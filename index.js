const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
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
        // ------data load or get api ----------
        app.get('/service', async (req, res) => {

            const query = {};
            const cursor = serviceCollection.find(query)
            const services = await cursor.toArray();
            res.send(services);
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

        app.get('/booking', async (req, res) => {
            const patientEmail = req.query.patientEmail;
            console.log(patientEmail);
            const query = { patientEmail: patientEmail }
            console.log(query);
            const booking = await bookingCollection.find(query).toArray();
            res.send(booking)

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