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
const HISTORY_LIMIT = 5;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeRetrievalMethod(method) {
  return String(method || "semantic").toLowerCase() === "tfidf"
    ? "tfidf"
    : "semantic";
}

// In-Class Assignment: Handling Multiple Participants and Conversation History with Baseline Prototype
function normalizeParticipantID(participantID) {
  return String(participantID || "").trim();
}

function requireParticipantID(participantID, res) {
  const normalizedParticipantID = normalizeParticipantID(participantID);

  if (!normalizedParticipantID) {
    res.status(400).json({ error: "Participant ID is required." });
    return null;
  }

  return normalizedParticipantID;
}

function deriveSystemID(participantID) {
  const numericMatch = String(participantID || "").match(/\d+/);

  if (!numericMatch) {
    return 1;
  }

  return Number.parseInt(numericMatch[0], 10) % 2 === 0 ? 2 : 1;
}

function normalizeSystemID(systemID, participantID) {
  const parsedSystemID = Number.parseInt(systemID, 10);

  if (parsedSystemID === 1 || parsedSystemID === 2) {
    return parsedSystemID;
  }

  return deriveSystemID(participantID);
}

function normalizeHistoryLimit(limit) {
  const parsedLimit = Number.parseInt(limit, 10);

  if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
    return HISTORY_LIMIT;
  }

  return Math.min(parsedLimit, HISTORY_LIMIT);
}

function normalizeConversationHistory(history, limit = HISTORY_LIMIT) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-limit)
    .map((entry) => ({
      userInput: String(entry.userInput || "").trim(),
      botResponse: String(entry.botResponse || "").trim(),
    }))
    .filter((entry) => entry.userInput && entry.botResponse);
}

function buildConversationMessages(history) {
  return history.flatMap((entry) => [
    {
      role: "user",
      content: entry.userInput,
    },
    {
      role: "assistant",
      content: entry.botResponse,
    },
  ]);
}

function buildSystemPrompt(systemID) {
  const basePrompt =
    "You are a helpful research chatbot. Answer using the retrieved document evidence when it is relevant. If the evidence is weak or missing, say so clearly and answer cautiously.";

  if (systemID === 2) {
    return (
      basePrompt +
      " You are operating in System 2, which is currently a placeholder alternate condition that should behave consistently with the baseline system."
    );
  }

  return basePrompt;
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
  const participantID = requireParticipantID(req.query.participantID, res);
  if (!participantID) {
    return;
  }

  try {
    const documents = await Document.find({ participantID }, "_id filename processingStatus processedAt")
      .sort({ processedAt: -1, _id: -1 });
    res.json({ documents });
  } catch (err) {
    console.error("Documents error:", err.message);
    res.status(500).json({ error: "Failed to load documents." });
  }
});

app.post("/upload-document", upload.single("document"), async (req, res) => {
  let documentRecord = null;
  const participantID = requireParticipantID(req.body.participantID, res);
  if (!participantID) {
    return;
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY." });
  }

  try {
    documentRecord = await Document.create({
      participantID,
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
  const participantID = requireParticipantID(req.body.participantID, res);
  if (!participantID) {
    return;
  }

  const systemID = normalizeSystemID(req.body.systemID, participantID);
  const userInput = String(req.body.input || req.body.message || "").trim();
  const retrievalMethod = normalizeRetrievalMethod(req.body.retrievalMethod);
  const conversationHistory = normalizeConversationHistory(
    req.body.conversationHistory,
    normalizeHistoryLimit(req.body.limit || HISTORY_LIMIT)
  );

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
      participantID,
    });
    const retrievedDocuments = mapRetrievedDocuments(retrievedDocs);
    const evidenceContext = buildEvidenceContext(retrievedDocuments);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(systemID),
        },
        ...buildConversationMessages(conversationHistory),
        {
          role: "user",
          content:
            `Participant ID: ${participantID}\n` +
            `System ID: ${systemID}\n\n` +
            `User question:\n${userInput}\n\n` +
            `Retrieved evidence:\n${evidenceContext}\n\n` +
            "Answer the question using the evidence above when possible. Use the prior conversation when it is relevant and mention when the evidence is insufficient.",
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
      systemID,
      userInput,
      botResponse,
      retrievalMethod,
      retrievedDocuments,
      confidenceMetrics,
    });

    res.json({
      userMessage: userInput,
      botResponse,
      systemID,
      retrievalMethod,
      retrievedDocuments,
      confidenceMetrics,
    });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Failed to get a response." });
  }
});

// Assignment: Add a Study Workflow Page & Qualtrics Demographics Survey Link
// Returns a Qualtrics URL with the participantID appended so Qualtrics can
// capture it as Embedded Data.
app.post("/redirect-to-survey", (req, res) => {
  const participantID = requireParticipantID(req.body.participantID, res);
  if (!participantID) {
    return;
  }

  const qualtricsBaseUrl =
    "https://qualtricsxmlfb8zdymw.qualtrics.com/jfe/form/SV_beCMMGDygjV0il8";
  const surveyUrl =
    qualtricsBaseUrl + "?participantID=" + encodeURIComponent(participantID);

  res.send(surveyUrl);
});

app.post("/log-event", async (req, res) => {
  const participantID = requireParticipantID(req.body.participantID, res);
  if (!participantID) {
    return;
  }

  const systemID = normalizeSystemID(req.body.systemID, participantID);
  const { eventType, elementName } = req.body;

  try {
    await EventLog.create({ participantID, systemID, eventType, elementName });
    res.json({ success: true });
  } catch (err) {
    console.error("Event log error:", err.message);
    res.status(500).json({ error: "Failed to log event." });
  }
});

app.post("/history", async (req, res) => {
  const participantID = requireParticipantID(req.body.participantID, res);
  if (!participantID) {
    return;
  }

  const limit = normalizeHistoryLimit(req.body.limit);

  try {
    const interactions = await Interaction.find({ participantID })
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit)
      .lean();

    res.json({ history: interactions.reverse() });
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
