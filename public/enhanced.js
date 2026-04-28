(function () {
  // Milestone 3 - Enhanced prototype: client behavior for the System 2 study assistant.
  const HISTORY_LIMIT = 5;
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

  let conversationHistory = [];
  let activeMode = "general";

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

  function appendNotice(text) {
    const notice = createElement("div", "enhanced-message enhanced-system-message", text);
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

  function appendParagraphs(parent, text) {
    const chunks = String(text || "")
      .split(/\n{2,}/)
      .map(function (chunk) { return chunk.trim(); })
      .filter(Boolean);

    if (chunks.length === 0) {
      parent.appendChild(createElement("p", "", "No response text was generated."));
      return;
    }

    chunks.forEach(function (chunk) {
      parent.appendChild(createElement("p", "", chunk));
    });
  }

  function createStructuredAnswer(text, mode) {
    const sections = parseStructuredSections(text);
    const container = createElement("div", "enhanced-structured-answer");

    if (sections.length <= 1 || mode === "general") {
      appendParagraphs(container, text);
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

  function createEvidenceSection(retrievedDocuments) {
    const section = createElement("details", "enhanced-evidence");
    const sourceCount = new Set((retrievedDocuments || []).map(function (doc) {
      return doc.docName || "Unknown Document";
    })).size;
    section.open = sourceCount > 0;
    section.appendChild(createElement("summary", "", "Retrieved evidence (" + sourceCount + " source" + (sourceCount === 1 ? "" : "s") + ")"));

    if (!retrievedDocuments || retrievedDocuments.length === 0) {
      section.appendChild(createElement("p", "enhanced-empty-state", "No evidence retrieved for this response."));
      return section;
    }

    retrievedDocuments.forEach(function (doc) {
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
      row.textContent = "Confidence unavailable | Method: " + (retrievalMethodValue || "semantic");
      return row;
    }

    row.textContent =
      "Overall " + formatConfidence(confidenceMetrics.overallConfidence) +
      " | Retrieval " + formatConfidence(confidenceMetrics.retrievalConfidence) +
      " | Method " + (confidenceMetrics.retrievalMethod || retrievalMethodValue || "semantic");
    return row;
  }

  function updateEvidenceSummary(retrievedDocuments) {
    const docs = retrievedDocuments || [];
    const sourceNames = Array.from(new Set(docs.map(function (doc) {
      return doc.docName || "Unknown Document";
    })));

    sourceChip.textContent = sourceNames.length > 0
      ? sourceNames.length + " source" + (sourceNames.length === 1 ? "" : "s") + " retrieved"
      : "No evidence retrieved";
    evidenceSummary.textContent = sourceNames.length > 0
      ? sourceNames.join(", ")
      : "The last response did not retrieve document evidence.";
  }

  function appendBotMessage(entry) {
    const mode = entry.studyMode || activeMode;
    const retrievedDocuments = entry.retrievedDocuments || [];
    const wrapper = createElement("article", "enhanced-message enhanced-assistant-message");
    const header = createElement("div", "enhanced-message-header");

    header.appendChild(createElement("div", "enhanced-message-label", modeLabels[mode] || "AI Study Assistant"));

    const sourceCount = new Set(retrievedDocuments.map(function (doc) {
      return doc.docName || "Unknown Document";
    })).size;
    header.appendChild(createElement("span", "enhanced-message-pill", sourceCount + " source" + (sourceCount === 1 ? "" : "s")));
    wrapper.appendChild(header);

    wrapper.appendChild(createStructuredAnswer(entry.botResponse, mode));
    wrapper.appendChild(createConfidenceRow(entry.confidenceMetrics || null, entry.retrievalMethod));
    wrapper.appendChild(createEvidenceSection(retrievedDocuments));

    wrapper.addEventListener("mouseenter", function () {
      logEvent("hover", "enhanced-assistant-message");
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
    } catch (error) {
      console.error("Error sending enhanced message:", error);
      loadingMessage.remove();
      appendNotice("Error: Failed to get a response.");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  uploadBtn.addEventListener("click", async function () {
    logEvent("click", "enhanced-upload-btn");

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
        return;
      }

      appendNotice("Uploaded " + data.document.filename + " with " + data.document.chunkCount + " processed chunks.");
      uploadForm.reset();
      fileName.textContent = "No file chosen";
      await loadDocuments();
    } catch (error) {
      console.error("Upload error:", error);
      appendNotice("Upload error: Failed to upload document.");
    } finally {
      uploadBtn.disabled = false;
    }
  });

  fileInput.addEventListener("change", function () {
    fileName.textContent = fileInput.files.length > 0 ? fileInput.files[0].name : "No file chosen";
    logEvent("change", "enhanced-file-input");
  });

  retrievalMethod.addEventListener("change", function () {
    appendNotice("Retrieval method changed to " + retrievalMethod.value + ".");
    logEvent("change", "enhanced-retrieval-method");
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
    });

    button.addEventListener("mouseenter", function () {
      logEvent("hover", "prompt-" + button.dataset.mode);
    });
  });

  document.querySelectorAll(".enhanced-tool-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      setMode(button.dataset.mode);
      input.focus();
      logEvent("click", "tool-" + button.dataset.mode);
    });
  });

  chatForm.addEventListener("submit", function (event) {
    event.preventDefault();
    logEvent("click", "enhanced-send-btn");
    sendMessage();
  });

  input.addEventListener("focus", function () {
    logEvent("focus", "enhanced-user-input");
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  messages.addEventListener("mouseenter", function () {
    logEvent("hover", "enhanced-messages");
  });

  sessionMeta.textContent = "Participant ID: " + participantID + " | System 2";
  setMode("general");
  updateContextStatus();
  loadDocuments();
  loadConversationHistory();
})();