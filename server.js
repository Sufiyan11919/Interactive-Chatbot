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
// Milestone 3 - Enhanced prototype: System 2 uses richer retrieval for structured comparison mode.
const ENHANCED_COMPARISON_TOP_K = 8;
const HISTORY_LIMIT = 5;
// Milestone 3 - Enhanced prototype: supported study modes for the System 2 interface.
const STUDY_MODES = new Set(["general", "explain", "compare", "define", "simplify"]);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeRetrievalMethod(method) {
  return String(method || "semantic").toLowerCase() === "tfidf"
    ? "tfidf"
    : "semantic";
}

// Milestone 3 - Enhanced prototype: normalize the study mode selected in the System 2 UI.
function normalizeStudyMode(mode) {
  const normalizedMode = String(mode || "general").toLowerCase();
  return STUDY_MODES.has(normalizedMode) ? normalizedMode : "general";
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
    // Milestone 3 - Enhanced prototype: course-aware prompt for the System 2 study assistant.
    return (
      "You are an enhanced AI study assistant for master's students in a reading-heavy computer science course. " +
      "Ground answers in the student's uploaded research papers, lecture slides, and notes whenever evidence is available. " +
      "Prioritize conceptual understanding over generic summary: define terms, explain why ideas matter, use simple language, and give concrete examples. " +
      "Use prior conversation context to support follow-up questions. If the student asks for clarification, change explanation strategy instead of repeating the same wording. " +
      "When comparing sources, synthesize across retrieved documents with clear headings such as Paper says, Slides or other source says, Key differences, and Study takeaway. " +
      "When evidence is weak, missing, or only comes from one source, state that limitation clearly."
    );
  }

  return basePrompt;
}

// Milestone 3 - Enhanced prototype: add mode-specific answer structure for System 2 without changing System 1 behavior.
function buildChatUserPrompt({
  participantID,
  systemID,
  studyMode,
  userInput,
  evidenceContext,
}) {
  const sharedPrompt =
    `Participant ID: ${participantID}\n` +
    `System ID: ${systemID}\n\n` +
    `User question:\n${userInput}\n\n` +
    `Retrieved evidence:\n${evidenceContext}\n\n`;

  if (systemID !== 2) {
    return (
      sharedPrompt +
      "Answer the question using the evidence above when possible. Use the prior conversation when it is relevant and mention when the evidence is insufficient."
    );
  }

  const modeInstructions = {
    general:
      "Answer as a course-aware study assistant. Ground the response in the evidence, explain the concept clearly, and include a concise study takeaway.",
    explain:
      "Explain the concept for a graduate student. Use the headings: What it means, Why it matters, Simple example, Study takeaway.",
    compare:
      "Compare how the retrieved sources explain the same concept. Use the headings: Paper says, Slides or other source says, Key differences, Study takeaway. If fewer than two sources are retrieved, say that the comparison is limited.",
    define:
      "Define the term using the course materials. Use the headings: Definition, Course context, Plain-language explanation, Example.",
    simplify:
      "The student is asking for clarification. Do not simply restate the previous answer. Use the headings: Simpler explanation, Analogy, Step-by-step breakdown, Concrete example.",
  };

  return (
    sharedPrompt +
    `Study mode: ${studyMode}\n` +
    modeInstructions[studyMode] +
    " Use prior conversation only when it helps the student's current learning goal, and be explicit when the uploaded evidence is insufficient."
  );
}

// Milestone 3 - Enhanced prototype: prefer multiple source documents when comparison mode has enough evidence.
function diversifyRetrievedDocuments(retrievedDocs, topK) {
  if (!Array.isArray(retrievedDocs) || retrievedDocs.length <= 1) {
    return retrievedDocs || [];
  }

  const selected = [];
  const selectedKeys = new Set();
  const usedDocs = new Set();

  retrievedDocs.forEach((doc) => {
    const docKey = doc.documentName || doc.docName || String(doc.documentId || "");
    const chunkKey = `${docKey}:${doc.chunkIndex}`;

    if (!usedDocs.has(docKey) && !selectedKeys.has(chunkKey) && selected.length < topK) {
      selected.push(doc);
      selectedKeys.add(chunkKey);
      usedDocs.add(docKey);
    }
  });

  retrievedDocs.forEach((doc) => {
    const docKey = doc.documentName || doc.docName || String(doc.documentId || "");
    const chunkKey = `${docKey}:${doc.chunkIndex}`;

    if (!selectedKeys.has(chunkKey) && selected.length < topK) {
      selected.push(doc);
      selectedKeys.add(chunkKey);
    }
  });

  return selected;
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
    // Milestone 3 - Enhanced prototype: count chunks without pulling stored embeddings into the documents list.
    const documents = await Document.aggregate([
      { $match: { participantID } },
      {
        $project: {
          filename: 1,
          processingStatus: 1,
          processedAt: 1,
          chunkCount: { $size: { $ifNull: ["$chunks", []] } },
        },
      },
      { $sort: { processedAt: -1, _id: -1 } },
    ]);

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
  const studyMode = systemID === 2 ? normalizeStudyMode(req.body.studyMode) : "general";
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
    const retrievalTopK = systemID === 2 && studyMode === "compare"
      ? ENHANCED_COMPARISON_TOP_K
      : RETRIEVAL_TOP_K;
    const rawRetrievedDocs = await retrievalService.retrieve(userInput, {
      method: retrievalMethod,
      topK: retrievalTopK,
      minScore: retrievalMethod === "tfidf" ? 0 : 0.3,
      participantID,
    });
    const retrievedDocs = systemID === 2 && studyMode === "compare"
      ? diversifyRetrievedDocuments(rawRetrievedDocs, ENHANCED_COMPARISON_TOP_K)
      : rawRetrievedDocs;
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
          content: buildChatUserPrompt({
            participantID,
            systemID,
            studyMode,
            userInput,
            evidenceContext,
          }),
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
      studyMode,
      retrievedDocuments,
      confidenceMetrics,
    });

    res.json({
      userMessage: userInput,
      botResponse,
      systemID,
      retrievalMethod,
      studyMode,
      retrievedDocuments,
      confidenceMetrics,
    });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Failed to get a response." });
  }
});

// Milestone 4(a): Questionnaires & Study Proposal
// Centralised Qualtrics URL registry — one place to update survey links.
const QUALTRICS_URLS = {
  demographics: "https://usfca.qualtrics.com/jfe/form/SV_bw8HUBhxCrsgCcS",
  pretask:      "https://usfca.qualtrics.com/jfe/form/SV_0uKrVAYyE7Ni4Zw",
  posttask:     "https://usfca.qualtrics.com/jfe/form/SV_9pByP04yCiyiyKq",
};

// General Qualtrics redirect — supports demographics, pretask, and posttask.
// Always appends participantID, systemID, and an optional returnUrl so
// Qualtrics can send participants back to the workflow page after submission.
app.post("/redirect-to-qualtrics", (req, res) => {
  const participantID = requireParticipantID(req.body.participantID, res);
  if (!participantID) {
    return;
  }

  const systemID  = normalizeSystemID(req.body.systemID, participantID);
  const surveyType = String(req.body.surveyType || "").trim();
  const returnUrl  = String(req.body.returnUrl  || "").trim();

  const qualtricsBaseUrl = QUALTRICS_URLS[surveyType];
  if (!qualtricsBaseUrl) {
    return res.status(400).json({ error: "Invalid survey type." });
  }

  const surveyUrl = new URL(qualtricsBaseUrl);
  surveyUrl.searchParams.set("participantID", participantID);
  surveyUrl.searchParams.set("systemID", String(systemID));

  if (returnUrl) {
    surveyUrl.searchParams.set("returnUrl", returnUrl);
  }

  res.send(surveyUrl.toString());
});

// Backward-compatible wrapper kept so any existing bookmarks or tests
// that call /redirect-to-survey still work.
app.post("/redirect-to-survey", (req, res, next) => {
  req.body.surveyType = req.body.surveyType || "demographics";
  req.url = "/redirect-to-qualtrics";
  app.handle(req, res, next);
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
