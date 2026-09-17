/* convert.js — HEIC 변환, 이미지 로드, 색보정, 리사이즈/압축, EXIF 제거
 * EXIF 제거 원리: 모든 출력은 canvas 재인코딩을 거치므로 메타데이터가 승계되지 않는다.
 */
window.SnapLab = window.SnapLab || {};

(function () {
  'use strict';

  var PREVIEW_LONG = 1600;   // 검출·미리보기 축소본 긴 변
  var THUMB = 96;

  function isHeic(file) {
    var n = (file.name || '').toLowerCase();
    return file.type === 'image/heic' || file.type === 'image/heif' ||
           /\.hei[cf]$/.test(n);
  }

  function isSupported(file) {
    var n = (file.name || '').toLowerCase();
    return isHeic(file) ||
      /^image\/(jpeg|png|webp)$/.test(file.type) ||
      /\.(jpe?g|png|webp)$/.test(n);
  }

  /* HEIC → JPEG. 그 외는 그대로 통과. */
  function toWebSafeBlob(file) {
    if (!isHeic(file)) return Promise.resolve(file);
    if (typeof window.heic2any !== 'function') {
      return Promise.reject(new Error('heic2any not loaded'));
    }
    return window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
      .then(function (out) { return Array.isArray(out) ? out[0] : out; });
  }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('image load failed')); };
      img.decoding = 'sync';
      img.src = src;
    });
  }

  function loadImageFromBlob(blob) {
    var url = URL.createObjectURL(blob);
    return loadImage(url).then(function (img) {
      img.__objectURL = url;
      return img;
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  function releaseImage(img) {
    if (img && img.__objectURL) { URL.revokeObjectURL(img.__objectURL); img.__objectURL = null; }
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ctx.filter 문자열. adjust = {b,c,s} (100 기준) */
  function adjustFilter(adj) {
    if (!adj) return 'none';
    var b = (adj.b == null ? 100 : adj.b) / 100;
    var c = (adj.c == null ? 100 : adj.c) / 100;
    var s = (adj.s == null ? 100 : adj.s) / 100;
    if (b === 1 && c === 1 && s === 1) return 'none';
    return 'brightness(' + b + ') contrast(' + c + ') saturate(' + s + ')';
  }

  function isNeutral(adj) { return adjustFilter(adj) === 'none'; }

  /* 원본 img를 지정 크기로, 색보정 적용해 캔버스에 그림 */
  function drawAdjusted(img, w, h, adj) {
    var c = makeCanvas(w, h);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.filter = adjustFilter(adj);
    g.drawImage(img, 0, 0, c.width, c.height);
    g.filter = 'none';
    return c;
  }

  function previewSize(w, h, longEdge) {
    var L = longEdge || PREVIEW_LONG;
    var s = Math.min(1, L / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) {
        if (b) res(b); else rej(new Error('toBlob failed'));
      }, mime, quality);
    });
  }

  /* 목표 용량(KB)에 맞춰 품질을 이분 탐색. 최후엔 축소까지 시도. */
  function encodeToTarget(canvas, mime, quality, targetKB) {
    var q = Math.max(0.05, Math.min(1, quality));
    if (mime !== 'image/jpeg' || !targetKB) return canvasToBlob(canvas, mime, q);

    var limit = targetKB * 1024;

    function search(cv, hiQ) {
      return canvasToBlob(cv, mime, hiQ).then(function (b0) {
        if (b0.size <= limit) return b0;
        var lo = 0.28, hi = hiQ, best = null, i = 0;
        function step() {
          if (i++ >= 7) return Promise.resolve(best);
          var mid = (lo + hi) / 2;
          return canvasToBlob(cv, mime, mid).then(function (b) {
            if (b.size <= limit) { best = b; lo = mid; } else { hi = mid; }
            return step();
          });
        }
        return step().then(function (r) { return r || canvasToBlob(cv, mime, 0.28); });
      });
    }

    function attempt(cv, round) {
      return search(cv, q).then(function (b) {
        if (b.size <= limit || round >= 4) return b;
        var nw = Math.max(200, Math.round(cv.width * 0.82));
        var nh = Math.max(150, Math.round(cv.height * 0.82));
        var next = makeCanvas(nw, nh);
        var g = next.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(cv, 0, 0, nw, nh);
        return attempt(next, round + 1);
      });
    }

    return attempt(canvas, 0);
  }

  /* 긴 변 기준 리사이즈 (확대는 하지 않음) */
  function resizeCanvas(srcCanvasOrImg, longEdge) {
    var w = srcCanvasOrImg.width || srcCanvasOrImg.naturalWidth;
    var h = srcCanvasOrImg.height || srcCanvasOrImg.naturalHeight;
    if (!longEdge || Math.max(w, h) <= longEdge) return srcCanvasOrImg;
    var s = longEdge / Math.max(w, h);
    var c = makeCanvas(w * s, h * s);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(srcCanvasOrImg, 0, 0, c.width, c.height);
    return c;
  }

  function rotate90(srcCanvasOrImg) {
    var w = srcCanvasOrImg.width || srcCanvasOrImg.naturalWidth;
    var h = srcCanvasOrImg.height || srcCanvasOrImg.naturalHeight;
    var c = makeCanvas(h, w);
    var g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    g.rotate(Math.PI / 2);
    g.drawImage(srcCanvasOrImg, -w / 2, -h / 2, w, h);
    return c;
  }

  function flipH(srcCanvasOrImg) {
    var w = srcCanvasOrImg.width || srcCanvasOrImg.naturalWidth;
    var h = srcCanvasOrImg.height || srcCanvasOrImg.naturalHeight;
    var c = makeCanvas(w, h);
    var g = c.getContext('2d');
    g.translate(w, 0);
    g.scale(-1, 1);
    g.drawImage(srcCanvasOrImg, 0, 0, w, h);
    return c;
  }

  function cropCanvas(src, x, y, w, h) {
    var c = makeCanvas(w, h);
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  function thumbDataURL(imgOrCanvas) {
    var w = imgOrCanvas.width || imgOrCanvas.naturalWidth;
    var h = imgOrCanvas.height || imgOrCanvas.naturalHeight;
    var s = Math.min(1, THUMB / Math.max(w, h));
    var c = makeCanvas(w * s, h * s);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'medium';
    g.drawImage(imgOrCanvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  }

  function extFor(mime) { return mime === 'image/png' ? 'png' : 'jpg'; }

  function baseName(name) { return String(name || 'image').replace(/\.[^.]+$/, ''); }

  function sanitize(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim(); }

  SnapLab.convert = {
    PREVIEW_LONG: PREVIEW_LONG,
    isHeic: isHeic,
    isSupported: isSupported,
    toWebSafeBlob: toWebSafeBlob,
    loadImage: loadImage,
    loadImageFromBlob: loadImageFromBlob,
    releaseImage: releaseImage,
    makeCanvas: makeCanvas,
    adjustFilter: adjustFilter,
    isNeutral: isNeutral,
    drawAdjusted: drawAdjusted,
    previewSize: previewSize,
    canvasToBlob: canvasToBlob,
    encodeToTarget: encodeToTarget,
    resizeCanvas: resizeCanvas,
    rotate90: rotate90,
    flipH: flipH,
    cropCanvas: cropCanvas,
    thumbDataURL: thumbDataURL,
    extFor: extFor,
    baseName: baseName,
    sanitize: sanitize
  };
})();
