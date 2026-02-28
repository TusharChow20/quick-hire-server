const express = require("express");
var cors = require("cors");
require("dotenv").config();
const bcrypt = require("bcryptjs");

const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGO_URI;
app.use(express.json());
app.use(cors());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Server is running successfully 🚀");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    const myDB = client.db("QuickHire");
    const userCollection = myDB.collection("users");
    const jobsCollection = myDB.collection("jobs");

    // ── AUTH ─── Register──────────────────────────────────────────────

    app.post("/api/auth/register", async (req, res) => {
      try {
        const { name, email, password } = req.body;
        const errors = [];
        if (!name || !name.trim()) errors.push("name is required");
        if (!email) errors.push("email is required");
        if (!password) errors.push("password is required");
        else if (password.length < 6)
          errors.push("password must be at least 6 characters");

        if (errors.length > 0)
          return res.status(400).json({ success: false, errors });

        const existing = await userCollection.findOne({
          email: email.toLowerCase(),
        });
        if (existing)
          return res.status(409).json({
            success: false,
            message: "An account with this email already exists",
          });

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          role: "user",
          avatar: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const result = await userCollection.insertOne(newUser);
        const { password: _, ...userWithoutPassword } = newUser;

        res.status(201).json({
          success: true,
          message: "Account created successfully",
          user: { _id: result.insertedId, ...userWithoutPassword },
        });
      } catch (error) {
        console.error("POST /api/auth/register error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to create account" });
      }
    });
    // -------------------------------------- login ------------------------

    app.post("/api/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password)
          return res.status(400).json({
            success: false,
            message: "Email and password are required",
          });

        const user = await userCollection.findOne({
          email: email.toLowerCase(),
        });
        if (!user)
          return res
            .status(401)
            .json({ success: false, message: "Invalid email or password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
          return res
            .status(401)
            .json({ success: false, message: "Invalid email or password" });

        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
      } catch (error) {
        console.error("POST /api/auth/login error:", error);
        res.status(500).json({ success: false, message: "Login failed" });
      }
    });

    //--------------------------------------featured//////////////////////
    app.get("/api/jobs/featured", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 8;
        const jobs = await jobsCollection
          .find({ isFeatured: true })
          .sort({ created_at: -1 })
          .limit(limit)
          .toArray();
        res.json({ success: true, jobs });
      } catch (error) {
        res.status(500).json({ success: false });
      }
    });

    // latest jobs //////----------------------------------------------
    app.get("/api/jobs/latest", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 8;
        const jobs = await jobsCollection
          .find({})
          .sort({ created_at: -1 })
          .limit(limit)
          .toArray();
        res.json({ success: true, jobs });
      } catch (error) {
        console.error("GET /api/jobs/latest:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch latest jobs" });
      }
    });

    // return job count categoryies ---------------------------------
    app.get("/api/jobs/categories", async (req, res) => {
      try {
        const categories = await jobsCollection
          .aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $project: { _id: 0, category: "$_id", count: 1 } },
          ])
          .toArray();
        res.json({ success: true, categories });
      } catch (error) {
        console.error("GET /api/jobs/categories:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch categories" });
      }
    });

    // all jobs--------------------------------------------------------
    app.get("/api/jobs", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        const {
          search,
          category,
          type,
          location,
          featured,
          sortBy,
          salary_min,
          salary_max,
        } = req.query;
        let query = {};

        // Full-text search across title, company, description
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { company: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }

        // Exact-ish filters (case-insensitive partial match)
        if (category && category !== "All")
          query.category = { $regex: category, $options: "i" };
        if (type && type !== "All")
          query.type = { $regex: type, $options: "i" };

        if (location && location !== "All") {
          const locationMap = {
            "United States": "USA|United States",
            "United Kingdom": "UK|United Kingdom",
            Germany: "Germany",
            France: "France",
            Spain: "Spain",
            Switzerland: "Switzerland",
            Canada: "Canada",
            Remote: "Remote",
          };
          const pattern = locationMap[location] || location;
          query.location = { $regex: pattern, $options: "i" };
        }

        if (featured === "true") query.isFeatured = true;

        // ── Salary range filter ──────────────────────────────
        if (salary_min || salary_max) {
          query.$and = query.$and || [];

          if (salary_min) {
            query.$and.push({
              $or: [
                { salary_max: { $gte: parseInt(salary_min) } }, // max is at least min
                { salary_min: { $gte: parseInt(salary_min) } }, // or min itself qualifies
              ],
            });
          }
          if (salary_max) {
            query.$and.push({
              $or: [
                { salary_min: { $lte: parseInt(salary_max) } }, // min is within range
                { salary_max: { $lte: parseInt(salary_max) } }, // or max is within range
              ],
            });
          }
        }

        // Sort
        let sort = { created_at: -1 };
        if (sortBy === "oldest") sort = { created_at: 1 };
        if (sortBy === "title_asc") sort = { title: 1 };
        if (sortBy === "title_desc") sort = { title: -1 };

        const total = await jobsCollection.countDocuments(query);
        const jobs = await jobsCollection
          .find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          success: true,
          jobs,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        console.error("GET /api/jobs error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch jobs" });
      }
    });

    //  ------------------------------------job details---------------
    app.get("/api/jobs/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res
            .status(400)
            .json({ success: false, message: "Invalid job ID" });

        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
        if (!job)
          return res
            .status(404)
            .json({ success: false, message: "Job not found" });

        jobsCollection
          .updateOne({ _id: new ObjectId(id) }, { $inc: { views: 1 } })
          .catch(() => {});

        res.json({ success: true, job });
      } catch (error) {
        console.error("GET /api/jobs/:id:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch job" });
      }
    });

    console.log(
      `Pinged your deployment. You successfully connected to MongoDB! Port: ${port}`,
    );
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);
