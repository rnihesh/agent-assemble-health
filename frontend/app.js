/* MedAssist Healthcare Agent Command Center */

(function () {
  "use strict";

  const API_BASE = window.location.origin;
  const DRAFT_STORAGE_KEY = "medassist-dashboard-draft-v1";
  const HISTORY_STORAGE_KEY = "medassist-dashboard-history-v2";
  const HISTORY_LIMIT = 8;

  const TOOL_CONFIG = {
    "patient-summary": {
      label: "Patient Summary",
      description:
        "Longitudinal overview of the current patient across demographics, problems, medications, labs, vitals, and immunizations.",
      endpoint: "/api/patient-summary",
      requiresPatient: true,
      buildBody: function (ctx) {
        return { patientId: ctx.patientId };
      },
    },
    "drug-interactions": {
      label: "Drug Interactions",
      description:
        "High-signal medication safety analysis across current meds, typed additions, allergies, and duplication risk.",
      endpoint: "/api/drug-interactions",
      requiresPatient: false,
      buildBody: function (ctx) {
        var medications = ctx.medList
          .split("\n")
          .map(function (item) {
            return item.trim();
          })
          .filter(Boolean);

        var body = {};
        if (ctx.patientId) {
          body.patientId = ctx.patientId;
        }
        if (medications.length > 0) {
          body.medications = medications;
        }
        return body;
      },
      validate: function (body) {
        return Boolean(body.patientId || (body.medications && body.medications.length));
      },
      validationMessage:
        "Provide a staged patient, typed medications, or both for interaction review.",
    },
    "lab-results": {
      label: "Lab Results",
      description:
        "Abnormality detection, trend interpretation, and derived values such as eGFR across the lookback window.",
      endpoint: "/api/lab-results",
      requiresPatient: true,
      buildBody: function (ctx) {
        return {
          patientId: ctx.patientId,
          lookbackDays: parseInt(ctx.lookbackDays, 10) || 90,
        };
      },
    },
    "risk-score": {
      label: "Risk Scores",
      description:
        "Validated bedside scoring for stroke, chest pain, thromboembolism, ASCVD, and kidney function.",
      endpoint: "/api/risk-score",
      requiresPatient: true,
      buildBody: function (ctx) {
        return {
          patientId: ctx.patientId,
          calculator: ctx.calculator,
        };
      },
    },
    "care-gaps": {
      label: "Care Gaps",
      description:
        "Preventive care, vaccination, and guideline-based follow-up gaps for the staged patient.",
      endpoint: "/api/care-gaps",
      requiresPatient: true,
      buildBody: function (ctx) {
        return { patientId: ctx.patientId };
      },
    },
    "clinical-guidelines": {
      label: "Clinical Guidelines",
      description:
        "Condition-specific standards of care and target-setting, with or without a live patient record.",
      endpoint: "/api/clinical-guidelines",
      requiresPatient: false,
      buildBody: function (ctx) {
        var body = {};
        if (ctx.patientId) {
          body.patientId = ctx.patientId;
        }
        if (ctx.condition) {
          body.condition = ctx.condition;
        }
        return body;
      },
      validate: function (body) {
        return Boolean(body.patientId || body.condition);
      },
      validationMessage:
        "Provide a staged patient or a condition name for guideline matching.",
    },
  };

  const DEMO_SCENARIOS = [
    {
      id: "elder-review",
      title: "Complex Elder Review",
      accent: "Full-story patient snapshot",
      narrative:
        "Stage your complex elderly patient, then lead with summary before pivoting into renal function, anticoagulation context, and care gaps.",
      tool: "patient-summary",
      patientHint:
        "Use the loaded James Wilson equivalent from your FHIR environment for the strongest full-patient walkthrough.",
      prefill: {},
    },
    {
      id: "polypharmacy",
      title: "Polypharmacy Safety",
      accent: "Judge-friendly instant risk",
      narrative:
        "Works even without FHIR data. Great backup path when you want fast, obvious clinical signal from interaction logic.",
      tool: "drug-interactions",
      patientHint:
        "Optional patient context adds allergies and current meds, but typed medications alone still demo well.",
      prefill: {
        medList: "warfarin\nibuprofen\nsertraline\ntramadol",
      },
    },
    {
      id: "lab-trend",
      title: "Diabetes Trendline",
      accent: "Worsening labs over time",
      narrative:
        "Use a diabetes patient with serial HbA1c results to show trend awareness, albuminuria, and derived kidney metrics.",
      tool: "lab-results",
      patientHint:
        "Best with the diabetic-not-at-goal patient or an equivalent live record with repeated labs.",
      prefill: {
        lookbackDays: 365,
      },
    },
    {
      id: "score-spotlight",
      title: "Risk Spotlight",
      accent: "Explicit clinical scoring",
      narrative:
        "Turn the logic into a judge-friendly moment by selecting the exact calculator you want to emphasize.",
      tool: "risk-score",
      patientHint:
        "Use an AFib patient for CHA2DS2-VASc or a chest-pain patient for HEART scoring.",
      prefill: {
        calculator: "CHA2DS2-VASc",
      },
    },
    {
      id: "guideline-fallback",
      title: "Guideline Fallback",
      accent: "No patient required",
      narrative:
        "A resilient fallback when live data is missing: still shows meaningful clinical value and domain knowledge.",
      tool: "clinical-guidelines",
      patientHint:
        "Patient optional. This is the safest mode when external FHIR access is unstable.",
      prefill: {
        condition: "diabetes",
      },
    },
  ];

  var state = {
    activeTool: "patient-summary",
    activeScenarioId: "",
    lastResultMarkdown: "",
    lastRunMeta: null,
    history: loadHistory(),
    statusRefreshInFlight: false,
    patientHint: "",
  };

  var refs = {
    patientIdInput: document.getElementById("patient-id"),
    patientLabel: document.getElementById("patient-label"),
    patientContextNote: document.getElementById("patient-context-note"),
    btnLoad: document.getElementById("btn-load"),
    btnRun: document.getElementById("btn-run"),
    btnRefreshStatus: document.getElementById("btn-refresh-status"),
    btnCopyLatest: document.getElementById("btn-copy-latest"),
    btnDownload: document.getElementById("btn-download"),
    btnClearResult: document.getElementById("btn-clear-result"),
    toolButtons: document.querySelectorAll(".tool-btn"),
    toolTitle: document.getElementById("tool-title"),
    toolSubtitle: document.getElementById("tool-subtitle"),
    stageCopy: document.getElementById("stage-copy"),
    statusIndicator: document.getElementById("status-indicator"),
    runtimeIndicator: document.getElementById("runtime-indicator"),
    resultSummary: document.getElementById("result-summary"),
    resultsContainer: document.getElementById("results"),
    medListInput: document.getElementById("med-list"),
    lookbackInput: document.getElementById("lookback-days"),
    calculatorSelect: document.getElementById("calculator-select"),
    conditionInput: document.getElementById("condition-input"),
    previewEndpoint: document.getElementById("preview-endpoint"),
    previewRequirement: document.getElementById("preview-requirement"),
    previewNote: document.getElementById("preview-note"),
    previewBody: document.getElementById("preview-body"),
    scenarioGrid: document.getElementById("scenario-grid"),
    historyList: document.getElementById("history-list"),
    historyCaption: document.getElementById("history-caption"),
    stackOverall: document.getElementById("stack-overall"),
    stackNote: document.getElementById("stack-note"),
    toast: document.getElementById("toast"),
  };

  restoreDraftState();
  bindEvents();
  renderScenarioCards();
  renderHistory();
  activateTool(state.activeTool);
  syncPatientContext();
  if (state.lastResultMarkdown && state.lastRunMeta) {
    showResult(state.lastResultMarkdown, state.lastRunMeta, { skipHistory: true });
  }
  updateInvocationPreview();
  refreshSystemStatus();
  window.setInterval(refreshSystemStatus, 60000);

  function bindEvents() {
    refs.toolButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.activeScenarioId = "";
        activateTool(button.dataset.tool);
        renderScenarioCards();
      });
    });

    refs.btnLoad.addEventListener("click", function () {
      syncPatientContext(true);
    });

    refs.patientIdInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        refs.btnLoad.click();
      }
    });

    refs.patientIdInput.addEventListener("input", function () {
      updateInvocationPreview();
      saveDraftState();
    });

    refs.medListInput.addEventListener("input", function () {
      updateInvocationPreview();
      saveDraftState();
    });

    refs.lookbackInput.addEventListener("input", function () {
      updateInvocationPreview();
      saveDraftState();
    });

    refs.calculatorSelect.addEventListener("change", function () {
      updateInvocationPreview();
      saveDraftState();
    });

    refs.conditionInput.addEventListener("input", function () {
      updateInvocationPreview();
      saveDraftState();
    });

    refs.btnRun.addEventListener("click", function () {
      runTool();
    });

    refs.btnRefreshStatus.addEventListener("click", function () {
      refreshSystemStatus(true);
    });

    refs.btnCopyLatest.addEventListener("click", function () {
      copyLatestResult();
    });

    refs.btnDownload.addEventListener("click", function () {
      downloadLatestResult();
    });

    refs.btnClearResult.addEventListener("click", function () {
      clearStage(true);
    });

    refs.scenarioGrid.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var button = target.closest("[data-scenario-id]");
      if (!button) {
        return;
      }
      stageScenario(button.dataset.scenarioId);
    });

    refs.historyList.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      var actionButton = target.closest("[data-history-id]");
      if (!actionButton) {
        return;
      }

      var historyId = actionButton.dataset.historyId;
      var action = actionButton.dataset.historyAction;
      if (!historyId || !action) {
        return;
      }

      if (action === "restore") {
        restoreHistory(historyId);
      } else if (action === "rerun") {
        rerunHistory(historyId);
      }
    });
  }

  function activateTool(toolId) {
    if (!TOOL_CONFIG[toolId]) {
      return;
    }

    state.activeTool = toolId;

    refs.toolButtons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.tool === toolId);
    });

    Object.keys(TOOL_CONFIG).forEach(function (knownToolId) {
      var panel = document.getElementById("options-" + knownToolId);
      if (!panel) {
        return;
      }
      panel.classList.toggle("is-hidden", knownToolId !== toolId);
    });

    var config = TOOL_CONFIG[toolId];
    refs.toolTitle.textContent = config.label;
    refs.toolSubtitle.textContent = config.description;
    refs.stageCopy.textContent = config.description;
    updateInvocationPreview();
    saveDraftState();
  }

  function syncPatientContext(showToastOnLoad) {
    var patientId = refs.patientIdInput.value.trim();

    if (patientId) {
      refs.patientLabel.textContent = "Patient: " + patientId;
      refs.patientContextNote.textContent = state.patientHint
        ? state.patientHint
        : "Patient is staged locally for dashboard requests. MCP invocations can also infer patient context from SHARP launch metadata.";

      if (showToastOnLoad) {
        showToast("Patient staged for the next analysis.");
      }
      updateInvocationPreview();
      saveDraftState();
      return;
    }

    refs.patientLabel.textContent = "No patient loaded";
    refs.patientContextNote.textContent = state.patientHint
      ? state.patientHint
      : "No patient staged yet. Guideline mode still works without a patient.";
    updateInvocationPreview();
    saveDraftState();
  }

  function stageScenario(scenarioId) {
    var scenario = DEMO_SCENARIOS.find(function (item) {
      return item.id === scenarioId;
    });

    if (!scenario) {
      return;
    }

    activateTool(scenario.tool);
    state.activeScenarioId = scenario.id;
    state.patientHint = scenario.patientHint;

    if (scenario.prefill.medList !== undefined) {
      refs.medListInput.value = scenario.prefill.medList;
    }
    if (scenario.prefill.lookbackDays !== undefined) {
      refs.lookbackInput.value = String(scenario.prefill.lookbackDays);
    }
    if (scenario.prefill.calculator !== undefined) {
      refs.calculatorSelect.value = scenario.prefill.calculator;
    }
    if (scenario.prefill.condition !== undefined) {
      refs.conditionInput.value = scenario.prefill.condition;
    }

    refs.resultSummary.textContent = scenario.narrative;
    renderScenarioCards();
    syncPatientContext();
    updateInvocationPreview();
    saveDraftState();
    showToast("Scenario staged: " + scenario.title);
  }

  function buildRequestContext() {
    return {
      patientId: refs.patientIdInput.value.trim(),
      medList: refs.medListInput.value.trim(),
      lookbackDays: refs.lookbackInput.value,
      calculator: refs.calculatorSelect.value,
      condition: refs.conditionInput.value.trim(),
    };
  }

  async function runTool() {
    var config = TOOL_CONFIG[state.activeTool];
    var requestContext = buildRequestContext();

    if (config.requiresPatient && !requestContext.patientId) {
      showError("Patient ID is required for " + config.label + ".");
      return;
    }

    var body = config.buildBody(requestContext);
    if (config.validate && !config.validate(body)) {
      showError(config.validationMessage || "The current configuration is incomplete.");
      return;
    }

    showLoading(config.label, body.patientId || requestContext.patientId);
    var startedAt = window.performance.now();

    try {
      var response = await fetch(API_BASE + config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      var data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || data.error) {
        showError(data.error || "Unexpected response from server.");
        return;
      }

      if (!data.result) {
        showError("The server response did not include a result payload.");
        return;
      }

      var runtimeMs = Math.round(window.performance.now() - startedAt);
      showResult(data.result, {
        toolId: state.activeTool,
        toolLabel: config.label,
        patientId: body.patientId || requestContext.patientId || "",
        body: body,
        runtimeMs: runtimeMs,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      showError("Connection failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  async function refreshSystemStatus(showToastOnSuccess) {
    if (state.statusRefreshInFlight) {
      return;
    }

    state.statusRefreshInFlight = true;
    refs.btnRefreshStatus.disabled = true;
    refs.stackOverall.textContent = "Checking";
    refs.stackNote.textContent = "Refreshing stack readiness.";

    try {
      var response = await fetch(API_BASE + "/api/system-status");
      var payload = await response.json();
      updateSystemStatus(payload);
      if (showToastOnSuccess) {
        showToast("System status refreshed.");
      }
    } catch (error) {
      applyStatusState("mcp", "unreachable", "Status endpoint unavailable.", "-", "-");
      applyStatusState("agent", "unreachable", "Status endpoint unavailable.", "-", "-");
      applyStatusState("fhir", "unreachable", "Status endpoint unavailable.", "-", "-");
      refs.stackOverall.textContent = "Offline";
      refs.stackNote.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      state.statusRefreshInFlight = false;
      refs.btnRefreshStatus.disabled = false;
    }
  }

  function updateSystemStatus(payload) {
    var services = payload.services || {};
    var mcp = services.mcp || {};
    var agent = services.agent || {};
    var fhir = services.fhir || {};

    applyStatusState(
      "mcp",
      normalizeStatus(mcp.status),
      mcp.status === "ok"
        ? "Tool server online and ready to accept dashboard and MCP traffic."
        : "Tool server health degraded.",
      mcp.activeSessions !== undefined ? String(mcp.activeSessions) : "-",
      mcp.port !== undefined ? String(mcp.port) : "-"
    );

    applyStatusState(
      "agent",
      normalizeStatus(agent.status),
      agent.status === "ok"
        ? "A2A agent is reachable and reporting healthy upstream MCP connectivity."
        : readStatusMessage(agent),
      safeAgentDetail(agent, "publicUrl"),
      safeAgentDetail(agent, "googleApiKeyConfigured")
    );

    applyStatusState(
      "fhir",
      normalizeStatus(fhir.status),
      fhir.status === "ok"
        ? "FHIR metadata endpoint responded successfully."
        : readStatusMessage(fhir),
      fhir.fhirVersion || "-",
      fhir.software || "-"
    );

    refs.stackOverall.textContent = payload.status === "ok" ? "Ready" : "Attention Needed";
    refs.stackNote.textContent =
      payload.status === "ok"
        ? "All three planes are reachable from the dashboard."
        : "One or more services need attention before the strongest live demo.";
  }

  function updateInvocationPreview() {
    var config = TOOL_CONFIG[state.activeTool];
    var requestContext = buildRequestContext();
    var body = config.buildBody(requestContext);
    var isReady =
      (!config.requiresPatient || Boolean(requestContext.patientId)) &&
      (!config.validate || config.validate(body));

    refs.previewEndpoint.textContent = config.endpoint;
    refs.previewRequirement.textContent = config.requiresPatient
      ? requestContext.patientId
        ? "Patient staged"
        : "Patient required"
      : requestContext.patientId
        ? "Patient optional, staged"
        : "Patient optional";
    refs.previewBody.textContent = JSON.stringify(body, null, 2);

    if (!isReady) {
      refs.previewNote.textContent =
        config.validationMessage ||
        "This request is not runnable yet. Complete the required inputs first.";
      return;
    }

    refs.previewNote.textContent = requestContext.patientId
      ? "Request is ready. Prompt Opinion can also supply patient context via SHARP metadata during launch."
      : "Request is ready without a patient. This is the safest fallback path when live FHIR data is unavailable.";
  }

  function applyStatusState(cardId, stateName, copy, detailA, detailB) {
    var card = document.getElementById("status-card-" + cardId);
    var badge = document.getElementById("status-badge-" + cardId);
    var copyElement = document.getElementById("status-copy-" + cardId);
    if (!card || !badge || !copyElement) {
      return;
    }

    card.dataset.state = stateName;
    badge.textContent = prettifyStatus(stateName);
    copyElement.textContent = copy;

    if (cardId === "mcp") {
      document.getElementById("status-detail-mcp-sessions").textContent = detailA;
      document.getElementById("status-detail-mcp-port").textContent = detailB;
    } else if (cardId === "agent") {
      document.getElementById("status-detail-agent-url").textContent = detailA;
      document.getElementById("status-detail-agent-key").textContent = detailB;
    } else if (cardId === "fhir") {
      document.getElementById("status-detail-fhir-version").textContent = detailA;
      document.getElementById("status-detail-fhir-software").textContent = detailB;
    }
  }

  function normalizeStatus(value) {
    if (value === "ok" || value === "healthy") {
      return "ok";
    }
    if (value === "degraded" || value === "unhealthy") {
      return "degraded";
    }
    if (value === "unreachable") {
      return "unreachable";
    }
    return value || "loading";
  }

  function prettifyStatus(status) {
    switch (status) {
      case "ok":
        return "Online";
      case "degraded":
        return "Degraded";
      case "unreachable":
        return "Offline";
      case "loading":
        return "Checking";
      default:
        return status;
    }
  }

  function safeAgentDetail(agent, field) {
    if (!agent || !agent.details) {
      return "-";
    }

    if (field === "publicUrl") {
      return agent.details.publicUrl || "-";
    }

    if (field === "googleApiKeyConfigured") {
      return agent.details.googleApiKeyConfigured ? "Configured" : "Missing";
    }

    return "-";
  }

  function readStatusMessage(statusPayload) {
    if (!statusPayload) {
      return "No status information available.";
    }
    if (statusPayload.error) {
      return statusPayload.error;
    }
    if (statusPayload.details && statusPayload.details.status) {
      return "Returned status: " + statusPayload.details.status;
    }
    if (statusPayload.statusCode) {
      return "HTTP " + statusPayload.statusCode;
    }
    return "Service not ready.";
  }

  function showLoading(label, patientId) {
    refs.statusIndicator.textContent = "Running";
    refs.statusIndicator.dataset.state = "loading";
    refs.runtimeIndicator.textContent = "Collecting evidence";
    refs.resultSummary.textContent =
      (patientId ? "Patient " + patientId + " staged. " : "") +
      "Running " + label + " against the current configuration.";
    refs.btnRun.disabled = true;
    refs.resultsContainer.innerHTML =
      '<div class="loading-state">' +
      '<div class="loading-orb"></div>' +
      '<div>' +
      '<p class="loading-title">Interpreting clinical context</p>' +
      '<p class="loading-copy">MedAssist is assembling the response.</p>' +
      "</div>" +
      "</div>";
  }

  function showResult(markdown, meta, options) {
    options = options || {};
    state.lastResultMarkdown = markdown;
    state.lastRunMeta = meta;

    refs.statusIndicator.textContent = "Ready";
    refs.statusIndicator.dataset.state = "success";
    refs.runtimeIndicator.textContent = meta.runtimeMs + " ms";
    refs.resultSummary.textContent =
      meta.toolLabel +
      " completed" +
      (meta.patientId ? " for " + meta.patientId : "") +
      ". " +
      summarizeMarkdown(markdown);
    refs.btnRun.disabled = false;
    refs.resultsContainer.innerHTML =
      '<div class="markdown-body">' + renderMarkdown(markdown) + "</div>";
    saveDraftState();

    if (!options.skipHistory) {
      persistHistoryEntry({
        id: meta.completedAt + "-" + meta.toolId,
        toolId: meta.toolId,
        toolLabel: meta.toolLabel,
        patientId: meta.patientId,
        runtimeMs: meta.runtimeMs,
        completedAt: meta.completedAt,
        markdown: markdown,
        body: meta.body,
        summary: summarizeMarkdown(markdown),
      });
    }
  }

  function showError(message) {
    refs.statusIndicator.textContent = "Error";
    refs.statusIndicator.dataset.state = "error";
    refs.runtimeIndicator.textContent = "Run halted";
    refs.resultSummary.textContent = "The requested analysis did not complete.";
    refs.btnRun.disabled = false;
    refs.resultsContainer.innerHTML =
      '<div class="error-box">' +
      '<p class="error-title">Analysis halted</p>' +
      '<p class="error-message">' + escapeHtml(message) + "</p>" +
      "</div>";
    saveDraftState();
  }

  function clearStage(showToastOnClear) {
    state.lastResultMarkdown = "";
    state.lastRunMeta = null;
    refs.statusIndicator.textContent = "Idle";
    refs.statusIndicator.dataset.state = "idle";
    refs.runtimeIndicator.textContent = "No run yet";
    refs.resultSummary.textContent = "Stage a patient or choose a guideline-only scenario to begin.";
    refs.resultsContainer.innerHTML =
      '<div class="empty-state">' +
      '<p class="empty-title">Command center standing by</p>' +
      '<p class="empty-body">Pick a demo runway, stage a patient, and run one of the six tools.</p>' +
      "</div>";
    saveDraftState();

    if (showToastOnClear) {
      showToast("Stage cleared.");
    }
  }

  function persistHistoryEntry(entry) {
    state.history = [entry]
      .concat(
        state.history.filter(function (item) {
          return item.id !== entry.id;
        })
      )
      .slice(0, HISTORY_LIMIT);

    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
    renderHistory();
  }

  function loadHistory() {
    try {
      var raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_error) {
      return [];
    }
  }

  function renderHistory() {
    refs.historyCaption.textContent = state.history.length + " saved locally";

    if (!state.history.length) {
      refs.historyList.innerHTML =
        '<div class="history-empty">No runs saved yet. Results will appear here after your first analysis.</div>';
      return;
    }

    refs.historyList.innerHTML = state.history
      .map(function (entry) {
        return (
          '<article class="history-item">' +
          '<div class="history-item-topline">' +
          '<span class="history-tool">' + escapeHtml(entry.toolLabel) + "</span>" +
          '<span class="history-time">' + escapeHtml(formatTimestamp(entry.completedAt)) + "</span>" +
          "</div>" +
          '<p class="history-summary">' + escapeHtml(entry.summary) + "</p>" +
          '<div class="history-meta">' +
          '<span>' + escapeHtml(entry.patientId || "Guideline-only mode") + "</span>" +
          '<span>' + escapeHtml(String(entry.runtimeMs)) + " ms</span>" +
          "</div>" +
          '<div class="history-actions">' +
          '<button class="btn btn-ghost btn-small" data-history-id="' + escapeHtml(entry.id) + '" data-history-action="restore">Open</button>' +
          '<button class="btn btn-secondary btn-small" data-history-id="' + escapeHtml(entry.id) + '" data-history-action="rerun">Run Again</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function restoreHistory(historyId) {
    var entry = findHistoryEntry(historyId);
    if (!entry) {
      return;
    }

    activateTool(entry.toolId);
    applyRequestBody(entry.toolId, entry.body || {});
    syncPatientContext();
    showResult(entry.markdown, {
      toolId: entry.toolId,
      toolLabel: entry.toolLabel,
      patientId: entry.patientId || "",
      body: entry.body || {},
      runtimeMs: entry.runtimeMs || 0,
      completedAt: entry.completedAt,
    }, { skipHistory: true });
    showToast("Restored a previous analysis.");
  }

  function rerunHistory(historyId) {
    var entry = findHistoryEntry(historyId);
    if (!entry) {
      return;
    }

    activateTool(entry.toolId);
    applyRequestBody(entry.toolId, entry.body || {});
    syncPatientContext();
    runTool();
  }

  function findHistoryEntry(historyId) {
    return state.history.find(function (entry) {
      return entry.id === historyId;
    });
  }

  function applyRequestBody(toolId, body) {
    refs.patientIdInput.value = body.patientId || refs.patientIdInput.value;

    if (toolId === "drug-interactions") {
      refs.medListInput.value = Array.isArray(body.medications)
        ? body.medications.join("\n")
        : "";
    } else if (toolId === "lab-results") {
      refs.lookbackInput.value = String(body.lookbackDays || 90);
    } else if (toolId === "risk-score") {
      refs.calculatorSelect.value = body.calculator || refs.calculatorSelect.value;
    } else if (toolId === "clinical-guidelines") {
      refs.conditionInput.value = body.condition || "";
    }
  }

  async function copyLatestResult() {
    if (!state.lastResultMarkdown) {
      showToast("No result available yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastResultMarkdown);
      showToast("Latest markdown copied.");
    } catch (_error) {
      showToast("Clipboard access failed.");
    }
  }

  function downloadLatestResult() {
    if (!state.lastResultMarkdown || !state.lastRunMeta) {
      showToast("No result available yet.");
      return;
    }

    var filename =
      "medassist-" +
      state.lastRunMeta.toolId +
      "-" +
      state.lastRunMeta.completedAt.slice(0, 19).replace(/[:T]/g, "-") +
      ".md";

    var blob = new Blob([state.lastResultMarkdown], { type: "text/markdown" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Markdown downloaded.");
  }

  function renderScenarioCards() {
    refs.scenarioGrid.innerHTML = DEMO_SCENARIOS.map(function (scenario) {
      var scenarioStateClass =
        scenario.id === state.activeScenarioId ? " scenario-card-active" : "";
      return (
        '<article class="scenario-card' + scenarioStateClass + '">' +
        '<p class="scenario-accent">' + escapeHtml(scenario.accent) + "</p>" +
        '<h4>' + escapeHtml(scenario.title) + "</h4>" +
        '<p class="scenario-copy">' + escapeHtml(scenario.narrative) + "</p>" +
        '<button class="btn btn-secondary btn-small" data-scenario-id="' + escapeHtml(scenario.id) + '">Stage Scenario</button>' +
        "</article>"
      );
    }).join("");
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add("is-visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      refs.toast.classList.remove("is-visible");
    }, 2200);
  }

  function restoreDraftState() {
    try {
      var raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        return;
      }

      var draft = JSON.parse(raw);
      state.activeTool = draft.activeTool || state.activeTool;
      state.activeScenarioId = draft.activeScenarioId || "";
      state.patientHint = draft.patientHint || "";
      refs.patientIdInput.value = draft.patientId || "";
      refs.medListInput.value = draft.medList || "";
      refs.lookbackInput.value = String(draft.lookbackDays || 90);
      refs.calculatorSelect.value = draft.calculator || refs.calculatorSelect.value;
      refs.conditionInput.value = draft.condition || "";

      if (draft.lastResultMarkdown && draft.lastRunMeta) {
        state.lastResultMarkdown = draft.lastResultMarkdown;
        state.lastRunMeta = draft.lastRunMeta;
      }
    } catch (_error) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }

  function saveDraftState() {
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          activeTool: state.activeTool,
          activeScenarioId: state.activeScenarioId,
          patientHint: state.patientHint,
          patientId: refs.patientIdInput.value.trim(),
          medList: refs.medListInput.value,
          lookbackDays: refs.lookbackInput.value,
          calculator: refs.calculatorSelect.value,
          condition: refs.conditionInput.value.trim(),
          lastResultMarkdown: state.lastResultMarkdown,
          lastRunMeta: state.lastRunMeta,
        }),
      );
    } catch (_error) {
      // Ignore storage failures in privacy-restricted browsers.
    }
  }

  function summarizeMarkdown(markdown) {
    var compact = markdown
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line && !/^#/.test(line) && !/^[-*]/.test(line) && !/^\|/.test(line);
      });

    if (!compact.length) {
      return "Structured output is ready.";
    }

    return compact[0].slice(0, 180);
  }

  function formatTimestamp(isoString) {
    var date = new Date(isoString);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Lightweight markdown renderer
  function renderMarkdown(markdown) {
    var lines = markdown.split("\n");
    var html = [];
    var inCodeBlock = false;
    var inTable = false;
    var inList = false;
    var listType = "";
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (inCodeBlock) {
          html.push("</code></pre>");
          inCodeBlock = false;
        } else {
          html.push("<pre><code>");
          inCodeBlock = true;
        }
        i++;
        continue;
      }

      if (inCodeBlock) {
        html.push(escapeHtml(line) + "\n");
        i++;
        continue;
      }

      if (trimmed === "") {
        if (inList) {
          html.push(listType === "ul" ? "</ul>" : "</ol>");
          inList = false;
        }
        if (inTable) {
          html.push("</tbody></table>");
          inTable = false;
        }
        i++;
        continue;
      }

      if (/^(---|\*\*\*|___)$/.test(trimmed)) {
        html.push("<hr>");
        i++;
        continue;
      }

      var headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        var level = headerMatch[1].length;
        html.push("<h" + level + ">" + inlineFormat(headerMatch[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      if (trimmed.startsWith(">")) {
        html.push("<blockquote>" + inlineFormat(trimmed.replace(/^>\s?/, "")) + "</blockquote>");
        i++;
        continue;
      }

      var isUnordered = /^[-*]\s+/.test(trimmed);
      var isOrdered = /^\d+[.)]\s+/.test(trimmed);
      if (inList && !isUnordered && !isOrdered) {
        html.push(listType === "ul" ? "</ul>" : "</ol>");
        inList = false;
      }

      if (trimmed.includes("|") && !inTable) {
        if (i + 1 < lines.length && /^\|?\s*[-:]+[-|:\s]*$/.test(lines[i + 1].trim())) {
          var headerCells = parseTableRow(line);
          html.push("<table><thead><tr>");
          headerCells.forEach(function (cell) {
            html.push("<th>" + inlineFormat(cell) + "</th>");
          });
          html.push("</tr></thead><tbody>");
          inTable = true;
          i += 2;
          continue;
        }
      }

      if (inTable && trimmed.includes("|")) {
        var cells = parseTableRow(line);
        html.push("<tr>");
        cells.forEach(function (cell) {
          html.push("<td>" + inlineFormat(cell) + "</td>");
        });
        html.push("</tr>");
        i++;
        continue;
      }

      if (isUnordered) {
        if (!inList || listType !== "ul") {
          if (inList) {
            html.push(listType === "ul" ? "</ul>" : "</ol>");
          }
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        html.push("<li>" + inlineFormat(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        i++;
        continue;
      }

      if (isOrdered) {
        if (!inList || listType !== "ol") {
          if (inList) {
            html.push(listType === "ul" ? "</ul>" : "</ol>");
          }
          html.push("<ol>");
          inList = true;
          listType = "ol";
        }
        html.push("<li>" + inlineFormat(trimmed.replace(/^\d+[.)]\s+/, "")) + "</li>");
        i++;
        continue;
      }

      html.push("<p>" + inlineFormat(trimmed) + "</p>");
      i++;
    }

    if (inList) {
      html.push(listType === "ul" ? "</ul>" : "</ol>");
    }
    if (inTable) {
      html.push("</tbody></table>");
    }
    if (inCodeBlock) {
      html.push("</code></pre>");
    }

    return html.join("");
  }

  function parseTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(function (cell) {
        return cell.trim();
      });
  }

  function inlineFormat(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
