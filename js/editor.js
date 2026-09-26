/* editor.js — fabric 캔버스. 마스크 박스(미리보기 레이어) + 주석 객체를 관리한다.
 * 좌표계: 캔버스 객체 좌표 = "미리보기 픽셀"(긴 변 1600 축소본). 화면 맞춤은 zoom 으로만 한다.
 */
window.SnapLab = window.SnapLab || {};

(function () {
  'use strict';

  var C = SnapLab.convert;
  var F = SnapLab.face;

  var canvas = null;
  var wrap = null;
  var srcCanvas = null;       // 색보정까지 끝난 미리보기 캔버스 (마스크 샘플 원본)
  var pw = 0, ph = 0;         // 미리보기 크기
  var drawMode = true;
  var drawing = null;
  var onChange = function () {};

  function isMask(o) { return !!(o && o.data && o.data.kind === 'mask'); }
  function isCrop(o) { return !!(o && o.data && o.data.kind === 'crop'); }
  function isAnnot(o) { return !!(o && o.data && o.data.kind === 'annot'); }

  function init(canvasEl, wrapEl, changeCb) {
    wrap = wrapEl;
    onChange = changeCb || function () {};
    canvas = new fabric.Canvas(canvasEl, {
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      enableRetinaScaling: false,
      selection: true,
      uniformScaling: false
    });
    fabric.Object.prototype.transparentCorners = false;
    // 색은 css/db-tokens.css 토큰과 같은 값 (캔버스는 CSS 변수를 못 읽는다) — --db-accent / --db-card
    fabric.Object.prototype.cornerColor = '#BE185D';      /* --db-accent (snap-box, 밝은 화면) */
    fabric.Object.prototype.cornerStrokeColor = '#FFFFFF'; /* --db-card */
    fabric.Object.prototype.borderColor = '#BE185D';
    fabric.Object.prototype.cornerSize = 10;
    fabric.Object.prototype.padding = 0;

    canvas.on('mouse:down', onDown);
    canvas.on('mouse:move', onMove);
    canvas.on('mouse:up', onUp);
    canvas.on('object:modified', function (e) {
      var o = e.target;
      if (isMask(o)) normalizeMask(o);
      onChange();
    });
    canvas.on('selection:created', onChange);
    canvas.on('selection:updated', onChange);
    canvas.on('selection:cleared', onChange);

    window.addEventListener('resize', fitView);
    return canvas;
  }

  /* ── 배경 / 뷰 ─────────────────────────────────────────── */

  function setSource(previewCanvas) {
    srcCanvas = previewCanvas;
    pw = previewCanvas.width;
    ph = previewCanvas.height;
    var img = new fabric.Image(previewCanvas, {
      left: 0, top: 0, selectable: false, evented: false,
      originX: 'left', originY: 'top'
    });
    img.scaleX = 1; img.scaleY = 1;
    canvas.backgroundImage = img;
    fitView();
  }

  /* 색보정만 바뀌었을 때: 배경과 모든 마스크 패치를 다시 만든다 */
  function refreshSource(previewCanvas) {
    srcCanvas = previewCanvas;
    var img = new fabric.Image(previewCanvas, {
      left: 0, top: 0, selectable: false, evented: false,
      originX: 'left', originY: 'top'
    });
    canvas.backgroundImage = img;
    canvas.getObjects().filter(isMask).forEach(refreshMask);
    canvas.requestRenderAll();
  }

  /* 캔버스를 '화면에 보이는 사진 크기' 로 맞춘다.
   * 무대 크기로 잡고 안에서 중앙 정렬하면, 캔버스에 준 테두리·그림자가
   * 사진이 아니라 무대 전체를 감싸 버린다. 여백은 바깥 flex 가 만든다. */
  var FIT_PAD = 16;

  /* ── 원본 잠깐 보기 ──────────────────────────────────────
   * 바탕 그림만 바꿔 끼우고 얹은 것들을 숨긴다. srcCanvas 는 건드리지 않으므로
   * 가림 패치를 다시 만들지 않고, 놓아 주면 그대로 돌아온다.
   * (refreshSource 를 쓰면 패치를 전부 다시 굽게 되어 느리고 상태도 흔들린다) */
  function showBackground(canvasEl) {
    if (!canvas || !canvasEl) return;
    canvas.backgroundImage = new fabric.Image(canvasEl, {
      left: 0, top: 0, selectable: false, evented: false,
      originX: 'left', originY: 'top'
    });
    canvas.requestRenderAll();
  }

  /* 잠깐 감추는 동안 고르고 있던 것을 기억했다가 되돌려 놓는다.
   * 원본을 봤다고 해서 고르던 표시가 풀리면 안 된다. */
  var peekActive = null;

  function setObjectsVisible(v) {
    if (!canvas) return;
    if (!v) { peekActive = canvas.getActiveObject() || null; canvas.discardActiveObject(); }
    canvas.getObjects().forEach(function (o) { o.visible = !!v; });
    canvas.selection = v && !drawMode;
    if (v) {
      if (peekActive && canvas.getObjects().indexOf(peekActive) >= 0) canvas.setActiveObject(peekActive);
      peekActive = null;
    }
    canvas.requestRenderAll();
  }

  function fitView() {
    if (!canvas || !wrap || !pw) return;
    var cw = wrap.clientWidth - FIT_PAD, ch = wrap.clientHeight - FIT_PAD;
    if (cw <= 0 || ch <= 0) return;
    var z = Math.min(cw / pw, ch / ph);
    canvas.setDimensions({ width: Math.round(pw * z), height: Math.round(ph * z) });
    canvas.setViewportTransform([z, 0, 0, z, 0, 0]);
    canvas.requestRenderAll();
  }

  function clearAll() {
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.remove.apply(canvas, canvas.getObjects().slice());
    canvas.backgroundImage = null;
    srcCanvas = null; pw = 0; ph = 0;
    canvas.setDimensions({ width: 1, height: 1 });
    canvas.requestRenderAll();
  }

  /* ── 마스크 ────────────────────────────────────────────── */

  function normalizeDef(def) {
    var d = Object.assign({}, def);
    d.cols = F.clampCols(d.cols);
    return d;
  }

  function makePatch(rect, def) {
    return F.buildPatch(srcCanvas, rect, def, rect.w, rect.h);
  }

  function addMask(rect, def) {
    if (!srcCanvas) return null;
    var d = normalizeDef(def);
    var patch = makePatch(rect, d);
    var obj = new fabric.Image(patch, {
      left: rect.cx, top: rect.cy,
      originX: 'center', originY: 'center',
      angle: (d.type === 'icon' || d.type === 'image') ? (rect.angle || 0) : 0,
      objectCaching: false
    });
    obj.data = { kind: 'mask', def: d, srcAngle: rect.angle || 0 };
    applyMaskLocks(obj);
    canvas.add(obj);
    return obj;
  }

  function applyMaskLocks(obj) {
    var t = obj.data.def.type;
    var lock = (t === 'pixelate' || t === 'blur');
    obj.lockRotation = lock;
    obj.setControlsVisibility({ mtr: !lock });
    if (lock) obj.angle = 0;
  }

  function maskRect(obj) {
    return {
      cx: obj.left, cy: obj.top,
      w: Math.max(4, obj.width * obj.scaleX),
      h: Math.max(4, obj.height * obj.scaleY),
      angle: obj.angle || 0
    };
  }

  function refreshMask(obj) {
    if (!srcCanvas) return;
    var r = maskRect(obj);
    obj.data.def = normalizeDef(obj.data.def);
    var patch = makePatch({ cx: r.cx, cy: r.cy, w: r.w, h: r.h }, obj.data.def);
    obj.setElement(patch);
    obj.set({ scaleX: 1, scaleY: 1 });
    obj.setCoords();
  }

  function normalizeMask(obj) {
    refreshMask(obj);
    canvas.requestRenderAll();
  }

  function setDefOn(objs, def) {
    objs.forEach(function (o) {
      if (!isMask(o)) return;
      var d = normalizeDef(def);
      o.data.def = d;
      applyMaskLocks(o);
      if (d.type === 'icon' || d.type === 'image') o.angle = o.data.srcAngle || 0;
      refreshMask(o);
    });
    canvas.requestRenderAll();
    onChange();
  }

  function masks() { return canvas ? canvas.getObjects().filter(isMask) : []; }
  function annots() { return canvas ? canvas.getObjects().filter(isAnnot) : []; }

  function selectedMasks() {
    var act = canvas.getActiveObjects();
    return act.filter(isMask);
  }

  function clearMasks() {
    masks().forEach(function (o) { canvas.remove(o); });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    onChange();
  }

  function deleteSelected() {
    var act = canvas.getActiveObjects();
    if (!act.length) return 0;
    act.forEach(function (o) { if (!isCrop(o)) canvas.remove(o); });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    onChange();
    return act.length;
  }

  /* 굽기용: 원본 좌표계로 변환한 마스크 목록 */
  function maskItemsAt(scale) {
    return masks().map(function (o) {
      var r = maskRect(o);
      return {
        rect: { cx: r.cx * scale, cy: r.cy * scale, w: r.w * scale, h: r.h * scale, angle: r.angle },
        def: o.data.def
      };
    });
  }

  /* ── 수동 박스 드래그 ───────────────────────────────────── */

  function setDrawMode(on) {
    drawMode = !!on;
    if (canvas) canvas.selection = !drawMode;
  }
  function getDrawMode() { return drawMode; }

  function onDown(opt) {
    if (!drawMode || !srcCanvas) return;
    if (opt.target) return;
    var p = canvas.getPointer(opt.e);
    // 가림이 타원이므로 끌 때 보이는 미리보기도 타원으로 둔다 — 끈 대로 가려진다
    drawing = {
      x0: p.x, y0: p.y,
      rect: new fabric.Ellipse({
        left: p.x, top: p.y, rx: 0.5, ry: 0.5,
        fill: 'rgba(190,24,93,0.16)', stroke: '#BE185D', strokeWidth: 1,   /* --db-accent */
        strokeDashArray: [4, 3], selectable: false, evented: false, objectCaching: false
      })
    };
    drawing.rect.data = { kind: 'helper' };
    canvas.add(drawing.rect);
  }

  function onMove(opt) {
    if (!drawing) return;
    var p = canvas.getPointer(opt.e);
    var x = Math.min(p.x, drawing.x0), y = Math.min(p.y, drawing.y0);
    var w = Math.abs(p.x - drawing.x0), h = Math.abs(p.y - drawing.y0);
    drawing.rect.set({ left: x, top: y, rx: Math.max(0.5, w / 2), ry: Math.max(0.5, h / 2) });
    canvas.requestRenderAll();
  }

  function onUp() {
    if (!drawing) return;
    var r = drawing.rect;
    var x = r.left, y = r.top, w = r.rx * 2, h = r.ry * 2;
    canvas.remove(r);
    drawing = null;
    if (w < 8 || h < 8) { canvas.requestRenderAll(); return; }
    var obj = addMask({ cx: x + w / 2, cy: y + h / 2, w: w, h: h, angle: 0 }, currentDef());
    if (obj) { canvas.setActiveObject(obj); canvas.requestRenderAll(); }
    onChange();
  }

  var currentDef = function () { return { type: 'pixelate', block: 14 }; };
  function setDefProvider(fn) { currentDef = fn; }

  /* ── 주석 ──────────────────────────────────────────────── */

  function centerPos() { return { x: pw / 2, y: ph / 2 }; }

  function addText(text, style) {
    var p = centerPos();
    var o = new fabric.IText(text || '내용', {
      left: p.x, top: p.y, originX: 'center', originY: 'center',
      fill: style.color, fontSize: style.size,
      fontFamily: '"Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif',
      fontWeight: '700', stroke: '#FFFFFF', strokeWidth: Math.max(0, style.size / 20),
      paintFirst: 'stroke'
    });
    o.data = { kind: 'annot' };
    canvas.add(o).setActiveObject(o);
    canvas.requestRenderAll(); onChange();
    return o;
  }

  function addRect(style) {
    var p = centerPos();
    var o = new fabric.Rect({
      left: p.x, top: p.y, originX: 'center', originY: 'center',
      width: pw * 0.3, height: ph * 0.2,
      fill: 'transparent', stroke: style.color, strokeWidth: style.width, strokeUniform: false
    });
    o.data = { kind: 'annot' };
    canvas.add(o).setActiveObject(o);
    canvas.requestRenderAll(); onChange();
    return o;
  }

  function addArrow(style) {
    var p = centerPos();
    var o = new fabric.Path('M 0 14 L 82 14 M 60 0 L 82 14 L 60 28', {
      left: p.x, top: p.y, originX: 'center', originY: 'center',
      fill: '', stroke: style.color, strokeWidth: style.width,
      strokeLineCap: 'round', strokeLineJoin: 'round', strokeUniform: false
    });
    o.data = { kind: 'annot' };
    o.scaleToWidth(pw * 0.28);
    canvas.add(o).setActiveObject(o);
    canvas.requestRenderAll(); onChange();
    return o;
  }

  function addImageObject(img, opts) {
    var o = new fabric.Image(img, Object.assign({
      originX: 'center', originY: 'center', left: pw / 2, top: ph / 2
    }, opts || {}));
    o.data = { kind: 'annot' };
    if (o.width > pw * 0.35) o.scaleToWidth(pw * 0.35);
    canvas.add(o).setActiveObject(o);
    canvas.requestRenderAll(); onChange();
    return o;
  }

  /* 우하단 한 줄 스탬프 */
  function addStamp(text) {
    var pad = Math.max(6, Math.round(pw * 0.012));
    var size = Math.max(11, Math.round(ph * 0.032));
    var t = new fabric.Text(text, {
      left: pad, top: pad, fill: '#ffffff', fontSize: size,
      fontFamily: '"Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif', fontWeight: '600'
    });
    var bg = new fabric.Rect({
      left: 0, top: 0,
      width: t.width + pad * 2, height: t.height + pad * 1.4,
      fill: 'rgba(28,32,36,0.62)', rx: 4, ry: 4   /* --ink 62% */
    });
    t.set({ top: (bg.height - t.height) / 2 });
    var g = new fabric.Group([bg, t], { originX: 'right', originY: 'bottom' });
    g.set({ left: pw - pad, top: ph - pad });
    g.data = { kind: 'annot', stamp: true };
    canvas.add(g);
    canvas.requestRenderAll(); onChange();
    return g;
  }

  /* ── 자르기 ────────────────────────────────────────────── */

  function startCrop() {
    cancelCrop();
    var o = new fabric.Rect({
      left: pw * 0.5, top: ph * 0.5, originX: 'center', originY: 'center',
      width: pw * 0.8, height: ph * 0.8,
      fill: 'rgba(0,0,0,0.001)', stroke: '#B4451C', strokeWidth: 2,
      strokeDashArray: [8, 5], strokeUniform: true, lockRotation: true
    });
    o.setControlsVisibility({ mtr: false });
    o.data = { kind: 'crop' };
    canvas.add(o).setActiveObject(o);
    canvas.requestRenderAll();
    return o;
  }

  function cropRect() {
    var o = canvas.getObjects().filter(isCrop)[0];
    if (!o) return null;
    var w = o.width * o.scaleX, h = o.height * o.scaleY;
    return { x: o.left - w / 2, y: o.top - h / 2, w: w, h: h };
  }

  function cancelCrop() {
    canvas.getObjects().filter(isCrop).forEach(function (o) { canvas.remove(o); });
    canvas.requestRenderAll();
  }

  /* ── 상태 보존 (이미지 전환 시) ──────────────────────────── */

  function stash() {
    var m = masks().map(function (o) {
      var r = maskRect(o);
      return { rect: r, def: Object.assign({}, o.data.def), srcAngle: o.data.srcAngle || 0 };
    });
    var a = annots().map(function (o) { return o.toObject(['data']); });
    return { masks: m, annots: a };
  }

  function restore(state) {
    if (!state) return Promise.resolve();
    state.masks.forEach(function (m) {
      var o = addMask(m.rect, m.def);
      if (o) { o.data.srcAngle = m.srcAngle; o.angle = m.rect.angle || 0; applyMaskLocks(o); o.setCoords(); }
    });
    if (!state.annots || !state.annots.length) { canvas.requestRenderAll(); return Promise.resolve(); }
    return new Promise(function (res) {
      fabric.util.enlivenObjects(state.annots, function (objs) {
        objs.forEach(function (o) { o.data = o.data || { kind: 'annot' }; canvas.add(o); });
        canvas.requestRenderAll();
        res();
      });
    });
  }

  function hasPending() {
    return masks().length > 0 || annots().length > 0;
  }

  /* ── 주석만 고해상도로 렌더 (투명 PNG) ───────────────────── */

  function renderAnnotations(multiplier) {
    var list = annots();
    if (!list.length) return null;

    var hidden = [];
    canvas.getObjects().forEach(function (o) {
      if (!isAnnot(o) && o.visible) { o.visible = false; hidden.push(o); }
    });
    var bg = canvas.backgroundImage;
    var vt = canvas.viewportTransform.slice();
    var dw = canvas.getWidth(), dh = canvas.getHeight();
    var active = canvas.getActiveObject();

    canvas.backgroundImage = null;
    canvas.discardActiveObject();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setDimensions({ width: pw, height: ph });

    var url;
    try {
      url = canvas.toDataURL({ format: 'png', multiplier: multiplier, enableRetinaScaling: false });
    } finally {
      canvas.setDimensions({ width: dw, height: dh });
      canvas.setViewportTransform(vt);
      canvas.backgroundImage = bg;
      hidden.forEach(function (o) { o.visible = true; });
      if (active) canvas.setActiveObject(active);
      canvas.requestRenderAll();
    }
    return url;
  }

  SnapLab.editor = {
    init: init,
    get canvas() { return canvas; },
    get previewW() { return pw; },
    get previewH() { return ph; },
    setSource: setSource,
    refreshSource: refreshSource,
    showBackground: showBackground,
    setObjectsVisible: setObjectsVisible,
    fitView: fitView,
    clearAll: clearAll,
    addMask: addMask,
    masks: masks,
    annots: annots,
    selectedMasks: selectedMasks,
    setDefOn: setDefOn,
    clearMasks: clearMasks,
    deleteSelected: deleteSelected,
    maskItemsAt: maskItemsAt,
    setDrawMode: setDrawMode,
    getDrawMode: getDrawMode,
    setDefProvider: setDefProvider,
    addText: addText,
    addRect: addRect,
    addArrow: addArrow,
    addImageObject: addImageObject,
    addStamp: addStamp,
    startCrop: startCrop,
    cropRect: cropRect,
    cancelCrop: cancelCrop,
    stash: stash,
    restore: restore,
    hasPending: hasPending,
    renderAnnotations: renderAnnotations,
    isMask: isMask,
    isAnnot: isAnnot,
    isCrop: isCrop
  };
})();
