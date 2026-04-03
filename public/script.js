const participantID = localStorage.getItem("participantID");
if (!participantID) {
  window.location.href = "/";
}

const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalMethod = document.getElementById("retrieval-method");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const fileNameSpan = document.getElementById("file-name");
const docsList = document.getElementById("docs-list");
const emptyDocs = document.getElementById("empty-docs");

function logEvent(eventType, elementName) {
  fetch("/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantID, eventType, elementName })
  }).catch(function (err) {
    console.error("Event log error:", err);
  });
}

function scrollMessagesToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function attachHoverLogging(element, role) {
  element.addEventListener("mouseenter", function () {
    logEvent("hover", "message-" + role);
  });
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.classList.add("message", role);
  div.textContent = text;
  messagesContainer.appendChild(div);
  scrollMessagesToBottom();
  attachHoverLogging(div, role);
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
    renderDocuments(data.documents || []);
  } catch (error) {
    console.error("Error loading documents:", error);
  }
}

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
        appendMessage("user", entry.userInput);
        appendMessage("bot", 'Bot: "' + entry.botResponse + '"');
      });
    }
  } catch (error) {
    console.error("Error loading history:", error);
  }
}

async function sendMessage() {
  const text = inputField.value.trim();

  if (!text) {
    alert("Please enter a message.");
    return;
  }

  appendMessage("user", text);
  inputField.value = "";

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: text,
        message: text,
        participantID: participantID,
        retrievalMethod: retrievalMethod.value,
      }),
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      appendMessage("system", "Error: " + (data.error || "Failed to get a response."));
      return;
    }

    appendMessage("bot", 'Bot: "' + data.botResponse + '"');
  } catch (error) {
    console.error("Error sending message:", error);
    appendMessage("system", "Error: Failed to get a response.");
  }
}

sendBtn.addEventListener("click", function () {
  logEvent("click", "send-btn");
  sendMessage();
});

inputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

inputField.addEventListener("focus", function () {
  logEvent("focus", "user-input");
});

retrievalMethod.addEventListener("change", function () {
  const selected = retrievalMethod.value;
  logEvent("click", "retrieval-method");
  appendMessage("system", "Retrieval method changed to: " + selected);
});

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
      body: formData,
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

fileInput.addEventListener("change", function () {
  fileNameSpan.textContent = fileInput.files.length > 0
    ? fileInput.files[0].name
    : "No file chosen";
});

messagesContainer.addEventListener("mouseenter", function () {
  logEvent("hover", "messages-container");
});

loadDocuments();
loadHistory();