const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const saltRounds = 10;

const db = admin.database();
const usersRef = db.ref("users"); // Update with the path where you want to store users

const app = express();
app.use(bodyParser.json());

// Signup route
router.post("/usersignup", async (req, res) => {
  try {
    const { name, email, password, isActive, designation } = req.body;

    // Validate inputs
    if (!name || !email || !password || !designation) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const hashpassword = await bcrypt.hash(password, saltRounds);

    console.log(hashpassword);

    // Create user object
    const newUser = {
      name,
      email,
      hashpassword,
      isActive: isActive || false,
      designation,
    };

    // Store user data in Firebase
    const newUserRef = usersRef.push();
    await newUserRef.set(newUser);

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
