/* dxf-parser.js
 * Hardened DXF reader for the Versigent Harness Tool.
 *
 * Handles the real-world variations we expect from AutoCAD / BricsCAD / ezdxf
 * exported DXF files:
 *   - BOM at the start of the file
 *   - COMMENT section (group code 999)
 *   - HEADER section with many $ variables
 *   - CLASSES section
 *   - TABLES section (used to find *Model_Space block record handle)
 *   - BLOCKS section (block definitions)
 *   - ENTITIES section (model-space entities)
 *   - OBJECTS section (preserved but not parsed)
 *
 * Entity types we parse for use:
 *   TEXT, MTEXT, INSERT, LWPOLYLINE, POLYLINE, LINE, CIRCLE, ARC, ELLIPSE,
 *   SPLINE, HATCH, RAY, XLINE, POINT
 *
 * For each block, we compute its true bounding box from its geometry so the
 * preview and the layout are accurate.
 *
 * MTEXT in AutoCAD often contains formatting codes like
 *   {\fArial|b0|i0|c0|p34;POS-01}  or  \P  (paragraph break)
 * We strip these to recover the visible plain text.
 */

window.DxfParser = (function () {

  // Strip BOM and any leading whitespace
  function stripBom(text) {
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    return text;
  }

  // Tokenize a DXF text into a flat list of (code, value) pairs.
  function tokenize(text) {
    text = stripBom(text);
    const lines = text.split(/\r\n|\r|\n/);
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const codeStr = lines[i].trim();
      // Skip blank lines (some writers add them)
      if (codeStr === "") { i--; continue; }
      const code = parseInt(codeStr, 10);
      if (isNaN(code)) continue;
      // Preserve trailing whitespace in value lines? DXF values are trimmed
      let value = lines[i + 1];
      // We keep the raw string; per-code parsing happens in val().
      pairs.push({ code, value });
    }
    return pairs;
  }

  // Build a typed value from a raw string for a given group code.
  function val(code, raw) {
    raw = (raw == null) ? "" : String(raw);
    // Numeric codes: 10-59 (coordinates), 60-79 (integers), 90-99 (int32),
    // 40-59 (floats), 140-149 (floats).
    if ((code >= 10 && code <= 59) || (code >= 140 && code <= 149) ||
        (code >= 60 && code <= 79) || (code >= 90 && code <= 99)) {
      const n = parseFloat(raw);
      return isNaN(n) ? 0 : n;
    }
    return raw.trim();
  }

  // Split the pairs into sections keyed by section name.
  function splitSections(pairs) {
    const sections = {};
    let i = 0;
    while (i < pairs.length) {
      if (pairs[i].code === 0 && pairs[i].value === "SECTION") {
        // next pair is code 2 with section name
        const secName = (pairs[i + 1] && pairs[i + 1].code === 2)
          ? String(pairs[i + 1].value).trim()
          : "UNKNOWN";
        const bodyStart = i + 2;
        let j = bodyStart;
        while (j < pairs.length && !(pairs[j].code === 0 && pairs[j].value === "ENDSEC")) j++;
        sections[secName] = pairs.slice(bodyStart, j);
        i = j + 1;
      } else if (pairs[i].code === 0 && pairs[i].value === "EOF") {
        break;
      } else {
        i++;
      }
    }
    return sections;
  }

  // ---- MTEXT formatting cleanup ---------------------------------------------
  // AutoCAD stores MTEXT with codes like:
  //   {\fArial|b0|i0|c0|p34;actual text}
  //   \P    (paragraph break)
  //   \\    (literal backslash)
  //   \~    (non-breaking space)
  // We strip the format codes and keep just the visible text.
  function cleanMtext(s) {
    if (s == null) return "";
    s = String(s);
    // Remove group {...} format codes (but keep their content)
    // The brace is the MTEXT "group format" opener; the format codes end at ';'
    let out = "";
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === "\\" && i + 1 < s.length) {
        const next = s[i + 1];
        if (next === "\\") { out += "\\"; i += 2; continue; }
        if (next === "P") { out += " "; i += 2; continue; }       // paragraph break → space
        if (next === "~") { out += " "; i += 2; continue; }       // non-breaking space
        if (next === "S") {
          // \Sxxx_yyy\  → stacked text; keep both halves joined with /
          const end = s.indexOf(";", i);
          if (end > 0) {
            const inner = s.slice(i + 2, end).replace(/_/g, "/");
            out += inner;
            i = end + 1;
            continue;
          }
        }
        // Other backslash codes: \f, \H, \W, \T, \Q, \A, \C — skip the code,
        // but stop at ';' if it's a brace-group code
        if ("fHWTAQC".indexOf(next) >= 0) {
          // find next ';' or end of string
          const end = s.indexOf(";", i + 2);
          if (end > 0) { i = end + 1; continue; }
        }
        // Unknown escape — drop the backslash
        i++; continue;
      }
      if (c === "{" || c === "}") { i++; continue; }  // drop braces themselves
      out += c;
      i++;
    }
    return out.trim();
  }

  // Read one entity from a body starting at a code-0 marker.
  function readEntity(pairs, start) {
    if (start >= pairs.length || pairs[start].code !== 0) return null;
    const type = pairs[start].value;
    const e = { type, raw: [] };

    let i = start + 1;
    while (i < pairs.length && pairs[i].code !== 0) {
      const p = pairs[i];
      const v = val(p.code, p.value);

      // LWPOLYLINE: collect repeating (10, 20) pairs as vertices.
      // Must be handled BEFORE the generic 10/20 case.
      if (type === "LWPOLYLINE") {
        if (p.code === 10) {
          e.verts = e.verts || [];
          e.verts.push({ x: v, y: 0 });
          e.raw.push(p); i++;
          continue;
        }
        if (p.code === 20 && e.verts && e.verts.length) {
          e.verts[e.verts.length - 1].y = v;
          e.raw.push(p); i++;
          continue;
        }
      }

      // POLYLINE / 3D: vertices are separate VERTEX entities that come AFTER
      // the POLYLINE head. We capture the header here; vertices get appended
      // by readEntities() when it sees them.
      switch (true) {
        case p.code === 1:
          e.text = (type === "MTEXT") ? cleanMtext(p.value) : String(p.value).trim();
          break;
        case p.code === 2:  e.name = v; break;
        case p.code === 8:  e.layer = v; break;
        case p.code === 10: e.x = v; break;
        case p.code === 20: e.y = v; break;
        case p.code === 30: e.z = v; break;
        case p.code === 11: e.x2 = v; break;
        case p.code === 21: e.y2 = v; break;
        case p.code === 40: e.height = v; e.r = v; break;
        case p.code === 50: e.a0 = v; break;
        case p.code === 51: e.a1 = v; break;
        case p.code === 70: e.flag = v; break;
        case p.code === 62: e.color = v; break;
        case p.code === 6:  e.linetype = v; break;
        default: break;
      }
      e.raw.push(p);
      i++;
    }
    return { entity: e, next: i };
  }

  // Read all entities from a section body. POLYLINE 3D entities get their
  // vertices attached.
  function readEntities(body) {
    const list = [];
    let i = 0;
    let curPolyline = null;
    while (i < body.length) {
      if (body[i].code === 0) {
        const t = body[i].value;
        // SEQEND closes a POLYLINE
        if (t === "SEQEND") {
          curPolyline = null;
          i++;
          while (i < body.length && body[i].code !== 0) i++;
          continue;
        }
        // VERTEX belongs to the current POLYLINE (3D POLYLINE entity)
        if (t === "VERTEX" && curPolyline) {
          // Find the X (10) and Y (20) of this vertex
          let vx = 0, vy = 0;
          for (let j = i + 1; j < body.length && body[j].code !== 0; j++) {
            if (body[j].code === 10) vx = val(10, body[j].value);
            else if (body[j].code === 20) vy = val(20, body[j].value);
          }
          curPolyline.verts = curPolyline.verts || [];
          curPolyline.verts.push({ x: vx, y: vy });
          i++;
          while (i < body.length && body[i].code !== 0) i++;
          continue;
        }
        const r = readEntity(body, i);
        if (r) {
          if (r.entity.type === "POLYLINE") {
            curPolyline = r.entity;
            curPolyline.verts = curPolyline.verts || [];
          }
          list.push(r.entity);
          i = r.next;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    return list;
  }

  // Read a numeric group code from a body slice starting at index i.
  function numCodeRaw(body, start, code) {
    for (let j = start; j < body.length; j++) {
      if (body[j].code === 0) break;
      if (body[j].code === code) return val(code, body[j].value);
    }
    return 0;
  }

  // ---- BLOCKS section -------------------------------------------------------
  // Each block looks like:
  //   0 BLOCK  8 layer  2 NAME  70 flags  10/20/30 basepoint
  //   <entities inside the block>
  //   0 ENDBLK  5 ...  8 layer
  // POLYLINE 3D entities inside a block have their VERTEXes attached.
  function readBlocks(body) {
    const blocks = {};
    let i = 0;
    while (i < body.length) {
      if (body[i].code === 0 && body[i].value === "BLOCK") {
        const blockEnts = [];
        let name = null;
        let baseX = 0, baseY = 0;
        let j = i + 1;
        while (j < body.length && body[j].code !== 0) {
          if (body[j].code === 2) name = String(body[j].value).trim();
          else if (body[j].code === 10) baseX = val(10, body[j].value);
          else if (body[j].code === 20) baseY = val(20, body[j].value);
          j++;
        }
        // j now at the next code-0 (first entity of block, or ENDBLK)
        i = j;
        // Read entities until ENDBLK, with POLYLINE/VERTEX/SEQEND handling.
        let curPolyline = null;
        while (i < body.length && !(body[i].code === 0 && body[i].value === "ENDBLK")) {
          if (body[i].code === 0) {
            const t = body[i].value;
            if (t === "SEQEND") {
              curPolyline = null;
              i++;
              while (i < body.length && body[i].code !== 0) i++;
              continue;
            }
            if (t === "VERTEX" && curPolyline) {
              let vx = 0, vy = 0;
              for (let k = i + 1; k < body.length && body[k].code !== 0; k++) {
                if (body[k].code === 10) vx = val(10, body[k].value);
                else if (body[k].code === 20) vy = val(20, body[k].value);
              }
              curPolyline.verts = curPolyline.verts || [];
              curPolyline.verts.push({ x: vx, y: vy });
              i++;
              while (i < body.length && body[i].code !== 0) i++;
              continue;
            }
            const r = readEntity(body, i);
            if (r) {
              if (r.entity.type === "POLYLINE") {
                curPolyline = r.entity;
                curPolyline.verts = curPolyline.verts || [];
              }
              blockEnts.push(r.entity);
              i = r.next;
              continue;
            }
          }
          i++;
        }
        // Skip ENDBLK tail pairs
        if (i < body.length) i++;
        while (i < body.length && body[i].code !== 0) i++;
        if (name) {
          blocks[name] = { entities: blockEnts, base: { x: baseX, y: baseY } };
        }
      } else {
        i++;
      }
    }
    return blocks;
  }

  // ---- TABLES section -------------------------------------------------------
  // We need the *Model_Space block record's handle so the new entities we
  // write will live in model space.
  function findModelSpaceOwner(tablesBody) {
    if (!tablesBody || !tablesBody.length) return "17";  // safe default
    // BLOCK_RECORD entries look like:
    //   0 BLOCK_RECORD  5 <handle>  100 AcDbSymbolTableRecord  100 AcDbBlockTableRecord  2 <name>
    let i = 0;
    while (i < tablesBody.length) {
      if (tablesBody[i].code === 0 && tablesBody[i].value === "BLOCK_RECORD") {
        let handle = null, name = null;
        let j = i + 1;
        while (j < tablesBody.length && tablesBody[j].code !== 0) {
          if (tablesBody[j].code === 5) handle = String(tablesBody[j].value).trim();
          else if (tablesBody[j].code === 2) name = String(tablesBody[j].value).trim();
          j++;
        }
        if (name === "*Model_Space" && handle) return handle;
        i = j;
      } else {
        i++;
      }
    }
    return "17";
  }

  // ---- Compute the bbox of a single entity (in absolute coordinates) -------
  function bumpEntity(e, bump) {
    switch (e.type) {
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (e.verts) e.verts.forEach(v => bump(v.x, v.y));
        break;
      }
      case "LINE": {
        const sx = numCode(e, 10), sy = numCode(e, 20);
        const ex = numCode(e, 11), ey = numCode(e, 21);
        bump(sx, sy); bump(ex, ey);
        break;
      }
      case "CIRCLE":
      case "ARC": {
        bump(e.x - e.r, e.y - e.r);
        bump(e.x + e.r, e.y + e.r);
        break;
      }
      case "ELLIPSE": {
        // Center (10/20), major axis endpoint (11/21), axis ratio (40).
        // For bbox we approximate using the major-axis length × ratio as radius.
        const cx = numCode(e, 10), cy = numCode(e, 20);
        const mx = numCode(e, 11), my = numCode(e, 21);
        const majorLen = Math.hypot(mx, my);
        const ratio = numCode(e, 40) || 1;
        const r = Math.max(majorLen, majorLen * ratio);
        bump(cx - r, cy - r); bump(cx + r, cy + r);
        break;
      }
      case "SPLINE": {
        // SPLINE has control points at codes (10, 20) repeating.
        if (e.raw) {
          for (const p of e.raw) {
            if (p.code === 10) bump(val(10, p.value), 0);
            if (p.code === 20) bump(0, val(20, p.value));
          }
        }
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const h = e.height || 3;
        const approxW = ((e.text || "").length || 1) * h * 0.6;
        bump(e.x, e.y);
        bump(e.x + approxW, e.y + h);
        break;
      }
      case "INSERT": {
        // Bbox is the block bbox translated to the insert point.
        // Without block info here we use a generous ±50mm.
        bump(e.x - 50, e.y - 50);
        bump(e.x + 50, e.y + 50);
        break;
      }
      case "POINT": {
        bump(e.x, e.y);
        break;
      }
      case "RAY":
      case "XLINE": {
        bump(numCode(e, 10), numCode(e, 20));
        bump(numCode(e, 11), numCode(e, 21));
        break;
      }
      // HATCH and others: we don't compute bbox; just trust other entities.
    }
  }

  function numCode(e, code) {
    if (!e.raw) return 0;
    for (const p of e.raw) {
      if (p.code === code) return val(p.code, p.value);
    }
    return 0;
  }

  // Compute the bbox of a block's contents (in block-local coordinates).
  // Used for accurate preview + layout placement.
  function blockBbox(block) {
    if (!block || !block.entities || !block.entities.length) {
      return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    }
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    const bump = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    };
    for (const be of block.entities) bumpEntity(be, bump);
    if (!isFinite(xMin)) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    return { xMin, yMin, xMax, yMax };
  }

  // ---- Find max handle in DXF text (so new handles won't collide) ----------
  function findMaxHandle(pairs) {
    let maxH = 0x100;  // safe minimum
    for (const p of pairs) {
      if (p.code === 5) {
        const h = parseInt(String(p.value).trim(), 16);
        if (!isNaN(h) && h > maxH) maxH = h;
      }
    }
    return maxH;
  }

  // ---- Public parse function ----------------------------------------------
  function parse(text) {
    const pairs = tokenize(text);
    const sections = splitSections(pairs);

    const blocks = sections.BLOCKS ? readBlocks(sections.BLOCKS) : {};
    const entities = sections.ENTITIES ? readEntities(sections.ENTITIES) : [];
    const modelSpaceOwner = sections.TABLES
      ? findModelSpaceOwner(sections.TABLES)
      : "17";
    const maxHandle = findMaxHandle(pairs);

    // Compute model-space bbox
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    const bump = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    };
    for (const e of entities) bumpEntity(e, bump);
    if (!isFinite(xMin)) {
      xMin = 0; yMin = 0; xMax = 100; yMax = 100;
    }

    // Pre-compute each block's bbox for fast lookup later.
    const blockBboxes = {};
    for (const name in blocks) {
      blockBboxes[name] = blockBbox(blocks[name]);
    }

    return {
      rawText: text,
      sections,
      blocks,
      blockBboxes,
      entities,
      modelSpaceOwner,
      maxHandle,
      bbox: { xMin, yMin, xMax, yMax },
    };
  }

  return { parse, cleanMtext, blockBbox };
})();
