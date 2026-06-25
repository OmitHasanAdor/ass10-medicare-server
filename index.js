const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
// const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const cors = require('cors');
const app = express();

// Adds headers: Access-Control-Allow-Origin: *
app.use(cors());
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = process.env.MONGO_DB_URI;

const port = process.env.PORT || 5000;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
  try {
    // MongoDB কানেকশন নিশ্চিত করা (v4.7+ এর পর ঐচ্ছিক হলেও করে রাখা ভালো)
    await client.connect();
    
    // ডাটাবেজ এবং কালেকশন রেফারেন্স
    const db = client.db("medicaredb");
    const usersCollection = db.collection("users");

    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // 🎯 ১. ফ্রন্টএন্ড থেকে ইউজার ডাটা রিসিভ করার জন্য POST API
    app.post('/api/users', async (req, res) => {
        try {
            const userData = req.body;
            
            // ইমেইল অলরেডি ডাটাবেজে আছে কিনা চেক করা
            const query = { email: userData.email };
            const existingUser = await usersCollection.findOne(query);
            
            if (existingUser) {
                return res.status(400).json({ message: "User already exists in medicaredb" });
            }

            // প্রথমবার ডাটা ইনসার্ট হওয়ার সাথে সাথেই কালেকশন তৈরি হয়ে যাবে
            const result = await usersCollection.insertOne(userData);
            res.status(201).json({ success: true, insertedId: result.insertedId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 🎯 ২. লগইন বা প্রোফাইলের জন্য ইমেইল দিয়ে ইউজার ডাটা গেট করার API
    app.get('/api/users/:email', async (req, res) => {
        try {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

  } catch (error) {
      console.error("Database connection error:", error);
  }
}
run().catch(console.dir);

// রুট রাউট (সার্ভার চলছে কিনা চেক করার জন্য)
app.get('/', (req, res) => {
    res.send('Medicare Express Server is running...');
});

// 🎯 ৩. সার্ভার লিসেন করা (এটি না দিলে পোর্ট সচল হবে না)
app.listen(port, () => {
    console.log(`Medicare Server is listening on port ${port}`);
});