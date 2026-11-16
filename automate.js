/* automate.js
 * Hardened detection + layout algorithm — JavaScript port of the Python script.
 *
 * Improvements:
 *   - Case-insensitive exact match on TEXT / MTEXT
 *   - When multiple TEXT entities match a position name, picks the one that has
 *     a nearby INSERT (so the right one wins if the name appears in a title
 *     block AND as a position label)
 *   - Per-position diagnostic: tells the user WHY a miss happened
 *     (no matching text vs. no nearby block)
 *   - Deduplicate position names from Excel (with a warning)
 *   - Validate that the chosen block exists in the BLOCKS table
 *   - Compute the new layout's bbox so the writer can update $EXTMIN/$EXTMAX
 *   - Don't crash if settings are malformed; clamp to safe ranges
 *   - Always return a result object even if 0 connectors found, so the UI can
 *     show a friendly error rather than throwing
 */

window.Automate = (function () {

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

  // Find candidate TEXT entities matching `name`.
  // Match rules (case-insensitive):
  //   - exact match: cleaned text equals name
  //   - prefix match (MTEXT only): cleaned text starts with name + optional
  //     separator (space, newline, punctuation). This handles MTEXT entries
  //     that have extra annotation after the position name.
  function findTextCandidates(entities, name) {
    name = String(name).trim().toLowerCase();
    if (!name) return [];
    const out = [];
    for (const e of entities) {
      if (e.type === "TEXT" || e.type === "MTEXT") {
        const t = String(e.text || "").trim().toLowerCase();
        if (!t) continue;
        if (t === name) { out.push(e); continue; }
        // Prefix match: "pos-01 ..." matches "pos-01"
        if (t.startsWith(name)) {
          const next = t[name.length];
          if (next === " " || next === "\n" || next === "\t" ||
              next === "\r" || next === "," || next === ";" || next === ":" ||
              next === "|" || next === "/" || next === "\\") {
            out.push(e);
          }
        }
      }
    }
    return out;
  }

  // Find the nearest INSERT entity whose insertion point lies within the
  // search region around (tx, ty). Returns { entity, distance } or null.
  function findNearestInsert(entities, tx, ty, s) {
    const xMin = tx - s.searchLR;
    const xMax = tx + s.searchLR;
    const yMin = ty - s.searchBelow;
    const yMax = ty + (s.searchAbove != null ? s.searchAbove : 10);

    let best = null;
    let bestD = Infinity;
    for (const e of entities) {
      if (e.type !== "INSERT") continue;
      if (!e.name) continue;
      const bx = e.x, by = e.y;
      if (bx < xMin || bx > xMax) continue;
      if (by < yMin || by > yMax) continue;
      const d = distance(tx, ty, bx, by);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ? { entity: best, distance: bestD } : null;
  }

  // Clamp a number to a safe range. If the input is missing (NaN) or
  // non-finite, use the default. If the input is within [min, max], keep it.
  // If the input is OUTSIDE [min, max], clamp it to the nearest boundary.
  function clamp(n, min, max, def) {
    n = parseFloat(n);
    if (!isFinite(n)) return def;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  // Validate that the chosen block name actually exists in the BLOCKS table.
  // Some AutoCAD exports include INSERTs that reference blocks defined in
  // external files (XREFs); we skip those.
  function blockExists(parsed, name) {
    return !!(parsed.blocks && parsed.blocks[name]);
  }

  function run(parsed, positions, settings) {
    settings = settings || {};
    const s = {
      slotW: clamp(settings.slotW, 5, 2000, 60),
      slotH: clamp(settings.slotH, 5, 2000, 50),
      gap: clamp(settings.gap, 0, 1000, 10),
      searchBelow: clamp(settings.searchBelow, 0, 5000, 50),
      searchLR: clamp(settings.searchLR, 0, 5000, 100),
      searchAbove: clamp(settings.searchAbove, 0, 5000, 10),
      textHeight: clamp(settings.textHeight, 1, 50, 4),
      rowMarginBottom: clamp(settings.rowMarginBottom, 0, 5000, 30),
      rowMarginLeft: clamp(settings.rowMarginLeft, 0, 5000, 40),
    };

    // Deduplicate position names while preserving order. Track duplicates
    // for the user.
    const seen = new Set();
    const seenLower = new Set();
    const dupes = [];
    const uniquePositions = [];
    for (const p of positions) {
      const pl = String(p).trim().toLowerCase();
      if (seenLower.has(pl)) {
        dupes.push(p);
      } else {
        seenLower.add(pl);
        uniquePositions.push(p);
      }
      seen.add(p);
    }

    const entities = parsed.entities;
    const found = [];
    const missing = [];   // { name, reason }

    for (const name of uniquePositions) {
      const candidates = findTextCandidates(entities, name);
      if (candidates.length === 0) {
        missing.push({ name, reason: "no text in the drawing matches this name" });
        continue;
      }
      // For each candidate text, find the nearest insert in the search region.
      // Pick the candidate that yields the closest insert.
      let bestPick = null;
      let bestDist = Infinity;
      let bestCandidate = null;
      for (const t of candidates) {
        const r = findNearestInsert(entities, t.x, t.y, s);
        if (r && r.distance < bestDist) {
          bestDist = r.distance;
          bestPick = r.entity;
          bestCandidate = t;
        }
      }
      if (!bestPick) {
        // No block found near ANY candidate text.
        // Maybe the block exists but is too far; try widening the search
        // just for diagnostic purposes (this doesn't change the result).
        let nearAny = false;
        for (const t of candidates) {
          // search 1000mm in each direction just to find SOMETHING
          const wide = findNearestInsert(entities, t.x, t.y, {
            searchBelow: 1000, searchLR: 1000, searchAbove: 1000
          });
          if (wide) { nearAny = true; break; }
        }
        missing.push({
          name,
          reason: nearAny
            ? "a block was found but it's outside the search range — increase 'Search below' or 'Search left/right' in Advanced settings"
            : "no block reference exists near this text in the drawing"
        });
        continue;
      }
      // Validate the block exists.
      if (!blockExists(parsed, bestPick.name)) {
        missing.push({
          name,
          reason: "the block named '" + bestPick.name + "' is referenced but not defined in the BLOCKS section (it may be an XREF)"
        });
        continue;
      }
      found.push({
        name,
        blockName: bestPick.name,
        srcX: bestPick.x,
        srcY: bestPick.y,
        distance: bestDist,
      });
    }

    if (found.length === 0) {
      return {
        found: [],
        missing,
        dupes,
        newEntitiesDxf: "",
        outputDxfText: parsed.rawText,
        layout: null,
        newBbox: null,
      };
    }

    // Compute the new row's Y position (below the lowest existing geometry).
    const rowY = parsed.bbox.yMin - s.rowMarginBottom - s.slotH;
    let curX = s.rowMarginLeft;
    const textY = rowY + s.slotH + 5;

    let newDxf = "";
    let newXMin = Infinity, newYMin = Infinity, newXMax = -Infinity, newYMax = -Infinity;
    const updateNewBbox = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < newXMin) newXMin = x;
      if (y < newYMin) newYMin = y;
      if (x > newXMax) newXMax = x;
      if (y > newYMax) newYMax = y;
    };

    for (const item of found) {
      const x0 = curX, y0 = rowY;
      const x1 = curX + s.slotW, y1 = rowY + s.slotH;
      // Cell rectangle
      newDxf += window.DxfWriter.lwpolyline(
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
        true
      );
      updateNewBbox(x0, y0); updateNewBbox(x1, y1);
      // Block insert centered in the cell
      const cx = x0 + s.slotW / 2;
      const cy = y0 + s.slotH / 2;
      newDxf += window.DxfWriter.insert(item.blockName, cx, cy);
      // Block bbox for the new-layout bounds
      const bb = parsed.blockBboxes[item.blockName];
      if (bb) {
        // Approximate block size in absolute mm around (cx, cy).
        const bxMin = cx + (bb.xMin || 0);
        const byMin = cy + (bb.yMin || 0);
        const bxMax = cx + (bb.xMax || 0);
        const byMax = cy + (bb.yMax || 0);
        updateNewBbox(bxMin, byMin); updateNewBbox(bxMax, byMax);
      } else {
        updateNewBbox(cx - 25, cy - 25); updateNewBbox(cx + 25, cy + 25);
      }
      // Position-name text above the cell, horizontally centered.
      // Approximate text width = len * height * 0.6.
      const approxW = item.name.length * s.textHeight * 0.6;
      const txLeft = x0 + s.slotW / 2 - approxW / 2;
      newDxf += window.DxfWriter.text(item.name, txLeft, textY, s.textHeight);
      updateNewBbox(txLeft, textY);
      updateNewBbox(txLeft + approxW, textY + s.textHeight);

      curX += s.slotW + s.gap;
    }

    const newBbox = { xMin: newXMin, yMin: newYMin, xMax: newXMax, yMax: newYMax };
    const outputText = window.DxfWriter.appendEntities(parsed.rawText, newDxf, {
      modelSpaceOwner: parsed.modelSpaceOwner,
      maxHandle: parsed.maxHandle,
      sourceBbox: parsed.bbox,
      newBbox,
    });

    return {
      found,
      missing,
      dupes,
      newEntitiesDxf: newDxf,
      outputDxfText: outputText,
      layout: {
        rowY, rowX: s.rowMarginLeft,
        slotW: s.slotW, slotH: s.slotH,
        gap: s.gap, textY,
      },
      newBbox,
    };
  }

  return { run };
})();
