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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });

    const myDB = client.db("QuickHire");
    const userCollection = myDB.collection("users");

    // users api ###########################################

    // -------------------------------------register user----------------------------------------------
    app.post("/api/auth/register", async (req, res) => {
      try {
        const { name, email, password } = req.body;

        // validation
        const errors = [];
        if (!name || !name.trim()) errors.push("name is required");
        if (!email) errors.push("email is required");

        if (!password) errors.push("password is required");
        else if (password.length < 6)
          errors.push("password must be at least 6 characters");

        if (errors.length > 0) {
          return res.status(400).json({ success: false, errors });
        }

        // duplicate check
        const existing = await userCollection.findOne({
          email: email.toLowerCase(),
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: "An account with this email already exists",
          });
        }

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

        // never return password
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

    // --------------------------------login user-----------------------------------
    app.post("/api/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: "Email and password are required",
          });
        }

        const user = await userCollection.findOne({
          email: email.toLowerCase(),
        });

        if (!user) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid email or password" });
        }

        const { password: _, ...userWithoutPassword } = user;

        res.json({ success: true, user: userWithoutPassword });
      } catch (error) {
        console.error("POST /api/auth/login error:", error);
        res.status(500).json({ success: false, message: "Login failed" });
      }
    });

    console.log(
      `Pinged your deployment. You successfully connected to MongoDB!${port}`,
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
