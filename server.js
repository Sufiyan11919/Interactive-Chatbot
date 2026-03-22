require("dotenv").config();

// Assignment 2 - Import Express
const express = require("express");
const mongoose = require("mongoose");

// Assignment 3 - Import models
const Interaction = require("./models/Interaction");
const EventLog    = require("./models/EventLog");

// Assignment 2 - Initialize an Express app
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Assignment 2 - Serve static files from the public folder
app.use(express.static("public"));

// Assignment 3 - Set up MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Serve index.html on the root route
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Assignment 2 - POST /chat route
app.post("/chat", (req, res) => {
  const { message, retrievalMethod } = req.body;
  console.log("User message:", message);
  console.log("Retrieval method:", retrievalMethod);

  res.json({
    userMessage: message,
    botResponse: "Message Received!"
  });
});

// Assignment 2 - Listen on port 3000
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
