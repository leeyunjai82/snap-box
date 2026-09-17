/* face.js — MediaPipe FaceDetector 검출 + 가림(마스크) 렌더링
 * 좌표계는 호출자가 정한다(미리보기 px 또는 원본 px). 이 모듈은 넘겨받은 좌표계를
 * 그대로 쓰므로, 같은 def를 미리보기/원본 양쪽에 쓸 수 있다.
 */
window.SnapLab = window.SnapLab || {};

(function () {
  'use strict';

  var C = SnapLab.convert;

  // 전부 셀프호스팅 — 실행 중 바깥으로 나가는 요청이 없다.
  //
  // 경로를 document.baseURI 기준으로 직접 푼다. classic script 안의 동적 import() 는
  // 문서가 아니라 '그 스크립트 파일' 을 기준으로 상대경로를 풀기 때문에,
  // './vendor/...' 라고 적으면 js/vendor/... 를 찾아가 404 가 난다.
  // 절대경로('/vendor/...')는 하위 경로 배포(GitHub Pages)에서 깨지므로 쓰지 않는다.
  function url(rel) { return new URL(rel, document.baseURI).href; }

  var TASKS_VISION = url('vendor/tasks-vision/vision_bundle.mjs'); // 라이브러리
  var WASM_DIR     = url('models');                                // wasm 런타임
  var MODEL_URL    = url('models/blaze_face_short_range.tflite');  // 얼굴 찾기 모델

  var EXPAND = 0.15;      // 검출 박스 상하좌우 15% 확장
  var MAX_COLS = 8;       // 모자이크 블록은 박스 폭의 1/8보다 작아지지 않는다
  var DEFAULT_COLS = 5;   // 기본값은 상한(8칸)보다 강하게 잡는다

  /* ── 기본 아이콘 (assets/icons/*.svg 와 동일 내용) ────────────────
   * 캔버스 오염(tainted canvas)을 피하려고 data: URI 로 내장한다.
   * file:// 로 열었을 때 로컬 SVG를 읽으면 toBlob()이 SecurityError 로 실패한다.
   * assets/icons/*.svg 를 고치면 여기도 같이 고쳐야 한다 (내용이 같아야 한다).
   */
  var ICON_SVG = {
    person:
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<circle cx="64" cy="64" r="58" fill="#FFFFFF" stroke="#1C2024" stroke-width="5"/>' +
      '<circle cx="64" cy="50" r="16" fill="#1F5F7A"/>' +
      '<path d="M34 98a30 26 0 0 1 60 0z" fill="#1F5F7A"/></svg>',
    smile:
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<circle cx="64" cy="64" r="58" fill="#FFFFFF" stroke="#1C2024" stroke-width="5"/>' +
      '<circle cx="50" cy="54" r="6" fill="#1F5F7A"/><circle cx="78" cy="54" r="6" fill="#1F5F7A"/>' +
      '<path d="M44 76q20 16 40 0" fill="none" stroke="#1F5F7A" stroke-width="7" stroke-linecap="round"/>' +
      '</svg>',
    star:
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<circle cx="64" cy="64" r="58" fill="#FFFFFF" stroke="#1C2024" stroke-width="5"/>' +
      '<path d="M64 28l10.5 22 24.5 3.5-17.5 17 4 24.5L64 83.5 42.5 95l4-24.5-17.5-17L53.5 50z" fill="#1F5F7A"/>' +
      '</svg>',
    flower:
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<circle cx="64" cy="64" r="58" fill="#FFFFFF" stroke="#1C2024" stroke-width="5"/>' +
      '<g fill="#1F5F7A"><circle cx="64" cy="40" r="15"/><circle cx="87" cy="57" r="15"/>' +
      '<circle cx="78" cy="84" r="15"/><circle cx="50" cy="84" r="15"/><circle cx="41" cy="57" r="15"/>' +
      '</g><circle cx="64" cy="64" r="11" fill="#FFFFFF"/></svg>',
    shield:
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<circle cx="64" cy="64" r="58" fill="#FFFFFF" stroke="#1C2024" stroke-width="5"/>' +
      '<path d="M64 28l32 12v22c0 20-14 31-32 38-18-7-32-18-32-38V40z" fill="#1F5F7A"/>' +
      '<path d="M52 66l9 9 17-18" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
  };

  var ICONS = Object.keys(ICON_SVG).map(function (id) {
    return { id: id, url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICON_SVG[id]) };
  });

  var iconCache = {};
  function iconImage(id) {
    if (iconCache[id]) return Promise.resolve(iconCache[id]);
    var found = null;
    for (var i = 0; i < ICONS.length; i++) if (ICONS[i].id === id) found = ICONS[i];
    if (!found) found = ICONS[0];
    return C.loadImage(found.url).then(function (img) { iconCache[found.id] = img; return img; });
  }
  function preloadIcons() { return Promise.all(ICONS.map(function (i) { return iconImage(i.id); })); }

  /* 사용자 업로드 대체 이미지 (dataURL 캐시) */
  var customCache = {};
  function customImage(dataURL) {
    if (!dataURL) return Promise.resolve(null);
    if (customCache[dataURL]) return Promise.resolve(customCache[dataURL]);
    return C.loadImage(dataURL).then(function (img) { customCache[dataURL] = img; return img; });
  }

  /* ── 검출기 ─────────────────────────────────────────────── */
  var detectorPromise = null;

  function getDetector() {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (function () {
      return import(TASKS_VISION).then(function (mod) {
        return mod.FilesetResolver.forVisionTasks(WASM_DIR).then(function (fileset) {
          function create(delegate) {
            return mod.FaceDetector.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_URL, delegate: delegate },
              runningMode: 'IMAGE',
              minDetectionConfidence: 0.2   // 낮게 잡고 슬라이더로 걸러낸다
            });
          }
          return create('GPU').catch(function () { return create('CPU'); });
        });
      });
    })();
    detectorPromise.catch(function () { detectorPromise = null; });
    return detectorPromise;
  }

  /* source: HTMLCanvasElement | HTMLImageElement (축소본 권장)
   * 반환: [{x,y,w,h,score,angle}] — source 픽셀 좌표계, 확장 전 */
  function detect(source) {
    return getDetector().then(function (det) {
      var res = det.detect(source);
      var sw = source.width || source.naturalWidth;
      var sh = source.height || source.naturalHeight;
      return (res.detections || []).map(function (d) {
        var bb = d.boundingBox;
        var score = (d.categories && d.categories[0] && d.categories[0].score) || 0;
        var angle = 0;
        var kp = d.keypoints;
        if (kp && kp.length >= 2) {
          // MediaPipe blaze_face: 0 = 오른쪽 눈, 1 = 왼쪽 눈 (정규화 좌표)
          var re = kp[0], le = kp[1];
          angle = Math.atan2((le.y - re.y) * sh, (le.x - re.x) * sw) * 180 / Math.PI;
          if (angle > 45 || angle < -45) angle = 0;   // 비정상값 무시
        }
        return {
          x: bb.originX, y: bb.originY, w: bb.width, h: bb.height,
          score: score, angle: angle
        };
      });
    });
  }

  /* 확장 + 신뢰도 필터 + 좌표계 변환(scale 배) */
  function toBoxes(raw, minScore, scale, limitW, limitH) {
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      if (d.score < minScore) continue;
      var w = d.w * (1 + EXPAND * 2);
      var h = d.h * (1 + EXPAND * 2);
      var cx = (d.x + d.w / 2) * scale;
      var cy = (d.y + d.h / 2) * scale;
      w *= scale; h *= scale;
      // 이미지 밖으로 나가는 부분은 잘라 중심을 다시 맞춘다
      var x0 = Math.max(0, cx - w / 2), y0 = Math.max(0, cy - h / 2);
      var x1 = Math.min(limitW, cx + w / 2), y1 = Math.min(limitH, cy + h / 2);
      if (x1 - x0 < 4 || y1 - y0 < 4) continue;
      out.push({
        cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
        w: x1 - x0, h: y1 - y0,
        angle: d.angle, score: d.score
      });
    }
    return out;
  }

  /* ── 마스크 렌더 ────────────────────────────────────────── */

  /* 가로로 몇 칸을 낼지. MAX_COLS 를 넘지 않으므로
   * "모자이크 블록은 박스 폭의 1/8 이상" 이라는 규칙이 언제나 지켜진다.
   * 사용자가 고른 값이 없으면 기본 5칸. */
  function clampCols(n) {
    n = Math.round(+n || DEFAULT_COLS);
    return Math.max(1, Math.min(MAX_COLS, n));
  }

  function clampSrc(src, x, y, w, h) {
    var sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    var x0 = Math.max(0, Math.min(sw - 1, x));
    var y0 = Math.max(0, Math.min(sh - 1, y));
    var x1 = Math.max(x0 + 1, Math.min(sw, x + w));
    var y1 = Math.max(y0 + 1, Math.min(sh, y + h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* 한 번에 20:1 로 줄이면 브라우저가 면적 평균을 하지 않고 몇 픽셀만 집어온다.
   * 절반씩 여러 단계로 줄여 모자이크가 제대로 평균값을 갖게 한다. */
  function downscale(src, r, dw, dh) {
    var cur = C.makeCanvas(r.w, r.h);
    cur.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, cur.width, cur.height);
    var w = cur.width, h = cur.height;
    var guard = 0;
    while ((w > dw * 2 || h > dh * 2) && guard++ < 16) {
      var nw = Math.max(dw, Math.floor(w / 2));
      var nh = Math.max(dh, Math.floor(h / 2));
      var next = C.makeCanvas(nw, nh);
      var ng = next.getContext('2d');
      ng.imageSmoothingQuality = 'high';
      ng.drawImage(cur, 0, 0, w, h, 0, 0, nw, nh);
      cur = next; w = nw; h = nh;
    }
    var out = C.makeCanvas(dw, dh);
    var og = out.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(cur, 0, 0, w, h, 0, 0, dw, dh);
    return out;
  }

  function drawPixelate(g, src, r, tw, th, cols) {
    var rows = Math.max(1, Math.round(cols * (th / Math.max(1, tw))));
    var tmp = downscale(src, r, cols, rows);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, cols, rows, 0, 0, tw, th);
    g.imageSmoothingEnabled = true;
  }

  function drawBlur(g, src, rect, tw, th, pct) {
    var pad = 0.45;
    var X = rect.cx - rect.w / 2 - rect.w * pad;
    var Y = rect.cy - rect.h / 2 - rect.h * pad;
    var W = rect.w * (1 + pad * 2);
    var H = rect.h * (1 + pad * 2);
    var cl = clampSrc(src, X, Y, W, H);

    var ew = Math.max(4, Math.round(tw * (1 + pad * 2)));
    var eh = Math.max(4, Math.round(th * (1 + pad * 2)));
    var tmp = C.makeCanvas(ew, eh);
    var tg = tmp.getContext('2d');
    tg.drawImage(src, cl.x, cl.y, cl.w, cl.h, 0, 0, ew, eh);          // 가장자리 확장 대용
    tg.drawImage(src, cl.x, cl.y, cl.w, cl.h,
      (cl.x - X) / W * ew, (cl.y - Y) / H * eh, cl.w / W * ew, cl.h / H * eh);

    // blur 는 캔버스 밖(투명)까지 섞으므로 가장자리가 반투명해진다.
    // (1) alpha:false 컨텍스트로 굽고 (2) 반경을 여백의 1/2.5 이하로 묶어
    //     잘라낼 중앙 영역에 투명·어두워짐이 번지지 않게 한다. 가림막이 비치면 안 된다.
    var padPx = Math.min(tw, th) * pad;
    var radius = Math.max(3, Math.min(Math.min(tw, th) * (pct / 100) * 0.35, padPx / 2.5));
    var b = C.makeCanvas(ew, eh);
    var bg = b.getContext('2d', { alpha: false });
    bg.filter = 'blur(' + radius.toFixed(2) + 'px)';
    bg.drawImage(tmp, 0, 0);
    bg.filter = 'none';

    g.drawImage(b, Math.round(tw * pad), Math.round(th * pad), tw, th, 0, 0, tw, th);
  }

  function drawContain(g, img, tw, th, ratio) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.min(tw / iw, th / ih) * (ratio || 1);
    var w = iw * s, h = ih * s;
    g.drawImage(img, (tw - w) / 2, (th - h) / 2, w, h);
  }

  /* def = {type, block, blurPct, iconId, customURL, cols}
   * rect = {cx,cy,w,h}  (src 좌표계, 회전 제외)
   * 반환: tw x th 캔버스. 아이콘/이미지 모드도 항상 픽셀화 바탕을 깔아 100% 가린다. */
  function buildPatch(src, rect, def, tw, th) {
    tw = Math.max(2, Math.round(tw));
    th = Math.max(2, Math.round(th));
    var c = C.makeCanvas(tw, th);
    var g = c.getContext('2d');
    var r = clampSrc(src, rect.cx - rect.w / 2, rect.cy - rect.h / 2, rect.w, rect.h);

    if (def.type === 'blur') {
      drawBlur(g, src, rect, tw, th, def.blurPct || 45);
    } else {
      drawPixelate(g, src, r, tw, th, clampCols(def.cols));
    }

    if (def.type === 'icon') {
      var im = iconCache[def.iconId] || iconCache[ICONS[0].id];
      if (im) drawContain(g, im, tw, th, 0.98);
    } else if (def.type === 'image') {
      var cu = customCache[def.customURL];
      if (cu) drawContain(g, cu, tw, th, 1.0);
    }
    return c;
  }

  /* def에 필요한 이미지를 미리 확보 */
  function ensureAssets(def) {
    if (def.type === 'icon') return iconImage(def.iconId);
    if (def.type === 'image') return customImage(def.customURL);
    return Promise.resolve(null);
  }

  /* 원본 해상도 캔버스에 마스크 하나를 굽는다.
   * ctx/target 은 이미 색보정까지 끝난 원본 캔버스여야 한다(자기 자신을 샘플링). */
  function bakeMask(target, item) {
    var g = target.getContext('2d');
    var rect = item.rect, def = item.def;
    var tw = Math.max(2, Math.round(rect.w));
    var th = Math.max(2, Math.round(rect.h));
    var patch = buildPatch(target, rect, def, tw, th);
    g.save();
    g.translate(rect.cx, rect.cy);
    if (rect.angle) g.rotate(rect.angle * Math.PI / 180);
    g.drawImage(patch, -tw / 2, -th / 2, tw, th);
    g.restore();
  }

  /* 미리 데워 두기 — 첫 사진에서 기다리지 않게 한다.
   * 실패하면 자동 찾기만 못 쓰고 나머지 기능은 그대로 돈다. */
  function warmUp() { return getDetector().then(function () { return true; }); }

  SnapLab.ICONS = ICONS;
  SnapLab.face = {
    EXPAND: EXPAND,
    MAX_COLS: MAX_COLS,
    ICONS: ICONS,
    iconImage: iconImage,
    preloadIcons: preloadIcons,
    customImage: customImage,
    detect: detect,
    warmUp: warmUp,
    toBoxes: toBoxes,
    clampCols: clampCols,
    DEFAULT_COLS: DEFAULT_COLS,
    buildPatch: buildPatch,
    ensureAssets: ensureAssets,
    bakeMask: bakeMask
  };
})();
