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
// middle ware
function requireAdmin(req, res, next) {
  const user = req.user; // from JWT middleware

  if (!user || user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  next();
}
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
    const applicationsCollection = myDB.collection("applications");

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

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { company: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }
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
    //post job ----------------------------------------------------------
    app.post("/api/jobs", async (req, res) => {
      try {
        const {
          title,
          company,
          location,
          category,
          type,
          description,
          requirements,
          tags,
          logo,
          salary_min,
          salary_max,
          salary_currency,
          isFeatured,
        } = req.body;

        const errors = [];
        if (!title?.trim()) errors.push("title is required");
        if (!company?.trim()) errors.push("company is required");
        if (!location?.trim()) errors.push("location is required");
        if (!category?.trim()) errors.push("category is required");
        if (!description?.trim()) errors.push("description is required");
        if (errors.length > 0)
          return res.status(400).json({ success: false, errors });

        const now = new Date().toISOString();
        const newJob = {
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          category: category.trim(),
          type: type || "Full Time",
          description: description.trim(),
          requirements: Array.isArray(requirements) ? requirements : [],
          tags: Array.isArray(tags) ? tags : [],
          logo: logo || null,
          salary_min: salary_min ? parseInt(salary_min) : null,
          salary_max: salary_max ? parseInt(salary_max) : null,
          salary_currency: salary_currency || "USD",
          isFeatured: isFeatured === true || isFeatured === "true",
          views: 0,
          applicationCount: 0,
          created_at: now,
          updated_at: now,
        };

        const result = await jobsCollection.insertOne(newJob);
        res.status(201).json({
          success: true,
          message: "Job created successfully",
          job: { _id: result.insertedId, ...newJob },
        });
      } catch (error) {
        console.error("POST /api/jobs error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to create job" });
      }
    });

    // -------------------add to featured -------------------------------------
    app.patch("/api/jobs/:id/featured", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res
            .status(400)
            .json({ success: false, message: "Invalid job ID" });

        // Accept explicit value from body; if not sent, toggle
        let newVal = req.body.isFeatured;
        if (typeof newVal === "undefined") {
          const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
          if (!job)
            return res
              .status(404)
              .json({ success: false, message: "Job not found" });
          newVal = !job.isFeatured;
        }
        // coerce to boolean
        newVal = newVal === true || newVal === "true";

        const result = await jobsCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          {
            $set: { isFeatured: newVal, updated_at: new Date().toISOString() },
          },
          { returnDocument: "after" },
        );

        if (!result)
          return res
            .status(404)
            .json({ success: false, message: "Job not found" });

        res.json({
          success: true,
          message: newVal
            ? "Job marked as featured"
            : "Job removed from featured",
          isFeatured: newVal,
          job: result,
        });
      } catch (error) {
        console.error("PATCH /api/jobs/:id/featured error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update featured status",
        });
      }
    });

    // ------------------------------ delete job post----------------------
    app.delete("/api/jobs/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res
            .status(400)
            .json({ success: false, message: "Invalid job ID" });

        const result = await jobsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0)
          return res
            .status(404)
            .json({ success: false, message: "Job not found" });

        // Cascade: delete all applications for this job
        await applicationsCollection.deleteMany({ job_id: id });

        res.json({
          success: true,
          message: "Job and its applications deleted",
        });
      } catch (error) {
        console.error("DELETE /api/jobs/:id error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to delete job" });
      }
    });

    // ── Submit application-----------------------------------------
    app.post("/api/applications", async (req, res) => {
      try {
        const {
          job_id,
          name,
          email,
          phone,
          resume_link,
          cover_note,
          linkedin_url,
          portfolio_url,
        } = req.body;

        const errors = [];
        if (!job_id) errors.push("job_id is required");
        if (!name?.trim()) errors.push("name is required");
        if (!email?.trim()) errors.push("email is required");
        if (!resume_link?.trim()) errors.push("resume_link is required");
        if (errors.length > 0)
          return res.status(400).json({ success: false, errors });

        // Check job exists
        if (!ObjectId.isValid(job_id))
          return res
            .status(400)
            .json({ success: false, message: "Invalid job ID" });

        const job = await jobsCollection.findOne({ _id: new ObjectId(job_id) });
        if (!job)
          return res
            .status(404)
            .json({ success: false, message: "Job not found" });

        // Prevent duplicate applications from same email for same job
        const existing = await applicationsCollection.findOne({
          job_id,
          email: email.toLowerCase(),
        });
        if (existing)
          return res
            .status(409)
            .json({
              success: false,
              message: "You have already applied for this job",
            });

        const now = new Date().toISOString();
        const newApplication = {
          job_id,
          job_title: job.title,
          company: job.company,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone?.trim() || null,
          resume_link: resume_link.trim(),
          cover_note: cover_note?.trim() || null,
          linkedin_url: linkedin_url?.trim() || null,
          portfolio_url: portfolio_url?.trim() || null,
          status: "pending",
          created_at: now,
          updated_at: now,
        };

        const result = await applicationsCollection.insertOne(newApplication);

        // Increment applicationCount on the job
        await jobsCollection.updateOne(
          { _id: new ObjectId(job_id) },
          { $inc: { applicationCount: 1 } },
        );

        res.status(201).json({
          success: true,
          message: "Application submitted successfully",
          application: { _id: result.insertedId, ...newApplication },
        });
      } catch (error) {
        console.error("POST /api/applications error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to submit application" });
      }
    });

    // ── Get all applications (admin-----------------------
    app.get("/api/applications", requireAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const { status, job_id } = req.query;

        const query = {};
        if (status) query.status = status;
        if (job_id) query.job_id = job_id;

        const total = await applicationsCollection.countDocuments(query);
        const applications = await applicationsCollection
          .find(query)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          success: true,
          applications,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        console.error("GET /api/applications error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch applications" });
      }
    });

    // ── Get applications by email (user's own) -------------------
    app.get("/api/applications/my", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email)
          return res
            .status(400)
            .json({ success: false, message: "Email is required" });

        const applications = await applicationsCollection
          .find({ email: email.toLowerCase() })
          .sort({ created_at: -1 })
          .toArray();

        res.json({ success: true, applications });
      } catch (error) {
        console.error("GET /api/applications/my error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch applications" });
      }
    });

    // ── Update application status (admin-------------------
    app.patch(
      "/api/applications/:id/status",
      requireAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status } = req.body;

          if (!ObjectId.isValid(id))
            return res
              .status(400)
              .json({ success: false, message: "Invalid application ID" });

          const validStatuses = [
            "pending",
            "reviewed",
            "shortlisted",
            "rejected",
            "hired",
          ];
          if (!validStatuses.includes(status))
            return res
              .status(400)
              .json({ success: false, message: "Invalid status" });

          const result = await applicationsCollection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: { status, updated_at: new Date().toISOString() } },
            { returnDocument: "after" },
          );

          if (!result)
            return res
              .status(404)
              .json({ success: false, message: "Application not found" });

          res.json({
            success: true,
            message: "Status updated",
            application: result,
          });
        } catch (error) {
          console.error("PATCH /api/applications/:id/status error:", error);
          res
            .status(500)
            .json({ success: false, message: "Failed to update status" });
        }
      },
    );

    // f--------------─ Admin stats----------------------------------

    app.get("/api/admin/stats", requireAdmin, async (req, res) => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const [
          totalJobs,
          totalApplications,
          newJobsToday,
          newApplicationsToday,
          applicationsByStatus,
          topCategories,
        ] = await Promise.all([
          jobsCollection.countDocuments(),
          applicationsCollection.countDocuments(),
          jobsCollection.countDocuments({ created_at: { $gte: todayISO } }),
          applicationsCollection.countDocuments({
            created_at: { $gte: todayISO },
          }),
          applicationsCollection
            .aggregate([
              { $group: { _id: "$status", count: { $sum: 1 } } },
              { $project: { _id: 0, status: "$_id", count: 1 } },
            ])
            .toArray(),
          jobsCollection
            .aggregate([
              { $group: { _id: "$category", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 },
              { $project: { _id: 0, category: "$_id", count: 1 } },
            ])
            .toArray(),
        ]);

        const companiesList = await jobsCollection.distinct("company");

        res.json({
          success: true,
          stats: {
            totalJobs,
            totalApplications,
            totalCompanies: companiesList.length,
            newJobsToday,
            newApplicationsToday,
            applicationsByStatus,
            topCategories,
          },
        });
      } catch (error) {
        console.error("GET /api/admin/stats error:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch stats" });
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
