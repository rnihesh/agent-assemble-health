/* ═══════════════════════════════════════════════════════════════════════════
   MedAssist Clinical Dashboard -- Client Application
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const API_BASE = window.location.origin;

  // ── DOM References ──────────────────────────────────────────────────────

  const patientIdInput = document.getElementById("patient-id");
  const btnLoad = document.getElementById("btn-load");
  const btnRun = document.getElementById("btn-run");
  const toolButtons = document.querySelectorAll(".tool-btn");
  const toolTitle = document.getElementById("tool-title");
  const patientLabel = document.getElementById("patient-label");
  const statusIndicator = document.getElementById("status-indicator");
  const resultsContainer = document.getElementById("results");

  // Tool-specific inputs
  const medListInput = document.getElementById("med-list");
  const lookbackInput = document.getElementById("lookback-days");
  const calculatorSelect = document.getElementById("calculator-select");
  const conditionInput = document.getElementById("condition-input");

  // ── State ───────────────────────────────────────────────────────────────

  let activeTool = "patient-summary";

  const TOOL_LABELS = {
    "patient-summary": "Patient Summary",
    "drug-interactions": "Drug Interactions",
    "lab-results": "Lab Results",
    "risk-score": "Risk Scores",
    "care-gaps": "Care Gaps",
    "clinical-guidelines": "Clinical Guidelines",
  };

  // ── Tool Navigation ─────────────────────────────────────────────────────

  toolButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeTool = btn.dataset.tool;
      toolButtons.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      toolTitle.textContent = TOOL_LABELS[activeTool] || activeTool;

      // Show/hide tool-specific options
      document.querySelectorAll(".tool-options").forEach(function (el) {
        el.style.display = "none";
      });
      var optionsPanel = document.getElementById("options-" + activeTool);
      if (optionsPanel) {
        optionsPanel.style.display = "block";
      }
    });
  });

  // ── Load Button ─────────────────────────────────────────────────────────

  btnLoad.addEventListener("click", function () {
    var pid = patientIdInput.value.trim();
    if (pid) {
      patientLabel.textContent = "Patient: " + pid;
    }
  });

  patientIdInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      btnLoad.click();
    }
  });

  // ── Run Analysis ────────────────────────────────────────────────────────

  btnRun.addEventListener("click", function () {
    runTool();
  });

  async function runTool() {
    var patientId = patientIdInput.value.trim();

    // Build request based on active tool
    var endpoint = "";
    var body = {};

    switch (activeTool) {
      case "patient-summary":
        if (!patientId) {
          showError("Patient ID is required for Patient Summary.");
          return;
        }
        endpoint = "/api/patient-summary";
        body = { patientId: patientId };
        break;

      case "drug-interactions":
        endpoint = "/api/drug-interactions";
        body = {};
        if (patientId) body.patientId = patientId;
        var meds = medListInput.value
          .trim()
          .split("\n")
          .map(function (m) {
            return m.trim();
          })
          .filter(Boolean);
        if (meds.length > 0) body.medications = meds;
        if (!patientId && meds.length === 0) {
          showError(
            "Provide a Patient ID, medication list, or both for Drug Interactions."
          );
          return;
        }
        break;

      case "lab-results":
        if (!patientId) {
          showError("Patient ID is required for Lab Results.");
          return;
        }
        endpoint = "/api/lab-results";
        body = {
          patientId: patientId,
          lookbackDays: parseInt(lookbackInput.value, 10) || 90,
        };
        break;

      case "risk-score":
        if (!patientId) {
          showError("Patient ID is required for Risk Scores.");
          return;
        }
        endpoint = "/api/risk-score";
        body = {
          patientId: patientId,
          calculator: calculatorSelect.value,
        };
        break;

      case "care-gaps":
        if (!patientId) {
          showError("Patient ID is required for Care Gaps.");
          return;
        }
        endpoint = "/api/care-gaps";
        body = { patientId: patientId };
        break;

      case "clinical-guidelines":
        endpoint = "/api/clinical-guidelines";
        body = {};
        if (patientId) body.patientId = patientId;
        var condition = conditionInput.value.trim();
        if (condition) body.condition = condition;
        if (!patientId && !condition) {
          showError(
            "Provide a Patient ID, condition name, or both for Clinical Guidelines."
          );
          return;
        }
        break;

      default:
        showError("Unknown tool: " + activeTool);
        return;
    }

    // Execute
    showLoading();
    patientLabel.textContent = patientId
      ? "Patient: " + patientId
      : "";

    try {
      var response = await fetch(API_BASE + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      var data = await response.json();

      if (data.error) {
        showError(data.error);
      } else if (data.result) {
        showResult(data.result);
      } else {
        showError("Unexpected response from server.");
      }
    } catch (err) {
      showError("Connection failed: " + err.message);
    }
  }

  // ── Display Functions ───────────────────────────────────────────────────

  function showLoading() {
    statusIndicator.textContent = "Processing...";
    statusIndicator.className = "status loading";
    btnRun.disabled = true;
    resultsContainer.innerHTML =
      '<div class="loading-indicator">' +
      '<span class="loading-text">Processing<span class="loading-dots"></span></span>' +
      "</div>";
  }

  function showResult(markdown) {
    statusIndicator.textContent = "Complete";
    statusIndicator.className = "status";
    btnRun.disabled = false;

    var html = renderMarkdown(markdown);
    resultsContainer.innerHTML = '<div class="markdown-body">' + html + "</div>";
  }

  function showError(message) {
    statusIndicator.textContent = "Error";
    statusIndicator.className = "status error";
    btnRun.disabled = false;

    resultsContainer.innerHTML =
      '<div class="error-box">' +
      '<div class="error-title">Error</div>' +
      '<div class="error-message">' + escapeHtml(message) + "</div>" +
      "</div>";
  }

  // ── Markdown Renderer ──────────────────────────────────────────────────
  // Lightweight markdown-to-HTML converter. Handles: headers, bold, italic,
  // tables, lists, horizontal rules, code blocks, inline code.

  function renderMarkdown(md) {
    var lines = md.split("\n");
    var html = [];
    var inCodeBlock = false;
    var inTable = false;
    var inList = false;
    var listType = "";
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Code blocks
      if (line.trimStart().startsWith("```")) {
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
        html.push(escapeHtml(line));
        html.push("\n");
        i++;
        continue;
      }

      // Close open list if this line isn't a list item
      var trimmed = line.trimStart();
      var isUnordered = /^[-*]\s/.test(trimmed);
      var isOrdered = /^\d+[.)]\s/.test(trimmed);
      if (inList && !isUnordered && !isOrdered && trimmed !== "") {
        html.push(listType === "ul" ? "</ul>" : "</ol>");
        inList = false;
      }

      // Empty line
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

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        html.push("<hr>");
        i++;
        continue;
      }

      // Headers
      var headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        var level = headerMatch[1].length;
        html.push(
          "<h" + level + ">" + inlineFormat(headerMatch[2]) + "</h" + level + ">"
        );
        i++;
        continue;
      }

      // Table detection
      if (trimmed.includes("|") && !inTable) {
        // Check if next line is separator
        if (i + 1 < lines.length && /^\|?\s*[-:]+[-|:\s]*$/.test(lines[i + 1].trim())) {
          // Parse header row
          var headerCells = parseTableRow(line);
          html.push("<table><thead><tr>");
          headerCells.forEach(function (cell) {
            html.push("<th>" + inlineFormat(cell) + "</th>");
          });
          html.push("</tr></thead><tbody>");
          inTable = true;
          i += 2; // Skip header and separator
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
      } else if (inTable) {
        html.push("</tbody></table>");
        inTable = false;
        // Don't increment, re-process this line
        continue;
      }

      // Unordered list
      if (isUnordered) {
        if (!inList || listType !== "ul") {
          if (inList) html.push(listType === "ul" ? "</ul>" : "</ol>");
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        var content = trimmed.replace(/^[-*]\s+/, "");
        html.push("<li>" + inlineFormat(content) + "</li>");
        i++;
        continue;
      }

      // Ordered list
      if (isOrdered) {
        if (!inList || listType !== "ol") {
          if (inList) html.push(listType === "ul" ? "</ul>" : "</ol>");
          html.push("<ol>");
          inList = true;
          listType = "ol";
        }
        var olContent = trimmed.replace(/^\d+[.)]\s+/, "");
        html.push("<li>" + inlineFormat(olContent) + "</li>");
        i++;
        continue;
      }

      // Paragraph
      html.push("<p>" + inlineFormat(line) + "</p>");
      i++;
    }

    // Close any open elements
    if (inCodeBlock) html.push("</code></pre>");
    if (inList) html.push(listType === "ul" ? "</ul>" : "</ol>");
    if (inTable) html.push("</tbody></table>");

    return html.join("\n");
  }

  function inlineFormat(text) {
    // Escape HTML first
    text = escapeHtml(text);

    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");

    // Italic: *text* or _text_
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

    // Inline code: `text`
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

    return text;
  }

  function parseTableRow(line) {
    return line
      .split("|")
      .map(function (c) {
        return c.trim();
      })
      .filter(function (c) {
        return c !== "";
      });
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
})();
