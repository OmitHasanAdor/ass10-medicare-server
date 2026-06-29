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
    const authUserCollection = db.collection("user");
    const appointmentsCollection = db.collection("appointments");
    const paymentsCollection = db.collection("payments");
    const doctorsCollection = db.collection("doctors");
    const prescriptionsCollection = db.collection("prescriptions");
    const reviewsCollection = db.collection("reviews");

    console.log("Pinged your deployment. You successfully connected to MongoDB!");




    // ৪. রিভিউ ডিলিট করার API (DELETE)
    app.delete('/api/reviews/delete/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await db.collection("reviews").deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send("Failed to delete review");
      }
    });

    // 💻 আপনার এক্সপ্রেস ব্যাকএন্ড (index.js)

  app.put('/api/doctor/save-credentials', async (req, res) => {
  try {
    const {
      email, doctorName, specialization, qualifications, experience,
      consultationFee, hospitalName, availableDays, availableSlots,
      profileImage, verificationStatus, rating
    } = req.body;

    if (!email) {
      return res.status(400).send({ success: false, message: "Doctor email is required" });
    }

    // ১. doctorsCollection এর জন্য কমপ্লিট অবজেক্ট
    const doctorCompleteData = {
      email,
      doctorName,
      specialization,
      qualifications,
      experience,
      consultationFee,
      hospitalName,
      availableDays,
      availableSlots,
      profileImage,
      verificationStatus,
      rating
    };

    // ২. doctorsCollection আপডেট বা ইনসার্ট করা
    const result = await doctorsCollection.updateOne(
      { email: email },
      { $set: doctorCompleteData },
      { upsert: true }
    );

    // ৩. 🎯 Better-Auth এর "user" কালেকশনে নাম এবং ইমেজ আপডেট (যদি প্রোফাইল পিকচার বা নাম চেঞ্জ হয়)
    const userUpdateFields = {};
    if (doctorName) userUpdateFields.name = doctorName;
    if (profileImage) userUpdateFields.image = profileImage; // Better-Auth এ সাধারণত ফিল্ডের নাম 'image' থাকে

    if (Object.keys(userUpdateFields).length > 0) {
      // Better-Auth এর তৈরি করা 'user' কালেকশন আপডেট
      await db.collection("user").updateOne(
        { email: email },
        { $set: userUpdateFields }
      );

      // আপনার নিজের তৈরি করা 'users' কালেকশন আপডেট
      const usersUpdateFields = { ...userUpdateFields };
      if (profileImage) usersUpdateFields.photo = profileImage; // আপনার কালেকশনে ফিল্ডের নাম 'photo'

      await db.collection("users").updateOne(
        { email: email },
        { $set: usersUpdateFields }
      );
    }

    res.send({
      success: true,
      message: result.upsertedCount > 0 ? "Doctor profile created successfully!" : "Doctor profile updated successfully!"
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});



    

    // 🟡 ২. Update/Modify Prescription API
  app.patch('/api/prescriptions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, medications, notes } = req.body;

    // ১. আইডি ফরম্যাট ভ্যালিডেশন
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid prescription ID format" });
    }

    // 🎯 ২. সিকিউরিটি ভ্যালিডেশন: রিকোয়েস্টে প্রয়োজনীয় ফিল্ড ফাঁকা পাঠানো হয়েছে কিনা চেক করা
    if (!diagnosis || !medications) {
      return res.status(400).send({ success: false, message: "Diagnosis and Medications are required to modify Rx" });
    }

    const updatedDoc = {
      $set: {
        diagnosis,
        medications,
        notes,
        updatedAt: new Date() // কখন আপডেট হলো তা ট্র্যাক রাখার জন্য ভালো
      }
    };

    const result = await prescriptionsCollection.updateOne(
      { _id: new ObjectId(id) },
      updatedDoc
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Prescription not found" });
    }

    res.send({ success: true, message: "Prescription updated successfully (Modify Rx)!" });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// 📂 backend/index.js (আপনার এক্সপ্রেস এপিআই ফাইল)


// 📂 backend/index.js
const { ObjectId } = require('mongodb'); 

app.get('/api/doctor-stats/:doctorIdOrEmail', async (req, res) => {
  try {
    const { doctorIdOrEmail } = req.params;
    let docObjectId = null;

    if (ObjectId.isValid(doctorIdOrEmail)) {
      docObjectId = new ObjectId(doctorIdOrEmail);
    } else {
      const currentDoctor = await db.collection("doctors").findOne({
        $or: [ { email: doctorIdOrEmail }, { userId: doctorIdOrEmail } ]
      });
      if (currentDoctor) docObjectId = new ObjectId(currentDoctor._id);
    }

    if (!docObjectId) {
      try { docObjectId = new ObjectId(doctorIdOrEmail); } catch(e) {
        return res.status(200).send({ 
          success: true, 
          stats: { distinctPatients: 0, pendingRequests: 0, clinicianScore: "0.0 / 5.0", totalPrescriptions: 0 },
          reviews: [] 
        });
      }
    }

    const query = { doctorId: docObjectId };

    // ১. Clinician Score (Average Rating)
    const ratingStats = await db.collection("reviews").aggregate([
      { $match: query },
      { $group: { _id: null, avgRating: { $avg: "$rating" } } }
    ]).toArray();
    const clinicianScore = ratingStats.length > 0 ? ratingStats[0].avgRating.toFixed(1) : "0.0";

    // ২. Pending Requests Count
    const pendingRequests = await db.collection("appointments").countDocuments({
      doctorId: docObjectId,
      appointmentStatus: "pending" 
    });

    // ৩. Distinct Patients Count
    const distinctPatientsStats = await db.collection("appointments").aggregate([
      { $match: query },
      { $group: { _id: "$patientId" } },
      { $count: "totalCount" }
    ]).toArray();
    const distinctPatients = distinctPatientsStats.length > 0 ? distinctPatientsStats[0].totalCount : 0;

    // ৪. Total Prescriptions Count
    const totalPrescriptions = await db.collection("prescriptions").countDocuments(query);

    // 🎯 ৫. Recent Reviews Fetch with Patient Names ($lookup ব্যবহার করে)
    // আপনার Better-Auth এর ইউজার কালেকশনের নাম যদি "users" বা "user" হয়, সেটি below localField অনুযায়ী সেট হবে
// 🎯 ৫. Recent Reviews Fetch (Better-Auth 'user' কালেকশনের সাথে জয়েন)
    const recentReviews = await db.collection("reviews").aggregate([
      { $match: query },
      { $sort: { reviewDate: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: "user", // 👈 "users" পরিবর্তন করে Better-Auth এর "user" কালেকশন দেওয়া হলো
          let: { review_patient_id: "$patientId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$_id", "$$review_patient_id"] },
                    { $eq: [{ $toString: "$_id" }, { $toString: "$$review_patient_id" }] }
                  ]
                }
              }
            }
          ],
          as: "patientInfo"
        }
      },
      { $unwind: { path: "$patientInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          rating: 1,
          reviewText: 1,
          reviewDate: 1,
          patientName: { $ifNull: ["$patientInfo.name", "Anonymous Patient"] }
        }
      }
    ]).toArray();

    // রেসপন্স পাঠানো
    res.send({
      success: true,
      stats: {
        distinctPatients,
        pendingRequests,
        clinicianScore: `${clinicianScore} / 5.0`,
        totalPrescriptions
      },
      reviews: recentReviews // 👈 রিভিউ এরে যুক্ত করা হলো
    });

  } catch (error) {
    console.error("API Main Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

    // 🔵 ৩. Get Prescriptions by Doctor ID API (🔥 ফ্রন্টএন্ডে নাম দেখানোর জন্য $lookup যুক্ত করা হয়েছে)
  // 🔵 ৩. Get Prescriptions by Doctor ID API (Updated Match Stage)


    // 💻 আপনার এক্সপ্রেস ব্যাকএন্ড (index.js)
    app.patch('/api/doctor/update-schedule', async (req, res) => {
      try {
        const { email, availableDays, availableSlots } = req.body;

        if (!email) {
          return res.status(400).send({ success: false, message: "Doctor email is required" });
        }

        // শুধুমাত্র শিডিউলের দুটি ফিল্ড আপডেট করা হচ্ছে
        const result = await doctorsCollection.updateOne(
          { email: email },
          {
            $set: {
              availableDays: Array.isArray(availableDays) ? availableDays : [],
              availableSlots: Array.isArray(availableSlots) ? availableSlots : []
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Doctor profile not found to update schedule" });
        }

        res.send({ success: true, message: "Schedule slots updated successfully!" });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // 💻 আপনার এক্সপ্রেস ব্যাকএন্ড ফাইল (index.js)
    app.get('/user-role', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "Email is required" });

        // কাস্টম users কালেকশন থেকে রোল এবং স্ট্যাটাস খুঁজে বের করা
        const userProfile = await usersCollection.findOne(
          { email: email },
          { projection: { role: 1, status: 1 } } // শুধু রোল এবং স্ট্যাটাস ফিল্ড নিবে পারফরম্যান্সের জন্য
        );

        if (!userProfile) {
          return res.status(404).send({ message: "User profile not found" });
        }

        res.send(userProfile);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });


    // ১. ডক্টরের অ্যাপয়েন্টমেন্টগুলো পেশেন্ট ডাটা-সহ গেট করার API
    // app.get('/api/doctor/appointments', async (req, res) => {
    //   try {
    //     const { email } = req.query;
    //     if (!email) {
    //       return res.status(400).send({ message: "Doctor email is required" });
    //     }

    //     // প্রথমে ডক্টরের ইমেল দিয়ে তার প্রোফাইল থেকে _id বের করা
    //     const doctor = await doctorsCollection.findOne({ email: email });
    //     if (!doctor) {
    //       return res.status(404).send({ message: "Doctor profile not found" });
    //     }

    //     // Aggregation pipeline: appointments-এর সাথে users কালেকশন যুক্ত করা
    //     const appointments = await appointmentsCollection.aggregate([
    //       {
    //         $match: { doctorId: doctor._id } // শুধুমাত্র এই ডক্টরের অ্যাপয়েন্টমেন্ট ফিল্টার
    //       },
    //       {
    //         $lookup: {
    //           from: "users",                  // আপনার পেশেন্ট বা ইউজারের কালেকশন নাম (নিশ্চিত হয়ে নিন)
    //           localField: "patientId",
    //           foreignField: "_id",
    //           as: "patientInfo"
    //         }
    //       },
    //       {
    //         $unwind: {
    //           path: "$patientInfo",
    //           preserveNullAndEmptyArrays: true // পেশেন্ট ডাটা কোনো কারণে না থাকলেও অ্যাপয়েন্টমেন্ট দেখাবে
    //         }
    //       },
    //       {
    //         $sort: { "createdAt": -1 } // নতুন অ্যাপয়েন্টমেন্টগুলো আগে দেখাবে
    //       }
    //     ]).toArray();

    //     res.send(appointments);
    //   } catch (error) {
    //     res.status(500).send({ message: error.message });
    //   }
    // });

    // // ২. অ্যাপয়েন্টমেন্টের স্ট্যাটাস চেঞ্জ করার PATCH API
    // app.patch('/api/appointments/:id/status', async (req, res) => {
    //   try {
    //     const { id } = req.params;
    //     const { status } = req.body; // 'confirmed', 'cancelled', অথবা 'completed'

    //     if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
    //       return res.status(400).send({ success: false, message: "Invalid status update" });
    //     }

    //     const { ObjectId } = require('mongodb');
    //     const result = await appointmentsCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       { $set: { appointmentStatus: status } }
    //     );

    //     if (result.modifiedCount === 0) {
    //       return res.status(404).send({ success: false, message: "Appointment not found or status unchanged" });
    //     }

    //     res.send({ success: true, message: `Appointment status updated to ${status}` });
    //   } catch (error) {
    //     res.status(500).send({ success: false, message: error.message });
    //   }
    // });


app.get('/api/admin/appointments', async (req, res) => {
    try {
        const appointmentsCollection = db.collection("appointments");
        
        const appointments = await appointmentsCollection.aggregate([
            {
                // 1. IDs format normalization with conversion safety checks
                $addFields: {
                    convertedPatientId: { 
                        $cond: {
                            if: { $eq: [{ $type: "$patientId" }, "string"] },
                            then: { $toObjectId: "$patientId" },
                            else: "$patientId"
                        }
                    },
                    convertedDoctorId: { 
                        $cond: {
                            if: { $eq: [{ $type: "$doctorId" }, "string"] },
                            then: { $toObjectId: "$doctorId" },
                            else: "$doctorId"
                        }
                    }
                }
            },
            {
                // 2. Patient Details Join directly from Auth "user" collection
                $lookup: {
                    from: "user", // NextAuth structure singular 'user' name mapped here
                    localField: "convertedPatientId",
                    foreignField: "_id",
                    as: "patientDetails"
                }
            },
            { $unwind: { path: "$patientDetails", preserveNullAndEmptyArrays: true } },
            {
                // 3. Doctor Details Join from doctors
                $lookup: {
                    from: "doctors", 
                    localField: "convertedDoctorId",
                    foreignField: "_id",
                    as: "doctorDetails"
                }
            },
            { $unwind: { path: "$doctorDetails", preserveNullAndEmptyArrays: true } },
            {
                // 4. Sorting
                $sort: { _id: -1 }
            },
            {
                // 5. Clean optimized data projection
                $project: {
                    _id: 1,
                    appointmentDate: 1,
                    appointmentTime: 1,
                    appointmentStatus: 1,
                    amountPaid: 1,
                    paymentStatus: 1,
                    symptoms: 1,
                    
                    // Auth schema targets mapping setup
                    patientName: { $ifNull: ["$patientDetails.name", "Unknown Patient"] },
                    patientEmail: { $ifNull: ["$patientDetails.email", "No Email Provided"] },
                    
                    // Doctor template mapping targets
                    doctorName: { $ifNull: ["$doctorDetails.doctorName", "Assigned Doctor"] },
                    specialization: { $ifNull: ["$doctorDetails.specialization", "General Physician"] }
                }
            }
        ]).toArray();

        res.status(200).json(appointments);
    } catch (error) {
        console.error("Error fetching admin appointments:", error);
        res.status(500).json({ 
            message: "Internal Server Error", 
            error: error.message 
        });
    }
});

    // ১. ডাক্তার অনুযায়ী অ্যাপয়েন্টমেন্ট এবং ফিল্টারিং গেট API
    // 📂 ব্যাকএন্ড ফাইল (Express Server)

  // ==========================================
// 1. GET: ডক্টরের অ্যাপয়েন্টমেন্ট এবং কিউ ফিল্টার
// ==========================================
app.get('/api/doctor/appointments', async (req, res) => {
  try {
    const { email, status } = req.query; 
    if (!email) return res.status(400).send({ success: false, message: "Email required" });

    const doctor = await doctorsCollection.findOne({ email: email.trim() });
    if (!doctor) return res.status(404).send({ success: false, message: "Doctor not found" });

    const matchQuery = { doctorId: doctor._id };
    if (status) matchQuery.appointmentStatus = status; 

    const appointments = await appointmentsCollection.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "patients", // 🎯 ফিক্স: কালেকশনের নাম 'users' বদলে 'patients' করা হলো
          localField: "patientId",
          foreignField: "_id",
          as: "patientInfo"
        }
      },
      { $unwind: { path: "$patientInfo", preserveNullAndEmptyArrays: true } },
      { $sort: { "createdAt": -1 } }
    ]).toArray();

    res.send({ success: true, data: appointments });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ==========================================
// 2. POST: প্রেসক্রিপশন তৈরি এবং অ্যাপয়েন্টমেন্ট কমপ্লিট করা
// ==========================================
app.post('/api/prescriptions', async (req, res) => {
  try {
    const { doctorId, patientId, appointmentId, diagnosis, medications, notes } = req.body;

    if (!doctorId || !patientId || !appointmentId || !diagnosis || !medications) {
      return res.status(400).send({ success: false, message: "Missing required fields" });
    }

    if (!ObjectId.isValid(doctorId) || !ObjectId.isValid(patientId) || !ObjectId.isValid(appointmentId)) {
      return res.status(400).send({ success: false, message: "Invalid Hex ID format detected" });
    }

    const newPrescription = {
      doctorId: new ObjectId(doctorId),
      patientId: new ObjectId(patientId),
      appointmentId: new ObjectId(appointmentId),
      diagnosis,
      medications,
      notes,
      createdAt: new Date()
    };

    const result = await prescriptionsCollection.insertOne(newPrescription);

    if (result.insertedId) {
      // 🎯 অ্যাপয়েন্টমেন্টের স্ট্যাটাস পরিবর্তন করে 'completed' করা হচ্ছে
      await appointmentsCollection.updateOne(
        { _id: new ObjectId(appointmentId) },
        { $set: { appointmentStatus: 'completed' } }
      );

      res.status(201).send({
        success: true,
        message: "Prescription formulated and appointment marked COMPLETED!",
        prescriptionId: result.insertedId
      });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ==========================================
// 3. GET: ডক্টরের আইডি অনুযায়ী সমস্ত প্রেসক্রিপশন হিস্ট্রি (Cabin Logs)
// ==========================================
app.get('/api/prescriptions', async (req, res) => {
  try {
    const { doctorId } = req.query;

    if (!doctorId || !ObjectId.isValid(doctorId)) {
      return res.status(400).send({ success: false, message: "Valid Doctor ID is required" });
    }

    const pipeline = [
      { $match: { doctorId: new ObjectId(doctorId) } },
      { $sort: { createdAt: -1 } }, // লেটেস্ট হিস্ট্রি আগে দেখাবে
      {
        $lookup: {
          from: 'users', // পেশেন্টের নাম আনার জন্য জয়েনিং
          localField: 'patientId',
          foreignField: '_id',
          as: 'patientInfo'
        }
      },
      { $unwind: { path: '$patientInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          doctorId: 1,
          patientId: 1,
          appointmentId: 1,
          diagnosis: 1,
          medications: 1,
          notes: 1,
          createdAt: 1,
          'patientInfo.name': 1,
          'patientInfo.email': 1
        }
      }
    ];

    const result = await prescriptionsCollection.aggregate(pipeline).toArray();
    res.send({ success: true, data: result });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

    // ২. অ্যাপয়েন্টমেন্টের স্ট্যাটাস চেঞ্চ করার PATCH API (হুবহু ঠিক আছে!)
    app.patch('/api/appointments/:id/status', async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
          return res.status(400).send({ success: false, message: "Invalid status update" });
        }

        const { ObjectId } = require('mongodb');

        // আইডি ফরম্যাট ভ্যালিডেশন
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid Appointment ID format" });
        }

        const result = await appointmentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { appointmentStatus: status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Appointment not found" });
        }

        res.send({ success: true, message: `Appointment status updated to ${status}` });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ৩. আগের রিভিউ এডিট/আপডেট করার API (PATCH)
    app.patch('/api/reviews/update/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { rating, reviewText } = req.body;
        const result = await db.collection("reviews").updateOne(
          { _id: new ObjectId(id) },
          { $set: { rating: Number(rating), reviewText, reviewDate: new Date() } }
        );
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send("Failed to update review");
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


    // 💻 আপনার এক্সপ্রেস ব্যাকএন্ড ফাইল (index.js)
    // const { ObjectId } = require('mongodb');

    app.get('/patient-dashboard-data', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "Email is required" });

        // 🌟 লক্ষ্য করুন: এখানে usersCollection এর বদলে authUserCollection (user কালেকশন) ব্যবহার করা হয়েছে
        const patientUser = await authUserCollection.findOne({ email: email });

        if (!patientUser) {
          // console.log(`❌ No user found in authUserCollection with email: ${email}`);
          return res.send([]);
        }

        // Better Auth এর তৈরি করা ইউজার অবজেক্ট থেকে আইডি নেওয়া
        const rawId = patientUser._id || patientUser.id;

        // আইডিটিকে মঙ্গোডিবি ObjectId-তে কনভার্ট করা
        const targetPatientId = typeof rawId === 'string' ? new ObjectId(rawId) : rawId;

        // console.log(`🔍 Fetching dynamic data for: ${email} -> Target Patient ID:`, targetPatientId);

        // ২. সঠিক আইডি দিয়ে অ্যাপয়েন্টমেন্ট এগ্রিগেট করা
        const appointments = await appointmentsCollection.aggregate([
          {
            $match: {
              patientId: targetPatientId // এখন এটি অবজেক্ট আইডি "6a400a5440312c29bf22bd55" এর সাথে হুবহু ম্যাচ করবে!
            }
          },
          { $sort: { appointmentDate: -1 } },
          {
            $lookup: {
              from: "doctors",
              localField: "doctorId",
              foreignField: "_id",
              as: "doctorDetails"
            }
          },
          { $unwind: { path: "$doctorDetails", preserveNullAndEmptyArrays: true } }
        ]).toArray();

        // console.log(`✅ Successfully found ${appointments.length} appointments for ${email}.`);
        res.send(appointments);

      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).send({ message: error.message });
      }
    });


    // 💳 ১. Stripe Hosted Checkout Session তৈরি করার API (Form POST)
    app.post('/api/create-checkout-session', async (req, res) => {
      try {
        const { doctorId, doctorName, consultationFee, appointmentDate, appointmentTime, symptoms } = req.body;
        const patientEmail = req.body.patientEmail;

        if (!patientEmail) {
          return res.status(400).send({ message: "Patient email is required to book an appointment" });
        }

        const patientUser = await authUserCollection.findOne({ email: patientEmail });

        if (!patientUser) {
          return res.status(404).send({ message: "Patient account not found in database" });
        }

        const patientId = patientUser._id.toString();

        // 🚀 এখানে consultationFee নিশ্চিত করে ইন্টিজারে কনভার্ট করা হচ্ছে
        const feeAmount = parseInt(consultationFee) || 0;
        const amountInCents = feeAmount * 100;

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
          // 🎯 মেটাডাটায় amountPaid স্পষ্ট করে পাস করে দেওয়া হলো
          metadata: {
            patientId,
            doctorId,
            appointmentDate,
            appointmentTime,
            symptoms: symptoms || "No symptoms specified",
            amountPaid: feeAmount // 🚀 এই নতুন ফিল্ডটি যোগ করা হলো
          },
          mode: 'payment',
          // 🚀 success_url ফিক্স করা হয়েছে (http://localhost:5000 অথবা env থেকে SERVER_URL ব্যবহার করুন)
          success_url: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/find-doctors/${doctorId}`,
        });

        res.redirect(303, session.url);

      } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // 🔄 ২. পেমেন্ট সাকসেস হ্যান্ডলার API
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

          // ১. ডুপ্লিকেট বুকিং এড়াতে চেক করা
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
              amountPaid: Number(data.amountPaid) || (session.amount_total / 100), // 🚀 এখানে ফিল্ডটি যুক্ত করা হলো যাতে $0 না আসে
              createdAt: new Date()
            };

            // ডাটাবেজে অ্যাপয়েন্টমেন্ট ইনসার্ট করা
            const appointmentResult = await appointmentsCollection.insertOne(newAppointment);
            appointmentId = appointmentResult.insertedId;
          } else {
            appointmentId = appointment._id;
          }

          // ২. 💳 Payments কালেকশনের জন্য ডেটা তৈরি ও ইনসার্ট করা
          const isPaymentExist = await paymentsCollection.findOne({ transactionId: session.payment_intent });

          if (!isPaymentExist) {
            const newPayment = {
              appointmentId: new ObjectId(appointmentId),
              patientId: new ObjectId(data.patientId),
              doctorId: new ObjectId(data.doctorId),
              amount: session.amount_total / 100, // সেন্ট থেকে ডলারে কনভার্ট করা হলো
              transactionId: session.payment_intent,
              paymentDate: new Date()
            };

            // Payments কালেকশনে ডেটা সেভ করা
            await paymentsCollection.insertOne(newPayment);
          }

          // 🚀 দুটি কালেকশনেই ডেটা সেভ হয়ে যাওয়ার পর পেশেন্টকে তার ড্যাশবোর্ডের সাকসেস পেজে রিডাইরেক্ট করা
          res.redirect(`${process.env.CLIENT_URL}/dashboard/patient/appointments?status=success`);
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

  // ১. বেস কোয়েরি: শুধুমাত্র ভেরিফাইড ডক্টরদের ডাটা ফিল্টার করা হবে
  const query = { verificationStatus: "Verified" };

  // ২. সার্চ লজিক
  if (req.query.search && req.query.search.trim() !== '') {
    query.$or = [
      { doctorName: { $regex: req.query.search.trim(), $options: 'i' } },
      { hospitalName: { $regex: req.query.search.trim(), $options: 'i' } }
    ];
  }

  // ৩. স্পেশালাইজেশন ফিল্টার
  if (req.query.specialization) {
    const spec = req.query.specialization.toLowerCase().trim();
    if (spec !== 'all' && spec !== 'all specialties' && spec !== '') {
      query.specialization = { $regex: `^${req.query.specialization.trim()}$`, $options: 'i' };
    }
  }

  // ৪. সোর্টিং লজিক
  let sortObj = {};
  if (req.query.sort === 'fee-low-high') {
    sortObj.consultationFee = 1;
  } else if (req.query.sort === 'fee-high-low') {
    sortObj.consultationFee = -1;
  } else if (req.query.sort === 'experience') {
    sortObj.experience = -1;
  } else if (req.query.sort === 'rating') {
    sortObj.rating = -1;
  } else {
    sortObj._id = -1; 
  }

  // ৫. পেজিনেশন লজিক
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