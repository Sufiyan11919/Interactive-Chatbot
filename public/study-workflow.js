// Assignment: Add a Study Workflow Page & Qualtrics Demographics Survey Link
(function () {
  const params = new URLSearchParams(window.location.search);
  const participantID = params.get("participantID") || localStorage.getItem("participantID");
  const systemIDParam = Number.parseInt(params.get("systemID"), 10);
  const surveyCompleteFromUrl = params.get("surveyComplete") === "true";

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

  const workflowStorageKey = "studyWorkflow:" + participantID + ":system-" + systemID;
  const surveyBtn = document.getElementById("survey-btn");
  const taskBtn = document.getElementById("task-btn");
  const prototypeBtn = document.getElementById("prototype-btn");
  const workflowStatus = document.getElementById("workflow-status");
  const taskDetails = document.getElementById("task-details");

  function loadWorkflowState() {
    try {
      return JSON.parse(localStorage.getItem(workflowStorageKey)) || {};
    } catch (error) {
      return {};
    }
  }

  function saveWorkflowState(nextState) {
    localStorage.setItem(workflowStorageKey, JSON.stringify(nextState));
  }

  let workflowState = Object.assign(
    {
      surveyComplete: false,
      taskRead: false,
      prototypeStarted: false,
    },
    loadWorkflowState()
  );

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

  function markStepComplete(stepName) {
    workflowState = Object.assign({}, workflowState, { [stepName]: true });
    saveWorkflowState(workflowState);
    updateWorkflowUI();
  }

  function setButtonState(button, state, label) {
    button.classList.remove("is-active", "is-completed", "is-locked");
    button.removeAttribute("aria-current");

    if (state === "completed") {
      button.disabled = true;
      button.classList.add("is-completed");
      button.textContent = "✓ " + label;
      return;
    }

    if (state === "active") {
      button.disabled = false;
      button.classList.add("is-active");
      button.setAttribute("aria-current", "step");
      button.textContent = label;
      return;
    }

    button.disabled = true;
    button.classList.add("is-locked");
    button.textContent = label;
  }

  function updateWorkflowUI() {
    if (!workflowState.surveyComplete) {
      setButtonState(surveyBtn, "active", "1. Complete the demographics questionnaire.");
      setButtonState(taskBtn, "locked", "2. Read the task.");
      setButtonState(prototypeBtn, "locked", "3. Use the AI system to complete the task.");
      workflowStatus.textContent = "Step 1 is required before the task and AI system are unlocked.";
      return;
    }

    setButtonState(surveyBtn, "completed", "Questionnaire completed.");

    if (!workflowState.taskRead) {
      setButtonState(taskBtn, "active", "2. Read the task.");
      setButtonState(prototypeBtn, "locked", "3. Use the AI system to complete the task.");
      workflowStatus.textContent = "Questionnaire complete. Read the task next.";
      return;
    }

    setButtonState(taskBtn, "completed", "Task read.");
    taskDetails.hidden = false;

    if (!workflowState.prototypeStarted) {
      setButtonState(prototypeBtn, "active", "3. Use the AI system to complete the task.");
      workflowStatus.textContent = "Task read. You can now launch the AI system.";
      return;
    }

    setButtonState(prototypeBtn, "completed", "AI system launched.");
    workflowStatus.textContent = "Workflow steps completed for this participant.";
  }

  function buildSurveyReturnUrl() {
    const returnUrl = new URL("/study-workflow.html", window.location.origin);
    returnUrl.searchParams.set("participantID", participantID);
    returnUrl.searchParams.set("systemID", String(systemID));
    returnUrl.searchParams.set("surveyComplete", "true");
    return returnUrl.toString();
  }

  if (surveyCompleteFromUrl) {
    workflowState.surveyComplete = true;
    saveWorkflowState(workflowState);
    logEvent("return", "Qualtrics Survey Complete");

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("surveyComplete");
    window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
  }

  // ── Step 1: Demographics questionnaire (Qualtrics redirect) ─────────────────
  function redirectToQualtrics() {
    fetch("/redirect-to-survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantID,
        systemID,
        returnUrl: buildSurveyReturnUrl(),
      }),
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

  surveyBtn.addEventListener("click", redirectToQualtrics);

  // ── Step 2: Task ───────────────────────────────────────────────────────────
  taskBtn.addEventListener("click", function () {
    logEvent("click", "task-btn");
    taskDetails.hidden = false;
    markStepComplete("taskRead");
  });

  // ── Step 3: Launch the AI system (preserving participantID + systemID) ─────
  prototypeBtn.addEventListener("click", function () {
    logEvent("click", "prototype-btn");
    markStepComplete("prototypeStarted");
    const destination = systemID === 2 ? "/enhanced.html" : "/chat.html";
    window.location.href =
      destination +
      "?participantID=" + encodeURIComponent(participantID) +
      "&systemID=" + systemID;
  });

  updateWorkflowUI();
})();
