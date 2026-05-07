// Milestone 4(a): Questionnaires & Study Proposal
// 5-step study workflow: demographics → task → pre-task → AI system → post-task
(function () {
  const params = new URLSearchParams(window.location.search);
  const participantID = params.get("participantID") || localStorage.getItem("participantID");
  const systemIDParam = Number.parseInt(params.get("systemID"), 10);

  // Read return flags sent back from Qualtrics
  const demographicsCompleteFromUrl = params.get("demographicsComplete") === "true";
  const pretaskCompleteFromUrl      = params.get("pretaskComplete")      === "true";
  const posttaskCompleteFromUrl     = params.get("posttaskComplete")     === "true";

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

  // DOM references
  const demographicsBtn = document.getElementById("demographics-btn");
  const taskBtn         = document.getElementById("task-btn");
  const pretaskBtn      = document.getElementById("pretask-btn");
  const prototypeBtn    = document.getElementById("prototype-btn");
  const posttaskBtn     = document.getElementById("posttask-btn");
  const workflowStatus  = document.getElementById("workflow-status");
  const taskDetails     = document.getElementById("task-details");

  // Show participant + system info
  const sessionMeta = document.getElementById("workflow-session-meta");
  if (sessionMeta) {
    sessionMeta.textContent =
      "Participant ID: " + participantID + " | System " + systemID;
  }

  // ── Workflow state persistence ───────────────────────────────────────────────
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
      demographicsComplete: false,
      taskRead:             false,
      pretaskComplete:      false,
      prototypeStarted:     false,
      posttaskComplete:     false,
    },
    loadWorkflowState()
  );

  // ── Event logger ─────────────────────────────────────────────────────────────
  function logEvent(eventType, elementName, metadata) {
    const payload = JSON.stringify({
      participantID,
      systemID,
      eventType,
      elementName,
      metadata: metadata || {},
    });

    if (navigator.sendBeacon) {
      const eventBlob = new Blob([payload], { type: "application/json" });

      if (navigator.sendBeacon("/log-event", eventBlob)) {
        return;
      }
    }

    fetch("/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(function (err) {
      console.error("Event log error:", err);
    });
  }

  function getSystemCondition() {
    return systemID === 2 ? "enhanced" : "baseline";
  }

  function getTaskTimingDetails(action, timestamp) {
    const startedAt = workflowState.prototypeStartedAt || "";
    const startedAtTime = startedAt ? new Date(startedAt).getTime() : NaN;
    const elapsedMs = Number.isFinite(startedAtTime) ? Date.now() - startedAtTime : null;

    return {
      action: action,
      condition: getSystemCondition(),
      taskTopic: "rdd-lineage-spark",
      workflowStep: "ai-system-interaction",
      startedAtClient: startedAt,
      timestampClient: timestamp || new Date().toISOString(),
      elapsedMs: elapsedMs,
    };
  }

  // ── Handle flags returned from Qualtrics via URL ─────────────────────────────
  function applyUrlFlags() {
    let changed = false;

    if (demographicsCompleteFromUrl && !workflowState.demographicsComplete) {
      workflowState.demographicsComplete = true;
      logEvent("return", "Demographics Questionnaire Complete");
      changed = true;
    }

    if (pretaskCompleteFromUrl && !workflowState.pretaskComplete) {
      workflowState.pretaskComplete = true;
      logEvent("return", "Pre-Task Questionnaire Complete");
      changed = true;
    }

    if (posttaskCompleteFromUrl && !workflowState.posttaskComplete) {
      workflowState.posttaskComplete = true;
      logEvent("return", "Post-Task Questionnaire Complete");
      changed = true;
    }

    if (changed) {
      saveWorkflowState(workflowState);
    }

    // Clean flags from URL so they don't linger on refresh
    if (demographicsCompleteFromUrl || pretaskCompleteFromUrl || posttaskCompleteFromUrl) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("demographicsComplete");
      cleanUrl.searchParams.delete("pretaskComplete");
      cleanUrl.searchParams.delete("posttaskComplete");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
    }
  }

  // ── Step state helpers ───────────────────────────────────────────────────────
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

    // locked
    button.disabled = true;
    button.classList.add("is-locked");
    button.textContent = label;
  }

  // ── UI update ────────────────────────────────────────────────────────────────
  function updateWorkflowUI() {
    // Step 1: Demographics
    if (!workflowState.demographicsComplete) {
      setButtonState(demographicsBtn, "active",  "1. Complete the demographics questionnaire.");
      setButtonState(taskBtn,         "locked",  "2. Read the task.");
      setButtonState(pretaskBtn,      "locked",  "3. Complete the pre-task questionnaire.");
      setButtonState(prototypeBtn,    "locked",  "4. Use the assigned AI system.");
      setButtonState(posttaskBtn,     "locked",  "5. Complete the post-task questionnaire.");
      workflowStatus.textContent = "Step 1 is required before the task is unlocked.";
      return;
    }

    setButtonState(demographicsBtn, "completed", "Demographics questionnaire completed.");

    // Step 2: Task
    if (!workflowState.taskRead) {
      setButtonState(taskBtn,      "active", "2. Read the task.");
      setButtonState(pretaskBtn,   "locked", "3. Complete the pre-task questionnaire.");
      setButtonState(prototypeBtn, "locked", "4. Use the assigned AI system.");
      setButtonState(posttaskBtn,  "locked", "5. Complete the post-task questionnaire.");
      workflowStatus.textContent = "Demographics complete. Read the task next.";
      return;
    }

    setButtonState(taskBtn, "completed", "Task read.");
    taskDetails.hidden = false;

    // Step 3: Pre-task
    if (!workflowState.pretaskComplete) {
      setButtonState(pretaskBtn,   "active", "3. Complete the pre-task questionnaire.");
      setButtonState(prototypeBtn, "locked", "4. Use the assigned AI system.");
      setButtonState(posttaskBtn,  "locked", "5. Complete the post-task questionnaire.");
      workflowStatus.textContent = "Task read. Complete the pre-task questionnaire before using the AI system.";
      return;
    }

    setButtonState(pretaskBtn, "completed", "Pre-task questionnaire completed.");

    // Step 4: AI prototype
    if (!workflowState.prototypeStarted) {
      setButtonState(prototypeBtn, "active", "4. Use the assigned AI system.");
      setButtonState(posttaskBtn,  "locked", "5. Complete the post-task questionnaire.");
      workflowStatus.textContent = "Pre-task questionnaire complete. You can now launch the assigned AI system.";
      return;
    }

    setButtonState(prototypeBtn, "completed", "AI system launched.");

    // Step 5: Post-task
    if (!workflowState.posttaskComplete) {
      setButtonState(posttaskBtn, "active", "5. Complete the post-task questionnaire.");
      workflowStatus.textContent = "AI system launched. After completing the task, return here and complete the post-task questionnaire.";
      return;
    }

    setButtonState(posttaskBtn, "completed", "Post-task questionnaire completed.");
    workflowStatus.textContent = "All study workflow steps are complete. Thank you.";
  }

  // ── Qualtrics redirect helpers ───────────────────────────────────────────────
  function buildWorkflowReturnUrl(flagName) {
    const returnUrl = new URL("/study-workflow.html", window.location.origin);
    returnUrl.searchParams.set("participantID", participantID);
    returnUrl.searchParams.set("systemID", String(systemID));
    returnUrl.searchParams.set(flagName, "true");
    return returnUrl.toString();
  }

  function redirectToQualtrics(surveyType, flagName, eventLabel) {
    workflowStatus.textContent = "Redirecting to the " + eventLabel.toLowerCase() + "...";
    fetch("/redirect-to-qualtrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantID,
        systemID,
        surveyType,
        returnUrl: buildWorkflowReturnUrl(flagName),
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed to build Qualtrics URL.");
        }
        return response.text();
      })
      .then(function (url) {
        logEvent("redirect", eventLabel);
        window.location.href = url;
      })
      .catch(function (error) {
        console.error("Error redirecting to Qualtrics:", error);
        alert("There was an error redirecting to the questionnaire. Please try again.");
      });
  }

  // ── Button event listeners ───────────────────────────────────────────────────

  // Step 1: Demographics
  demographicsBtn.addEventListener("click", function () {
    logEvent("click", "demographics-btn", {
      workflowStep: "demographics",
      condition: getSystemCondition(),
    });
    redirectToQualtrics("demographics", "demographicsComplete", "Demographics Questionnaire");
  });

  // Step 2: Task
  taskBtn.addEventListener("click", function () {
    logEvent("click", "task-btn", {
      workflowStep: "task-description",
      condition: getSystemCondition(),
      taskTopic: "rdd-lineage-spark",
    });
    taskDetails.hidden = false;
    markStepComplete("taskRead");
  });

  // Step 3: Pre-task
  pretaskBtn.addEventListener("click", function () {
    logEvent("click", "pretask-btn", {
      workflowStep: "pretask",
      condition: getSystemCondition(),
    });
    redirectToQualtrics("pretask", "pretaskComplete", "Pre-Task Questionnaire");
  });

  // Step 4: AI prototype
  prototypeBtn.addEventListener("click", function () {
    const destination = systemID === 2 ? "/enhanced.html" : "/chat.html";
    const startedAtClient = new Date().toISOString();

    workflowState = Object.assign({}, workflowState, {
      prototypeStarted: true,
      prototypeStartedAt: startedAtClient,
      prototypeTaskActive: true,
      prototypeDestination: destination,
    });
    saveWorkflowState(workflowState);
    updateWorkflowUI();
    logEvent("click", "prototype-btn", {
      workflowStep: "prototype",
      condition: getSystemCondition(),
      destination: destination,
    });
    logEvent("task_start", "ai-system-interaction", getTaskTimingDetails("start", startedAtClient));
    window.location.href =
      destination +
      "?participantID=" + encodeURIComponent(participantID) +
      "&systemID=" + systemID;
  });

  // Step 5: Post-task
  posttaskBtn.addEventListener("click", function () {
    const endedAtClient = new Date().toISOString();

    logEvent("click", "posttask-btn", {
      workflowStep: "posttask",
      condition: getSystemCondition(),
    });
    logEvent("task_end", "ai-system-interaction", getTaskTimingDetails("end", endedAtClient));
    workflowState = Object.assign({}, workflowState, {
      prototypeTaskActive: false,
      prototypeEndedAt: endedAtClient,
    });
    saveWorkflowState(workflowState);
    redirectToQualtrics("posttask", "posttaskComplete", "Post-Task Questionnaire");
  });

  // ── Initialise ───────────────────────────────────────────────────────────────
  applyUrlFlags();
  updateWorkflowUI();
})();
