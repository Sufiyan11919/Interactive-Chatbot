(function () {
  // Milestone 3 - Enhanced prototype: client behavior for the System 2 study assistant.
  const HISTORY_LIMIT = 5;
  const TOUR_STORAGE_KEY = "enhancedTourSeen:v1";
  const NOTES_AUTOSAVE_DELAY = 500;
  const NOTES_INPUT_LOG_INTERVAL = 8000;
  const NOTES_MAX_IMAGE_WIDTH = 1200;
  const NOTES_MAX_IMAGE_DATA_URL_LENGTH = 2600000;
  const params = new URLSearchParams(window.location.search);
  const modeLabels = {
    general: "General study mode",
    explain: "Concept explanation",
    compare: "Structured comparison",
    define: "Term definition",
    simplify: "Follow-up clarification",
  };

  function deriveSystemID(participantID) {
    const numericMatch = String(participantID || "").match(/\d+/);

    if (!numericMatch) {
      return 1;
    }

    return Number.parseInt(numericMatch[0], 10) % 2 === 0 ? 2 : 1;
  }

  function resolveParticipantID() {
    const fromUrl = String(params.get("participantID") || "").trim();
    const fromStorage = String(localStorage.getItem("participantID") || "").trim();
    const resolved = fromUrl || fromStorage;

    if (resolved) {
      localStorage.setItem("participantID", resolved);
    }

    return resolved;
  }

  function resolveSystemID(participantID) {
    const fromUrl = Number.parseInt(params.get("systemID"), 10);

    if (fromUrl === 1 || fromUrl === 2) {
      return fromUrl;
    }

    return deriveSystemID(participantID);
  }

  const participantID = resolveParticipantID();

  if (!participantID) {
    alert("Please enter a Participant ID.");
    window.location.replace("/");
    return;
  }

  const systemID = resolveSystemID(participantID);

  if (systemID !== 2) {
    window.location.replace(
      "/chat.html?participantID=" +
        encodeURIComponent(participantID) +
        "&systemID=1"
    );
    return;
  }

  const NOTES_STORAGE_KEY = "enhancedNotes:" + participantID + ":system-2";
  const NOTES_POSITION_STORAGE_KEY = "enhancedNotesPosition:" + participantID + ":system-2";
  const NOTES_SIZE_STORAGE_KEY = "enhancedNotesSize:" + participantID + ":system-2";
  const WELCOME_STORAGE_KEY = "enhancedWelcomeSeen:" + participantID + ":system-2";
  const normalizedUrl = new URL(window.location.href);
  normalizedUrl.searchParams.set("participantID", participantID);
  normalizedUrl.searchParams.set("systemID", "2");
  window.history.replaceState({}, "", normalizedUrl.pathname + normalizedUrl.search);

  const uploadForm = document.getElementById("enhanced-upload-form");
  const fileInput = document.getElementById("enhanced-file-input");
  const fileName = document.getElementById("enhanced-file-name");
  const uploadBtn = document.getElementById("enhanced-upload-btn");
  const docsList = document.getElementById("enhanced-docs-list");
  const emptyDocs = document.getElementById("enhanced-empty-docs");
  const docCount = document.getElementById("enhanced-doc-count");
  const retrievalMethod = document.getElementById("enhanced-retrieval-method");
  const messages = document.getElementById("enhanced-messages");
  const chatForm = document.getElementById("enhanced-chat-form");
  const input = document.getElementById("enhanced-user-input");
  const sendBtn = document.getElementById("enhanced-send-btn");
  const sessionMeta = document.getElementById("enhanced-session-meta");
  const contextChip = document.getElementById("enhanced-context-chip");
  const sourceChip = document.getElementById("enhanced-source-chip");
  const modeChip = document.getElementById("enhanced-mode-chip");
  const historySummary = document.getElementById("enhanced-history-summary");
  const evidenceSummary = document.getElementById("enhanced-evidence-summary");
  const tourBtn = document.getElementById("enhanced-tour-btn");
  const notesBtn = document.getElementById("enhanced-notes-btn");
  const notesPopup = document.getElementById("enhanced-notes-popup");
  const notesHeader = notesPopup ? notesPopup.querySelector(".enhanced-notes-header") : null;
  const notesResizeHandles = notesPopup
    ? Array.from(notesPopup.querySelectorAll("[data-notes-resize]"))
    : [];
  const notesCloseBtn = document.getElementById("enhanced-notes-close-btn");
  const notesEditor = document.getElementById("enhanced-notes-editor");
  const notesFormat = document.getElementById("enhanced-notes-format");
  const notesImageInput = document.getElementById("enhanced-notes-image-input");
  const notesImageBtn = document.getElementById("enhanced-notes-image-btn");
  const notesCaptureBtn = document.getElementById("enhanced-notes-capture-btn");
  const notesClearBtn = document.getElementById("enhanced-notes-clear-btn");
  const notesExportBtn = document.getElementById("enhanced-notes-export-btn");
  const notesStatus = document.getElementById("enhanced-notes-status");
  const welcomeOverlay = document.getElementById("enhanced-welcome-overlay");
  const welcomeStartBtn = document.getElementById("enhanced-welcome-start-btn");
  const welcomeSkipBtn = document.getElementById("enhanced-welcome-skip-btn");

  let conversationHistory = [];
  let activeMode = "general";
  let lastSubmitMethod = "button";
  let notesIsOpen = false;
  let notesSaveTimer = null;
  let notesSizeSaveTimer = null;
  let notesPreviousFocus = null;
  let notesDragState = null;
  let notesResizeState = null;
  let lastNotesInputLogAt = 0;
  let tourOverlay = null;
  let tourHighlight = null;
  let tourCard = null;
  let tourStepCount = null;
  let tourTitle = null;
  let tourBody = null;
  let tourBackBtn = null;
  let tourNextBtn = null;
  let tourSkipBtn = null;
  let activeTourStep = 0;
  let previousTourFocus = null;
  let tourIsActive = false;
  const tourSteps = [
    {
      selector: ".enhanced-sidebar",
      title: "Start with your course materials",
      body: "Upload TXT or PDF readings here. The assistant uses your files as the evidence base, so responses can stay grounded in course content.",
    },
    {
      selector: "#enhanced-retrieval-method",
      title: "Choose how evidence is retrieved",
      body: "Semantic retrieval is best for meaning and concepts. TF-IDF is useful when you want keyword-style matching for exact terms.",
    },
    {
      selector: ".enhanced-prompts",
      title: "Use prompt starters",
      body: "These buttons help new users ask strong study questions quickly. They fill the input with a template you can edit before sending.",
    },
    {
      selector: ".enhanced-rail",
      title: "Switch study modes",
      body: "Study tools change the response structure for common learning tasks such as comparing sources, defining terms, and simplifying explanations.",
    },
    {
      selector: "#enhanced-notes-btn",
      title: "Capture your study notes",
      body: "Open the notes popup to write rich notes, paste or capture screenshots, and export your notes as a PDF when you are done.",
    },
    {
      selector: "#enhanced-messages",
      title: "Read answers with evidence",
      body: "Responses appear here with confidence information and retrieved evidence so you can inspect what the AI used to answer.",
    },
    {
      selector: "#enhanced-user-input",
      title: "Ask, refine, and follow up",
      body: "Type your own question here. Follow-up questions use recent context, so you can ask for clarification without starting over.",
    },
  ];

  function getRecentConversationHistory() {
    return conversationHistory.slice(-HISTORY_LIMIT);
  }

  function rememberInteraction(entry) {
    conversationHistory = getRecentConversationHistory().concat({
      userInput: entry.userInput,
      botResponse: entry.botResponse,
      retrievalMethod: entry.retrievalMethod || "semantic",
      studyMode: entry.studyMode || activeMode,
      retrievedDocuments: entry.retrievedDocuments || [],
      confidenceMetrics: entry.confidenceMetrics || null,
    });
    updateContextStatus();
  }

  function updateContextStatus() {
    const count = conversationHistory.length;
    contextChip.textContent = count > 0
      ? "Session context active (" + count + " turns)"
      : "Session context ready";
    historySummary.textContent = count > 0
      ? "Loaded " + count + " recent turn" + (count === 1 ? "" : "s") + " for " + participantID + "."
      : "No prior turns found for this participant.";
  }

  function setMode(mode) {
    activeMode = modeLabels[mode] ? mode : "general";
    modeChip.textContent = modeLabels[activeMode];

    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.classList.toggle("selected", button.dataset.mode === activeMode);
    });
  }

  function logEvent(eventType, elementName) {
    fetch("/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID, systemID: 2, eventType, elementName }),
    }).catch(function (error) {
      console.error("Event log error:", error);
    });
  }

  function logCommonEvent(eventType, elementName) {
    logEvent(eventType, "common-" + elementName);
  }

  function logStudyEvent(eventType, elementName) {
    logEvent(eventType, "study-" + elementName);
  }

  function formatDate(value) {
    if (!value) {
      return "Not processed yet";
    }

    return new Date(value).toLocaleString();
  }

  function formatConfidence(value) {
    if (typeof value !== "number") {
      return "N/A";
    }

    return (value * 100).toFixed(1) + "%";
  }

  function scrollMessagesToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function hasSeenTour() {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function markTourSeen() {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } catch (error) {}
  }

  function createTourElements() {
    if (tourOverlay) {
      return;
    }

    tourOverlay = createElement("div", "enhanced-tour-overlay");
    tourOverlay.hidden = true;
    tourOverlay.setAttribute("aria-hidden", "true");

    const scrim = createElement("div", "enhanced-tour-scrim");
    scrim.addEventListener("click", function () {
      closeTour("skipped");
    });

    tourHighlight = createElement("div", "enhanced-tour-highlight");
    tourCard = createElement("section", "enhanced-tour-card");
    tourCard.setAttribute("role", "dialog");
    tourCard.setAttribute("aria-modal", "true");
    tourCard.setAttribute("aria-labelledby", "enhanced-tour-title");
    tourCard.setAttribute("aria-describedby", "enhanced-tour-body");
    tourCard.tabIndex = -1;

    tourStepCount = createElement("div", "enhanced-tour-step-count");
    tourTitle = createElement("h3", "");
    tourTitle.id = "enhanced-tour-title";
    tourBody = createElement("p", "");
    tourBody.id = "enhanced-tour-body";
    const tourHint = createElement("p", "enhanced-tour-hint", "Keyboard: use arrow keys to move, Tab to switch buttons, and Escape to skip.");

    const actions = createElement("div", "enhanced-tour-actions");
    const secondaryActions = createElement("div", "enhanced-tour-secondary-actions");
    const primaryActions = createElement("div", "enhanced-tour-primary-actions");

    tourSkipBtn = createElement("button", "enhanced-tour-action", "Skip");
    tourSkipBtn.type = "button";
    tourBackBtn = createElement("button", "enhanced-tour-action", "Back");
    tourBackBtn.type = "button";
    tourNextBtn = createElement("button", "enhanced-tour-action primary", "Next");
    tourNextBtn.type = "button";

    tourSkipBtn.addEventListener("click", function () {
      closeTour("skipped");
    });
    tourBackBtn.addEventListener("click", function () {
      showPreviousTourStep();
    });
    tourNextBtn.addEventListener("click", function () {
      showNextTourStep();
    });

    secondaryActions.appendChild(tourSkipBtn);
    primaryActions.appendChild(tourBackBtn);
    primaryActions.appendChild(tourNextBtn);
    actions.appendChild(secondaryActions);
    actions.appendChild(primaryActions);

    tourCard.appendChild(tourStepCount);
    tourCard.appendChild(tourTitle);
    tourCard.appendChild(tourBody);
    tourCard.appendChild(tourHint);
    tourCard.appendChild(actions);
    tourOverlay.appendChild(scrim);
    tourOverlay.appendChild(tourHighlight);
    tourOverlay.appendChild(tourCard);
    document.body.appendChild(tourOverlay);
  }

  function getTourTarget(step) {
    return document.querySelector(step.selector) || document.querySelector(".enhanced-app");
  }

  function setTourHighlight(rect) {
    const margin = 8;
    const top = Math.max(margin, rect.top - margin);
    const left = Math.max(margin, rect.left - margin);
    const width = Math.min(window.innerWidth - left - margin, rect.width + margin * 2);
    const height = Math.min(window.innerHeight - top - margin, rect.height + margin * 2);

    tourHighlight.style.top = top + "px";
    tourHighlight.style.left = left + "px";
    tourHighlight.style.width = Math.max(80, width) + "px";
    tourHighlight.style.height = Math.max(48, height) + "px";
  }

  function positionTourCard(rect) {
    tourCard.style.visibility = "hidden";
    tourCard.style.left = "16px";
    tourCard.style.top = "16px";

    requestAnimationFrame(function () {
      const gap = 16;
      const margin = 16;
      const cardRect = tourCard.getBoundingClientRect();
      let left = rect.right + gap;
      let top = rect.top;

      if (window.innerWidth <= 860) {
        left = 12;
        top = rect.bottom + gap;

        if (top + cardRect.height > window.innerHeight - 12) {
          top = Math.max(12, rect.top - cardRect.height - gap);
        }
      } else if (left + cardRect.width > window.innerWidth - margin) {
        left = rect.left - cardRect.width - gap;

        if (left < margin) {
          left = Math.min(Math.max(margin, rect.left), window.innerWidth - cardRect.width - margin);
          top = rect.bottom + gap;
        }
      }

      if (top + cardRect.height > window.innerHeight - margin) {
        top = window.innerHeight - cardRect.height - margin;
      }

      tourCard.style.left = Math.max(margin, left) + "px";
      tourCard.style.top = Math.max(margin, top) + "px";
      tourCard.style.visibility = "visible";
    });
  }

  function updateTourPosition() {
    if (!tourIsActive) {
      return;
    }

    const step = tourSteps[activeTourStep];
    const target = getTourTarget(step);
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });

    requestAnimationFrame(function () {
      const rect = target.getBoundingClientRect();
      setTourHighlight(rect);
      positionTourCard(rect);
    });
  }

  function renderTourStep() {
    const step = tourSteps[activeTourStep];
    tourStepCount.textContent = "Step " + (activeTourStep + 1) + " of " + tourSteps.length;
    tourTitle.textContent = step.title;
    tourBody.textContent = step.body;
    tourBackBtn.disabled = activeTourStep === 0;
    tourNextBtn.textContent = activeTourStep === tourSteps.length - 1 ? "Finish" : "Next";
    updateTourPosition();
    logStudyEvent("view", "tour-step-" + (activeTourStep + 1));
  }

  function startTour(source) {
    createTourElements();

    if (tourIsActive) {
      return;
    }

    previousTourFocus = document.activeElement;
    activeTourStep = 0;
    tourIsActive = true;
    tourOverlay.hidden = false;
    tourOverlay.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", handleTourKeydown);
    window.addEventListener("resize", updateTourPosition);
    renderTourStep();
    tourNextBtn.focus();
    logStudyEvent("start", source === "auto" ? "tour-auto-start" : "tour-manual-start");
  }

  function closeTour(reason) {
    if (!tourIsActive) {
      return;
    }

    tourIsActive = false;
    tourOverlay.hidden = true;
    tourOverlay.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", handleTourKeydown);
    window.removeEventListener("resize", updateTourPosition);
    markTourSeen();

    if (reason === "finished") {
      logStudyEvent("complete", "tour-finished");
    } else {
      logStudyEvent("skip", "tour-skipped");
    }

    if (previousTourFocus && typeof previousTourFocus.focus === "function") {
      previousTourFocus.focus();
    }
  }

  function showNextTourStep() {
    if (activeTourStep >= tourSteps.length - 1) {
      closeTour("finished");
      return;
    }

    logStudyEvent("next", "tour-step-" + (activeTourStep + 1));
    activeTourStep += 1;
    renderTourStep();
  }

  function showPreviousTourStep() {
    if (activeTourStep === 0) {
      return;
    }

    logStudyEvent("back", "tour-step-" + (activeTourStep + 1));
    activeTourStep -= 1;
    renderTourStep();
  }

  function handleTourKeydown(event) {
    if (!tourIsActive) {
      return;
    }
    if (event.key === "Tab") {
      trapTourFocus(event);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTour("skipped");
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextTourStep();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousTourStep();
    }
  }

  function trapTourFocus(event) {
    const focusableElements = Array.from(
      tourCard.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      tourCard.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function initializeGuidedTour() {
    if (!tourBtn) {
      return;
    }

    tourBtn.addEventListener("click", function () {
      logStudyEvent("click", "tour-button");
      startTour("manual");
    });

    if (!hasSeenTour() && hasSeenWelcome()) {
      window.setTimeout(function () {
        if (!hasSeenTour() && hasSeenWelcome()) {
          startTour("auto");
        }
      }, 900);
    }
  }

  function hasSeenWelcome() {
    return localStorage.getItem(WELCOME_STORAGE_KEY) === "true";
  }

  function markWelcomeSeen() {
    localStorage.setItem(WELCOME_STORAGE_KEY, "true");
  }

  function closeWelcomeOverlay(action) {
    if (!welcomeOverlay || welcomeOverlay.hidden) {
      return;
    }

    welcomeOverlay.classList.add("is-hiding");
    markWelcomeSeen();
    logStudyEvent(action === "skip" ? "skip" : "start", "welcome-overlay");

    window.setTimeout(function () {
      welcomeOverlay.hidden = true;
      welcomeOverlay.classList.remove("is-visible", "is-hiding");
      input.focus();

      if (!hasSeenTour()) {
        window.setTimeout(function () {
          startTour("auto");
        }, 450);
      }
    }, 220);
  }

  function initializeWelcomeOverlay() {
    if (!welcomeOverlay || !welcomeStartBtn || !welcomeSkipBtn) {
      return;
    }

    welcomeStartBtn.addEventListener("click", function () {
      closeWelcomeOverlay("start");
    });

    welcomeSkipBtn.addEventListener("click", function () {
      closeWelcomeOverlay("skip");
    });

    welcomeOverlay.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWelcomeOverlay("skip");
      }
    });

    if (!hasSeenWelcome()) {
      welcomeOverlay.hidden = false;
      requestAnimationFrame(function () {
        welcomeOverlay.classList.add("is-visible");
        welcomeStartBtn.focus();
      });
      logStudyEvent("view", "welcome-overlay");
    }
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  function sanitizeNotesHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");

    template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach(function (element) {
      element.remove();
    });

    template.content.querySelectorAll("*").forEach(function (element) {
      Array.from(element.attributes).forEach(function (attribute) {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || "").trim();

        if (name.startsWith("on") || name === "style") {
          element.removeAttribute(attribute.name);
          return;
        }

        if ((name === "href" || name === "src") && /^javascript:/i.test(value)) {
          element.removeAttribute(attribute.name);
        }
      });

      if (element.tagName === "IMG") {
        const src = element.getAttribute("src") || "";

        if (!/^data:image\//i.test(src)) {
          element.remove();
        }
      }
    });

    return template.innerHTML;
  }

  function notesHasContent() {
    if (!notesEditor) {
      return false;
    }

    return Boolean(notesEditor.textContent.trim() || notesEditor.querySelector("img"));
  }

  function setNotesStatus(text) {
    if (notesStatus) {
      notesStatus.textContent = text;
    }
  }

  function updateNotesExportState() {
    if (notesExportBtn) {
      notesExportBtn.disabled = !notesHasContent();
    }
  }

  function saveNotesNow() {
    if (!notesEditor) {
      return;
    }

    const sanitizedHtml = sanitizeNotesHtml(notesEditor.innerHTML);

    try {
      if (notesHasContent()) {
        localStorage.setItem(NOTES_STORAGE_KEY, sanitizedHtml);
        setNotesStatus("Saved locally at " + new Date().toLocaleTimeString() + ".");
      } else {
        localStorage.removeItem(NOTES_STORAGE_KEY);
        setNotesStatus("Notes autosave locally.");
      }
    } catch (error) {
      console.error("Notes save error:", error);
      setNotesStatus("Could not save notes locally. Try removing large images.");
      logStudyEvent("error", "notes-save-failed");
    }

    updateNotesExportState();
  }

  function scheduleNotesSave() {
    window.clearTimeout(notesSaveTimer);
    notesSaveTimer = window.setTimeout(saveNotesNow, NOTES_AUTOSAVE_DELAY);

    const now = Date.now();
    if (now - lastNotesInputLogAt > NOTES_INPUT_LOG_INTERVAL) {
      lastNotesInputLogAt = now;
      logStudyEvent("input", "notes-editor");
    }
  }

  function loadNotes() {
    if (!notesEditor) {
      return;
    }

    try {
      const savedNotes = localStorage.getItem(NOTES_STORAGE_KEY);

      if (savedNotes) {
        notesEditor.innerHTML = sanitizeNotesHtml(savedNotes);
        setNotesStatus("Loaded saved notes for this study session.");
      }
    } catch (error) {
      console.error("Notes load error:", error);
      logStudyEvent("error", "notes-load-failed");
    }

    updateNotesExportState();
  }

  function getBoundedNotesPosition(left, top) {
    if (!notesPopup) {
      return { left: left, top: top };
    }

    const viewportMargin = 12;
    const rect = notesPopup.getBoundingClientRect();
    const width = rect.width || 520;
    const height = rect.height || 420;
    const maxLeft = Math.max(viewportMargin, window.innerWidth - width - viewportMargin);
    const maxTop = Math.max(viewportMargin, window.innerHeight - height - viewportMargin);

    return {
      left: Math.min(Math.max(viewportMargin, left), maxLeft),
      top: Math.min(Math.max(viewportMargin, top), maxTop),
    };
  }

  function getNotesSizeLimits(left, top) {
    const viewportMargin = 12;
    const availableWidth = Math.max(280, window.innerWidth - viewportMargin * 2);
    const availableHeight = Math.max(320, window.innerHeight - viewportMargin * 2);
    const minWidth = Math.min(340, availableWidth);
    const minHeight = Math.min(360, availableHeight);
    const maxWidthAtPosition = Math.max(minWidth, window.innerWidth - left - viewportMargin);
    const maxHeightAtPosition = Math.max(minHeight, window.innerHeight - top - viewportMargin);

    return {
      minWidth: minWidth,
      minHeight: minHeight,
      maxWidth: Math.min(availableWidth, maxWidthAtPosition),
      maxHeight: Math.min(availableHeight, maxHeightAtPosition),
    };
  }

  function setNotesPopupSize(width, height) {
    if (!notesPopup) {
      return;
    }

    const rect = notesPopup.getBoundingClientRect();
    const limits = getNotesSizeLimits(rect.left || 12, rect.top || 12);
    const boundedWidth = Math.min(Math.max(limits.minWidth, width), limits.maxWidth);
    const boundedHeight = Math.min(Math.max(limits.minHeight, height), limits.maxHeight);

    notesPopup.style.width = Math.round(boundedWidth) + "px";
    notesPopup.style.height = Math.round(boundedHeight) + "px";
  }

  function scheduleNotesPopupSizeSave() {
    window.clearTimeout(notesSizeSaveTimer);
    notesSizeSaveTimer = window.setTimeout(function () {
      saveNotesPopupSize();
      keepNotesPopupInViewport();
    }, 250);
  }

  function saveNotesPopupSize() {
    if (!notesPopup) {
      return;
    }

    const rect = notesPopup.getBoundingClientRect();

    try {
      localStorage.setItem(NOTES_SIZE_STORAGE_KEY, JSON.stringify({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }));
    } catch (error) {
      console.error("Notes size save error:", error);
    }
  }

  function restoreNotesPopupSize() {
    if (!notesPopup) {
      return;
    }

    try {
      const savedSize = JSON.parse(localStorage.getItem(NOTES_SIZE_STORAGE_KEY) || "null");

      if (
        savedSize &&
        Number.isFinite(savedSize.width) &&
        Number.isFinite(savedSize.height)
      ) {
        setNotesPopupSize(savedSize.width, savedSize.height);
      }
    } catch (error) {
      console.error("Notes size load error:", error);
      localStorage.removeItem(NOTES_SIZE_STORAGE_KEY);
    }
  }

  function setNotesPopupPosition(left, top) {
    if (!notesPopup) {
      return;
    }

    const boundedPosition = getBoundedNotesPosition(left, top);
    notesPopup.style.left = boundedPosition.left + "px";
    notesPopup.style.top = boundedPosition.top + "px";
    notesPopup.style.right = "auto";
    notesPopup.style.bottom = "auto";
  }

  function saveNotesPopupPosition() {
    if (!notesPopup) {
      return;
    }

    const rect = notesPopup.getBoundingClientRect();

    try {
      localStorage.setItem(NOTES_POSITION_STORAGE_KEY, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }));
    } catch (error) {
      console.error("Notes position save error:", error);
    }
  }

  function restoreNotesPopupPosition() {
    if (!notesPopup) {
      return;
    }

    try {
      const savedPosition = JSON.parse(localStorage.getItem(NOTES_POSITION_STORAGE_KEY) || "null");

      if (
        savedPosition &&
        Number.isFinite(savedPosition.left) &&
        Number.isFinite(savedPosition.top)
      ) {
        setNotesPopupPosition(savedPosition.left, savedPosition.top);
      }
    } catch (error) {
      console.error("Notes position load error:", error);
      localStorage.removeItem(NOTES_POSITION_STORAGE_KEY);
    }
  }

  function keepNotesPopupInViewport() {
    if (!notesPopup || notesPopup.hidden) {
      return;
    }

    const rect = notesPopup.getBoundingClientRect();
    setNotesPopupSize(rect.width, rect.height);
    const updatedRect = notesPopup.getBoundingClientRect();
    setNotesPopupPosition(updatedRect.left, updatedRect.top);
  }

  function startNotesDrag(event) {
    if (!notesPopup || !notesHeader || event.button !== 0) {
      return;
    }

    if (event.target.closest("button, a, input, select, textarea, [contenteditable='true']")) {
      return;
    }

    const rect = notesPopup.getBoundingClientRect();
    notesDragState = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    notesPopup.classList.add("is-dragging");
    setNotesPopupPosition(rect.left, rect.top);
    notesHeader.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveNotesDrag(event) {
    if (!notesDragState) {
      return;
    }

    setNotesPopupPosition(
      event.clientX - notesDragState.offsetX,
      event.clientY - notesDragState.offsetY
    );
    event.preventDefault();
  }

  function endNotesDrag(event) {
    if (!notesDragState || !notesPopup || !notesHeader) {
      return;
    }

    notesDragState = null;
    notesPopup.classList.remove("is-dragging");
    saveNotesPopupPosition();
    logStudyEvent("drag", "notes-popup");

    if (notesHeader.hasPointerCapture(event.pointerId)) {
      notesHeader.releasePointerCapture(event.pointerId);
    }
  }

  function startNotesResize(event) {
    if (!notesPopup || event.button !== 0) {
      return;
    }

    const resizeHandle = event.currentTarget;
    const resizeDirection = resizeHandle.dataset.notesResize || "se";
    const rect = notesPopup.getBoundingClientRect();
    notesResizeState = {
      direction: resizeDirection,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startRight: rect.right,
      startBottom: rect.bottom,
      startWidth: rect.width,
      startHeight: rect.height,
      handle: resizeHandle,
    };

    setNotesPopupPosition(rect.left, rect.top);
    notesPopup.classList.add("is-resizing");
    window.addEventListener("pointermove", moveNotesResize);
    window.addEventListener("pointerup", endNotesResize);
    window.addEventListener("pointercancel", endNotesResize);

    if (resizeHandle.setPointerCapture) {
      resizeHandle.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }

  function moveNotesResize(event) {
    if (!notesResizeState) {
      return;
    }

    const direction = notesResizeState.direction;
    const deltaX = event.clientX - notesResizeState.startX;
    const deltaY = event.clientY - notesResizeState.startY;
    const viewportMargin = 12;
    const limits = getNotesSizeLimits(notesResizeState.startLeft, notesResizeState.startTop);
    let nextLeft = notesResizeState.startLeft;
    let nextRight = notesResizeState.startRight;
    let nextTop = notesResizeState.startTop;
    let nextBottom = notesResizeState.startBottom;

    if (direction.indexOf("e") !== -1) {
      nextRight = Math.min(
        Math.max(notesResizeState.startRight + deltaX, nextLeft + limits.minWidth),
        window.innerWidth - viewportMargin
      );
    }

    if (direction.indexOf("w") !== -1) {
      nextLeft = Math.max(
        Math.min(notesResizeState.startLeft + deltaX, nextRight - limits.minWidth),
        viewportMargin
      );
    }

    if (direction.indexOf("s") !== -1) {
      nextBottom = Math.min(
        Math.max(notesResizeState.startBottom + deltaY, nextTop + limits.minHeight),
        window.innerHeight - viewportMargin
      );
    }

    if (direction.indexOf("n") !== -1) {
      nextTop = Math.max(
        Math.min(notesResizeState.startTop + deltaY, nextBottom - limits.minHeight),
        viewportMargin
      );
    }

    notesPopup.style.left = Math.round(nextLeft) + "px";
    notesPopup.style.top = Math.round(nextTop) + "px";
    notesPopup.style.right = "auto";
    notesPopup.style.bottom = "auto";
    notesPopup.style.width = Math.round(nextRight - nextLeft) + "px";
    notesPopup.style.height = Math.round(nextBottom - nextTop) + "px";
    event.preventDefault();
  }

  function endNotesResize(event) {
    if (!notesResizeState || !notesPopup) {
      return;
    }

    const resizeHandle = notesResizeState.handle;
    notesResizeState = null;
    notesPopup.classList.remove("is-resizing");
    window.removeEventListener("pointermove", moveNotesResize);
    window.removeEventListener("pointerup", endNotesResize);
    window.removeEventListener("pointercancel", endNotesResize);
    keepNotesPopupInViewport();
    saveNotesPopupSize();
    saveNotesPopupPosition();
    logStudyEvent("resize", "notes-popup");

    if (
      resizeHandle &&
      resizeHandle.hasPointerCapture &&
      resizeHandle.hasPointerCapture(event.pointerId)
    ) {
      resizeHandle.releasePointerCapture(event.pointerId);
    }
  }

  function openNotesPopup(source) {
    if (!notesPopup || !notesBtn || !notesEditor) {
      return;
    }

    notesPreviousFocus = document.activeElement;
    notesIsOpen = true;
    notesPopup.hidden = false;
    restoreNotesPopupSize();
    restoreNotesPopupPosition();
    window.setTimeout(keepNotesPopupInViewport, 0);
    notesBtn.setAttribute("aria-expanded", "true");
    notesEditor.focus();
    logStudyEvent("open", source === "button" ? "notes-popup-via-button" : "notes-popup");
  }

  function closeNotesPopup() {
    if (!notesPopup || !notesBtn || !notesIsOpen) {
      return;
    }

    saveNotesNow();
    notesIsOpen = false;
    notesPopup.hidden = true;
    notesBtn.setAttribute("aria-expanded", "false");
    logStudyEvent("close", "notes-popup");

    if (notesPreviousFocus && typeof notesPreviousFocus.focus === "function") {
      notesPreviousFocus.focus();
    }
  }

  function applyNotesCommand(command, value) {
    if (!notesEditor) {
      return;
    }
    const commandValue = command === "formatBlock" && value && value.charAt(0) !== "<"
      ? "<" + value + ">"
      : value;

    notesEditor.focus();
    document.execCommand(command, false, commandValue || null);
    scheduleNotesSave();
    logStudyEvent("format", "notes-" + command.toLowerCase());
  }

  function insertNotesImage(dataUrl, altText, source) {
    if (!notesEditor) {
      return;
    }

    const html =
      '<p><img src="' + dataUrl + '" alt="' + escapeHtml(altText || "Study note image") + '"></p><p><br></p>';
    notesEditor.focus();
    document.execCommand("insertHTML", false, html);
    saveNotesNow();
    logStudyEvent("insert", source || "notes-image");
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Could not read image."));
      };
      reader.readAsDataURL(file);
    });
  }

  function resizeImageDataUrl(dataUrl) {
    return new Promise(function (resolve, reject) {
      const image = new Image();

      image.onload = function () {
        const maxDimension = Math.max(image.width, image.height);
        const scale = maxDimension > NOTES_MAX_IMAGE_WIDTH
          ? NOTES_MAX_IMAGE_WIDTH / maxDimension
          : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };

      image.onerror = function () {
        reject(new Error("Could not process image."));
      };

      image.src = dataUrl;
    });
  }

  async function processNotesImageFile(file, source) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      alert("Please choose an image file for notes.");
      logStudyEvent("error", "notes-invalid-image");
      return;
    }

    try {
      setNotesStatus("Adding image to notes...");
      const dataUrl = await readFileAsDataUrl(file);
      const resizedDataUrl = await resizeImageDataUrl(dataUrl);

      if (resizedDataUrl.length > NOTES_MAX_IMAGE_DATA_URL_LENGTH) {
        alert("That image is too large for local notes. Try a smaller screenshot.");
        setNotesStatus("Image was too large to save locally.");
        logStudyEvent("error", "notes-image-too-large");
        return;
      }

      insertNotesImage(resizedDataUrl, file.name || "Study note screenshot", source);
      setNotesStatus("Image added and saved locally.");
    } catch (error) {
      console.error("Notes image error:", error);
      setNotesStatus("Could not add that image.");
      logStudyEvent("error", "notes-image-failed");
    }
  }

  function handleNotesImageFiles(files, source) {
    Array.from(files || []).forEach(function (file) {
      processNotesImageFile(file, source);
    });
  }

  async function captureScreenForNotes() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert("Screen capture is not supported in this browser. You can still paste or upload a screenshot image.");
      logStudyEvent("error", "notes-screen-capture-unsupported");
      return;
    }

    let stream = null;

    try {
      setNotesStatus("Choose a screen, window, or tab to capture.");
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await new Promise(function (resolve) {
        if (video.readyState >= 2) {
          resolve();
          return;
        }

        video.onloadeddata = resolve;
      });
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 250);
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, video.videoWidth);
      canvas.height = Math.max(1, video.videoHeight);
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const resizedDataUrl = await resizeImageDataUrl(canvas.toDataURL("image/jpeg", 0.88));

      if (resizedDataUrl.length > NOTES_MAX_IMAGE_DATA_URL_LENGTH) {
        alert("That screenshot is too large for local notes.");
        setNotesStatus("Screenshot was too large to save locally.");
        logStudyEvent("error", "notes-screen-capture-too-large");
        return;
      }

      insertNotesImage(resizedDataUrl, "Captured screen for study notes", "notes-screen-capture");
      setNotesStatus("Screenshot captured and saved locally.");
    } catch (error) {
      console.error("Screen capture error:", error);
      setNotesStatus("Screen capture was cancelled or unavailable.");
      logStudyEvent("error", "notes-screen-capture-failed");
    } finally {
      if (stream) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
      }
    }
  }

  function exportNotesAsPdf() {
    if (!notesEditor || !notesHasContent()) {
      alert("Add notes before exporting.");
      logStudyEvent("error", "notes-export-empty");
      return;
    }

    saveNotesNow();

    const notesHtml = sanitizeNotesHtml(notesEditor.innerHTML);
    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      alert("Please allow popups to export notes as a PDF.");
      logStudyEvent("error", "notes-export-popup-blocked");
      return;
    }

    const title = "Study Notes - " + participantID + " - System 2";
    printWindow.document.open();
    printWindow.document.write(
      "<!DOCTYPE html>" +
      "<html><head><title>" + escapeHtml(title) + "</title>" +
      "<style>" +
      "body{font-family:Arial,sans-serif;margin:36px;color:#111827;line-height:1.55;}" +
      "header{border-bottom:3px solid #2563eb;margin-bottom:24px;padding-bottom:12px;}" +
      "h1{font-size:24px;margin:0 0 8px;} .meta{color:#475569;font-size:13px;}" +
      "img{max-width:100%;height:auto;border:1px solid #d8dee8;border-radius:8px;margin:10px 0;}" +
      "blockquote{border-left:4px solid #93c5fd;margin-left:0;padding-left:12px;color:#475569;}" +
      "@media print{body{margin:24px;} button{display:none;}}" +
      "</style></head><body>" +
      "<header><h1>Study Notes</h1><div class=\"meta\">Participant ID: " + escapeHtml(participantID) + " | System 2 | Exported " + escapeHtml(new Date().toLocaleString()) + "</div></header>" +
      "<main>" + notesHtml + "</main>" +
      "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>" +
      "</body></html>"
    );
    printWindow.document.close();
    setNotesStatus("Print dialog opened. Choose Save as PDF to download.");
    logStudyEvent("export", "notes-pdf-print");
  }

  function clearNotes() {
    if (!notesEditor || !notesHasContent()) {
      return;
    }

    if (!window.confirm("Clear all saved notes for this session?")) {
      return;
    }

    notesEditor.innerHTML = "";
    localStorage.removeItem(NOTES_STORAGE_KEY);
    setNotesStatus("Notes cleared.");
    updateNotesExportState();
    logStudyEvent("clear", "notes");
  }

  function initializeNotesFeature() {
    if (!notesBtn || !notesPopup || !notesEditor) {
      return;
    }

    loadNotes();

    if (notesHeader) {
      notesHeader.addEventListener("pointerdown", startNotesDrag);
      notesHeader.addEventListener("pointermove", moveNotesDrag);
      notesHeader.addEventListener("pointerup", endNotesDrag);
      notesHeader.addEventListener("pointercancel", endNotesDrag);
      window.addEventListener("resize", keepNotesPopupInViewport);
    }

    notesResizeHandles.forEach(function (resizeHandle) {
      resizeHandle.addEventListener("pointerdown", startNotesResize);
    });

    if (window.ResizeObserver) {
      const notesResizeObserver = new ResizeObserver(function () {
        if (notesIsOpen && !notesResizeState) {
          scheduleNotesPopupSizeSave();
        }
      });
      notesResizeObserver.observe(notesPopup);
    }

    notesBtn.addEventListener("click", function () {
      logStudyEvent("click", "notes-button");

      if (notesIsOpen) {
        closeNotesPopup();
      } else {
        openNotesPopup("button");
      }
    });

    notesCloseBtn.addEventListener("click", closeNotesPopup);

    document.querySelectorAll("[data-notes-command]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyNotesCommand(button.dataset.notesCommand);
      });
    });

    notesFormat.addEventListener("change", function () {
      applyNotesCommand("formatBlock", notesFormat.value);
      logStudyEvent("select", "notes-format-" + notesFormat.value);
    });

    notesImageBtn.addEventListener("click", function () {
      logStudyEvent("click", "notes-add-image");
      notesImageInput.click();
    });

    notesImageInput.addEventListener("change", function () {
      handleNotesImageFiles(notesImageInput.files, "notes-uploaded-image");
      notesImageInput.value = "";
    });

    notesCaptureBtn.addEventListener("click", function () {
      logStudyEvent("click", "notes-capture-screen");
      captureScreenForNotes();
    });

    notesEditor.addEventListener("input", scheduleNotesSave);

    notesEditor.addEventListener("paste", function (event) {
      const clipboardData = event.clipboardData;
      const files = Array.from(clipboardData ? clipboardData.items : [])
        .filter(function (item) {
          return item.kind === "file" && item.type.startsWith("image/");
        })
        .map(function (item) {
          return item.getAsFile();
        })
        .filter(Boolean);

      if (files.length > 0) {
        event.preventDefault();
        handleNotesImageFiles(files, "notes-pasted-image");
        return;
      }

      const html = clipboardData ? clipboardData.getData("text/html") : "";

      if (html) {
        event.preventDefault();
        document.execCommand("insertHTML", false, sanitizeNotesHtml(html));
        scheduleNotesSave();
        logStudyEvent("paste", "notes-rich-html");
      }
    });

    notesEditor.addEventListener("dragover", function (event) {
      event.preventDefault();
      notesEditor.classList.add("drag-over");
    });

    notesEditor.addEventListener("dragleave", function () {
      notesEditor.classList.remove("drag-over");
    });

    notesEditor.addEventListener("drop", function (event) {
      event.preventDefault();
      notesEditor.classList.remove("drag-over");
      handleNotesImageFiles(event.dataTransfer ? event.dataTransfer.files : [], "notes-dropped-image");
    });

    notesClearBtn.addEventListener("click", clearNotes);
    notesExportBtn.addEventListener("click", exportNotesAsPdf);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && notesIsOpen && !tourIsActive) {
        event.preventDefault();
        closeNotesPopup();
      }
    });
  }

  function appendNotice(text) {
    const notice = createElement("div", "enhanced-message enhanced-system-message", text);
    notice.addEventListener("mouseenter", function () {
      logStudyEvent("hover", "system-notice");
      logCommonEvent("hover", "system-message");
    });
    messages.appendChild(notice);
    scrollMessagesToBottom();
  }

  function appendLoadingMessage() {
    const wrapper = createElement("article", "enhanced-message enhanced-assistant-message enhanced-loading-message");
    wrapper.setAttribute("aria-live", "polite");
    wrapper.appendChild(createElement("div", "enhanced-message-label", "AI Study Assistant"));

    const loadingRow = createElement("div", "enhanced-loading-row");
    loadingRow.appendChild(createElement("span", "enhanced-loading-dot"));
    loadingRow.appendChild(createElement("span", "enhanced-loading-dot"));
    loadingRow.appendChild(createElement("span", "enhanced-loading-dot"));
    loadingRow.appendChild(createElement("span", "enhanced-loading-text", "Reading your materials and drafting an answer"));
    wrapper.appendChild(loadingRow);

    messages.appendChild(wrapper);
    scrollMessagesToBottom();
    return wrapper;
  }

  function appendUserMessage(text) {
    const wrapper = createElement("article", "enhanced-message enhanced-user-message");
    wrapper.appendChild(createElement("div", "enhanced-message-label", "You"));
    wrapper.appendChild(createElement("p", "", text));
    wrapper.addEventListener("mouseenter", function () {
      logEvent("hover", "enhanced-user-message");
      logCommonEvent("hover", "user-message");
    });
    messages.appendChild(wrapper);
    scrollMessagesToBottom();
  }

  function normalizeTitle(title) {
    return String(title || "")
      .replace(/\*\*/g, "")
      .replace(/:$/, "")
      .trim();
  }

  function isKnownSectionTitle(title) {
    const normalized = normalizeTitle(title).toLowerCase();
    return [
      "paper says",
      "slides say",
      "slides or other source says",
      "source 1 says",
      "source 2 says",
      "key differences",
      "study takeaway",
      "definition",
      "course context",
      "plain-language explanation",
      "plain language explanation",
      "what it means",
      "why it matters",
      "simple example",
      "example",
      "simpler explanation",
      "analogy",
      "step-by-step breakdown",
      "concrete example",
      "check your understanding",
    ].includes(normalized);
  }

  function isSoftSectionTitle(title) {
    const normalized = normalizeTitle(title);
    const words = normalized.split(/\s+/).filter(Boolean);

    return (
      normalized.length >= 3 &&
      normalized.length <= 56 &&
      words.length <= 7 &&
      !/[.!?]$/.test(normalized)
    );
  }

  function pushSection(sections, current) {
    const content = current.lines.join("\n").trim();

    if (content) {
      sections.push({ title: current.title, content });
    }
  }

  function parseStructuredSections(text) {
    const sections = [];
    let current = { title: "Answer", lines: [] };

    String(text || "").split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      const markdownHeading = trimmed.match(/^#{1,4}\s+(.+)$/);
      const boldHeading = trimmed.match(/^\*\*(.+?)\*\*:?\s*$/);
      const colonHeading = trimmed.match(/^([^:]{3,48}):\s*(.*)$/);
      const heading = markdownHeading || boldHeading;

      if (heading && (isKnownSectionTitle(heading[1]) || isSoftSectionTitle(heading[1]))) {
        pushSection(sections, current);
        current = { title: normalizeTitle(heading[1]), lines: [] };
        return;
      }

      if (colonHeading && isKnownSectionTitle(colonHeading[1])) {
        pushSection(sections, current);
        current = { title: normalizeTitle(colonHeading[1]), lines: [] };

        if (colonHeading[2]) {
          current.lines.push(colonHeading[2]);
        }

        return;
      }

      current.lines.push(line);
    });

    pushSection(sections, current);
    return sections;
  }

  function removeTrailingPromptBoilerplate(text) {
    const chunks = String(text || "")
      .split(/\n{2,}/)
      .map(function (chunk) { return chunk.trim(); })
      .filter(Boolean);

    if (chunks.length === 0) {
      return "";
    }

    const lastChunk = chunks[chunks.length - 1];

    if (
      lastChunk.length <= 260 &&
      /^if you\b/i.test(lastChunk) &&
      /(question|clarification|specific|deeper|further|feel free|let me know|ask)/i.test(lastChunk)
    ) {
      chunks.pop();
    }

    return chunks.join("\n\n");
  }

  function appendInlineText(parent, text) {
    String(text || "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach(function (part) {
      if (!part) {
        return;
      }

      if (/^\*\*[^*]+\*\*$/.test(part)) {
        parent.appendChild(createElement("strong", "", part.slice(2, -2)));
        return;
      }

      if (/^`[^`]+`$/.test(part)) {
        parent.appendChild(createElement("code", "enhanced-inline-code", part.slice(1, -1)));
        return;
      }

      parent.appendChild(document.createTextNode(part));
    });
  }

  function createFormattedTextBlock(tagName, className, text) {
    const element = createElement(tagName, className || "");
    appendInlineText(element, text);
    return element;
  }

  function appendReadableList(parent, lines, ordered) {
    const list = createElement(ordered ? "ol" : "ul", "enhanced-readable-list");

    lines.forEach(function (line) {
      const itemText = ordered
        ? line.replace(/^\d+[\.)]\s+/, "")
        : line.replace(/^[-*•]\s+/, "");
      const item = createElement("li", "");
      appendInlineText(item, itemText);
      list.appendChild(item);
    });

    parent.appendChild(list);
  }

  function appendFormattedChunk(parent, chunk) {
    const trimmed = String(chunk || "").trim();
    const lines = trimmed.split(/\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean);

    if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
      const codeText = trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "").trim();
      const pre = createElement("pre", "enhanced-code-block");
      pre.appendChild(createElement("code", "", codeText));
      parent.appendChild(pre);
      return;
    }

    if (lines.length > 1 && lines.every(function (line) { return /^[-*•]\s+/.test(line); })) {
      appendReadableList(parent, lines, false);
      return;
    }

    if (lines.length > 1 && lines.every(function (line) { return /^\d+[\.)]\s+/.test(line); })) {
      appendReadableList(parent, lines, true);
      return;
    }

    parent.appendChild(createFormattedTextBlock("p", "", trimmed));
  }

  function appendParagraphs(parent, text) {
    const displayText = removeTrailingPromptBoilerplate(text);
    const chunks = displayText
      .split(/\n{2,}/)
      .map(function (chunk) { return chunk.trim(); })
      .filter(Boolean);

    if (chunks.length === 0) {
      parent.appendChild(createElement("p", "", "No response text was generated."));
      return;
    }

    chunks.forEach(function (chunk) {
      appendFormattedChunk(parent, chunk);
    });
  }

  function createStructuredAnswer(text, mode) {
    const displayText = removeTrailingPromptBoilerplate(text);
    const sections = parseStructuredSections(displayText);
    const container = createElement("div", "enhanced-structured-answer mode-" + (mode || "general"));

    if (sections.length <= 1) {
      appendParagraphs(container, displayText);
      return container;
    }

    sections.forEach(function (section) {
      const card = createElement("section", "enhanced-answer-section");
      card.appendChild(createElement("h4", "", section.title));
      appendParagraphs(card, section.content);
      container.appendChild(card);
    });

    return container;
  }

  function getUniqueRetrievedDocuments(retrievedDocuments) {
    const seen = new Set();

    return (retrievedDocuments || []).filter(function (doc) {
      const key = [
        doc.docName || "Unknown Document",
        doc.chunkIndex !== undefined ? doc.chunkIndex : "unknown",
        String(doc.chunkText || "").slice(0, 160),
      ].join("|");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function getSourceNames(retrievedDocuments) {
    return Array.from(new Set((retrievedDocuments || []).map(function (doc) {
      return doc.docName || "Unknown Document";
    })));
  }

  function createSourceChips(retrievedDocuments) {
    const sourceNames = getSourceNames(retrievedDocuments);

    if (sourceNames.length === 0) {
      return null;
    }

    const chips = createElement("div", "enhanced-source-chips");
    const visibleSources = sourceNames.slice(0, 4);

    visibleSources.forEach(function (sourceName) {
      chips.appendChild(createElement("span", "enhanced-source-chip", sourceName));
    });

    if (sourceNames.length > visibleSources.length) {
      chips.appendChild(createElement("span", "enhanced-source-chip muted", "+" + (sourceNames.length - visibleSources.length) + " more"));
    }

    return chips;
  }

  function createEvidenceSection(retrievedDocuments) {
    const section = createElement("details", "enhanced-evidence");
    const uniqueDocuments = getUniqueRetrievedDocuments(retrievedDocuments);
    const sourceCount = getSourceNames(uniqueDocuments).length;
    section.open = false;
    section.appendChild(createElement("summary", "", "Show retrieved evidence (" + sourceCount + " source" + (sourceCount === 1 ? "" : "s") + ")"));
    section.addEventListener("toggle", function () {
      logStudyEvent("toggle", section.open ? "evidence-expanded" : "evidence-collapsed");
    });

    if (!uniqueDocuments || uniqueDocuments.length === 0) {
      section.appendChild(createElement("p", "enhanced-empty-state", "No evidence retrieved for this response."));
      return section;
    }
    uniqueDocuments.forEach(function (doc) {
      const item = createElement("div", "enhanced-evidence-item");
      const score = typeof doc.relevanceScore === "number" ? doc.relevanceScore.toFixed(4) : "0.0000";
      item.appendChild(createElement("div", "enhanced-evidence-meta", (doc.docName || "Unknown Document") + " | Chunk " + doc.chunkIndex + " | Score " + score));
      item.appendChild(createElement("p", "", doc.chunkText || ""));
      section.appendChild(item);
    });

    return section;
  }

  function createConfidenceRow(confidenceMetrics, retrievalMethodValue) {
    const row = createElement("div", "enhanced-confidence-row");

    if (!confidenceMetrics) {
      row.textContent = "Confidence unavailable · Method: " + (retrievalMethodValue || "semantic");
      return row;
    }

    row.textContent =
      "Confidence: overall " + formatConfidence(confidenceMetrics.overallConfidence) +
      " · retrieval " + formatConfidence(confidenceMetrics.retrievalConfidence) +
      " · method " + (confidenceMetrics.retrievalMethod || retrievalMethodValue || "semantic");
    return row;
  }

  function updateEvidenceSummary(retrievedDocuments) {
    const docs = getUniqueRetrievedDocuments(retrievedDocuments || []);
    const sourceNames = getSourceNames(docs);

    sourceChip.textContent = sourceNames.length > 0
      ? sourceNames.length + " source" + (sourceNames.length === 1 ? "" : "s") + " retrieved"
      : "No evidence retrieved";
    evidenceSummary.textContent = sourceNames.length > 0
      ? sourceNames.join(", ")
      : "The last response did not retrieve document evidence.";
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return Promise.resolve();
  }

  function saveResponseToNotes(entry) {
    if (!notesEditor) {
      return;
    }

    openNotesPopup("response-action");
    const mode = entry.studyMode || activeMode;
    const title = modeLabels[mode] || "AI Study Assistant";
    const displayText = removeTrailingPromptBoilerplate(entry.botResponse || "");
    const paragraphs = displayText
      .split(/\n{2,}/)
      .map(function (chunk) { return chunk.trim(); })
      .filter(Boolean);
    const html = [
      "<h3>" + escapeHtml(title) + "</h3>",
      paragraphs.map(function (paragraph) {
        return "<p>" + escapeHtml(paragraph).replace(/\n/g, "<br>") + "</p>";
      }).join(""),
      "<p><br></p>",
    ].join("");

    notesEditor.focus();
    document.execCommand("insertHTML", false, html);
    saveNotesNow();
    setNotesStatus("Saved AI response to notes.");
    logStudyEvent("save", "response-to-notes");
  }

  function createResponseActionButton(label, actionName, onClick) {
    const button = createElement("button", "enhanced-response-action", label);
    button.type = "button";
    button.addEventListener("click", function () {
      logStudyEvent("click", "response-action-" + actionName);
      onClick(button);
    });
    return button;
  }

  function createResponseActions(entry) {
    const actions = createElement("div", "enhanced-response-actions");

    actions.appendChild(createResponseActionButton("Simplify", "simplify", function () {
      setMode("simplify");
      sendMessage("Re-explain the previous answer in simpler language with one concrete example.");
    }));

    actions.appendChild(createResponseActionButton("Give example", "example", function () {
      sendMessage("Give one concrete example that makes the previous answer easier to understand.");
    }));

    actions.appendChild(createResponseActionButton("Compare sources", "compare", function () {
      setMode("compare");
      sendMessage("Compare how my uploaded documents explain the previous topic. Use short sections and a study takeaway.");
    }));

    actions.appendChild(createResponseActionButton("Save to notes", "save-to-notes", function () {
      saveResponseToNotes(entry);
    }));

    actions.appendChild(createResponseActionButton("Copy", "copy", function (button) {
      copyTextToClipboard(removeTrailingPromptBoilerplate(entry.botResponse || "")).then(function () {
        const originalText = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(function () {
          button.textContent = originalText;
        }, 1400);
      }).catch(function (error) {
        console.error("Copy response error:", error);
      });
    }));

    return actions;
  }

  function appendBotMessage(entry) {
    const mode = entry.studyMode || activeMode;
    const retrievedDocuments = getUniqueRetrievedDocuments(entry.retrievedDocuments || []);
    const wrapper = createElement("article", "enhanced-message enhanced-assistant-message mode-" + mode);
    const header = createElement("div", "enhanced-message-header");

    header.appendChild(createElement("div", "enhanced-message-label", modeLabels[mode] || "AI Study Assistant"));
    const sourceCount = getSourceNames(retrievedDocuments).length;
    header.appendChild(createElement("span", "enhanced-message-pill", sourceCount + " source" + (sourceCount === 1 ? "" : "s")));
    wrapper.appendChild(header);

    wrapper.appendChild(createStructuredAnswer(entry.botResponse, mode));
    const sourceChips = createSourceChips(retrievedDocuments);

    if (sourceChips) {
      wrapper.appendChild(sourceChips);
    }
    wrapper.appendChild(createConfidenceRow(entry.confidenceMetrics || null, entry.retrievalMethod));
    wrapper.appendChild(createResponseActions(entry));
    wrapper.appendChild(createEvidenceSection(retrievedDocuments));

    wrapper.addEventListener("mouseenter", function () {
      logEvent("hover", "enhanced-assistant-message");
      logCommonEvent("hover", "assistant-message");
    });

    messages.appendChild(wrapper);
    updateEvidenceSummary(retrievedDocuments);
    scrollMessagesToBottom();
  }

  function renderDocuments(documents) {
    docsList.innerHTML = "";

    if (!documents || documents.length === 0) {
      emptyDocs.hidden = false;
      docCount.textContent = "0 active";
      sourceChip.textContent = "No uploaded files";
      return;
    }

    emptyDocs.hidden = true;
    docCount.textContent = documents.length + " active";
    sourceChip.textContent = documents.length + " uploaded file" + (documents.length === 1 ? "" : "s");

    documents.forEach(function (documentRecord) {
      const item = createElement("li", "enhanced-doc-item");
      const filename = String(documentRecord.filename || "");
      const ext = filename.includes(".")
        ? filename.split(".").pop().slice(0, 4).toUpperCase()
        : "DOC";
      const icon = createElement("span", "enhanced-doc-icon", ext);
      const body = createElement("div", "enhanced-doc-body");
      body.appendChild(createElement("strong", "", documentRecord.filename || "Untitled document"));
      body.appendChild(createElement("span", "", (documentRecord.processingStatus || "unknown") + " | " + (documentRecord.chunkCount || 0) + " chunks | " + formatDate(documentRecord.processedAt)));
      item.appendChild(icon);
      item.appendChild(body);
      item.addEventListener("mouseenter", function () {
        logEvent("hover", "document-" + (documentRecord.filename || "unknown"));
        logStudyEvent("hover", "document-item");
      });
      docsList.appendChild(item);
    });
  }

  async function loadDocuments() {
    try {
      const response = await fetch("/documents?participantID=" + encodeURIComponent(participantID));
      const data = await response.json();
      renderDocuments(data.documents || []);
    } catch (error) {
      console.error("Error loading documents:", error);
      appendNotice("Could not load uploaded documents.");
    }
  }

  function renderInteraction(entry) {
    appendUserMessage(entry.userInput);
    appendBotMessage({
      botResponse: entry.botResponse,
      retrievalMethod: entry.retrievalMethod || "semantic",
      studyMode: entry.studyMode || "general",
      retrievedDocuments: entry.retrievedDocuments || [],
      confidenceMetrics: entry.confidenceMetrics || null,
    });
    rememberInteraction(entry);
  }

  async function loadConversationHistory() {
    try {
      const response = await fetch("/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantID, systemID: 2, limit: HISTORY_LIMIT }),
      });
      const data = await response.json();
      messages.innerHTML = "";

      if (data.history && data.history.length > 0) {
        data.history.forEach(renderInteraction);
      } else {
        appendNotice("Start with a prompt above or ask a question about your uploaded course materials.");
        updateContextStatus();
      }
    } catch (error) {
      console.error("Error loading history:", error);
      appendNotice("Could not load participant history.");
      updateContextStatus();
    }
  }

  async function sendMessage(text) {
    const messageText = String(text || input.value || "").trim();

    if (!messageText) {
      alert("Please enter a message.");
      return;
    }

    appendUserMessage(messageText);
    input.value = "";
    sendBtn.disabled = true;
    const loadingMessage = appendLoadingMessage();

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: messageText,
          message: messageText,
          participantID,
          systemID: 2,
          retrievalMethod: retrievalMethod.value,
          studyMode: activeMode,
          conversationHistory: getRecentConversationHistory(),
          limit: HISTORY_LIMIT,
        }),
      });
      const data = await response.json();
      loadingMessage.remove();

      if (!response.ok || data.error) {
        appendNotice("Error: " + (data.error || "Failed to get a response."));
        logStudyEvent("error", "chat-response-error");
        return;
      }

      const interaction = {
        userInput: messageText,
        botResponse: data.botResponse,
        retrievalMethod: data.retrievalMethod || retrievalMethod.value,
        studyMode: data.studyMode || activeMode,
        retrievedDocuments: data.retrievedDocuments || [],
        confidenceMetrics: data.confidenceMetrics || null,
      };

      appendBotMessage(interaction);
      rememberInteraction(interaction);
      logStudyEvent("complete", "chat-response-success");
    } catch (error) {
      console.error("Error sending enhanced message:", error);
      loadingMessage.remove();
      appendNotice("Error: Failed to get a response.");
      logStudyEvent("error", "chat-request-failed");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  uploadBtn.addEventListener("click", async function () {
    logEvent("click", "enhanced-upload-btn");
    logCommonEvent("click", "upload-document");

    if (fileInput.files.length === 0) {
      alert("Please choose a TXT or PDF document first.");
      return;
    }

    const formData = new FormData();
    formData.append("document", fileInput.files[0]);
    formData.append("participantID", participantID);
    uploadBtn.disabled = true;

    try {
      const response = await fetch("/upload-document", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        appendNotice("Upload error: " + (data.error || "Failed to upload document."));
        logStudyEvent("error", "upload-error");
        return;
      }

      appendNotice("Uploaded " + data.document.filename + " with " + data.document.chunkCount + " processed chunks.");
      logStudyEvent("complete", "upload-success");
      uploadForm.reset();
      fileName.textContent = "No file chosen";
      await loadDocuments();
    } catch (error) {
      console.error("Upload error:", error);
      appendNotice("Upload error: Failed to upload document.");
      logStudyEvent("error", "upload-request-failed");
    } finally {
      uploadBtn.disabled = false;
    }
  });

  fileInput.addEventListener("change", function () {
    fileName.textContent = fileInput.files.length > 0 ? fileInput.files[0].name : "No file chosen";
    logEvent("change", "enhanced-file-input");
    logCommonEvent("change", "file-input");
    logStudyEvent("change", fileInput.files.length > 0 ? "file-selected" : "file-cleared");
  });

  retrievalMethod.addEventListener("change", function () {
    appendNotice("Retrieval method changed to " + retrievalMethod.value + ".");
    logEvent("change", "enhanced-retrieval-method");
    logCommonEvent("change", "retrieval-method");
    logStudyEvent("change", "retrieval-method-" + retrievalMethod.value);
  });

  function selectPromptPlaceholder() {
    const match = input.value.match(/\[[^\]]+\]/);

    if (match) {
      input.setSelectionRange(match.index, match.index + match[0].length);
    }
  }

  document.querySelectorAll(".enhanced-prompt-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      setMode(button.dataset.mode);
      input.value = button.dataset.prompt;
      input.focus();
      selectPromptPlaceholder();
      logEvent("click", "prompt-" + button.dataset.mode);
      logStudyEvent("select", "mode-" + button.dataset.mode + "-via-prompt");
    });

    button.addEventListener("mouseenter", function () {
      logEvent("hover", "prompt-" + button.dataset.mode);
      logStudyEvent("hover", "prompt-button");
    });
  });
  sendBtn.addEventListener("click", function () {
    lastSubmitMethod = "button";
  });

  document.querySelectorAll(".enhanced-tool-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      setMode(button.dataset.mode);
      input.focus();
      logEvent("click", "tool-" + button.dataset.mode);
      logStudyEvent("select", "mode-" + button.dataset.mode + "-via-tool");
    });
  });

  chatForm.addEventListener("submit", function (event) {
    event.preventDefault();
    logEvent("click", "enhanced-send-btn");
    logCommonEvent("submit", "send-message");
    logStudyEvent("submit", "chat-submit-" + lastSubmitMethod);
    sendMessage();
    lastSubmitMethod = "button";
  });

  input.addEventListener("focus", function () {
    logEvent("focus", "enhanced-user-input");
    logCommonEvent("focus", "user-input");
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      lastSubmitMethod = "enter-key";
      chatForm.requestSubmit();
    }
  });

  messages.addEventListener("mouseenter", function () {
    logEvent("hover", "enhanced-messages");
    logCommonEvent("hover", "messages-container");
  });

  sessionMeta.textContent = "Study session active";
  setMode("general");
  updateContextStatus();
  loadDocuments();
  loadConversationHistory();
  // Milestone 4(a): Set return link href with participantID and systemID
  const returnWorkflowLink = document.getElementById("return-workflow-link");
  if (returnWorkflowLink) {
    returnWorkflowLink.href =
      "/study-workflow.html?participantID=" +
      encodeURIComponent(participantID) +
      "&systemID=" +
      systemID;
  }
  initializeNotesFeature();
  initializeWelcomeOverlay();

  initializeGuidedTour();
})();