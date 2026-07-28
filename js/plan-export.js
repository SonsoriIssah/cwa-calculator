// plan-export.js — renders the currently selected plan as a downloadable PNG
// or PDF. Both reuse the same <canvas> render: PNG saves it directly, PDF
// embeds it as an image via jsPDF (js/vendor/jspdf.umd.min.js).

const EXPORT_COLORS = {
  text: "#1c2230",
  muted: "#6b7280",
  border: "#e2e5eb",
  headerBg: "#f6f7fb",
  rowAltBg: "#fafbfd",
  primary: "#2f5cf5",
  danger: "#d9455f",
  warn: "#b5720f",
};

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function targetColor(course) {
  if (course.impossible) return EXPORT_COLORS.danger;
  if (course.capped) return EXPORT_COLORS.warn;
  if (course.flagged) return EXPORT_COLORS.danger;
  return EXPORT_COLORS.text;
}

function targetLabel(course) {
  if (course.impossible) return `${course.target}+`;
  if (course.capped) return `${course.target} (capped)`;
  return String(course.target);
}

function renderPlanCanvas(meta) {
  const width = 680;
  const padding = 32;
  const colGap = 12;
  const creditsColWidth = 70;
  const targetColWidth = 110;
  const courseColWidth = width - padding * 2 - creditsColWidth - targetColWidth - colGap * 2;
  const lineHeight = 18;
  const rowPadding = 10;
  const headerFont = "600 12px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const bodyFont = "13px -apple-system, Segoe UI, Roboto, Arial, sans-serif";

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  mctx.font = bodyFont;

  const rows = meta.courses.map((c) => ({
    course: c,
    lines: wrapText(mctx, c.course_name, courseColWidth),
  }));
  const rowHeights = rows.map((r) => Math.max(1, r.lines.length) * lineHeight + rowPadding);

  const headerBlockHeight = 190; // title + subtitle + plan label + description + 3 stat lines
  const tableHeaderHeight = 30;
  const tableHeight = rowHeights.reduce((s, h) => s + h, 0);
  const footerHeight = 40;
  const height = headerBlockHeight + tableHeaderHeight + tableHeight + footerHeight;

  const canvas = document.createElement("canvas");
  const scale = 2; // render at 2x for a crisp download
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let y = padding;
  ctx.fillStyle = EXPORT_COLORS.text;
  ctx.font = "700 20px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText("CWA Target Calculator", padding, y);
  y += 24;

  ctx.font = "13px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = EXPORT_COLORS.muted;
  ctx.fillText(meta.subtitle, padding, y);
  y += 26;

  ctx.font = "700 16px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = EXPORT_COLORS.primary;
  ctx.fillText(meta.planLabel, padding, y);
  y += 20;

  ctx.font = "12px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = EXPORT_COLORS.muted;
  wrapText(mctx, meta.description, width - padding * 2).forEach((line) => {
    ctx.fillText(line, padding, y);
    y += 15;
  });
  y += 8;

  ctx.font = "13px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = EXPORT_COLORS.text;
  ctx.fillText(`Your goal — cumulative CWA: ${meta.desiredCwaText}`, padding, y);
  y += 18;
  ctx.fillText(`Required average this semester: ${meta.requiredAverageText}`, padding, y);
  y += 18;
  ctx.fillStyle = EXPORT_COLORS.primary;
  ctx.font = "700 13px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(`Projected cumulative CWA if you hit these targets: ${meta.projectedCwaText}`, padding, y);
  y += 20;

  // Table header
  ctx.fillStyle = EXPORT_COLORS.headerBg;
  ctx.fillRect(padding, y, width - padding * 2, tableHeaderHeight);
  ctx.fillStyle = EXPORT_COLORS.muted;
  ctx.font = headerFont;
  const courseX = padding + 10;
  const creditsX = padding + courseColWidth + colGap;
  const targetX = creditsX + creditsColWidth + colGap;
  ctx.fillText("COURSE", courseX, y + 19);
  ctx.fillText("CREDITS", creditsX, y + 19);
  ctx.fillText("TARGET", targetX, y + 19);
  y += tableHeaderHeight;

  rows.forEach((row, i) => {
    const rowHeight = rowHeights[i];
    if (i % 2 === 1) {
      ctx.fillStyle = EXPORT_COLORS.rowAltBg;
      ctx.fillRect(padding, y, width - padding * 2, rowHeight);
    }
    ctx.font = bodyFont;
    ctx.fillStyle = EXPORT_COLORS.text;
    row.lines.forEach((line, li) => {
      ctx.fillText(line, courseX, y + lineHeight * (li + 1) + 2);
    });
    const midY = y + rowHeight / 2 + 4;
    ctx.fillText(String(row.course.credits), creditsX, midY);
    ctx.fillStyle = targetColor(row.course);
    ctx.font = "600 13px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(targetLabel(row.course), targetX, midY);

    ctx.strokeStyle = EXPORT_COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, y + rowHeight);
    ctx.lineTo(width - padding, y + rowHeight);
    ctx.stroke();

    y += rowHeight;
  });

  y += 24;
  ctx.font = "11px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = EXPORT_COLORS.muted;
  ctx.fillText(`Generated ${new Date().toLocaleDateString()}`, padding, y);

  return canvas;
}

function downloadCanvasAsPng(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// Embeds the plan canvas as a full-page image in a PDF sized to match it,
// and saves it directly — no print dialog, no popup window. Sized in points
// (1px = 0.75pt at the standard 96 DPI). Orientation must be passed
// explicitly: jsPDF otherwise defaults to portrait and silently swaps the
// custom format's width/height to match, clipping a wide image like ours.
function downloadPlanAsPdf(meta, filename) {
  const canvas = renderPlanCanvas(meta);
  const widthPx = parseFloat(canvas.style.width);
  const heightPx = parseFloat(canvas.style.height);
  const widthPt = widthPx * 0.75;
  const heightPt = heightPx * 0.75;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: widthPt >= heightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [widthPt, heightPt],
  });
  // JPEG (no alpha channel) so jsPDF embeds a compressed stream instead of
  // the raw RGBA bitmap it falls back to for PNGs with transparency.
  doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, widthPt, heightPt);
  doc.save(filename);
}

window.PlanExport = {
  renderPlanCanvas,
  downloadCanvasAsPng,
  downloadPlanAsPdf,
};
