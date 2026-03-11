const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalMethod = document.getElementById("retrieval-method");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const fileNameSpan = document.getElementById("file-name");
const docsList = document.getElementById("docs-list");
const emptyDocs = document.getElementById("empty-docs");

// Send user message and display it in the chat window
function sendMessage() {
  const text = inputField.value.trim();

  if (!text) {
    alert("Please enter a message.");
    return;
  }

  const msgDiv
  msgDiv.classList.add("message", "user");
  msgDiv.textContent = text;
  messagesContainer.appendChild(msgDiv);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  inputField.value = "";
}

sendBtn.addEventListener("click", sendMessage);
inputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Log and display retrieval method change
retrievalMethod.addEventListener("change", function () {
  const selected = retrievalMethod.value;
  console.log("Retrieval method: " + selected);

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "system");
  msgDiv.textContent = "Retrieval method changed to: " + selected;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Update file name display when a file is selected
fileInput.addEventListener("change", function () {
  if (fileInput.files.length > 0) {
    fileNameSpan.textContent = fileInput.files[0].name;
  } else {
    fileNameSpan.textContent = "No file chosen";
  }
});

// Upload button: log selected file and add to document list
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
