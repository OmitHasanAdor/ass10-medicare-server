const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
// const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const cors = require('cors');
const app = express();

// Adds headers: Access-Control-Allow-Origin: *
app.use(cors());
app.use(express.json())
// এক্সপ্রেসের অন্যান্য মিডলওয়্যারের সাথে এটি যুক্ত করুন
app.use(express.urlencoded({ extended: true }));

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const appointmentsCollection = db.collection("appointments");
    const authUserCollection = db.collection("user");
    const paymentsCollection = db.collection("payments");

    console.log("Pinged your deployment. You successfully connected to MongoDB!");


    // 💳 ১. Stripe Hosted Checkout Session তৈরি করার API (Form POST)
    app.post('/api/create-checkout-session', async (req, res) => {
      try {
        const { doctorId, doctorName, consultationFee, appointmentDate, appointmentTime, symptoms } = req.body;

        // ⚠️ ফ্রন্টএন্ড থেকে কারেন্ট লগড-ইন ইউজারের ইমেইলটি ফর্মে হিডেন হিসেবে পাঠাতে হবে (যেমন: user?.email)
        const patientEmail = req.body.patientEmail;

        if (!patientEmail) {
          return res.status(400).send({ message: "Patient email is required to book an appointment" });
        }

        // 🔍 Better Auth এর 'user' কালেকশন থেকে পেশেন্টের আসল মঙ্গোডিবি আইডি (_id) খুঁজে বের করা
        const patientUser = await authUserCollection.findOne({ email: patientEmail });

        if (!patientUser) {
          return res.status(404).send({ message: "Patient account not found in database" });
        }

        const patientId = patientUser._id.toString(); // আইডিটি মেটাডাটার জন্য স্ট্রিং করে নিলাম
        const amountInCents = parseInt(consultationFee) * 100;

        // 🚀 Stripe Checkout Session জেনারেট করা
        const session = await stripe.checkout.sessions.create({
          customer_email: patientEmail,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: doctorName,
                  description: `Appointment on ${appointmentDate} at ${appointmentTime}`,
                },
                unit_amount: amountInCents,
              },
              quantity: 1,
            },
          ],
          // 🎯 মেটাডাটায় আপনার Appointments কালেকশনের জন্য প্রয়োজনীয় সব ফিল্ড পুশ করা হচ্ছে
          metadata: {
            patientId, // 'user' কালেকশন থেকে পাওয়া আসল আইডি
            doctorId,
            appointmentDate,
            appointmentTime,
            symptoms: symptoms || "No symptoms specified"
          },
          mode: 'payment',
          success_url: `http://localhost:5000/api/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `http://localhost:3000/find-doctors/${doctorId}`,
        });

        // স্ট্রাইপ পেমেন্ট পেজে রিডাইরেক্ট
        res.redirect(303, session.url);

      } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).send({ error: error.message });
      }
    });



    // ২. নতুন রিভিউ তৈরি করার API (POST)
app.post('/api/reviews/add', async (req, res) => {
    try {
        const { patientId, doctorId, rating, reviewText } = req.body;
        const newReview = {
            patientId: new ObjectId(patientId),
            doctorId: new ObjectId(doctorId),
            rating: Number(rating),
            reviewText,
            reviewDate: new Date()
        };
        const result = await db.collection("reviews").insertOne(newReview);
        res.send(result);
    } catch (error) {
        console.error(error);
        res.status(500).send("Failed to add review");
    }
});
    // ১. নির্দিষ্ট পেশেন্টের দেওয়া সমস্ত রিভিউ দেখার API (GET)
app.get('/api/reviews/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const reviews = await db.collection("reviews").aggregate([
            {
                $match: { patientId: new ObjectId(patientId) }
            },
            {
                $lookup: {
                    from: "doctors", // আপনার ডক্টর কালেকশনের নাম
                    localField: "doctorId",
                    foreignField: "_id",
                    as: "doctorDetails"
                }
            },
            { $unwind: { path: "$doctorDetails", preserveNullAndEmptyArrays: true } },
            { $sort: { reviewDate: -1 } }
        ]).toArray();
        
        res.send(reviews);
    } catch (error) {
        console.error(error);
        res.status(500).send("Failed to fetch reviews");
    }
});

// 💳 পেশেন্টের সম্পূর্ণ পেমেন্ট হিস্ট্রি ডক্টরের নামসহ নিয়ে আসার API (GET)
app.get('/api/payments/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;

        // payments কালেকশন থেকে ডাটা ফেচ করে doctors কালেকশনের সাথে যুক্ত করা হচ্ছে
        const paymentHistory = await db.collection("payments").aggregate([
            {
                $match: { patientId: new ObjectId(patientId) }
            },
            {
                $lookup: {
                    from: "doctors",          // আপনার ডাটাবেজে ডক্টর কালেকশনের আসল নাম
                    localField: "doctorId",
                    foreignField: "_id",
                    as: "doctorDetails"
                }
            },
            {
                $unwind: {
                    path: "$doctorDetails",
                    preserveNullAndEmptyArrays: true // ডক্টর কোনো কারণে ডিলিট হলেও ডাটা ক্রাশ করবে না
                }
            },
            {
                $sort: { "paymentDate": -1 } // লেটেস্ট পেমেন্ট বা ট্রানজেকশনগুলো সবার উপরে থাকবে
            }
        ]).toArray();

        res.send(paymentHistory);
    } catch (error) {
        console.error("Fetch Payment History Error:", error);
        res.status(500).send({ message: "Internal server error failed to fetch payment history" });
    }
});

    // ❌ ৩. অ্যাপয়েন্টমেন্ট ডিলিট/ক্যান্সেল করার API (DELETE)
app.delete('/api/appointments/cancel/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // আপনার রিকোয়ারমেন্ট অনুযায়ী সরাসরি ডাটাবেজ থেকে ডিলিট করা হচ্ছে
        const result = await appointmentsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
    } catch (error) {
        console.error("Delete Appointment Error:", error);
        res.status(500).send({ message: "Failed to cancel appointment" });
    }
});

    // 🔄 ২. অ্যাপয়েন্টমেন্ট রিশেডিউল (Reschedule) করার API (PATCH)
app.patch('/api/appointments/reschedule/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { appointmentDate, appointmentTime } = req.body;

        if (!appointmentDate || !appointmentTime) {
            return res.status(400).send({ message: "Date and Time are required" });
        }

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: {
                appointmentDate,
                appointmentTime,
                appointmentStatus: "pending" // রিশেডিউল করলে স্ট্যাটাস আবার পেন্ডিং এ যাবে
            }
        };

        const result = await appointmentsCollection.updateOne(filter, updatedDoc);
        res.send(result);
    } catch (error) {
        console.error("Reschedule Error:", error);
        res.status(500).send({ message: "Failed to reschedule" });
    }
});

    // 🔍 ১. নির্দিষ্ট পেশেন্টের সমস্ত অ্যাপয়েন্টমেন্ট ডক্টরের ডিটেইলসসহ নিয়ে আসার API (GET)
app.get('/api/appointments/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;

        // MongoDB Aggregation Pipeline ব্যবহার করে ডক্টরের তথ্য যুক্ত করা হচ্ছে
        const appointments = await appointmentsCollection.aggregate([
            {
                $match: { patientId: new ObjectId(patientId) }
            },
            {
                $lookup: {
                    from: "doctors",          // আপনার ডক্টর কালেকশনের নাম (নিশ্চিত হয়ে নিন)
                    localField: "doctorId",
                    foreignField: "_id",
                    as: "doctorDetails"
                }
            },
            {
                $unwind: {
                    path: "$doctorDetails",
                    preserveNullAndEmptyArrays: true // ডক্টর ডিলিট হয়ে গেলেও যেন অ্যাপয়েন্টমেন্ট ক্রাশ না করে
                }
            },
            {
                $sort: { "createdAt": -1 } // নতুন অ্যাপয়েন্টমেন্টগুলো উপরে দেখাবে
            }
        ]).toArray();

        res.send(appointments);
    } catch (error) {
        console.error("Fetch Appointments Error:", error);
        res.status(500).send({ message: "Internal server error" });
    }
});


    // 🎉 ২. পেমেন্ট সফল হলে Appointments কালেকশনে ডেটা ইনসার্ট করার API
 app.get('/api/payment-success', async (req, res) => {
    try {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).send("Session ID is required");
        }

        // Stripe থেকে পেমেন্ট সেশন রিট্রিভ করে মেটাডাটা ও পেমেন্ট ইনটেন্ট আইডি বের করা
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            const data = session.metadata;

            // ১. ডুপ্লিকেট বুকিং এড়াতে চেক করা (ইতিমধ্যে এই সেশনের জন্য অ্যাপয়েন্টমেন্ট আছে কিনা)
            let appointment = await appointmentsCollection.findOne({ stripeSessionId: session_id });
            let appointmentId;

            if (!appointment) {
                // 📝 Appointments কালেকশনের অবজেক্ট তৈরি
                const newAppointment = {
                    patientId: new ObjectId(data.patientId),
                    doctorId: new ObjectId(data.doctorId),
                    appointmentDate: data.appointmentDate,
                    appointmentTime: data.appointmentTime,
                    appointmentStatus: "pending", 
                    symptoms: data.symptoms,
                    paymentStatus: "paid", 
                    stripeSessionId: session_id,
                    createdAt: new Date()
                };

                // ডাটাবেজে অ্যাপয়েন্টমেন্ট ইনসার্ট করা
                const appointmentResult = await appointmentsCollection.insertOne(newAppointment);
                appointmentId = appointmentResult.insertedId;
            } else {
                appointmentId = appointment._id;
            }

            // ২. 💳 Payments কালেকশনের জন্য ডেটা তৈরি ও ইনসার্ট করা
            // চেক করে নেওয়া যে এই সেশনের পেমেন্ট অলরেডি ডাটাবেজে সেভ হয়েছে কিনা
            const isPaymentExist = await paymentsCollection.findOne({ transactionId: session.payment_intent });

            if (!isPaymentExist) {
                const newPayment = {
                    appointmentId: new ObjectId(appointmentId), // উপরে তৈরি হওয়া বা খুঁজে পাওয়া অ্যাপয়েন্টমেন্টের আইডি
                    patientId: new ObjectId(data.patientId),
                    doctorId: new ObjectId(data.doctorId),
                    amount: session.amount_total / 100, // সেন্ট থেকে ডলারে কনভার্ট করা হলো
                    transactionId: session.payment_intent, // Stripe এর অফিশিয়াল ইউনিক ট্রানজেকশন আইডি
                    paymentDate: new Date() // পেমেন্ট সফল হওয়ার কারেন্ট ডেট ও টাইম
                };

                // Payments কালেকশনে ডেটা সেভ করা
                await paymentsCollection.insertOne(newPayment);
            }

            // 🚀 দুটি কালেকশনেই ডেটা সেভ হয়ে যাওয়ার পর পেশেন্টকে তার ড্যাশবোর্ডের সাকসেস পেজে রিডাইরেক্ট করা
            res.redirect(`http://localhost:3000/dashboard/patient/appointments?status=success`);
        } else {
            res.status(400).send("Payment validation failed.");
        }

    } catch (error) {
        console.error("Database Insertion Error:", error);
        res.status(500).send({ message: "Failed to process payment data", error: error.message });
    }
});

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


    // job search related

    // 🔍 Get current logged-in user data by email (Handles both 'users' and 'user' collections)
    app.get('/api/current-user', async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ message: "Email query parameter is required" });
        }

        const db = client.db("medicaredb");

        // ১. প্রথমে 'users' কালেকশনে খুঁজুন (যেখানে ডক্টর বা নরমাল ইউজার আছে এবং photo ফিল্ড আছে)
        let userData = await db.collection("users").findOne({ email: email });

        // ২. যদি ওখানে না পাওয়া যায়, তবে 'user' কালেকশনে খুঁজুন (যেমন আপনার Admin ইউজার)
        if (!userData) {
          userData = await db.collection("user").findOne({ email: email });
        }

        // যদি কোনো কালেকশনেই ইউজারকে না পাওয়া যায়
        if (!userData) {
          return res.status(404).send({ message: "User not found in database" });
        }

        // ৩. ফ্রন্টএন্ডের জন্য একটি ক্লিন রেসপন্স অবজেক্ট তৈরি করা
        // যদি ডাটাবেজে photo ফিল্ড না থাকে (যেমন Admin এর ক্ষেত্রে), তবে ui-avatars থেকে একটি ডিফল্ট ইমেজ ইউআরএল জেনারেট হবে
        const responseData = {
          _id: userData._id,
          name: userData.name,
          email: userData.email,
          role: userData.role || "user",
          status: userData.status || "active",
          photo: userData.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || "User")}&background=0D8ABC&color=fff&bold=true`
        };

        // ফাইনাল ডেটা পাঠানো
        res.send(responseData);

      } catch (error) {
        console.error("Backend error fetching current user:", error);
        res.status(500).send({ message: "Internal server error", error: error.message });
      }
    });


    app.get('/api/doctors', async (req, res) => {
      console.log('Server side doctor query:', req.query);

      const query = {};
      const db = client.db("medicaredb");
      const doctorsCollection = db.collection("doctors");

      // ১. সার্চ লজিক
      if (req.query.search) {
        query.$or = [
          { doctorName: { $regex: req.query.search, $options: 'i' } },
          { hospitalName: { $regex: req.query.search, $options: 'i' } }
        ];
      }

      // ২. স্পেশালাইজেশন ফিল্টার
      if (req.query.specialization && req.query.specialization !== 'all') {
        query.specialization = req.query.specialization;
      }

      // ৩. সোর্টিং লজিক
      let sortObj = {};
      if (req.query.sort === 'fee-low-high') {
        sortObj.consultationFee = 1;
      } else if (req.query.sort === 'fee-high-low') {
        sortObj.consultationFee = -1;
      } else if (req.query.sort === 'experience') {
        sortObj.experience = -1;
      } else if (req.query.sort === 'rating') {
        sortObj.rating = -1; // 🎯 রেটিং সর্টিং পারফেক্টলি হ্যান্ডেলড
      } else {
        sortObj._id = -1; // সেফ ডিফল্ট: নতুন ডক্টর আগে দেখাবে
      }

      // ৪. পেজিনেশন লজিক
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 12;
      const skipItems = (page - 1) * perPage;

      try {
        const total = await doctorsCollection.countDocuments(query);

        const doctors = await doctorsCollection.find(query)
          .sort(sortObj)
          .skip(skipItems)
          .limit(perPage)
          .toArray();

        res.send({ total, doctors });

      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // 🩺 ১. নির্দিষ্ট ডক্টরের ডিটেইলস গেট করার এপিআই (Next.js-এর জন্য)
    app.get('/api/doctors/:id', async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Doctor ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const doctor = await db.collection("doctors").findOne(query);

        if (!doctor) {
          return res.status(404).send({ message: "Doctor not found" });
        }

        res.send(doctor);
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // 💳 ২. ডাইনামিক পেমেন্ট ইনটেন্ট তৈরি করার এপিআই (Stripe Payment Intent)
    app.post('/api/create-payment-intent', async (req, res) => {
      try {
        const { doctorId } = req.body; // ফ্রন্টএন্ড থেকে ডক্টরের আইডি আসবে

        if (!doctorId || !ObjectId.isValid(doctorId)) {
          return res.status(400).send({ message: "Valid Doctor ID is required" });
        }

        // ডাটাবেজ থেকে ওই নির্দিষ্ট ডক্টরের ফি খুঁজে বের করা
        const doctor = await db.collection("doctors").findOne({ _id: new ObjectId(doctorId) });

        if (!doctor) {
          return res.status(404).send({ message: "Doctor not found" });
        }

        // 💰 ডাইনামিক অ্যামাউন্ট প্রসেসিং (Stripe-এ সেন্টে হিসাব হয়, তাই ১০০ দিয়ে গুণ)
        const amountInCents = parseInt(doctor.consultationFee) * 100;

        if (isNaN(amountInCents) || amountInCents <= 0) {
          return res.status(400).send({ message: "Invalid consultation fee in database" });
        }

        // Stripe-এর অফিশিয়াল Payment Intent তৈরি করা
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd', // আপনার প্রয়োজন অনুযায়ী 'bdt' বা অন্য কিছু দিতে পারেন
          payment_method_types: ['card'],
        });

        // ক্লায়েন্ট সিক্রেট (clientSecret) ফ্রন্টএন্ডে পাঠানো হচ্ছে
        res.send({
          clientSecret: paymentIntent.client_secret,
          amount: doctor.consultationFee
        });

      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message });
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