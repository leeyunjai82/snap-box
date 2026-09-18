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

  /* 얼굴 찾기 모델 — BlazeFace 풀레인지를 먼저 쓴다.
   *
   * 단거리(blaze_face_short_range)는 2m 이내 근거리용이라 단체사진처럼
   * 작게 찍힌 얼굴을 거의 못 잡는다. 같은 합성 장면에서 잰 검출률:
   *   얼굴 폭이 사진의 5.6% → 단거리 0/10, 풀레인지 9/10
   *   얼굴 폭이 사진의 3.6% → 단거리 0/10, 풀레인지 5/10
   * 풀레인지는 tasks-vision 0.10.x 에서는 출력 앵커 수가 맞지 않아
   * 디코딩에서 터진다. 1.0.1 이상이 필요하다.
   * 만약을 대비해 실패하면 단거리로 내려간다. */
  var MODEL_FULL  = url('models/blaze_face_full_range.tflite');
  var MODEL_SHORT = url('models/blaze_face_short_range.tflite');

  var EXPAND = 0.15;      // 검출 박스 상하좌우 15% 확장 (머리카락·턱 노출 방지)

  /* 가림은 사각형이 아니라 타원으로 만들고 바깥은 투명하게 둔다.
   * 사각 모자이크는 보고서에 넣으면 도장을 찍은 것처럼 튄다.
   *
   * 다만 사각형에 내접한 타원은 네 모서리를 잃는다. 그만큼 얼굴이 드러나면
   * 안 되므로, 검출 박스를 한 번 더 넓혀서 타원이 예전 사각형만큼은 덮게 한다.
   *   얼굴 폭 w 기준 박스 폭 = w × 1.3(EXPAND) × 1.18(ELLIPSE_K) ≈ 1.53w
   *   얼굴 위·아래 끝(±0.5h)에서 타원의 반폭 ≈ 0.58w  >  그 높이의 머리 반폭 ≈ 0.4w
   * 사람이 직접 그린 칸은 그린 그대로 쓴다(넓히지 않는다). */
  var ELLIPSE_K = 1.18;
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
          function create(model, delegate) {
            return mod.FaceDetector.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: model, delegate: delegate },
              runningMode: 'IMAGE',
              minDetectionConfidence: 0.2   // 낮게 잡고 슬라이더로 걸러낸다
            });
          }
          // 풀레인지 GPU → 풀레인지 CPU → 단거리 GPU → 단거리 CPU
          return create(MODEL_FULL, 'GPU')
            .catch(function () { return create(MODEL_FULL, 'CPU'); })
            .catch(function () { return create(MODEL_SHORT, 'GPU'); })
            .catch(function () { return create(MODEL_SHORT, 'CPU'); });
        });
      });
    })();
    detectorPromise.catch(function () { detectorPromise = null; });
    return detectorPromise;
  }

  /* source: HTMLCanvasElement | HTMLImageElement
   * 반환: [{x,y,w,h,score,angle}] — source 픽셀 좌표계, 확장 전
   *
   * 주의: 모델은 입력을 정해진 작은 크기로 줄여서 본다. 그래서 큰 사진을
   * 통째로 넣어도 해상도가 도움이 되지 않고, 얼굴이 '넣어 준 그림의' 폭에서
   * 일정 비율 이상은 되어야 잡는다. 작게 찍힌 단체사진은 detectMulti() 로
   * 잘라 넣어야 한다. */
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

  /* ── 잘라 넣어 작은 얼굴까지 찾기 ────────────────────────
   * 사진을 격자로 잘라 한 칸씩 검출기에 넣는다. 칸이 작을수록 얼굴이
   * 칸 안에서 크게 잡히므로 작은 얼굴이 살아난다. 칸 경계에 걸린 얼굴은
   * 칸을 20% 겹쳐 잘라 건지고, 겹쳐 나온 것은 NMS 로 하나로 합친다.
   *
   * 자를 원본은 축소본이 아니라 '원본 해상도' 를 준다. 같은 격자라도
   * 원본에서 자른 칸이 더 선명해서 작은 얼굴을 더 건진다.
   *
   * 4000x3000 합성 장면(얼굴 10명)에서 잰 검출률 — 풀레인지 기준:
   *   얼굴 폭  5.6%   3.6%   2.4%   1.6%
   *   1        7/10   4/10   0/10   0/10
   *   1,2     10/10  10/10   5/10   0/10
   *   1,2,3   10/10  10/10   9/10   0/10
   * 격자를 더 늘려도 1.6% 아래는 거의 못 잡고 오검출만 는다. */

  var TILE_OVERLAP = 0.2;
  var NMS_IOU = 0.3;

  /* 찾는 범위 → 격자 사다리. 위에서부터 차례로 돌려 합친다. */
  var RANGE_GRIDS = {
    near:  [1],         /* 가까이 — 얼굴이 크게 찍힌 사진.        4000px 기준 ~0.3초 */
    mid:   [1, 2],      /* 보통 — 얼굴 폭이 사진의 3.5% 까지.     ~0.9초 */
    group: [1, 2, 3]    /* 단체사진 — 얼굴 폭이 사진의 2.4% 까지. ~2.0초 */
  };

  function iou(a, b) {
    var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    var x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 <= x0 || y1 <= y0) return 0;
    var i = (x1 - x0) * (y1 - y0);
    return i / (a.w * a.h + b.w * b.h - i);
  }

  function nms(list, thr) {
    var sorted = list.slice().sort(function (p, q) { return q.score - p.score; });
    var keep = [];
    sorted.forEach(function (d) {
      for (var i = 0; i < keep.length; i++) if (iou(keep[i], d) > thr) return;
      keep.push(d);
    });
    return keep;
  }

  function tilesOf(W, H, grid) {
    if (grid <= 1) return [{ x: 0, y: 0, w: W, h: H }];
    var cols = grid, rows = Math.max(1, Math.round(grid * H / W));
    var tw = W / cols, th = H / rows;
    var ox = tw * TILE_OVERLAP, oy = th * TILE_OVERLAP;
    var out = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x0 = Math.max(0, Math.round(c * tw - ox));
        var y0 = Math.max(0, Math.round(r * th - oy));
        var x1 = Math.min(W, Math.round((c + 1) * tw + ox));
        var y1 = Math.min(H, Math.round((r + 1) * th + oy));
        if (x1 - x0 > 16 && y1 - y0 > 16) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    return out;
  }

  function gridsFor(range) { return RANGE_GRIDS[range] || RANGE_GRIDS.mid; }

  /* onStep(한 칸 끝날 때마다, 전체 칸 수) — 진행률 표시용 */
  function detectMulti(source, range, onStep) {
    var W = source.width || source.naturalWidth;
    var H = source.height || source.naturalHeight;
    var jobs = [];
    gridsFor(range).forEach(function (g) {
      tilesOf(W, H, g).forEach(function (t) { jobs.push(t); });
    });

    return getDetector().then(function () {
      var all = [];
      var i = 0;
      function step() {
        if (i >= jobs.length) return nms(all, NMS_IOU);
        var t = jobs[i++];
        if (onStep) onStep(i, jobs.length);
        var input = source;
        if (t.w !== W || t.h !== H) {
          input = C.makeCanvas(t.w, t.h);
          input.getContext('2d').drawImage(source, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
        }
        return detect(input).catch(function () { return []; }).then(function (list) {
          list.forEach(function (d) {
            all.push({ x: d.x + t.x, y: d.y + t.y, w: d.w, h: d.h, score: d.score, angle: d.angle });
          });
          // 한 칸마다 한 번 숨을 돌려 화면이 멈춘 것처럼 보이지 않게 한다
          return new Promise(function (r) { setTimeout(r, 0); }).then(step);
        });
      }
      return step();
    });
  }

  /* 확장 + 신뢰도 필터 + 좌표계 변환(scale 배) */
  function toBoxes(raw, minScore, scale, limitW, limitH) {
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      if (d.score < minScore) continue;
      var w = d.w * (1 + EXPAND * 2) * ELLIPSE_K;
      var h = d.h * (1 + EXPAND * 2) * ELLIPSE_K;
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

  /* 캔버스를 타원으로 오려내고 바깥은 alpha 0 으로 만든다.
   * destination-in: 원본(타원)이 불투명한 곳만 남기고 나머지는 지운다.
   * 가장자리는 안티에일리어싱으로 부드럽게 빠져 사진에 자연스럽게 얹힌다. */
  function clipEllipse(c) {
    var g = c.getContext('2d');
    g.save();
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    g.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2);
    g.fillStyle = '#000';
    g.fill();
    g.restore();
  }

  /* 타원을 가득 채우도록 그린다(넘치는 부분은 오려낸다). 우리가 만든 둥근 그림에 쓴다. */
  function drawCover(g, img, tw, th) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.max(tw / iw, th / ih);
    var w = iw * s, h = ih * s;
    g.drawImage(img, (tw - w) / 2, (th - h) / 2, w, h);
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
      // 우리 그림은 둥근 판이라 타원을 가득 채워도 어색하지 않다
      var im = iconCache[def.iconId] || iconCache[ICONS[0].id];
      if (im) drawCover(g, im, tw, th);
    } else if (def.type === 'image') {
      // 사용자가 올린 그림은 잘리거나 찌그러지면 안 되므로 안쪽에 맞춘다.
      // 남는 자리는 아래 깔린 모자이크가 채운다.
      var cu = customCache[def.customURL];
      if (cu) drawContain(g, cu, tw, th, 1.0);
    }
    clipEllipse(c);
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
    detectMulti: detectMulti,
    gridsFor: gridsFor,
    RANGE_GRIDS: RANGE_GRIDS,
    warmUp: warmUp,
    toBoxes: toBoxes,
    clampCols: clampCols,
    clipEllipse: clipEllipse,
    ELLIPSE_K: ELLIPSE_K,
    DEFAULT_COLS: DEFAULT_COLS,
    buildPatch: buildPatch,
    ensureAssets: ensureAssets,
    bakeMask: bakeMask
  };
})();
