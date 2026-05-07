/* MedAssist clinical workbench — state machine + REST client + markdown render. */

(function () {
  "use strict";

  const API_BASE = window.location.origin;
  const HISTORY_KEY = "medassist-workbench-history-v1";
  const DRAFT_KEY = "medassist-workbench-draft-v1";
  const HISTORY_LIMIT = 12;
  const STATUS_INTERVAL_MS = 60000;

  // ── Tool catalogue ────────────────────────────────────────────────────────

  const TOOLS = {
    "patient-summary": {
      label: "Patient Summary",
      lede:
        "A longitudinal overview of the staged patient: demographics, active problems, medications, recent labs, vitals, allergies, and immunizations.",
      endpoint: "/api/patient-summary",
      requiresPatient: true,
      fields: [],
      loading: "Pulling the patient record from FHIR",
      buildBody(ctx) {
        return { patientId: ctx.patientId };
      },
    },
    "drug-interactions": {
      label: "Drug Interactions",
      lede:
        "Reviews drug-drug interactions, drug-allergy conflicts, and duplicates across the staged patient's medications and any you add below.",
      endpoint: "/api/drug-interactions",
      requiresPatient: false,
      fields: ["med-list"],
      loading: "Checking RxNorm and OpenFDA for interactions",
      buildBody(ctx) {
        const meds = ctx.medList
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const body = {};
        if (ctx.patientId) body.patientId = ctx.patientId;
        if (meds.length) body.medications = meds;
        return body;
      },
      validate(body) {
        return Boolean(body.patientId || (body.medications && body.medications.length));
      },
      validationMessage:
        "Stage a patient or list at least one medication to review.",
    },
    "lab-results": {
      label: "Lab Results",
      lede:
        "Flags abnormal observations, calculates derived values like eGFR, and surfaces trends across the lookback window.",
      endpoint: "/api/lab-results",
      requiresPatient: true,
      fields: ["lookback-days"],
      loading: "Fetching Observation entries from the past lookback window",
      buildBody(ctx) {
        return {
          patientId: ctx.patientId,
          lookbackDays: parseInt(ctx.lookbackDays, 10) || 90,
        };
      },
    },
    "risk-score": {
      label: "Risk Score",
      lede:
        "Runs a validated bedside calculator against the staged patient and explains each contributing factor.",
      endpoint: "/api/risk-score",
      requiresPatient: true,
      fields: ["calculator"],
      loadingFor(ctx) {
        return "Computing " + (ctx.calculator || "the selected score") + " from patient observations";
      },
      buildBody(ctx) {
        return { patientId: ctx.patientId, calculator: ctx.calculator };
      },
    },
    "care-gaps": {
      label: "Care Gaps",
      lede:
        "Compares the staged patient against USPSTF screenings, CDC immunization schedules, and condition-specific monitoring intervals.",
      endpoint: "/api/care-gaps",
      requiresPatient: true,
      fields: [],
      loading: "Comparing the patient record against USPSTF and CDC schedules",
      buildBody(ctx) {
        return { patientId: ctx.patientId };
      },
    },
    "clinical-guidelines": {
      label: "Clinical Guidelines",
      lede:
        "Matches a condition or staged patient against ADA, ACC/AHA, GOLD, GINA, and KDIGO guideline targets.",
      endpoint: "/api/clinical-guidelines",
      requiresPatient: false,
      fields: ["condition"],
      loading: "Matching against ADA, ACC/AHA, GOLD, GINA, and KDIGO guidelines",
      buildBody(ctx) {
        const body = {};
        if (ctx.patientId) body.patientId = ctx.patientId;
        if (ctx.condition) body.condition = ctx.condition;
        return body;
      },
      validate(body) {
        return Boolean(body.patientId || body.condition);
      },
      validationMessage:
        "Stage a patient or enter a condition (for example, diabetes) to match guidelines.",
    },
    "soap-note": {
      label: "SOAP Note",
      lede:
        "LLM-powered SOAP note draft. Takes a visit reason and optional clinician notes, grounds in the patient's longitudinal record, and returns a Subjective / Objective / Assessment / Plan starting point for clinician edit. Optional language for non-English documentation.",
      endpoint: "/api/soap-note",
      requiresPatient: true,
      fields: ["visit-reason", "clinician-notes", "soap-language"],
      loading: "Drafting SOAP note from the patient record",
      buildBody(ctx) {
        const body = { patientId: ctx.patientId };
        if (ctx.visitReason) body.visitReason = ctx.visitReason.trim();
        if (ctx.clinicianNotes) body.clinicianNotes = ctx.clinicianNotes.trim();
        if (ctx.soapLanguage) body.language = ctx.soapLanguage.trim();
        return body;
      },
      validate(body) {
        return (
          typeof body.visitReason === "string" && body.visitReason.length > 0
        );
      },
      validationMessage:
        "Enter a visit reason, e.g. \"3-month diabetes follow-up\".",
    },
    "next-best-test": {
      label: "Next Best Test",
      lede:
        "LLM-powered 'what should we order next'. Reasons over the patient's record + chief complaint + optional working differential, returns a top recommended test plus 2–4 alternatives, each with rationale and what positive vs. negative results would change.",
      endpoint: "/api/next-best-test",
      requiresPatient: true,
      fields: ["chief-complaint", "nbt-candidates"],
      loading: "Reasoning about which test would maximally narrow the differential",
      buildBody(ctx) {
        const body = { patientId: ctx.patientId };
        if (ctx.chiefComplaint) body.chiefComplaint = ctx.chiefComplaint.trim();
        if (ctx.nbtCandidates) {
          const list = ctx.nbtCandidates
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (list.length) body.candidates = list;
        }
        return body;
      },
      validate(body) {
        return (
          typeof body.chiefComplaint === "string" &&
          body.chiefComplaint.length > 0
        );
      },
      validationMessage:
        "Enter a chief complaint, e.g. \"72F fatigue and edema\".",
    },
    "patient-friendly-summary": {
      label: "Patient-Friendly Summary",
      lede:
        "LLM-powered plain-language version of the patient summary. Strips clinical jargon, hides the FHIR audit trail, and ends with a gentle 'what this means for you' paragraph framed as information, not medical advice. Configurable language and reading level.",
      endpoint: "/api/patient-friendly-summary",
      requiresPatient: true,
      fields: ["pf-language", "pf-reading-level"],
      loading: "Translating the chart into plain language",
      buildBody(ctx) {
        const body = { patientId: ctx.patientId };
        if (ctx.pfLanguage) body.language = ctx.pfLanguage.trim();
        if (ctx.pfReadingLevel) body.readingLevel = ctx.pfReadingLevel.trim();
        return body;
      },
    },
    "clinical-handoff": {
      label: "Shift Handoff",
      lede:
        "Composes a structured shift-handoff: active issues, current meds, allergies, vitals, abnormal labs, interaction concerns, top open care gaps, applicable risk scores, and a numbered action list for the receiving provider.",
      endpoint: "/api/clinical-handoff",
      requiresPatient: true,
      fields: [],
      loading: "Aggregating active issues, labs, interactions, gaps, and risk scores",
      buildBody(ctx) {
        return { patientId: ctx.patientId };
      },
    },
    "differential-diagnosis": {
      label: "Differential Diagnosis",
      lede:
        "LLM-powered ranked differential. Reasons over the patient's longitudinal record against a chief complaint and surfaces 3–5 candidates with cited findings.",
      endpoint: "/api/differential-diagnosis",
      requiresPatient: true,
      fields: ["chief-complaint", "additional-context"],
      // After a result, expose a Refine box. Submitting appends the
      // follow-up to the additionalContext field and re-runs.
      supportsRefine: true,
      refineMergeField: "additionalContext",
      loading: "Reasoning over the patient's record against the chief complaint",
      buildBody(ctx) {
        const body = { patientId: ctx.patientId };
        if (ctx.chiefComplaint) body.chiefComplaint = ctx.chiefComplaint.trim();
        if (ctx.additionalContext) body.additionalContext = ctx.additionalContext.trim();
        return body;
      },
      validate(body) {
        return (
          typeof body.chiefComplaint === "string" &&
          body.chiefComplaint.length > 0
        );
      },
      validationMessage:
        "Enter a chief complaint, e.g. \"72yo F, progressive fatigue and bilateral edema over 6 weeks\".",
    },
  };

  // Curated demo scenarios. Each preloads the strongest clinical setup for
  // the named tool against a verified Synthea patient on the public HAPI
  // sandbox. See docs/test-scenarios.md.
  const SCENARIOS = [
    {
      id: "considine-handoff",
      title: "Shift handoff — Considine, 72F polypharmacy",
      desc:
        "Synthea patient with diabetes, hypertension, post-renal-transplant, hyperlipidemia. Shows the orchestration across five tools in one read.",
      tool: "clinical-handoff",
      patientId: "6c4769e4-beda-5b20-3ba5-67e01c6daf03",
      prefill: {},
    },
    {
      id: "considine-ddx",
      title: "Differential diagnosis — Considine fatigue + edema",
      desc:
        "Same complex elder with a new chief complaint. The LLM ranks candidates against her actual record and cites the supporting findings.",
      tool: "differential-diagnosis",
      patientId: "6c4769e4-beda-5b20-3ba5-67e01c6daf03",
      prefill: {
        chiefComplaint:
          "72yo F, progressive fatigue and bilateral lower-extremity edema over 6 weeks, recent weight gain of 4 kg",
      },
    },
    {
      id: "pacocha-risk",
      title: "Risk + care gaps — Pacocha, 67M",
      desc:
        "Synthea patient with diabetes and 21 USPSTF gaps. CHA2DS2-VASc surfaces a real anticoagulation recommendation.",
      tool: "risk-score",
      patientId: "99dd324a-1a4e-f640-ab63-729bfd413be4",
      prefill: { calculator: "CHA2DS2-VASc" },
    },
    {
      id: "polypharmacy",
      title: "Polypharmacy interaction check",
      desc: "Four-drug list, no patient required. Shows the interaction matrix in seconds.",
      tool: "drug-interactions",
      patientId: "",
      prefill: { medList: "warfarin\nibuprofen\nsertraline\ntramadol" },
    },
    {
      id: "diabetes-guidelines",
      title: "Diabetes guideline targets",
      desc: "Pulls ADA and KDIGO targets without depending on FHIR connectivity.",
      tool: "clinical-guidelines",
      patientId: "",
      prefill: { condition: "diabetes" },
    },
  ];

  // ── State ─────────────────────────────────────────────────────────────────

  const state = {
    activeTool: "patient-summary",
    mode: "idle",
    lastResult: null,
    lastError: null,
    history: loadHistory(),
    statusOpen: false,
    scenariosOpen: false,
    historyOpen: false,
    statusInFlight: false,
    serviceStatus: null,
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);
  const refs = {
    patientInput: $("patient-id"),
    rail: $("tool-rail"),
    title: $("tool-title"),
    lede: $("tool-lede"),
    configure: $("configure"),
    fields: {
      "med-list": document.querySelector('[data-field="med-list"]'),
      "lookback-days": document.querySelector('[data-field="lookback-days"]'),
      "calculator": document.querySelector('[data-field="calculator"]'),
      "condition": document.querySelector('[data-field="condition"]'),
      "chief-complaint": document.querySelector('[data-field="chief-complaint"]'),
      "additional-context": document.querySelector('[data-field="additional-context"]'),
      "visit-reason": document.querySelector('[data-field="visit-reason"]'),
      "clinician-notes": document.querySelector('[data-field="clinician-notes"]'),
      "soap-language": document.querySelector('[data-field="soap-language"]'),
      "pf-language": document.querySelector('[data-field="pf-language"]'),
      "pf-reading-level": document.querySelector('[data-field="pf-reading-level"]'),
      "nbt-candidates": document.querySelector('[data-field="nbt-candidates"]'),
    },
    medList: $("med-list"),
    lookback: $("lookback-days"),
    calculator: $("calculator"),
    condition: $("condition"),
    chiefComplaint: $("chief-complaint"),
    additionalContext: $("additional-context"),
    visitReason: $("visit-reason"),
    clinicianNotes: $("clinician-notes"),
    soapLanguage: $("soap-language"),
    pfLanguage: $("pf-language"),
    pfReadingLevel: $("pf-reading-level"),
    nbtCandidates: $("nbt-candidates"),
    runBtn: $("run-btn"),
    resetBtn: $("reset-btn"),
    retryBtn: $("retry-btn"),
    stateIdle: $("state-idle"),
    stateRunning: $("state-running"),
    stateError: $("state-error"),
    stateResult: $("state-result"),
    idleCopy: $("idle-copy"),
    runningCopy: $("running-copy"),
    errorTitle: $("error-title"),
    errorCopy: $("error-copy"),
    note: $("note"),
    resultTool: $("result-tool"),
    resultPatient: $("result-patient"),
    resultRuntime: $("result-runtime"),
    resultTime: $("result-time"),
    resultSnapshotBadge: $("result-snapshot-badge"),
    refine: $("refine"),
    refineInput: $("refine-input"),
    refineBtn: $("refine-btn"),
    refineClear: $("refine-clear"),
    copyBtn: $("copy-btn"),
    downloadBtn: $("download-btn"),
    status: $("status"),
    statusLabel: $("status-label"),
    statusMcp: $("status-mcp"),
    statusAgent: $("status-agent"),
    statusFhir: $("status-fhir"),
    statusChecked: $("status-checked"),
    scenarios: $("scenarios"),
    scenariosToggle: $("scenarios-toggle"),
    scenariosMenu: $("scenarios-menu"),
    history: $("history"),
    historyToggle: $("history-toggle"),
    historyList: $("history-list"),
    historyCount: $("history-count"),
    toast: $("toast"),
  };

  // ── Init ──────────────────────────────────────────────────────────────────

  restoreDraft();
  renderScenarios();
  renderHistory();
  bind();
  selectTool(state.activeTool, { quiet: true });
  refreshStatus();
  window.setInterval(refreshStatus, STATUS_INTERVAL_MS);

  // ── Bind events ───────────────────────────────────────────────────────────

  function bind() {
    refs.rail.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tool]");
      if (!btn) return;
      selectTool(btn.dataset.tool);
    });

    refs.runBtn.addEventListener("click", run);
    refs.resetBtn.addEventListener("click", resetTool);
    refs.retryBtn.addEventListener("click", run);

    refs.patientInput.addEventListener("input", saveDraft);
    refs.medList.addEventListener("input", saveDraft);
    refs.lookback.addEventListener("input", saveDraft);
    refs.calculator.addEventListener("change", saveDraft);
    refs.condition.addEventListener("input", saveDraft);
    refs.chiefComplaint.addEventListener("input", saveDraft);
    refs.additionalContext.addEventListener("input", saveDraft);
    refs.visitReason.addEventListener("input", saveDraft);
    refs.clinicianNotes.addEventListener("input", saveDraft);

    refs.copyBtn.addEventListener("click", copyResult);
    refs.downloadBtn.addEventListener("click", downloadResult);

    refs.status.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.scenariosOpen) closeScenarios();
      toggleStatus();
    });

    refs.scenariosToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.statusOpen) closeStatus();
      toggleScenarios();
    });
    refs.scenariosMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-scenario]");
      if (!btn) return;
      applyScenario(btn.dataset.scenario);
    });

    refs.historyToggle.addEventListener("click", toggleHistory);
    refs.historyList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-history-id]");
      if (!btn) return;
      const id = btn.dataset.historyId;
      const action = btn.dataset.action;
      if (action === "open") openHistory(id);
      else if (action === "rerun") rerunHistory(id);
    });

    document.addEventListener("click", (e) => {
      if (state.statusOpen && !refs.status.contains(e.target)) closeStatus();
      if (state.scenariosOpen && !refs.scenarios.contains(e.target)) closeScenarios();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (state.statusOpen) closeStatus();
      if (state.scenariosOpen) closeScenarios();
    });

    refs.patientInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") run();
    });

    if (refs.refineBtn) refs.refineBtn.addEventListener("click", refine);
    if (refs.refineClear)
      refs.refineClear.addEventListener("click", () => {
        if (refs.refineInput) refs.refineInput.value = "";
      });
    if (refs.refineInput) {
      refs.refineInput.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") refine();
      });
    }
  }

  // Refine takes the last result's input body, appends the refinement note
  // to the configured merge field, and re-runs the same tool.
  async function refine() {
    const last = state.lastResult;
    if (!last || !last.meta) return;
    const tool = TOOLS[last.meta.toolId];
    if (!tool || !tool.supportsRefine) return;
    const note = (refs.refineInput.value || "").trim();
    if (!note) return;

    const field = tool.refineMergeField || "additionalContext";
    const priorBody = { ...last.meta.body };
    const priorNote = priorBody[field] ? String(priorBody[field]).trim() : "";
    priorBody[field] = priorNote
      ? priorNote + "\nFollow-up: " + note
      : "Follow-up: " + note;

    // Mirror the body back into the configure inputs so the user can see
    // what's being sent and edit further if needed.
    if (field === "additionalContext" && refs.additionalContext) {
      refs.additionalContext.value = priorBody.additionalContext;
    }

    // Reuse the same render path by faking a "live" run from the prior
    // tool config but with the merged body.
    selectTool(last.meta.toolId, { quiet: true });
    refs.runBtn.disabled = true;
    setMode("running");
    refs.runningCopy.textContent =
      typeof tool.loadingFor === "function"
        ? tool.loadingFor({})
        : tool.loading;

    const startedAt = performance.now();
    try {
      const response = await fetch(API_BASE + tool.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priorBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.result) {
        showError(
          "Refine failed",
          data.error || "The MCP server returned " + response.status + ".",
        );
        return;
      }
      const runtimeMs = Math.round(performance.now() - startedAt);
      const completedAt = new Date().toISOString();
      const meta = {
        toolId: last.meta.toolId,
        toolLabel: tool.label,
        patientId: priorBody.patientId || "",
        body: priorBody,
        runtimeMs,
        completedAt,
        refined: true,
      };
      state.lastResult = { markdown: data.result, meta };
      renderResult(data.result, meta);
      persistHistory({
        id: completedAt + ":" + last.meta.toolId,
        ...meta,
        markdown: data.result,
      });
    } catch (err) {
      showError(
        "Refine failed",
        "The MCP server didn't respond. Try again or rerun from configure.",
      );
    } finally {
      refs.runBtn.disabled = false;
    }
  }

  // ── Tool selection ────────────────────────────────────────────────────────

  function selectTool(toolId, opts = {}) {
    const tool = TOOLS[toolId];
    if (!tool) return;
    state.activeTool = toolId;

    Array.from(refs.rail.querySelectorAll("button[data-tool]")).forEach((btn) => {
      const isActive = btn.dataset.tool === toolId;
      if (isActive) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });

    refs.title.textContent = tool.label;
    refs.lede.textContent = tool.lede;

    Object.entries(refs.fields).forEach(([name, el]) => {
      if (!el) return;
      el.hidden = !tool.fields.includes(name);
    });

    state.lastResult = null;
    state.lastError = null;
    setMode("idle");
    refs.idleCopy.textContent = idleCopyFor(tool);

    if (!opts.quiet) saveDraft();
  }

  function idleCopyFor(tool) {
    if (tool.requiresPatient) {
      return "Stage a patient ID, then press Run to begin.";
    }
    if (tool.fields.length) {
      return "Fill in the fields above, then press Run to begin.";
    }
    return "Press Run to begin.";
  }

  function resetTool() {
    refs.medList.value = "";
    refs.lookback.value = 90;
    refs.calculator.value = "CHA2DS2-VASc";
    refs.condition.value = "";
    state.lastResult = null;
    state.lastError = null;
    setMode("idle");
    saveDraft();
  }

  // ── Modes ─────────────────────────────────────────────────────────────────

  function setMode(mode) {
    state.mode = mode;
    refs.stateIdle.hidden = mode !== "idle";
    refs.stateRunning.hidden = mode !== "running";
    refs.stateError.hidden = mode !== "error";
    refs.stateResult.hidden = mode !== "result";
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async function run() {
    const tool = TOOLS[state.activeTool];
    const ctx = readContext();

    if (tool.requiresPatient && !ctx.patientId) {
      showError(
        "Couldn't run " + tool.label,
        "This tool needs a patient ID. Enter one in the header or pick a scenario."
      );
      return;
    }

    const body = tool.buildBody(ctx);
    if (tool.validate && !tool.validate(body)) {
      showError("Couldn't run " + tool.label, tool.validationMessage);
      return;
    }

    const loadingCopy =
      typeof tool.loadingFor === "function"
        ? tool.loadingFor(ctx)
        : tool.loading;
    refs.runningCopy.textContent = loadingCopy;
    setMode("running");
    refs.runBtn.disabled = true;
    const startedAt = performance.now();

    let snapshotServed = false;
    try {
      let response;
      let data;
      try {
        response = await fetch(API_BASE + tool.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        data = await response.json().catch(() => ({}));
      } catch (netErr) {
        // Network-level failure (MCP unreachable). Try a snapshot.
        const snap = await loadSnapshot(state.activeTool, body.patientId);
        if (snap) {
          data = snap;
          response = { ok: true, status: 200 };
          snapshotServed = true;
        } else {
          throw netErr;
        }
      }

      // If the server responded but with a 5xx and we have a snapshot,
      // prefer the snapshot (HAPI flake / FHIR rate-limit safety net).
      if (response.status >= 500 && !snapshotServed && body.patientId) {
        const snap = await loadSnapshot(state.activeTool, body.patientId);
        if (snap) {
          data = snap;
          response = { ok: true, status: 200 };
          snapshotServed = true;
        }
      }

      // Treat "patient not known/found" as an empty-state, not a server error.
      const notFoundLike =
        response.status === 404 ||
        /\b(not\s*found|not\s*known|no\s*such|does\s*not\s*exist)\b/i.test(
          data.error || ""
        );
      if (notFoundLike && ctx.patientId) {
        showError(
          "No patient with that ID",
          "FHIR couldn't find patient " + ctx.patientId + ". Check the ID, or try one from the scenarios."
        );
        return;
      }

      if (!response.ok) {
        const isServer = response.status >= 500;
        showError(
          "Couldn't run " + tool.label,
          isServer
            ? "The MCP server returned " + response.status + ". Check the status indicator or retry."
            : data.error || "Request rejected (" + response.status + ")."
        );
        return;
      }

      if (data.error) {
        showError("Couldn't run " + tool.label, data.error);
        return;
      }

      if (!data.result) {
        showError(
          "Couldn't run " + tool.label,
          "The server response was empty. Retry, or check the status indicator."
        );
        return;
      }

      const runtimeMs = Math.round(performance.now() - startedAt);
      const completedAt = new Date().toISOString();
      const meta = {
        toolId: state.activeTool,
        toolLabel: tool.label,
        patientId: body.patientId || ctx.patientId || "",
        body,
        runtimeMs,
        completedAt,
        snapshotServed,
      };
      state.lastResult = { markdown: data.result, meta };
      renderResult(data.result, meta);
      persistHistory({
        id: completedAt + ":" + state.activeTool,
        ...meta,
        markdown: data.result,
      });
    } catch (err) {
      const offline = !navigator.onLine;
      // Last-ditch snapshot fallback even after the catch path.
      if (body.patientId) {
        const snap = await loadSnapshot(state.activeTool, body.patientId);
        if (snap && snap.result) {
          const runtimeMs = Math.round(performance.now() - startedAt);
          const completedAt = new Date().toISOString();
          const meta = {
            toolId: state.activeTool,
            toolLabel: tool.label,
            patientId: body.patientId,
            body,
            runtimeMs,
            completedAt,
            snapshotServed: true,
          };
          state.lastResult = { markdown: snap.result, meta };
          renderResult(snap.result, meta);
          return;
        }
      }
      showError(
        "Couldn't run " + tool.label,
        offline
          ? "Your browser is offline. Reconnect, then retry."
          : "The MCP server didn't respond. Check the status indicator or retry."
      );
    } finally {
      refs.runBtn.disabled = false;
    }
  }

  function readContext() {
    return {
      patientId: refs.patientInput.value.trim(),
      medList: refs.medList.value,
      lookbackDays: refs.lookback.value,
      calculator: refs.calculator.value,
      condition: refs.condition.value.trim(),
      chiefComplaint: refs.chiefComplaint.value,
      additionalContext: refs.additionalContext.value.trim(),
      visitReason: refs.visitReason.value,
      clinicianNotes: refs.clinicianNotes.value,
      soapLanguage: refs.soapLanguage.value,
      pfLanguage: refs.pfLanguage.value,
      pfReadingLevel: refs.pfReadingLevel.value,
      nbtCandidates: refs.nbtCandidates.value,
    };
  }

  // ── Result / error views ──────────────────────────────────────────────────

  function renderResult(markdown, meta) {
    // Markdown renderer escapes all interpolated values (escHtml/escAttr).
    refs.note.innerHTML = renderMarkdown(markdown);
    refs.resultTool.textContent = meta.toolLabel;
    refs.resultPatient.textContent = meta.patientId
      ? "Patient " + meta.patientId
      : "No patient";
    refs.resultRuntime.textContent = meta.runtimeMs + " ms";
    refs.resultTime.textContent = formatTime(meta.completedAt);
    if (refs.resultSnapshotBadge) {
      refs.resultSnapshotBadge.hidden = !meta.snapshotServed;
    }
    // Show the Refine box only for tools that opt in. Each render hides
    // any pending refinement input from the previous run.
    const tool = TOOLS[meta.toolId];
    if (refs.refine) {
      const showRefine = !!(tool && tool.supportsRefine);
      refs.refine.hidden = !showRefine;
      if (showRefine && refs.refineInput) refs.refineInput.value = "";
    }
    setMode("result");
    try {
      refs.note.focus({ preventScroll: true });
    } catch (_) {}
  }

  // Snapshot fallback: when a live tool call fails, look for a pre-captured
  // response in /demo-fixtures/<tool>__<nick>.json. Match by patientId via a
  // small lookup table (the three demo patients are frozen in
  // docs/test-scenarios.md). Returns null when no snapshot exists.
  const SNAPSHOT_NICKS = {
    "6c4769e4-beda-5b20-3ba5-67e01c6daf03": "considine",
    "99dd324a-1a4e-f640-ab63-729bfd413be4": "pacocha",
    "3236e622-25fc-dfc3-70a3-f501faa674eb": "padberg",
  };
  async function loadSnapshot(toolId, patientId) {
    const nick = SNAPSHOT_NICKS[patientId];
    if (!nick) return null;
    try {
      const res = await fetch("demo-fixtures/" + toolId + "__" + nick + ".json");
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function showError(title, copy) {
    state.lastError = { title, copy };
    refs.errorTitle.textContent = title;
    refs.errorCopy.textContent = copy;
    setMode("error");
  }

  // ── Status indicator ──────────────────────────────────────────────────────

  async function refreshStatus() {
    if (state.statusInFlight) return;
    state.statusInFlight = true;
    try {
      const response = await fetch(API_BASE + "/api/system-status");
      const data = await response.json().catch(() => ({}));
      applyStatus(data);
    } catch (_) {
      applyStatus(null);
    } finally {
      state.statusInFlight = false;
    }
  }

  function applyStatus(payload) {
    state.serviceStatus = payload;
    const services = (payload && payload.services) || {};
    const mcp = services.mcp || {};
    const agent = services.agent || {};
    const fhir = services.fhir || {};
    // Cache the FHIR base URL for click-through citations. Fall back to the
    // default if the status payload doesn't include it (older MCP versions).
    const fhirBase =
      (fhir.details && (fhir.details.fhirBaseUrl || fhir.details.baseUrl)) ||
      "http://hapi.fhir.org/baseR4";
    state.fhirBaseUrl = String(fhirBase).replace(/\/+$/, "");
    // Expose to the inline-code renderer (markdown rendering happens in a
    // closure that doesn't have direct state access).
    window.__fhirBaseUrl = state.fhirBaseUrl;

    let overall = "down";
    let label = "Down";
    if (!payload) {
      overall = "down";
      label = "Down";
    } else if (payload.status === "ok") {
      overall = "ok";
      label = "Live";
    } else {
      overall = "degraded";
      label = "Degraded";
    }

    refs.status.dataset.state = overall;
    refs.statusLabel.textContent = label;

    refs.statusMcp.textContent = describeService(
      mcp,
      "port " + (mcp.port || "?") + " · " + (mcp.activeSessions != null ? mcp.activeSessions : 0) + " sessions"
    );
    refs.statusAgent.textContent = describeService(
      agent,
      agent.healthUrl || "—"
    );
    refs.statusFhir.textContent = describeService(
      fhir,
      fhir.fhirVersion ? (fhir.software || "FHIR") + " " + fhir.fhirVersion : (fhir.metadataUrl || "—")
    );
    refs.statusChecked.textContent = payload && payload.checkedAt ? formatTime(payload.checkedAt) : "—";
  }

  function describeService(svc, detail) {
    const status = (svc && svc.status) || "unknown";
    const word =
      status === "ok"
        ? "ok"
        : status === "unhealthy" || status === "degraded"
          ? "degraded"
          : "down";
    return word + " · " + (detail || "—");
  }

  function toggleStatus() {
    state.statusOpen = !state.statusOpen;
    refs.status.setAttribute("aria-expanded", String(state.statusOpen));
  }

  function closeStatus() {
    state.statusOpen = false;
    refs.status.setAttribute("aria-expanded", "false");
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────

  function renderScenarios() {
    // Build via DOM nodes so we never inject untrusted strings.
    refs.scenariosMenu.replaceChildren();
    SCENARIOS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scenarios__item";
      btn.dataset.scenario = s.id;
      btn.setAttribute("role", "menuitem");
      const title = document.createElement("span");
      title.className = "scenarios__item-title";
      title.textContent = s.title;
      const desc = document.createElement("span");
      desc.className = "scenarios__item-desc";
      desc.textContent = s.desc;
      btn.append(title, desc);
      refs.scenariosMenu.append(btn);
    });
  }

  function toggleScenarios() {
    state.scenariosOpen = !state.scenariosOpen;
    refs.scenarios.setAttribute("aria-expanded", String(state.scenariosOpen));
  }

  function closeScenarios() {
    state.scenariosOpen = false;
    refs.scenarios.setAttribute("aria-expanded", "false");
  }

  function applyScenario(id) {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) return;
    selectTool(scenario.tool, { quiet: true });
    refs.patientInput.value = scenario.patientId || "";
    if (scenario.prefill && scenario.prefill.medList !== undefined)
      refs.medList.value = scenario.prefill.medList;
    if (scenario.prefill && scenario.prefill.lookbackDays !== undefined)
      refs.lookback.value = scenario.prefill.lookbackDays;
    if (scenario.prefill && scenario.prefill.calculator !== undefined)
      refs.calculator.value = scenario.prefill.calculator;
    if (scenario.prefill && scenario.prefill.condition !== undefined)
      refs.condition.value = scenario.prefill.condition;
    if (scenario.prefill && scenario.prefill.chiefComplaint !== undefined)
      refs.chiefComplaint.value = scenario.prefill.chiefComplaint;
    if (scenario.prefill && scenario.prefill.additionalContext !== undefined)
      refs.additionalContext.value = scenario.prefill.additionalContext;
    if (scenario.prefill && scenario.prefill.visitReason !== undefined)
      refs.visitReason.value = scenario.prefill.visitReason;
    if (scenario.prefill && scenario.prefill.clinicianNotes !== undefined)
      refs.clinicianNotes.value = scenario.prefill.clinicianNotes;
    closeScenarios();
    saveDraft();
    toast("Scenario loaded — " + scenario.title);
  }

  // ── History ───────────────────────────────────────────────────────────────

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function persistHistory(entry) {
    state.history = [entry]
      .concat(state.history.filter((h) => h.id !== entry.id))
      .slice(0, HISTORY_LIMIT);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    } catch (_) {}
    renderHistory();
  }

  function renderHistory() {
    refs.historyCount.textContent = state.history.length
      ? state.history.length + " saved"
      : "empty";
    refs.historyList.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement("li");
      empty.className = "history__empty";
      empty.textContent = "No runs yet. Try a scenario from the header to load one.";
      refs.historyList.append(empty);
      return;
    }
    state.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "history__item";

      const titleWrap = document.createElement("div");
      const title = document.createElement("span");
      title.className = "history__item-title";
      title.textContent = h.toolLabel;
      const meta = document.createElement("span");
      meta.className = "history__item-meta";
      meta.textContent = " · " + (h.patientId || "no patient");
      titleWrap.append(title, meta);

      const time = document.createElement("span");
      time.className = "history__item-meta";
      time.textContent = formatTime(h.completedAt) + " · " + h.runtimeMs + " ms";

      const actions = document.createElement("span");
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "history__item-action";
      openBtn.dataset.historyId = h.id;
      openBtn.dataset.action = "open";
      openBtn.textContent = "Open";
      const rerunBtn = document.createElement("button");
      rerunBtn.type = "button";
      rerunBtn.className = "history__item-action";
      rerunBtn.dataset.historyId = h.id;
      rerunBtn.dataset.action = "rerun";
      rerunBtn.textContent = "Rerun";
      actions.append(openBtn, rerunBtn);

      li.append(titleWrap, time, actions);
      refs.historyList.append(li);
    });
  }

  function toggleHistory() {
    state.historyOpen = !state.historyOpen;
    refs.history.setAttribute("aria-expanded", String(state.historyOpen));
  }

  function openHistory(id) {
    const entry = state.history.find((h) => h.id === id);
    if (!entry) return;
    selectTool(entry.toolId, { quiet: true });
    applyBody(entry.toolId, entry.body || {});
    refs.patientInput.value = entry.patientId || "";
    state.lastResult = { markdown: entry.markdown, meta: entry };
    renderResult(entry.markdown, entry);
  }

  function rerunHistory(id) {
    const entry = state.history.find((h) => h.id === id);
    if (!entry) return;
    selectTool(entry.toolId, { quiet: true });
    applyBody(entry.toolId, entry.body || {});
    refs.patientInput.value = entry.patientId || "";
    run();
  }

  function applyBody(toolId, body) {
    if (toolId === "drug-interactions") {
      refs.medList.value = Array.isArray(body.medications) ? body.medications.join("\n") : "";
    } else if (toolId === "lab-results") {
      refs.lookback.value = body.lookbackDays || 90;
    } else if (toolId === "risk-score") {
      refs.calculator.value = body.calculator || "CHA2DS2-VASc";
    } else if (toolId === "clinical-guidelines") {
      refs.condition.value = body.condition || "";
    }
  }

  // ── Copy / download ───────────────────────────────────────────────────────

  async function copyResult() {
    if (!state.lastResult) return;
    try {
      await navigator.clipboard.writeText(state.lastResult.markdown);
      toast("Copied as Markdown.");
    } catch (_) {
      toast("Clipboard access blocked.");
    }
  }

  function downloadResult() {
    if (!state.lastResult) return;
    const { markdown, meta } = state.lastResult;
    const filename =
      "medassist-" +
      meta.toolId +
      "-" +
      meta.completedAt.slice(0, 19).replace(/[:T]/g, "-") +
      ".md";
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  function toast(message) {
    refs.toast.textContent = message;
    refs.toast.dataset.visible = "true";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      refs.toast.dataset.visible = "false";
    }, 2200);
  }

  // ── Draft persistence ─────────────────────────────────────────────────────

  function saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          activeTool: state.activeTool,
          patientId: refs.patientInput.value.trim(),
          medList: refs.medList.value,
          lookbackDays: refs.lookback.value,
          calculator: refs.calculator.value,
          condition: refs.condition.value.trim(),
          chiefComplaint: refs.chiefComplaint.value,
          additionalContext: refs.additionalContext.value.trim(),
          visitReason: refs.visitReason.value,
          clinicianNotes: refs.clinicianNotes.value,
        })
      );
    } catch (_) {}
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.activeTool && TOOLS[draft.activeTool]) state.activeTool = draft.activeTool;
      if (typeof draft.patientId === "string") refs.patientInput.value = draft.patientId;
      if (typeof draft.medList === "string") refs.medList.value = draft.medList;
      if (draft.lookbackDays) refs.lookback.value = draft.lookbackDays;
      if (draft.calculator) refs.calculator.value = draft.calculator;
      if (typeof draft.condition === "string") refs.condition.value = draft.condition;
      if (typeof draft.chiefComplaint === "string") refs.chiefComplaint.value = draft.chiefComplaint;
      if (typeof draft.additionalContext === "string") refs.additionalContext.value = draft.additionalContext;
      if (typeof draft.visitReason === "string") refs.visitReason.value = draft.visitReason;
      if (typeof draft.clinicianNotes === "string") refs.clinicianNotes.value = draft.clinicianNotes;
    } catch (_) {}
  }

  // ── Time formatting ───────────────────────────────────────────────────────

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (_) {
      return iso;
    }
  }

  // ── Markdown renderer ─────────────────────────────────────────────────────
  // Handles ATX headers, fenced code, GFM tables, ordered/unordered lists
  // (with indent-based nesting), blockquotes, hr, inline code, bold, italic.
  // All interpolated content flows through escHtml/escAttr; the only HTML
  // that reaches the DOM is the static markup this function emits.

  function renderMarkdown(md) {
    const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    let inFence = false;
    let fenceLang = "";
    let fenceBuf = [];

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      const fenceOpen = trimmed.match(/^```\s*([^\s`]*)\s*$/);
      if (fenceOpen && !inFence) {
        inFence = true;
        fenceLang = fenceOpen[1] || "";
        fenceBuf = [];
        i++;
        continue;
      }
      if (trimmed === "```" && inFence) {
        out.push(
          "<pre><code" +
            (fenceLang ? ' class="language-' + escAttr(fenceLang) + '"' : "") +
            ">" +
            escHtml(fenceBuf.join("\n")) +
            "</code></pre>"
        );
        inFence = false;
        fenceLang = "";
        fenceBuf = [];
        i++;
        continue;
      }
      if (inFence) {
        fenceBuf.push(line);
        i++;
        continue;
      }

      if (trimmed === "") {
        i++;
        continue;
      }

      if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
        out.push("<hr>");
        i++;
        continue;
      }

      const h = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
      if (h) {
        const level = h[1].length;
        out.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          buf.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        out.push("<blockquote>" + inline(buf.join(" ")) + "</blockquote>");
        continue;
      }

      if (
        line.includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?\s*[-:]+(\s*\|\s*[-:]+)+\s*\|?\s*$/.test(lines[i + 1])
      ) {
        const headerCells = splitTableRow(line);
        out.push("<table><thead><tr>");
        headerCells.forEach((c) => out.push("<th>" + inline(c) + "</th>"));
        out.push("</tr></thead><tbody>");
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          const cells = splitTableRow(lines[i]);
          out.push("<tr>");
          cells.forEach((c) => out.push("<td>" + inline(c) + "</td>"));
          out.push("</tr>");
          i++;
        }
        out.push("</tbody></table>");
        continue;
      }

      if (isListLine(line)) {
        const consumed = renderList(lines, i, listIndent(line));
        out.push(consumed.html);
        i = consumed.next;
        continue;
      }

      const para = [trimmed];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^#{1,6}\s+/.test(lines[i].trim()) &&
        !isListLine(lines[i]) &&
        !/^>\s?/.test(lines[i].trim()) &&
        !/^```/.test(lines[i].trim()) &&
        !(
          lines[i].includes("|") &&
          i + 1 < lines.length &&
          /^\s*\|?\s*[-:]+(\s*\|\s*[-:]+)+\s*\|?\s*$/.test(lines[i + 1])
        )
      ) {
        para.push(lines[i].trim());
        i++;
      }
      out.push("<p>" + inline(para.join(" ")) + "</p>");
    }

    if (inFence) {
      out.push("<pre><code>" + escHtml(fenceBuf.join("\n")) + "</code></pre>");
    }

    return out.join("");
  }

  function isListLine(line) {
    return /^\s*([-*+]|\d+[.)])\s+/.test(line);
  }

  function listKind(line) {
    if (/^\s*(\d+)[.)]\s+/.test(line)) return "ol";
    return "ul";
  }

  function listIndent(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].replace(/\t/g, "  ").length : 0;
  }

  function renderList(lines, start, baseIndent) {
    const kind = listKind(lines[start]);
    const html = ["<" + kind + ">"];
    let i = start;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        if (
          i + 1 < lines.length &&
          isListLine(lines[i + 1]) &&
          listIndent(lines[i + 1]) >= baseIndent
        ) {
          i++;
          continue;
        }
        break;
      }
      if (!isListLine(line)) break;
      const indent = listIndent(line);
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        // shouldn't happen at this depth — let outer loop handle
        break;
      }

      const stripped = line.replace(/^\s*([-*+]|\d+[.)])\s+/, "");
      const itemHtml = [inline(stripped)];

      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === "") {
          // blank inside list — peek ahead
          if (
            i + 1 < lines.length &&
            isListLine(lines[i + 1]) &&
            listIndent(lines[i + 1]) > indent
          ) {
            i++;
            continue;
          }
          break;
        }
        const nextIndent = listIndent(next);
        if (isListLine(next) && nextIndent > indent) {
          const nested = renderList(lines, i, nextIndent);
          itemHtml.push(nested.html);
          i = nested.next;
          continue;
        }
        if (!isListLine(next) && nextIndent > indent) {
          itemHtml.push(" " + inline(next.trim()));
          i++;
          continue;
        }
        break;
      }

      html.push("<li>" + itemHtml.join("") + "</li>");
    }

    html.push("</" + kind + ">");
    return { html: html.join(""), next: i };
  }

  function splitTableRow(line) {
    let s = line.trim();
    s = s.replace(/^\|/, "").replace(/\|$/, "");
    return s.split("|").map((c) => c.trim());
  }

  function inline(text) {
    let html = escHtml(text);
    const codes = [];
    html = html.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return "\u0001CODE" + (codes.length - 1) + "\u0001";
    });
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(
      /(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g,
      "$1<em>$2</em>"
    );
    html = html.replace(/\u0001CODE(\d+)\u0001/g, (_, idx) =>
      renderInlineCode(codes[+idx]),
    );
    return html;
  }

  // FHIR resource references look like `Condition/abc-123` or
  // `Observation/1234`. Real-world UUIDs are 36 chars and break the line layout.
  // Render them as compact pills with the full id in title= for hover/audit.
  const FHIR_REF_PATTERN = /^([A-Z][A-Za-z]+)\/([A-Za-z0-9._-]{8,})$/;

  function renderInlineCode(content) {
    const match = content.match(FHIR_REF_PATTERN);
    if (!match) return "<code>" + content + "</code>";
    const type = match[1];
    const id = match[2];
    const shortId = id.length > 12 ? "…" + id.slice(-8) : id;
    // Click opens the raw FHIR resource in a new tab — auditability becomes
    // visible, not just present. Links are wrapped around the <code> so the
    // existing inline-code styling (small mono pill with crimson tint)
    // continues to apply, with the dotted underline in CSS signaling
    // interactivity.
    const base = (window.__fhirBaseUrl || "http://hapi.fhir.org/baseR4").replace(/\/+$/, "");
    const url = base + "/" + type + "/" + id;
    return (
      '<a class="fhir-ref-link" href="' + escAttr(url) + '" target="_blank" rel="noopener">' +
      '<code class="fhir-ref" title="' + escAttr(content + " — click to view raw FHIR") + '">' +
      escHtml(type + "/" + shortId) +
      "</code></a>"
    );
  }

  function escHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escAttr(value) {
    return escHtml(value);
  }
})();
