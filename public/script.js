// ── Step 1: Guard — redirect to homepage if no participantID ─────────────────
const participantID = localStorage.getItem("participantID");
if (!participantID) {
  window.location.href = "/";
}

// ── Step 2: DOM references ────────────────────────────────────────────────────
const inputField        = document.getElementById("user-input");
const sendBtn           = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalMethod   = document.getElementById("retrieval-method");
const uploadBtn         = document.getElementById("upload-btn");
const fileInput         = document.getElementById("file-input");
const fileNameSpan      = document.getElementById("file-name");
const docsList          = document.getElementById("docs-list");
const emptyDocs         = document.getElementById("empty-docs");

// ── Step 3: Helper — log an event to /log-event ───────────────────────────────
function logEvent(eventType, elementName) {
  fetch("/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantID, eventType, elementName })
  }).catch(function (err) {
    console.error("Event log error:", err);
  });
}

function formatConfidence(value) {
  if (value === null || typeof value !== "number") {
    return "N/A";
  }

  return (value * 100).toFixed(1) + "%";
}

function scrollMessagesToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function attachHoverLogging(element, role) {
  element.addEventListener("mouseenter", function () {
    logEvent("hover", "message-" + role);
  });
}

// ── Step 4: Helper — append a message bubble to the chat window ───────────────
function appendMessage(role, text) {
  const div = document.createElement("div");
  div.classList.add("message", role);
  div.textContent = text;
  messagesContainer.appendChild(div);
  scrollMessagesToBottom();

  attachHoverLogging(div, role);
}

function createEvidenceSection(retrievedDocuments) {
  const section = document.createElement("div");
  section.classList.add("evidence-section");

  const title = document.createElement("div");
  title.classList.add("detail-title");
  title.textContent = "Retrieved Evidence";
  section.appendChild(title);

  if (!retrievedDocuments || retrievedDocuments.length === 0) {
    const empty = document.createElement("p");
    empty.classList.add("detail-empty");
    empty.textContent = "No evidence retrieved for this response.";
    section.appendChild(empty);
    return section;
  }

  retrievedDocuments.forEach(function (doc) {
    const item = document.createElement("div");
    item.classList.add("evidence-item");

    const meta = document.createElement("div");
    meta.classList.add("evidence-meta");
    meta.textContent =
      doc.docName +
      " | Chunk " +
      doc.chunkIndex +
      " | Score " +
      (typeof doc.relevanceScore === "number" ? doc.relevanceScore.toFixed(4) : "0.0000");

    const text = document.createElement("div");
    text.classList.add("evidence-text");
    text.textContent = doc.chunkText;

    item.appendChild(meta);
    item.appendChild(text);
    section.appendChild(item);
  });

  return section;
}

function createConfidenceSection(confidenceMetrics, retrievalMethodValue) {
  const section = document.createElement("div");
  section.classList.add("confidence-section");

  const title = document.createElement("div");
  title.classList.add("detail-title");
  title.textContent = "Confidence";
  section.appendChild(title);

  if (!confidenceMetrics) {
    const empty = document.createElement("p");
    empty.classList.add("detail-empty");
    empty.textContent = "No confidence metrics available.";
    section.appendChild(empty);
    return section;
  }

  const metrics = [
    "Overall: " + formatConfidence(confidenceMetrics.overallConfidence),
    "Retrieval: " + formatConfidence(confidenceMetrics.retrievalConfidence),
    "Response: " + formatConfidence(confidenceMetrics.responseConfidence),
    "Method: " + (confidenceMetrics.retrievalMethod || retrievalMethodValue || "unknown")
  ];

  metrics.forEach(function (metric) {
    const row = document.createElement("div");
    row.classList.add("confidence-row");
    row.textContent = metric;
    section.appendChild(row);
  });

  return section;
}

function appendBotResponse(botResponse, retrievedDocuments, confidenceMetrics, retrievalMethodValue) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "bot", "bot-response");

  const messageText = document.createElement("div");
  messageText.classList.add("message-text");
  messageText.textContent = "Bot: \"" + botResponse + "\"";
  wrapper.appendChild(messageText);

  const methodBadge = document.createElement("div");
  methodBadge.classList.add("method-badge");
  methodBadge.textContent = "Retrieval: " + (retrievalMethodValue || "semantic");
  wrapper.appendChild(methodBadge);

  wrapper.appendChild(createConfidenceSection(confidenceMetrics, retrievalMethodValue));
  wrapper.appendChild(createEvidenceSection(retrievedDocuments));

  messagesContainer.appendChild(wrapper);
  scrollMessagesToBottom();
  attachHoverLogging(wrapper, "bot");
}

function renderDocuments(documents) {
  docsList.innerHTML = "";

  if (!documents || documents.length === 0) {
    emptyDocs.style.display = "block";
    return;
  }

  emptyDocs.style.display = "none";

  documents.forEach(function (doc) {
    const li = document.createElement("li");
    const processedAt = doc.processedAt
      ? new Date(doc.processedAt).toLocaleString()
      : "Not processed yet";
    li.textContent = doc.filename + " (" + doc.processingStatus + ") - " + processedAt;
    docsList.appendChild(li);
  });
}

async function loadDocuments() {
  try {
    const response = await fetch("/documents");
    const data = await response.json();
    const documents = Array.isArray(data) ? data : data.documents;
    renderDocuments(documents || []);
  } catch (err) {
    console.error("Error loading documents:", err);
  }
}

function renderInteraction(entry) {
  appendMessage("user", entry.userInput);
  appendBotResponse(
    entry.botResponse,
    entry.retrievedDocuments || [],
    entry.confidenceMetrics || null,
    entry.retrievalMethod || "semantic"
  );
}

// ── Step 5: Load chat history for this participant on page load ───────────────
async function loadHistory() {
  try {
    const response = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID })
    });
    const data = await response.json();

    if (data.history && data.history.length > 0) {
      data.history.forEach(function (entry) {
        renderInteraction(entry);
      });
      console.log("Chat history loaded for:", participantID);
    }
  } catch (err) {
    console.error("Error loading history:", err);
  }
}

// ── Step 6: sendMessage — POST to /chat and display bot response ──────────────
async function sendMessage() {
  const text = inputField.value.trim();

  if (!text) {
    alert("Please enter a message.");
    return;
  }

  appendMessage("user", text);
  inputField.value = "";

  const selectedMethod = retrievalMethod.value;
  sendBtn.disabled = true;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: text,
        message: text,
        participantID: participantID,
        retrievalMethod: selectedMethod
      })
    });
    const data = await response.json();

    console.log("Server response:", data);
    if (!response.ok || data.error) {
      appendMessage("system", "Error: " + (data.error || "Failed to get a response."));
      return;
    }

    appendBotResponse(
      data.botResponse,
      data.retrievedDocuments || [],
      data.confidenceMetrics || null,
      data.retrievalMethod || selectedMethod
    );
  } catch (error) {
    console.error("Error sending message:", error);
    appendMessage("system", "Error: Failed to get a response.");
  } finally {
    sendBtn.disabled = false;
  }
}

// ── Step 7: Send button — click listener + event log ─────────────────────────
sendBtn.addEventListener("click", function () {
  logEvent("click", "send-btn");
  sendMessage();
});

// ── Step 8: Enter key listener ────────────────────────────────────────────────
inputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// ── Step 9: Focus event on text input ────────────────────────────────────────
inputField.addEventListener("focus", function () {
  logEvent("focus", "user-input");
});

// ── Step 10: Retrieval method dropdown — change listener ─────────────────────
retrievalMethod.addEventListener("change", function () {
  const selected = retrievalMethod.value;
  console.log("Retrieval method: " + selected);
  logEvent("click", "retrieval-method");

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "system");
  msgDiv.textContent = "Retrieval method changed to: " + selected;
  messagesContainer.appendChild(msgDiv);
  scrollMessagesToBottom();
});

// ── Step 11: Upload button — click listener + event log ──────────────────────
uploadBtn.addEventListener("click", async function () {
  logEvent("click", "upload-btn");

  if (fileInput.files.length === 0) {
    alert("Please choose a TXT or PDF document first.");
    return;
  }

  const formData = new FormData();
  formData.append("document", fileInput.files[0]);

  uploadBtn.disabled = true;

  try {
    const response = await fetch("/upload-document", {
      method: "POST",
      body: formData
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      appendMessage("system", "Upload error: " + (data.error || "Failed to upload document."));
      return;
    }

    fileInput.value = "";
    fileNameSpan.textContent = "No file chosen";
    appendMessage(
      "system",
      "Uploaded " + data.document.filename + " with " + data.document.chunkCount + " processed chunks."
    );
    await loadDocuments();
  } catch (error) {
    console.error("Upload error:", error);
    appendMessage("system", "Upload error: Failed to upload document.");
  } finally {
    uploadBtn.disabled = false;
    await loadDocuments();
  }
});

// ── Step 12: File input — change listener ────────────────────────────────────
fileInput.addEventListener("change", function () {
  if (fileInput.files.length > 0) {
    fileNameSpan.textContent = fileInput.files[0].name;
  } else {
    fileNameSpan.textContent = "No file chosen";
  }
});

// ── Step 13: Hover event on the messages container ───────────────────────────
messagesContainer.addEventListener("mouseenter", function () {
  logEvent("hover", "messages-container");
});

loadDocuments();
loadHistory();
