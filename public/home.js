// Assignment 3 - Save Participant ID to localStorage and navigate to chatbot
const participantForm = document.getElementById("participant-form");
const participantInput = document.getElementById("participantID");

// In-Class Assignment: Handling Multiple Participants and Conversation History with Baseline Prototype
function deriveSystemID(participantID) {
  const numericMatch = String(participantID).match(/\d+/);

  if (!numericMatch) {
    return 1;
  }

  return Number.parseInt(numericMatch[0], 10) % 2 === 0 ? 2 : 1;
}

// Pre-fill if a Participant ID is already saved
const savedParticipantID = localStorage.getItem("participantID");
if (savedParticipantID) {
  participantInput.value = savedParticipantID;
}

// Form submit listener
participantForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const participantID = participantInput.value.trim();
  if (!participantID) {
    alert("Please enter a Participant ID.");
    return;
  }

  const systemID = deriveSystemID(participantID);

  localStorage.setItem("participantID", participantID);

  // Assignment: Send participant to Study Workflow page between homepage and AI system.
  window.location.href =
    "/study-workflow.html?participantID=" +
    encodeURIComponent(participantID) +
    "&systemID=" +
    systemID;
});
