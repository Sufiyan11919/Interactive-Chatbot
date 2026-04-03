// RAG:Part4 - Document Upload + Storage (MongoDB): store uploaded documents, processed text, and chunk embeddings for later retrieval.
const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema(
  {
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    startChar: { type: Number, default: 0 },
    endChar: { type: Number, default: 0 },
    embedding: { type: [Number], default: [] },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  text: { type: String, default: "" },
  chunks: { type: [chunkSchema], default: [] },
  processingStatus: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  processedAt: { type: Date, default: null },
});

module.exports = mongoose.model("Document", documentSchema);
