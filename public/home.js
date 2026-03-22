// Assignment 3 - Save Participant ID to localStorage and navigate to chatbot
const startBtn         = document.getElementById("start-btn");
const participantInput = document.getElementById("participant-id");

// Pre-fill if a Participant ID is already saved
const saved = localStorage.getItem("participantID");
if (saved) {
  participantInput.value = saved;
}

function startChat() {
  const id = participantInput.value.trim();
  if (!id) {
    alert("Please enter a Participant ID.");
    return;
  }
  localStorage.setItem("participantID", id);
  window.location.href = "/chat.html";
}

// Click listener
startBtn.addEventListener("click", startChat);

// Enter key listener
participantInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    startChat();
  }
});
