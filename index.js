const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ogkul.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db("doctor_portal").collection("service");
        const bookingCollection = client.db("doctor_portal").collection("booking");
        const userCollection = client.db("doctor_portal").collection("users");
        const doctorCollection = client.db("doctor_portal").collection("doctors");
        const paymentCollection = client.db("doctor_portal").collection("payments");
        // function for verify jwt token
        function verifyJwt(req, res, next) {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorize' })
            }
            const token = authHeader.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
                if (err) {
                    return res.status(403).send({ message: 'forbidden access' })
                }
                req.decoded = decoded;
                next();
            });
        }
        // verify admin
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' })
            }
        }

        // ------data load or get api ----------
        app.get('/service', async (req, res) => {

            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 })
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/user', verifyJwt, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;
            console.log(date);
            const services = await serviceCollection.find().toArray();
            const query = { date: date };
            const booking = await bookingCollection.find(query).toArray();
            services.forEach(service => {
                const bookingService = booking.filter(book => book.treatmentName === service.name);
                const bookedSlots = bookingService.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
                console.log(service.slots.length);
            })
            res.send(services);
        })

        app.get('/booking', verifyJwt, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.email;
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail }
                const booking = await bookingCollection.find(query).toArray();
                return res.send(booking)
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        })
        app.get('/booking/:appointmentId', verifyJwt, async (req, res) => {
            const appointmentId = req.params.appointmentId;
            const query = { _id: ObjectId(appointmentId) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking)
        })

        // update method 
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const user = req.body;
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        })
        // update method for admin
        app.put('/user/admin/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // payment user update
        app.patch('/booking/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transaction: payment.transaction,
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);

            res.send(updatedDoc);

        })

        // without admin page not show api 
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })
        // -------add a new user or create a user ------
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            // to stop duplicating we can use query
            const query = { treatmentName: booking.treatmentName, date: booking.date, patientEmail: booking.patientEmail };

            const exists = await bookingCollection.findOne(query);

            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })
        app.get('/doctor', verifyJwt, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors)
        })

        app.post('/doctor', verifyJwt, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })
        // stripe api
        app.post('/create-payment-intent', verifyJwt, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        });
        // delete api
        app.delete('/doctor/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })

    }
    finally {

    }
}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello, my doctor portal')
})
app.listen(port, () => {
    console.log('listening port', port);
})