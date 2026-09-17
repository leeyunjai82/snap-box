/* export.js — ZIP, PDF(1장/페이지), 콘택트시트 PDF, 전/후 합치기, 파일명 규칙
 * 모든 출력은 캔버스 재인코딩을 거치므로 EXIF(GPS 포함)가 남지 않는다.
 */
window.SnapLab = window.SnapLab || {};

(function () {
  'use strict';

  var C = SnapLab.convert;

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* {school} {project} {date} {n} {orig} */
  function buildName(template, vars, mime) {
    var t = template && template.trim() ? template : '{orig}';
    var s = t.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'n') return String(vars.n).padStart(2, '0');
      return C.sanitize(vars[k] != null ? vars[k] : '');
    });
    s = s.replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
    if (!s) s = 'image';
    return s + '.' + C.extFor(mime);
  }

  function zip(files) {
    var z = new JSZip();
    files.forEach(function (f) { z.file(f.name, f.blob); });
    return z.generateAsync({ type: 'blob', compression: 'STORE' });
  }

  /* ── PDF 공통 ──────────────────────────────────────────── */
  var A4 = { w: 210, h: 297 };   // mm, 세로

  function newPdf() {
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  }

  function canvasJpeg(canvas, q) { return canvas.toDataURL('image/jpeg', q == null ? 0.85 : q); }

  /* 원본 캔버스를 PDF 배치용으로 적당히 줄인다 (용량 방지) */
  function downscaleForPdf(src, maxPx) {
    return C.resizeCanvas(src, maxPx || 1400);
  }

  function fitBox(iw, ih, bw, bh) {
    var s = Math.min(bw / iw, bh / ih);
    return { w: iw * s, h: ih * s };
  }

  /* pages: [{canvas, caption}] — 1장/페이지 */
  function photoPdf(pages, header) {
    var pdf = newPdf();
    var M = 12;
    var capH = 8;
    pages.forEach(function (p, i) {
      if (i > 0) pdf.addPage();
      var top = M;
      if (header) {
        pdf.setFontSize(9); pdf.setTextColor(90);
        pdf.text(header, M, top + 2);
        top += 6;
      }
      var bw = A4.w - M * 2;
      var bh = A4.h - top - M - capH;
      var cv = downscaleForPdf(p.canvas, 1800);
      var f = fitBox(cv.width, cv.height, bw, bh);
      pdf.addImage(canvasJpeg(cv, 0.86), 'JPEG', M + (bw - f.w) / 2, top, f.w, f.h, undefined, 'FAST');
      if (p.caption) {
        pdf.setFontSize(8); pdf.setTextColor(120);
        pdf.text(p.caption, A4.w / 2, top + f.h + 5, { align: 'center' });
      }
    });
    return pdf;
  }

  /* 콘택트시트: A4 세로, 2x2 또는 2x3, 각 칸 아래 파일명 캡션 */
  function contactSheet(items, layout, header) {
    var cols = 2;
    var rows = layout === '2x3' ? 3 : 2;
    var per = cols * rows;
    var pdf = newPdf();
    var M = 12, GAP = 6, HEAD = header ? 12 : 0, CAP = 6;

    var gridW = A4.w - M * 2;
    var gridH = A4.h - M * 2 - HEAD;
    var cellW = (gridW - GAP * (cols - 1)) / cols;
    var cellH = (gridH - GAP * (rows - 1)) / rows;
    var imgH = cellH - CAP;

    for (var i = 0; i < items.length; i++) {
      var slot = i % per;
      if (i > 0 && slot === 0) pdf.addPage();
      if (slot === 0 && header) {
        pdf.setFontSize(11); pdf.setTextColor(40);
        pdf.text(header, M, M + 5);
        pdf.setDrawColor(200); pdf.line(M, M + 8, A4.w - M, M + 8);
      }
      var r = Math.floor(slot / cols), c = slot % cols;
      var x = M + c * (cellW + GAP);
      var y = M + HEAD + r * (cellH + GAP);

      var cv = downscaleForPdf(items[i].canvas, 1000);
      var f = fitBox(cv.width, cv.height, cellW, imgH);
      pdf.addImage(canvasJpeg(cv, 0.8), 'JPEG',
        x + (cellW - f.w) / 2, y + (imgH - f.h) / 2, f.w, f.h, undefined, 'FAST');

      pdf.setFontSize(7); pdf.setTextColor(110);
      var cap = items[i].caption || '';
      pdf.text(cap, x + cellW / 2, y + imgH + 4, { align: 'center', maxWidth: cellW });
    }
    return pdf;
  }

  /* 전/후 합치기: 두 캔버스를 높이 맞춰 좌우로 나란히 */
  function mergeSideBySide(a, b, gap, bgColor) {
    gap = gap == null ? 16 : gap;
    var h = Math.max(a.height, b.height);
    var aw = Math.round(a.width * (h / a.height));
    var bw = Math.round(b.width * (h / b.height));
    var out = C.makeCanvas(aw + bw + gap, h);
    var g = out.getContext('2d');
    g.fillStyle = bgColor || '#ffffff';
    g.fillRect(0, 0, out.width, out.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(a, 0, 0, aw, h);
    g.drawImage(b, aw + gap, 0, bw, h);
    return out;
  }

  SnapLab.exporter = {
    saveBlob: saveBlob,
    buildName: buildName,
    zip: zip,
    photoPdf: photoPdf,
    contactSheet: contactSheet,
    mergeSideBySide: mergeSideBySide
  };
})();
