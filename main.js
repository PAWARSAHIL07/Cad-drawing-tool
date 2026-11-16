/* main.js
 * Hardened UI orchestration for the Versigent Harness Connector Layout Tool.
 *
 * Hardening:
 *   - File type validation on drop (friendly message instead of cryptic parse error)
 *   - File size warnings for files > 50 MB
 *   - Sheet selector (auto-populated from Excel) when the workbook has multiple
 *     sheets; hidden when only one sheet exists
 *   - "Automate" button is disabled during run with a spinner; double-click
 *     can't trigger a double run
 *   - Result card scrolls into view smoothly after a run
 *   - Inline error banners (red) for hard failures and warnings (amber) for
 *     partial misses / duplicates — no more silent failures
 *   - Console errors get caught and shown to the user
 *   - Keyboard a11y for drop zones (Enter / Space opens file picker)
 *   - "Start over" resets everything cleanly
 */

(function () {
  "use strict";

  // ---- State ---------------------------------------------------------------
  let excelFile = null;
  let excelData = null;     // SheetJS workbook
  let excelColumns = [];
  let dxfFile = null;
  let parsedDxf = null;
  let lastResult = null;
  let activePreviewTab = "output";
  let running = false;

  const $ = id => document.getElementById(id);

  // ---- DOM -----------------------------------------------------------------
  const dropExcel = $("drop-excel");
  const fileExcel = $("file-excel");
  const excelName = $("excel-name");
  const excelMeta = $("excel-meta");
  const excelClear = $("excel-clear");
  const dzExcelEmpty = dropExcel.querySelector(".dz-empty");
  const dzExcelFilled = dropExcel.querySelector(".dz-filled");

  const dropDxf = $("drop-dxf");
  const fileDxf = $("file-dxf");
  const dxfName = $("dxf-name");
  const dxfMeta = $("dxf-meta");
  const dxfClear = $("dxf-clear");
  const dzDxfEmpty = dropDxf.querySelector(".dz-empty");
  const dzDxfFilled = dropDxf.querySelector(".dz-filled");

  const advToggle = $("adv-toggle");
  const advBody = $("adv-body");
  const fCol = $("f-col");
  const fSheet = $("f-sheet");         // sheet selector (added below)
  const fSheetWrap = $("f-sheet-wrap"); // wrapper that we show/hide
  const fSW = $("f-sw");
  const fSH = $("f-sh");
  const fBelow = $("f-below");
  const fLR = $("f-lr");
  const fGap = $("f-gap");
  const advReset = $("adv-reset");

  const btnRun = $("btn-run");
  const runStatus = $("run-status");
  const results = $("results");
  const resultsSummary = $("results-summary");
  const btnDownload = $("btn-download");
  const btnRestart = $("btn-restart");
  const previewCanvas = $("preview-canvas");
  const previewHint = $("preview-hint");
  const tabs = document.querySelectorAll(".preview-tabs .tab");

  // ---- Helpers -------------------------------------------------------------
  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  function setDxFilled(zone) {
    zone.querySelector(".dz-empty").hidden = true;
    zone.querySelector(".dz-filled").hidden = false;
    zone.classList.add("filled");
  }
  function setDxEmpty(zone) {
    zone.querySelector(".dz-empty").hidden = false;
    zone.querySelector(".dz-filled").hidden = true;
    zone.classList.remove("filled");
  }

  function updateRunButton() {
    const ready = !!excelFile && !!dxfFile && !running;
    btnRun.disabled = !ready;
    if (running) {
      btnRun.querySelector(".btn-label").innerHTML =
        '<span class="spinner"></span>Running…';
    } else if (excelFile && dxfFile) {
      btnRun.querySelector(".btn-label").textContent = "Automate";
    } else {
      btnRun.querySelector(".btn-label").textContent = "Upload both files first";
    }
  }

  function showStatus(msg, kind) {
    if (!msg) { runStatus.textContent = ""; runStatus.className = "run-status"; return; }
    runStatus.textContent = msg;
    runStatus.className = "run-status " + (kind || "");
  }

  // Validate the file extension/type against expected.
  function validateFile(file, kind) {
    const n = file.name.toLowerCase();
    if (kind === "excel") {
      const ok = n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv") ||
                 (file.type && (file.type.includes("sheet") || file.type.includes("csv") || file.type.includes("excel")));
      if (!ok) return "Expected an Excel (.xlsx, .xls) or .csv file. Got: " + file.name;
    } else if (kind === "dxf") {
      const ok = n.endsWith(".dxf") ||
                 (file.type && file.type.includes("dxf"));
      if (!ok) return "Expected a DXF file. Got: " + file.name;
    }
    if (file.size > 50 * 1024 * 1024) {
      return "File is " + fmtBytes(file.size) + " — very large. The tool may take a few seconds.";
    }
    return null;
  }

  // ---- Excel handling ------------------------------------------------------
  function handleExcelFile(file) {
    const err = validateFile(file, "excel");
    if (err && err.includes("Expected")) {
      showStatus(err, "err");
      return;
    }
    excelFile = file;
    excelName.textContent = file.name;
    excelMeta.textContent = fmtBytes(file.size);
    setDxFilled(dropExcel);

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        excelData = wb;
        populateSheetSelector();
        populateColumnDropdown();
        showStatus(null);
      } catch (ex) {
        showStatus("Could not read Excel: " + (ex && ex.message ? ex.message : ex), "err");
        excelData = null;
      }
    };
    reader.onerror = () => {
      showStatus("Failed to read the Excel file (browser error).", "err");
    };
    reader.readAsArrayBuffer(file);
    updateRunButton();
  }

  function clearExcel() {
    excelFile = null; excelData = null; excelColumns = [];
    setDxEmpty(dropExcel);
    excelName.textContent = "—"; excelMeta.textContent = "—";
    fileExcel.value = "";
    fCol.disabled = true;
    fCol.innerHTML = "<option>Upload Excel first</option>";
    if (fSheet) { fSheet.disabled = true; fSheet.innerHTML = "<option>—</option>"; }
    if (fSheetWrap) fSheetWrap.style.display = "none";
    updateRunButton();
  }

  function populateSheetSelector() {
    if (!fSheet || !fSheetWrap) return;
    const names = excelData.SheetNames || [];
    if (names.length <= 1) {
      fSheetWrap.style.display = "none";
      return;
    }
    fSheetWrap.style.display = "";
    fSheet.disabled = false;
    fSheet.innerHTML = "";
    for (const n of names) {
      const opt = document.createElement("option");
      opt.value = n; opt.textContent = n;
      fSheet.appendChild(opt);
    }
  }

  function currentSheetName() {
    if (!excelData) return null;
    // Use the sheet selector only if it's enabled and has a real value
    // (i.e. there's more than one sheet). Otherwise, fall back to the
    // first sheet of the workbook.
    if (fSheet && !fSheet.disabled && fSheet.value && fSheet.value !== "—") {
      // Verify the value is actually a sheet in the workbook.
      if (excelData.SheetNames.includes(fSheet.value)) {
        return fSheet.value;
      }
    }
    return excelData.SheetNames[0];
  }

  function populateColumnDropdown() {
    const sheetName = currentSheetName();
    if (!sheetName) return;
    const sheet = excelData.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows.length) {
      showStatus("The selected Excel sheet is empty.", "err");
      return;
    }
    excelColumns = rows[0].map(String);
    fCol.disabled = false;
    fCol.innerHTML = "";
    let picked = excelColumns[0];
    for (const c of excelColumns) {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      fCol.appendChild(opt);
      const cl = c.toLowerCase();
      if (cl.includes("position") && cl.includes("name")) picked = c;
    }
    fCol.value = picked;
  }

  // ---- DXF handling --------------------------------------------------------
  function handleDxfFile(file) {
    const err = validateFile(file, "dxf");
    if (err && err.includes("Expected")) {
      showStatus(err, "err");
      return;
    }
    dxfFile = file;
    dxfName.textContent = file.name;
    dxfMeta.textContent = fmtBytes(file.size);
    setDxFilled(dropDxf);

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        if (!text || text.length < 50) {
          throw new Error("DXF file is empty or too small to be valid.");
        }
        parsedDxf = window.DxfParser.parse(text);
        if (!parsedDxf.entities || parsedDxf.entities.length === 0) {
          showStatus("DXF loaded but contains 0 entities — is this the right file?", "warn");
        } else {
          const t = parsedDxf.entities.filter(x => x.type === "TEXT" || x.type === "MTEXT").length;
          const i = parsedDxf.entities.filter(x => x.type === "INSERT").length;
          dxfMeta.textContent =
            fmtBytes(file.size) + " · " + t + " text · " + i + " blocks";
          showStatus(null);
        }
      } catch (ex) {
        showStatus("Could not parse DXF: " + (ex && ex.message ? ex.message : ex), "err");
        parsedDxf = null;
      }
    };
    reader.onerror = () => {
      showStatus("Failed to read the DXF file (browser error).", "err");
    };
    reader.readAsText(file);
    updateRunButton();
  }

  function clearDxf() {
    dxfFile = null; parsedDxf = null;
    setDxEmpty(dropDxf);
    dxfName.textContent = "—"; dxfMeta.textContent = "—";
    fileDxf.value = "";
    updateRunButton();
  }

  // ---- Drag-and-drop ------------------------------------------------------
  function wireDrop(zone, input, handler) {
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", e => {
      if (e.target.files.length) handler(e.target.files[0]);
    });
    ["dragenter", "dragover"].forEach(ev =>
      zone.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        zone.classList.add("dragover");
      })
    );
    ["dragleave", "dragend", "drop"].forEach(ev =>
      zone.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        zone.classList.remove("dragover");
      })
    );
    zone.addEventListener("drop", e => {
      if (e.dataTransfer.files.length) handler(e.dataTransfer.files[0]);
    });
  }
  wireDrop(dropExcel, fileExcel, handleExcelFile);
  wireDrop(dropDxf, fileDxf, handleDxfFile);

  excelClear.addEventListener("click", e => { e.stopPropagation(); clearExcel(); });
  dxfClear.addEventListener("click", e => { e.stopPropagation(); clearDxf(); });

  // ---- Advanced settings --------------------------------------------------
  advToggle.addEventListener("click", () => {
    const open = advToggle.getAttribute("aria-expanded") === "true";
    advToggle.setAttribute("aria-expanded", String(!open));
    advBody.hidden = open;
  });

  advReset.addEventListener("click", () => {
    fSW.value = 60; fSH.value = 50;
    fBelow.value = 50; fLR.value = 100; fGap.value = 10;
  });

  if (fSheet) {
    fSheet.addEventListener("change", () => {
      if (excelData) populateColumnDropdown();
    });
  }

  // ---- Run the automation -------------------------------------------------
  function getPositions() {
    if (!excelData) return [];
    const sheetName = currentSheetName();
    const sheet = excelData.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const col = fCol.value;
    return rows.map(r => String(r[col] || "")).filter(s => s.trim().length > 0);
  }

  function collectSettings() {
    return {
      positionColumn: fCol.value,
      sheetName: currentSheetName(),
      slotW: parseFloat(fSW.value),
      slotH: parseFloat(fSH.value),
      searchBelow: parseFloat(fBelow.value),
      searchLR: parseFloat(fLR.value),
      searchAbove: 10,
      gap: parseFloat(fGap.value),
      textHeight: 4,
      rowMarginBottom: 30,
      rowMarginLeft: 40,
    };
  }

  btnRun.addEventListener("click", () => {
    if (running) return;
    if (!parsedDxf || !excelData) {
      showStatus("Please upload both files first.", "err");
      return;
    }

    running = true;
    updateRunButton();

    // Yield to the browser so the spinner can render before the heavy work.
    setTimeout(() => {
      try {
        const positions = getPositions();
        if (positions.length === 0) {
          throw new Error("No position names found in the selected column. Pick a different 'Position column' in Advanced settings.");
        }
        const settings = collectSettings();
        const result = window.Automate.run(parsedDxf, positions, settings);
        lastResult = result;

        // Build the results summary HTML.
        let html = "";
        if (result.found.length === 0) {
          html = '<div class="error-banner">No connectors found. Check that the position names in Excel match the text in the CAD drawing exactly (case-insensitive).</div>';
        } else {
          html = '<strong>' + result.found.length + '</strong> connector(s) found';
          if (result.missing.length) {
            html += ', <strong style="color:var(--err)">' + result.missing.length + '</strong> not found';
          }
          if (result.dupes && result.dupes.length) {
            html += ', <strong style="color:var(--warn)">' + result.dupes.length + '</strong> duplicate position name(s) skipped';
          }
          html += "<ul>";
          for (const it of result.found) {
            html += '<li class="ok">✓ ' + escapeHtml(it.name) +
                    ' → block "' + escapeHtml(it.blockName) +
                    '" at (' + it.srcX.toFixed(1) + ', ' + it.srcY.toFixed(1) +
                    ')</li>';
          }
          for (const m of result.missing) {
            html += '<li class="miss">✕ ' + escapeHtml(m.name) +
                    ' — ' + escapeHtml(m.reason) + '</li>';
          }
          if (result.dupes && result.dupes.length) {
            html += '<li class="miss" style="color:var(--warn)">⚠ Duplicates skipped: ' +
                    escapeHtml(result.dupes.join(", ")) + '</li>';
          }
          html += "</ul>";
        }
        resultsSummary.innerHTML = html;
        results.hidden = false;

        drawPreview();
        results.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        console.error(err);
        results.hidden = false;
        resultsSummary.innerHTML = '<div class="error-banner">Error: ' +
          escapeHtml(err.message || String(err)) +
          '</div>';
      } finally {
        running = false;
        updateRunButton();
      }
    }, 60);
  });

  function drawPreview() {
    if (!lastResult || !parsedDxf) return;
    let overlay = [];
    if (activePreviewTab === "output" && lastResult.layout) {
      overlay = window.Preview.buildOverlay(lastResult.found, lastResult.layout);
    }
    window.Preview.draw(previewCanvas, parsedDxf, overlay);
  }

  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    activePreviewTab = t.dataset.tab;
    drawPreview();
  }));

  // ---- Download -----------------------------------------------------------
  btnDownload.addEventListener("click", () => {
    if (!lastResult || !lastResult.outputDxfText) return;
    let base = "output";
    if (dxfFile) {
      base = dxfFile.name.replace(/\.dxf$/i, "") + "_layout";
    }
    const blob = new Blob([lastResult.outputDxfText], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = base + ".dxf";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  });

  btnRestart.addEventListener("click", () => {
    clearExcel();
    clearDxf();
    lastResult = null;
    results.hidden = true;
    showStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---- Utility -----------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  updateRunButton();
})();
