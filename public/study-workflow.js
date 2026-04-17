// Assignment: Add a Study Workflow Page & Qualtrics Demographics Survey Link
(function () {
  const params = new URLSearchParams(window.location.search);
  const participantID = params.get("participantID") || localStorage.getItem("participantID");
  const systemIDParam = Number.parseInt(params.get("systemID"), 10);

  // ── Guard: require participantID ────────────────────────────────────────────
  if (!participantID) {
    alert("Please enter a Participant ID.");
    window.location.replace("/");
    return;
  }

  // Persist participantID so downstream pages can read it from localStorage too
  localStorage.setItem("participantID", participantID);

  // Derive systemID if missing or invalid (mirrors home.js / script.js logic)
  function deriveSystemID(id) {
    const numericMatch = String(id || "").match(/\d+/);
    if (!numericMatch) {
      return 1;
    }
    return Number.parseInt(numericMatch[0], 10) % 2 === 0 ? 2 : 1;
  }

  const systemID = systemIDParam === 1 || systemIDParam === 2
    ? systemIDParam
    : deriveSystemID(participantID);

  // Show which participant is logged in
  const sessionMeta = document.getElementById("workflow-session-meta");
  if (sessionMeta) {
    sessionMeta.textContent =
      "Participant ID: " + participantID + " | System " + systemID;
  }

  // ── Lightweight event logger (best-effort; tolerates failure) ───────────────
  function logEvent(eventType, elementName) {
    fetch("/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID, systemID, eventType, elementName }),
    }).catch(function (err) {
      console.error("Event log error:", err);
    });
  }

  // ── Step 1: Demographics questionnaire (Qualtrics redirect) ─────────────────
  function redirectToQualtrics() {
    fetch("/redirect-to-survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID }),
    })
      .then(function (response) { return response.text(); })
      .then(function (url) {
        logEvent("redirect", "Qualtrics Survey");
        window.location.href = url;
      })
      .catch(function (error) {
        console.error("Error redirecting to survey:", error);
        alert("There was an error redirecting to the survey. Please try again.");
      });
  }

  document.getElementById("survey-btn").addEventListener("click", redirectToQualtrics);

  // ── Step 2: Task (placeholder for now) ─────────────────────────────────────
  document.getElementById("task-btn").addEventListener("click", function () {
    logEvent("click", "task-btn");
    alert("Add your task instructions here or link this button to a task page.");
  });

  // ── Step 3: Launch the AI system (preserving participantID + systemID) ─────
  document.getElementById("prototype-btn").addEventListener("click", function () {
    logEvent("click", "prototype-btn");
    const destination = systemID === 2 ? "/enhanced.html" : "/chat.html";
    window.location.href =
      destination +
      "?participantID=" + encodeURIComponent(participantID) +
      "&systemID=" + systemID;
  });
})();
