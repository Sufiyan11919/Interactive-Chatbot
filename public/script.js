// ── Step 1: Guard — redirect to homepage if no participantID ─────────────────
const participantID = localStorage.getItem("participantID");
if (!participantID) {
  window.location.href = "/";
}

// ── Step 2: DOM references ────────────────────────────────────────────────────
const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalMethod = document.getElementById("retrieval-method");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const fileNameSpan = document.getElementById("file-name");
const docsList = document.getElementById("docs-list");
const emptyDocs = document.getElementById("empty-docs");

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

// ── Step 4: Helper — append a message bubble to the chat window ───────────────
function appendMessage(role, text) {
  const div = document.createElement("div");
  div.classList.add("message", role);
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Log hover events on each message bubble
  div.addEventListener("mouseenter", function () {
    logEvent("hover", "message-" + role);
  });
}

// RAG:Part4 - Document Listing (for UI): render the uploaded document list from MongoDB so the left panel reflects processed files.
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

// RAG:Part4 - Document Listing (for UI): fetch the current document inventory for the upload panel.
async function loadDocuments() {
  try {
    const response = await fetch("/documents");
    const data = await response.json();
    renderDocuments(data.documents || []);
  } catch (err) {
    console.error("Error loading documents:", err);
  }
}

// ── Step 5: Load chat history for this participant on page load ───────────────
fetch("/history", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ participantID })
})
  .then(function (response) {
    return response.json();
  })
  .then(function (data) {
    if (data.history && data.history.length > 0) {
      data.history.forEach(function (entry) {
        appendMessage("user", entry.userInput);
        appendMessage("bot", "Bot: \"" + entry.botResponse + "\"");
      });
      console.log("Chat history loaded for:", participantID);
    }
  })
  .catch(function (err) {
    console.error("Error loading history:", err);
  });

// ── Step 6: sendMessage — POST to /chat and display bot response ──────────────
function sendMessage() {
  const text = inputField.value.trim();

  if (!text) {
    alert("Please enter a message.");
    return;
  }

  appendMessage("user", text);
  inputField.value = "";

  const selectedMethod = retrievalMethod.value;

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, participantID, retrievalMethod: selectedMethod })
  })
    .then(function (response) { return response.json(); })
    .then(function (data) {
      console.log("Server response:", data);
      if (data.error) {
        appendMessage("system", "Error: " + data.error);
      } else {
        appendMessage("bot", "Bot: \"" + data.botResponse + "\"");
      }
    })
    .catch(function (error) { console.error("Error sending message:", error); });
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
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// RAG:Part4 - Document Upload + Storage (MongoDB): send the selected document to the backend for processing, chunking, embedding, and storage.
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
