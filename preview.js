/* preview.js
 * Hardened canvas preview.
 *  - Outlines only (no fills) so closed polylines render as rectangles.
 *  - Auto-extending bbox includes the new layout so it's always visible.
 *  - Accurate block bounding boxes (from parser's blockBboxes).
 *  - Handles POLYLINE 3D (vertices collected by parser).
 *  - Handles ARC, ELLIPSE, SPLINE, POINT, RAY, XLINE.
 *  - Scale-aware line width.
 *  - Insertion points marked with Versigent-orange "+".
 */

window.Preview = (function () {

  function ensureCtx(canvas) {
    canvas = (typeof canvas === "string") ? document.getElementById(canvas) : canvas;
    return canvas.getContext("2d");
  }

  function numCode(e, code) {
    if (!e.raw) return 0;
    for (const p of e.raw) {
      if (p.code === code) return parseFloat(p.value) || 0;
    }
    return 0;
  }

  // Apply (block-bbox-aware) bounds to a list of overlays.
  function computeViewBbox(parsed, extra) {
    let { xMin, yMin, xMax, yMax } = parsed.bbox;
    if (extra && extra.length) {
      for (const o of extra) {
        if (o.kind === "rect") {
          xMin = Math.min(xMin, o.x0); yMin = Math.min(yMin, o.y0);
          xMax = Math.max(xMax, o.x1); yMax = Math.max(yMax, o.y1);
        } else if (o.kind === "text") {
          yMax = Math.max(yMax, o.y + 5);
          yMin = Math.min(yMin, o.y - 5);
        } else if (o.kind === "insert") {
          const bb = parsed.blockBboxes && parsed.blockBboxes[o.blockName];
          if (bb) {
            xMin = Math.min(xMin, o.cx + bb.xMin);
            yMin = Math.min(yMin, o.cy + bb.yMin);
            xMax = Math.max(xMax, o.cx + bb.xMax);
            yMax = Math.max(yMax, o.cy + bb.yMax);
          } else {
            xMin = Math.min(xMin, o.cx - 25);
            yMin = Math.min(yMin, o.cy - 25);
            xMax = Math.max(xMax, o.cx + 25);
            yMax = Math.max(yMax, o.cy + 25);
          }
        }
      }
    }
    return { xMin, yMin, xMax, yMax };
  }

  function draw(canvas, parsed, extra) {
    const ctx = ensureCtx(canvas);
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);

    const bb = computeViewBbox(parsed, extra);
    const padMM = 20;
    const drawW = (bb.xMax - bb.xMin) + 2 * padMM;
    const drawH = (bb.yMax - bb.yMin) + 2 * padMM;
    const scale = Math.min(W / drawW, H / drawH) * 0.92;
    const offsetX = (W - drawW * scale) / 2 - (bb.xMin - padMM) * scale;
    const offsetY = H - (H - drawH * scale) / 2 + (bb.yMin - padMM) * scale;
    const w2sX = x => x * scale + offsetX;
    const w2sY = y => offsetY - y * scale;
    const pxPerMm = scale;  // since we draw axes 1:1 with mm

    // Scale-aware line width: aim for ~1px on screen but never thinner than 0.6
    ctx.lineWidth = Math.max(0.6, Math.min(1.5, 1.0));
    ctx.strokeStyle = "#1F1F23";
    ctx.fillStyle = "#1F1F23";
    ctx.font = "12px -apple-system, sans-serif";

    // 1. Draw all model-space entities from the source DXF.
    for (const e of parsed.entities) {
      drawEntity(ctx, e, w2sX, w2sY, pxPerMm);
    }

    // 2. Draw block contents for INSERT entities.
    for (const e of parsed.entities) {
      if (e.type === "INSERT" && parsed.blocks[e.name]) {
        const block = parsed.blocks[e.name];
        ctx.save();
        ctx.translate(w2sX(e.x), w2sY(e.y));
        ctx.scale(scale, -scale);
        for (const be of block.entities) {
          drawBlockEntity(ctx, be);
        }
        ctx.restore();
        // Mark the insertion point with a small orange "+".
        ctx.strokeStyle = "#CE7926";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ix = w2sX(e.x), iy = w2sY(e.y);
        ctx.moveTo(ix - 5, iy);
        ctx.lineTo(ix + 5, iy);
        ctx.moveTo(ix, iy - 5);
        ctx.lineTo(ix, iy + 5);
        ctx.stroke();
        ctx.strokeStyle = "#1F1F23";
        ctx.lineWidth = Math.max(0.6, Math.min(1.5, 1.0));
      }
    }

    // 3. Draw the overlay (new layout tables), if any.
    if (extra && extra.length) {
      for (const o of extra) {
        if (o.kind === "rect") {
          ctx.beginPath();
          ctx.moveTo(w2sX(o.x0), w2sY(o.y0));
          ctx.lineTo(w2sX(o.x1), w2sY(o.y0));
          ctx.lineTo(w2sX(o.x1), w2sY(o.y1));
          ctx.lineTo(w2sX(o.x0), w2sY(o.y1));
          ctx.closePath();
          ctx.strokeStyle = "#CE7926";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.strokeStyle = "#1F1F23";
          ctx.lineWidth = Math.max(0.6, Math.min(1.5, 1.0));
        } else if (o.kind === "text") {
          ctx.fillStyle = "#1F1F23";
          ctx.font = "13px -apple-system, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(o.text, w2sX(o.cx), w2sY(o.y));
          ctx.textAlign = "left";
        } else if (o.kind === "insert" && parsed.blocks[o.blockName]) {
          ctx.save();
          ctx.translate(w2sX(o.cx), w2sY(o.cy));
          ctx.scale(scale, -scale);
          for (const be of parsed.blocks[o.blockName].entities) {
            drawBlockEntity(ctx, be);
          }
          ctx.restore();
        }
      }
    }
  }

  function drawEntity(ctx, e, w2sX, w2sY, pxPerMm) {
    switch (e.type) {
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (!e.verts || e.verts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(w2sX(e.verts[0].x), w2sY(e.verts[0].y));
        for (let i = 1; i < e.verts.length; i++) {
          ctx.lineTo(w2sX(e.verts[i].x), w2sY(e.verts[i].y));
        }
        if (e.flag & 1) ctx.closePath();
        ctx.stroke();
        break;
      }
      case "LINE": {
        const sx = numCode(e, 10), sy = numCode(e, 20);
        const ex = numCode(e, 11), ey = numCode(e, 21);
        ctx.beginPath();
        ctx.moveTo(w2sX(sx), w2sY(sy));
        ctx.lineTo(w2sX(ex), w2sY(ey));
        ctx.stroke();
        break;
      }
      case "CIRCLE": {
        const r = (e.r || 1) * Math.abs(pxPerMm);
        ctx.beginPath();
        ctx.arc(w2sX(e.x), w2sY(e.y), r, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      }
      case "ARC": {
        const r = (e.r || 1) * Math.abs(pxPerMm);
        const a0 = ((e.a0 || 0)) * Math.PI / 180;
        const a1 = ((e.a1 || 0)) * Math.PI / 180;
        // Canvas Y is flipped, so we negate angles and draw clockwise.
        ctx.beginPath();
        ctx.arc(w2sX(e.x), w2sY(e.y), r, -a1, -a0);
        ctx.stroke();
        break;
      }
      case "ELLIPSE": {
        const cx = numCode(e, 10), cy = numCode(e, 20);
        const mx = numCode(e, 11), my = numCode(e, 21);
        const majorLen = Math.hypot(mx, my);
        const angle = Math.atan2(my, mx);
        const ratio = numCode(e, 40) || 1;
        ctx.save();
        ctx.translate(w2sX(cx), w2sY(cy));
        ctx.scale(Math.abs(pxPerMm), -Math.abs(pxPerMm));
        ctx.rotate(-angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, majorLen, majorLen * ratio, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "POINT": {
        ctx.beginPath();
        ctx.arc(w2sX(e.x), w2sY(e.y), 2, 0, 2 * Math.PI);
        ctx.fillStyle = "#1F1F23";
        ctx.fill();
        break;
      }
      case "RAY":
      case "XLINE": {
        const sx = numCode(e, 10), sy = numCode(e, 20);
        const ex = numCode(e, 11), ey = numCode(e, 21);
        // Extend the line beyond the canvas
        const dx = ex - sx, dy = ey - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        ctx.beginPath();
        ctx.moveTo(w2sX(sx - ux * 5000), w2sY(sy - uy * 5000));
        ctx.lineTo(w2sX(ex + ux * 5000), w2sY(ey + uy * 5000));
        ctx.stroke();
        break;
      }
      case "TEXT":
      case "MTEXT": {
        ctx.fillStyle = "#1F1F23";
        const h = (e.height || 3) * Math.abs(pxPerMm);
        ctx.font = h.toFixed(1) + "px -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(e.text || "", w2sX(e.x), w2sY(e.y));
        break;
      }
      // SPLINE / HATCH: not rendered in preview (preserved in output).
    }
  }

  function drawBlockEntity(ctx, e) {
    switch (e.type) {
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (!e.verts || e.verts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(e.verts[0].x, e.verts[0].y);
        for (let i = 1; i < e.verts.length; i++) {
          ctx.lineTo(e.verts[i].x, e.verts[i].y);
        }
        if (e.flag & 1) ctx.closePath();
        ctx.stroke();
        break;
      }
      case "LINE": {
        const sx = numCode(e, 10), sy = numCode(e, 20);
        const ex = numCode(e, 11), ey = numCode(e, 21);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        break;
      }
      case "CIRCLE": {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r || 1, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      }
      case "ARC": {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r || 1,
                ((e.a0 || 0)) * Math.PI / 180,
                ((e.a1 || 0)) * Math.PI / 180);
        ctx.stroke();
        break;
      }
    }
  }

  // Build the overlay array from Automate output (found[] + layout).
  function buildOverlay(found, layout) {
    const overlay = [];
    let curX = layout.rowX;
    for (const item of found) {
      const x0 = curX, y0 = layout.rowY;
      const x1 = curX + layout.slotW, y1 = layout.rowY + layout.slotH;
      overlay.push({ kind: "rect", x0, y0, x1, y1 });
      if (item.blockName) {
        overlay.push({
          kind: "insert",
          blockName: item.blockName,
          cx: x0 + layout.slotW / 2,
          cy: y0 + layout.slotH / 2,
        });
      }
      overlay.push({
        kind: "text",
        text: item.name,
        cx: x0 + layout.slotW / 2,
        y: layout.textY,
      });
      curX += layout.slotW + layout.gap;
    }
    return overlay;
  }

  return { draw, buildOverlay, computeViewBbox };
})();
