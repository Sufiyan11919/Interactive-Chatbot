// Assignment 3 - EventLog model: captures user interaction events
const mongoose = require("mongoose");

const eventLogSchema = new mongoose.Schema({
  // In-Class Assignment: Handling Multiple Participants and Conversation History with Baseline Prototype
  participantID: { type: String, required: true },
  systemID: { type: Number, enum: [1, 2], default: 1 },
  eventType:     { type: String, required: true },
  elementName:   { type: String, required: true },
  timestamp:     { type: Date,   default: Date.now }
});

module.exports = mongoose.model("EventLog", eventLogSchema);
