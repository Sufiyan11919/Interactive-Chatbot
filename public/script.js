// Assignment 1, Step 1 - Constant variables retrieved by ID
const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalMethod = document.getElementById("retrieval-method");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const fileNameSpan = document.getElementById("file-name");
const docsList = document.getElementById("docs-list");
const emptyDocs = document.getElementById("empty-docs");

// Step 2: Helper — append a message bubble to the chat window
function appendMessage(role, text) {
  const div = document.createElement("div");
  div.classList.add("message", role);
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Step 3: sendMessage — POST to /chat with participantID, display bot response
function sendMessage() {
  const text          = inputField.value.trim();
  const participantID = localStorage.getItem("participantID") || "anonymous";

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
        appendMessage("bot", 'Bot: "' + data.botResponse + '"');
      }
    })
    .catch(function (error) { console.error("Error sending message:", error); });
}

// Step 4: Click listener on send button
sendBtn.addEventListener("click", sendMessage);

// Step 5: Enter key listener
inputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter") { sendMessage(); }
});

// Step 6: Retrieval method dropdown
retrievalMethod.addEventListener("change", function () {
  const selected = retrievalMethod.value;
  console.log("Retrieval method: " + selected);
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "system");
  msgDiv.textContent = "Retrieval method changed to: " + selected;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Step 7: Upload button
uploadBtn.addEventListener("click", function () {
  if (fileInput.files.length > 0) {
    const name = fileInput.files[0].name;
    const li = document.createElement("li");
    li.textContent = name;
    docsList.appendChild(li);
    emptyDocs.style.display = "none";
    console.log("Selected file: " + name);
  } else {
    console.log("No file chosen");
  }
});

// Step 8: File input change
fileInput.addEventListener("change", function () {
  fileNameSpan.textContent = fileInput.files.length > 0
    ? fileInput.files[0].name
    : "No file chosen";
});
