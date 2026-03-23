require("dotenv").config();

const express  = require("express");
const mongoose = require("mongoose");
const { OpenAI } = require("openai");
const path     = require("path");

const Interaction = require("./models/Interaction");
const EventLog    = require("./models/EventLog");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// MongoDB Atlas 
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// OpenAI 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GET / — serve the participant homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// POST /chat — send message to OpenAI and save interaction to MongoDB
app.post("/chat", async (req, res) => {
  const { message, participantID, retrievalMethod } = req.body;

  console.log("User message:", message);
  console.log("Participant ID:", participantID);
  console.log("Retrieval method:", retrievalMethod);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }]
    });

    const botResponse = completion.choices[0].message.content;

    await Interaction.create({ participantID, userInput: message, botResponse });

    res.json({ userMessage: message, botResponse });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Failed to get a response." });
  }
});

// Start the server on port 3000
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});