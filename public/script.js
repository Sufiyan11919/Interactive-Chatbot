// Step 1: Constant variables retrieved by ID
const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalMethod = document.getElementById("retrieval-method");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const fileNameSpan = document.getElementById("file-name");
const docsList = document.getElementById("docs-list");
const emptyDocs = document.getElementById("empty-docs");

// Step 2: sendMessage() function
function sendMessage() {
  const text = inputField.value.trim();

  if (!text) {
    alert("Please enter a message.");
    return;
  }

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "user");
  msgDiv.textContent = text;
  messagesContainer.appendChild(msgDiv);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  inputField.value = "";

  // Send message and retrieval method to backend server via fetch
  const selectedMethod = retrievalMethod.value;

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, retrievalMethod: selectedMethod })
  }).then(function (response) {
      return response.json();
    }).then(function (data) {
      // testing console response
      console.log("Server response:", data);

      // Displaying bot response in chat window
      const botDiv = document.createElement("div");
      botDiv.classList.add("message", "bot");
      botDiv.textContent = 'Bot: "' + data.botResponse + '"';
      messagesContainer.appendChild(botDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }).catch(function (error) {
      console.error("Error sending message:", error);
    });
}

// Step 3: Click listener on send button
sendBtn.addEventListener("click", sendMessage);

// Step 4: Enter key listener on input field
inputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Step 5: Change listener for retrieval dropdown
retrievalMethod.addEventListener("change", function () {
  const selected = retrievalMethod.value;
  console.log("Retrieval method: " + selected);

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "system");
  msgDiv.textContent = "Retrieval method changed to: " + selected;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

fileInput.addEventListener("change", function () {
  if (fileInput.files.length > 0) {
    fileNameSpan.textContent = fileInput.files[0].name;
  } else {
    fileNameSpan.textContent = "No file chosen";
  }
});

// Step 6: Upload button logs selected file and adds to document list
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
