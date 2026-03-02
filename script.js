// Step 1: Constant variables retrieved by ID
const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");

// Step 2: sendMessage function
function sendMessage() {
  const text = inputField.value.trim();

  if (!text) {
    alert("Please enter a message.");
    return;
  }

  // Display user message in chat window
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "user");
  msgDiv.textContent = text;
  messagesContainer.appendChild(msgDiv);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Clear input field
  inputField.value = "";
}

// Step 3: Click listener on send button
sendBtn.addEventListener("click", sendMessage);

// Step 4: Enter key listener on input field
inputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Document Upload Functionality
// Step 6: Upload button logs selected file and adds to doc list
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const fileNameSpan = document.getElementById("file-name");
const docsList = document.getElementById("docs-list");
const emptyDocs = document.getElementById("empty-docs");

// Update file name display when a file is selected
fileInput.addEventListener("change", function () {
  if (fileInput.files.length > 0) {
    fileNameSpan.textContent = fileInput.files[0].name;
  } else {
    fileNameSpan.textContent = "No file chosen";
  }
});


