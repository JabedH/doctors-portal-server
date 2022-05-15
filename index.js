const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mljzx.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client.db("doctors_portal").collection("booking");
    const userCollection = client.db("doctors_portal").collection("users");
    // put user information
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { title: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: "10d",
      });
      res.send({ result, token });
    });

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      // const authorization = req.headers.authorization; // this place has been change by verifyJWT for more security
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const booking = await bookingCollection.find(query).toArray();
        res.send(booking);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    // this is not a proper way
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1: get all services
      const services = await serviceCollection.find().toArray();
      // step 2: get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      // step3: for each services, find bookings for that service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (b) => b.treatment === service.name
        );
        const booked = serviceBookings.map((s) => s.slot);
        const available = service.slots.filter((s) => !booked.includes(s));
        service.slots = available;
        // service.booked = serviceBookings.map((s) => s.slot);
      });
      res.send(services);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log("Server", port);
});
