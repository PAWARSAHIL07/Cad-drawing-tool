/* dxf-writer.js
 * Hardened DXF writer for the Versigent Harness Tool.
 *
 * Generates valid DXF text for new entities (LWPOLYLINE, INSERT, TEXT, LINE)
 * and inserts them before the ENDSEC of the ENTITIES section of the source
 * DXF text.
 *
 * Hardening:
 *   - Handle counter starts above the source DXF's max handle (no collisions)
 *   - Each new entity gets a proper DXF structure:
 *       0 <type>, 5 <handle>, 330 <owner>, 100 AcDbEntity, 8 <layer>, 62 <color>,
 *       100 AcDb<Type> subclass, type-specific fields
 *   - New entities go on a dedicated layer "VERSIGENT_LAYOUT" so users can
 *     toggle visibility / select / delete them easily in AutoCAD/BricsCAD.
 *   - LAYER table entry is added to the TABLES section so the layer is
 *     registered and the file stays valid.
 *   - $EXTMIN / $EXTMAX in HEADER are updated to include the new geometry,
 *     so AutoCAD's zoom extents works correctly.
 */

window.DxfWriter = (function () {

  let handleCounter = 0x1000;
  let owner = "17";

  function nextHandle() {
    const h = handleCounter.toString(16).toUpperCase();
    handleCounter++;
    return h;
  }

  function fmtNum(n) {
    if (typeof n !== "number" || !isFinite(n)) n = 0;
    let s = n.toFixed(6);
    s = s.replace(/\.?0+$/, "");
    if (s === "-0") s = "0";
    return s;
  }

  function setOwner(o) {
    owner = String(o || "17").trim();
  }

  const LAYER_NAME = "VERSIGENT_LAYOUT";

  function lwpolyline(points, closed) {
    const handle = nextHandle();
    let s = "";
    s += "0\nLWPOLYLINE\n";
    s += "5\n" + handle + "\n";
    s += "330\n" + owner + "\n";
    s += "100\nAcDbEntity\n";
    s += "8\n" + LAYER_NAME + "\n";
    s += "62\n7\n";
    s += "100\nAcDbPolyline\n";
    s += "90\n" + points.length + "\n";
    s += "70\n" + (closed ? 1 : 0) + "\n";
    for (const p of points) {
      s += "10\n" + fmtNum(p[0]) + "\n";
      s += "20\n" + fmtNum(p[1]) + "\n";
      s += "30\n0\n";
    }
    return s;
  }

  function line(x1, y1, x2, y2) {
    const handle = nextHandle();
    return "0\nLINE\n" +
      "5\n" + handle + "\n" +
      "330\n" + owner + "\n" +
      "100\nAcDbEntity\n" +
      "8\n" + LAYER_NAME + "\n" +
      "62\n7\n" +
      "100\nAcDbLine\n" +
      "10\n" + fmtNum(x1) + "\n20\n" + fmtNum(y1) + "\n30\n0\n" +
      "11\n" + fmtNum(x2) + "\n21\n" + fmtNum(y2) + "\n31\n0\n";
  }

  function text(str, x, y, h) {
    const safe = String(str).replace(/\n/g, " ").replace(/\r/g, " ");
    const handle = nextHandle();
    return "0\nTEXT\n" +
      "5\n" + handle + "\n" +
      "330\n" + owner + "\n" +
      "100\nAcDbEntity\n" +
      "8\n" + LAYER_NAME + "\n" +
      "62\n7\n" +
      "100\nAcDbText\n" +
      "10\n" + fmtNum(x) + "\n20\n" + fmtNum(y) + "\n30\n0\n" +
      "40\n" + fmtNum(h) + "\n" +
      "1\n" + safe + "\n" +
      "7\nSTANDARD\n" +
      "50\n0\n" +
      "100\nAcDbText\n";
  }

  function insert(blockName, x, y) {
    const handle = nextHandle();
    return "0\nINSERT\n" +
      "5\n" + handle + "\n" +
      "330\n" + owner + "\n" +
      "100\nAcDbEntity\n" +
      "8\n" + LAYER_NAME + "\n" +
      "62\n7\n" +
      "100\nAcDbBlockReference\n" +
      "2\n" + blockName + "\n" +
      "10\n" + fmtNum(x) + "\n20\n" + fmtNum(y) + "\n30\n0\n" +
      "41\n1\n42\n1\n43\n1\n" +
      "50\n0\n";
  }

  // ---- Insert a LAYER table record into the TABLES section ------------------
  // If the layer "VERSIGENT_LAYOUT" is not already defined, add a LAYER entry
  // inside the existing LAYER table. We insert just before the LAYER table's
  // ENDSEC ... actually we insert just before the ENDTAB of the LAYER table.
  function ensureLayerExists(lines) {
    // Find the LAYER table:
    //   0 TABLE  2 LAYER  5 ...  70 <count>  ... <layer records> ...  0 ENDTAB
    let i = 0;
    let inLayerTable = false;
    let endtabAt = -1;
    let countAt = -1;
    while (i + 3 < lines.length) {
      if (lines[i].trim() === "0" && lines[i + 1].trim() === "TABLE" &&
          lines[i + 2].trim() === "2" && lines[i + 3].trim() === "LAYER") {
        inLayerTable = true;
        // Find the count (group code 70) — it appears after the table header
        // and before any LAYER records.
        for (let j = i + 4; j < lines.length && lines[j].code !== 0; j++) {
          if (lines[j].trim() === "70") {
            countAt = j + 1;
            break;
          }
        }
        // Find the ENDTAB that closes this table.
        for (let j = i + 4; j + 1 < lines.length; j++) {
          if (lines[j].trim() === "0" && lines[j + 1].trim() === "ENDTAB") {
            endtabAt = j;
            break;
          }
        }
        break;
      }
      i++;
    }
    if (!inLayerTable || endtabAt < 0) {
      // No LAYER table found; we skip adding a layer definition. The layer
      // name in our entities will still work — AutoCAD will auto-create the
      // layer when the file is opened.
      return lines;
    }

    // Check if our layer is already defined.
    for (let k = 0; k < endtabAt; k++) {
      if (lines[k].trim() === "0" && lines[k + 1] && lines[k + 1].trim() === "LAYER") {
        // Look ahead for the layer name (group code 2)
        for (let m = k + 2; m < endtabAt && lines[m].code !== 0; m++) {
          if (lines[m].trim() === "2" && lines[m + 1] && lines[m + 1].trim() === LAYER_NAME) {
            return lines;  // already exists
          }
        }
      }
    }

    // Build the new LAYER record.
    const handle = nextHandle();
    const newLayer = [
      "0", "LAYER",
      "5", handle,
      "330", "2",   // owner = the LAYER symbol table (handle "2" is conventional)
      "100", "AcDbSymbolTableRecord",
      "100", "AcDbLayerTableRecord",
      "2", LAYER_NAME,
      "70", "0",
      "62", "7",
      "6", "CONTINUOUS",
    ];
    // Bump the layer table's entry count (group code 70).
    if (countAt >= 0 && countAt < lines.length) {
      const cur = parseInt(lines[countAt].trim(), 10) || 0;
      lines[countAt] = String(cur + 1);
    }
    // Insert before ENDTAB
    return [...lines.slice(0, endtabAt), ...newLayer, ...lines.slice(endtabAt)];
  }

  // ---- Update $EXTMIN / $EXTMAX in HEADER -----------------------------------
  function updateExtents(lines, xMin, yMin, xMax, yMax) {
    // Walk through HEADER variables; update $EXTMIN and $EXTMAX.
    // Each var: 9 $NAME  10 X  20 Y  30 Z
    let i = 0;
    let updated = 0;
    while (i + 1 < lines.length) {
      if (lines[i].trim() === "9") {
        const v = lines[i + 1].trim();
        if (v === "$EXTMIN" || v === "$EXTMAX") {
          // Find the 10/20 codes following this header var.
          for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== "9"; j++) {
            if (lines[j].trim() === "10") {
              lines[j + 1] = (v === "$EXTMIN") ? fmtNum(xMin) : fmtNum(xMax);
            } else if (lines[j].trim() === "20") {
              lines[j + 1] = (v === "$EXTMIN") ? fmtNum(yMin) : fmtNum(yMax);
            }
          }
          updated++;
          if (updated >= 2) break;
        }
      }
      i++;
    }
    return lines;
  }

  // ---- Main entry: append entities to source DXF text ----------------------
  function appendEntities(originalText, newEntitiesDxf, options) {
    options = options || {};
    handleCounter = (options.maxHandle || 0) + 1;
    setOwner(options.modelSpaceOwner || "17");

    let lines = originalText.split(/\r\n|\r|\n/);

    // 1. Find the ENDSEC of the ENTITIES section.
    let inEntities = false;
    let insertAt = -1;
    for (let i = 0; i + 3 < lines.length; i++) {
      if (lines[i].trim() === "0" && lines[i + 1].trim() === "SECTION" &&
          lines[i + 2].trim() === "2" && lines[i + 3].trim() === "ENTITIES") {
        inEntities = true;
        continue;
      }
      if (inEntities && lines[i].trim() === "0" && lines[i + 1].trim() === "ENDSEC") {
        insertAt = i;
        break;
      }
    }

    // 2. Compute the new geometry's bbox so we can update $EXTMIN/$EXTMAX.
    // The options.extents { xMin, yMin, xMax, yMax } describes the new layout.
    let allXMin = options.sourceBbox ? options.sourceBbox.xMin : 0;
    let allYMin = options.sourceBbox ? options.sourceBbox.yMin : 0;
    let allXMax = options.sourceBbox ? options.sourceBbox.xMax : 0;
    let allYMax = options.sourceBbox ? options.sourceBbox.yMax : 0;
    if (options.newBbox) {
      allXMin = Math.min(allXMin, options.newBbox.xMin);
      allYMin = Math.min(allYMin, options.newBbox.yMin);
      allXMax = Math.max(allXMax, options.newBbox.xMax);
      allYMax = Math.max(allYMax, options.newBbox.yMax);
    }

    // 3. Update $EXTMIN/$EXTMAX in HEADER.
    lines = updateExtents(lines, allXMin, allYMin, allXMax, allYMax);

    // 4. Add LAYER record (if not present).
    lines = ensureLayerExists(lines);

    // 5. Insert new entities before ENDSEC.
    if (insertAt < 0) {
      // Re-find the ENDSEC of ENTITIES, since ensureLayerExists may have
      // shifted line indices.
      inEntities = false;
      for (let i = 0; i + 3 < lines.length; i++) {
        if (lines[i].trim() === "0" && lines[i + 1].trim() === "SECTION" &&
            lines[i + 2].trim() === "2" && lines[i + 3].trim() === "ENTITIES") {
          inEntities = true; continue;
        }
        if (inEntities && lines[i].trim() === "0" && lines[i + 1].trim() === "ENDSEC") {
          insertAt = i; break;
        }
      }
    }
    if (insertAt < 0) {
      // Fallback: append a new ENTITIES section.
      return lines.join("\n") + "\n0\nSECTION\n2\nENTITIES\n" + newEntitiesDxf +
             "0\nENDSEC\n0\nEOF\n";
    }

    const newLines = newEntitiesDxf.split(/\r\n|\r|\n/);
    while (newLines.length && newLines[newLines.length - 1] === "") newLines.pop();
    const updated = [...lines.slice(0, insertAt), ...newLines, ...lines.slice(insertAt)];
    return updated.join("\n");
  }

  return { lwpolyline, line, text, insert, appendEntities, fmtNum, setOwner, LAYER_NAME };
})();
