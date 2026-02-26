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
