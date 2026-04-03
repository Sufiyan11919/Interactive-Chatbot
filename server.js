const fs = require("fs/promises");
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.config"), override: false });

const Interaction = require("./models/Interaction");
const EventLog = require("./models/EventLog");
const Document = require("./models/Document");
const documentProcessor = require("./services/documentProcessor");
const embeddingService = require("./services/embeddingService");
const retrievalService = require("./services/retrievalService");
const confidenceCalculator = require("./services/confidenceCalculator");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
const upload = multer({ dest: uploadDir });
const PORT = process.env.PORT || 3000;
const RETRIEVAL_TOP_K = 3;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeRetrievalMethod(method) {
  return String(method || "semantic").toLowerCase() === "tfidf"
    ? "tfidf"
    : "semantic";
}

function mapRetrievedDocuments(retrievedDocs) {
  return retrievedDocs.map((doc) => ({
    docName: doc.documentName || doc.docName || "Unknown Document",
    chunkIndex: doc.chunkIndex,
    chunkText: doc.chunkText || doc.text || "",
    relevanceScore: doc.relevanceScore ?? doc.score ?? 0,
  }));
}

function buildEvidenceContext(retrievedDocuments) {
  if (!retrievedDocuments.length) {
    return "No relevant document evidence was retrieved.";
  }

  return retrievedDocuments
    .map(
      (doc, index) =>
        `[${index + 1}] ${doc.docName} | chunk ${doc.chunkIndex} | score ${doc.relevanceScore.toFixed(4)}\n${doc.chunkText}`
    )
    .join("\n\n");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

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

app.post("/chat", async (req, res) => {
  const participantID = String(req.body.participantID || "anonymous").trim() || "anonymous";
  const userInput = String(req.body.input || req.body.message || "").trim();
  const retrievalMethod = normalizeRetrievalMethod(req.body.retrievalMethod);

  if (!userInput) {
    return res.status(400).json({ error: "Please enter a message." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY." });
  }

  try {
    const retrievedDocs = await retrievalService.retrieve(userInput, {
      method: retrievalMethod,
      topK: RETRIEVAL_TOP_K,
      minScore: retrievalMethod === "tfidf" ? 0 : 0.3,
    });
    const retrievedDocuments = mapRetrievedDocuments(retrievedDocs);
    const evidenceContext = buildEvidenceContext(retrievedDocuments);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful research chatbot. Answer using the retrieved document evidence when it is relevant. If the evidence is weak or missing, say so clearly and answer cautiously.",
        },
        {
          role: "user",
          content: `Participant ID: ${participantID}\n\nUser question:\n${userInput}\n\nRetrieved evidence:\n${evidenceContext}\n\nAnswer the question using the evidence above when possible. Mention when the evidence is insufficient.`,
        },
      ],
    });

    const botResponse = completion.choices[0].message.content || "No response generated.";
    const confidenceMetrics = confidenceCalculator.calculate({
      retrievedDocs,
      retrievalMethod,
    });

    await Interaction.create({
      participantID,
      userInput,
      botResponse,
      retrievalMethod,
      retrievedDocuments,
      confidenceMetrics,
    });

    res.json({
      userMessage: userInput,
      botResponse,
      retrievalMethod,
      retrievedDocuments,
      confidenceMetrics,
    });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Failed to get a response." });
  }
});

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