require("dotenv").config();

const fs = require("fs/promises");
const express  = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { OpenAI } = require("openai");
const path     = require("path");

const Interaction = require("./models/Interaction");
const EventLog    = require("./models/EventLog");
const Document = require("./models/Document");
const documentProcessor = require("./services/documentProcessor");
const embeddingService = require("./services/embeddingService");
const retrievalService = require("./services/retrievalService");

const app = express();
// RAG:Part4 - Document Upload + Storage (MongoDB): keep uploaded files in a temporary folder while they are processed into chunks and embeddings.
const uploadDir = path.join(__dirname, "uploads");
const upload = multer({ dest: uploadDir });
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// OpenAI 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GET / — serve the participant homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// RAG:Part4 - Document Listing (for UI): return stored documents so the left panel can show what has already been processed.
app.get("/documents", async (req, res) => {
  try {
    const documents = await Document.find({}, "_id filename processingStatus processedAt")
      .sort({ processedAt: -1, _id: -1 });

    res.json({ documents });
  } catch (err) {
    console.error("Documents error:", err.message);
    res.status(500).json({ error: "Failed to load documents." });
  }
});

// RAG:Part4 - Document Upload + Storage (MongoDB): process TXT/PDF uploads, generate chunk embeddings, store the completed document, and rebuild the TF-IDF index.
app.post("/upload-document", upload.single("document"), async (req, res) => {
  let documentRecord = null;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY." });
  }

  try {
    documentRecord = await Document.create({
      filename: req.file.originalname,
      processingStatus: "processing",
    });

    const processedDocument = await documentProcessor.processDocument(req.file);
    const chunksWithEmbeddings = await embeddingService.generateEmbeddings(processedDocument.chunks);

    documentRecord.text = processedDocument.fullText;
    documentRecord.chunks = chunksWithEmbeddings.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      embedding: chunk.embedding,
    }));
    documentRecord.processingStatus = "completed";
    documentRecord.processedAt = new Date();
    await documentRecord.save();

    await retrievalService.rebuildIndex();

    res.json({
      status: "success",
      document: {
        id: documentRecord._id,
        filename: documentRecord.filename,
        processingStatus: documentRecord.processingStatus,
        processedAt: documentRecord.processedAt,
        chunkCount: documentRecord.chunks.length,
      },
    });
  } catch (err) {
    console.error("Upload error:", err.message);

    if (documentRecord) {
      documentRecord.processingStatus = "failed";
      documentRecord.processedAt = new Date();
      await documentRecord.save().catch(() => {});
    }

    res.status(500).json({ error: "Failed to process document." });
  } finally {
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
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

// POST /log-event — log a user interaction event to MongoDB
app.post("/log-event", async (req, res) => {
  const { participantID, eventType, elementName } = req.body;

  try {
    await EventLog.create({ participantID, eventType, elementName });
    res.json({ success: true });
  } catch (err) {
    console.error("Event log error:", err.message);
    res.status(500).json({ error: "Failed to log event." });
  }
});

// POST /history — return a participant's full chat history
app.post("/history", async (req, res) => {
  const { participantID } = req.body;

  try {
    const interactions = await Interaction.find({ participantID }).sort({ timestamp: 1 });
    res.json({ history: interactions });
  } catch (err) {
    console.error("History error:", err.message);
    res.status(500).json({ error: "Failed to retrieve history." });
  }
});

// RAG:Part4 - Retrieval Methods: initialize the TF-IDF index after MongoDB connects so uploaded documents are ready for later retrieval work.
async function startServer() {
  await fs.mkdir(uploadDir, { recursive: true });
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB Atlas");

  await retrievalService.initialize();

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Startup error:", err.message);
});
