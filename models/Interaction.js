// Assignment 3 - Interaction model: captures user messages and bot responses
const mongoose = require("mongoose");

const retrievedDocumentSchema = new mongoose.Schema(
  {
    docName: { type: String, default: "" },
    chunkIndex: { type: Number, default: 0 },
    chunkText: { type: String, default: "" },
    relevanceScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const confidenceMetricsSchema = new mongoose.Schema(
  {
    overallConfidence: { type: Number, default: 0 },
    retrievalConfidence: { type: Number, default: 0 },
    responseConfidence: { type: Number, default: null },
    retrievalMethod: { type: String, default: "unknown" },
  },
  { _id: false }
);

const interactionSchema = new mongoose.Schema({
  // In-Class Assignment: Handling Multiple Participants and Conversation History with Baseline Prototype
  participantID: { type: String, required: true },
  systemID: { type: Number, enum: [1, 2], default: 1 },
  userInput:     { type: String, required: true },
  botResponse:   { type: String, required: true },
  retrievalMethod: { type: String, default: "semantic" },
  retrievedDocuments: { type: [retrievedDocumentSchema], default: [] },
  confidenceMetrics: { type: confidenceMetricsSchema, default: null },
  timestamp:     { type: Date,   default: Date.now }
});

module.exports = mongoose.model("Interaction", interactionSchema);
