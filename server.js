require("dotenv").config();

// 2.1 Import Express
const express = require("express");
const mongoose = require("mongoose");

// 4. Backend Step 2: Import models
const Interaction = require("./models/Interaction");
const EventLog    = require("./models/EventLog");

// 2.2 Initialize an Express app
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// 2.3 Serve static files from the public folder
app.use(express.static("public"));

// 2. Set up MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Serve index.html on the root route
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// 2.4 POST route
app.post("/chat", (req, res) => {
  const { message, retrievalMethod } = req.body;
  console.log("User message:", message);
  console.log("Retrieval method:", retrievalMethod);

  res.json({
    userMessage: message,
    botResponse: "Message Received!"
  });
});

// 2.5 Listen on port 3000
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
