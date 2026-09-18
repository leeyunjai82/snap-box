/* app.js — 상태, 사진 목록, 단계 이동, 굽기 파이프라인, 한꺼번에 처리
 *
 * 화면 문구는 한국어 원문을 그대로 쓴다 (js/i18n.js 규약).
 * 번역이 필요한 문장은 GL_T('한국어') / GL_TF('한국어 {n}장', {n:3}) 으로 감싼다.
 */
(function () {
  'use strict';

  var C = SnapLab.convert;
  var F = SnapLab.face;
  var E = SnapLab.editor;
  var X = SnapLab.exporter;
  var T = GL_T, TF = GL_TF;

  var LS_KEY = 'snapbox.settings';          // 저장 키 규약: <서비스>.<이름>
  var STEPS = ['face', 'edit', 'conv', 'out'];
  var STEP_META = {
    face: { title: '얼굴 가리기', icon: 'fa-eye-slash' },
    edit: { title: '다듬기', icon: 'fa-sliders' },
    conv: { title: '크기·용량', icon: 'fa-compress' },
    out:  { title: '내보내기', icon: 'fa-file-export' }
  };

  var state = {
    items: [],
    index: -1,
    seq: 0,
    step: 'face',
    settings: {
      conf: 0.5,
      range: 'mid',          // 찾는 범위 near | mid | group
      maskType: 'pixelate',
      cols: 5,
      blurPct: 60,
      iconId: 'person',
      customURL: '',
      adjLive: { b: 100, c: 100, s: 100 },
      annot: { color: '#B4451C', width: 4, size: 36 },
      stamp: { project: '', school: '', date: '' },
      resizeLong: 1600,
      targetKB: 0,
      format: 'image/jpeg',
      quality: 88,
      nameTemplate: '{학교명}_{날짜}_{번호}',
      sheetLayout: '2x2'
    }
  };

  var cur = null;   // {item, img, preview, previewAdjusted, scale}

  /* 화면 슬라이더는 '오른쪽일수록 세다' 로 통일한다. 내부 값은 반대이므로 여기서 뒤집는다.
   *   가림 세기 1~6  →  모자이크 칸 수 8~3 (칸이 적을수록 굵게 가려진다)
   *   민감도   1~9  →  기준값 0.9~0.1     (기준값이 낮을수록 많이 찾는다) */
  function strengthToCols(v) { return 9 - Math.max(1, Math.min(6, +v || 4)); }
  function colsToStrength(c) { return 9 - Math.max(3, Math.min(8, +c || 5)); }
  function sensToConf(v) { return (10 - Math.max(1, Math.min(9, +v || 5))) / 10; }
  function confToSens(c) { return Math.max(1, Math.min(9, Math.round(10 - (+c || 0.5) * 10))); }

  /* 사진이 없으면 눌러 봐야 안내만 뜨는 버튼들 — 아예 잠가 둔다 */
  var NEEDS_PHOTO = [
    'btnRedetect', 'btnApplyToSelected', 'btnApplyToAll', 'btnDelBox', 'btnClearBoxes',
    'btnRotate', 'btnFlip', 'btnCropStart', 'btnAdjReset',
    'btnAddText', 'btnAddRect', 'btnAddArrow', 'btnAddStamp', 'btnStampAll',
    'btnConvertCurrent', 'btnConvertAll',
    'btnDownloadCurrent', 'btnDownloadZip', 'btnContactSheet', 'btnPhotoPdf', 'btnMerge',
    'btnRemoveSel', 'btnClearQueue'
  ];
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ── 알림 · 진행률 ─────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2400);
  }

  function busy(on, text) {
    $('#busy').hidden = !on;
    $('#busyText').textContent = text || T('처리하는 중입니다');
  }

  function progress(i, n, label, name) {
    var w = $('#progressWrap');
    if (n == null) { w.hidden = true; return; }
    w.hidden = false;
    $('#progressFill').style.width = (n ? Math.round(i / n * 100) : 0) + '%';
    $('#progressText').textContent = (label || '') + (name ? ' · ' + name : '');
    $('#progressPct').textContent = i + ' / ' + n;
  }

  function setEngine(text, ok) {
    var el = $('#engine');
    if (!el) return;
    el.textContent = T(text);
    el.classList.toggle('ok', !!ok);
  }

  /* ── 설정 저장 (스탬프 입력값·마지막 설정값만. 이미지 저장 금지) ── */
  function loadSettings() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      delete s.customURL;
      delete s.adjLive;
      Object.keys(s).forEach(function (k) {
        if (!(k in state.settings)) return;
        if (state.settings[k] && typeof state.settings[k] === 'object') Object.assign(state.settings[k], s[k]);
        else state.settings[k] = s[k];
      });
    } catch (e) { /* 저장값이 깨졌으면 기본값으로 간다 */ }
  }

  function saveSettings() {
    try {
      var s = Object.assign({}, state.settings);
      delete s.customURL;
      delete s.adjLive;
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) { /* 저장 못 해도 기능은 계속 쓴다 */ }
  }

  /* ── 사진 목록 ─────────────────────────────────────────── */
  function currentItem() { return state.index >= 0 ? state.items[state.index] : null; }

  function withImage(item, fn) {
    return C.loadImageFromBlob(item.blob).then(function (img) {
      return Promise.resolve(fn(img)).then(
        function (r) { C.releaseImage(img); return r; },
        function (e) { C.releaseImage(img); throw e; }
      );
    });
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    if (!files.length) return Promise.resolve();
    var ok = files.filter(C.isSupported);
    files.filter(function (f) { return !C.isSupported(f); })
      .forEach(function (f) { toast(T('받을 수 없는 형식입니다') + ' — ' + f.name); });
    if (!ok.length) return Promise.resolve();

    busy(true);
    var added = 0;
    var chain = Promise.resolve();
    ok.forEach(function (file, i) {
      chain = chain.then(function () {
        progress(i, ok.length, T('사진 목록'), file.name);
        return C.toWebSafeBlob(file).catch(function () {
          toast(T('HEIC를 바꾸지 못했습니다') + ' — ' + file.name);
          return null;
        }).then(function (blob) {
          if (!blob) return;
          return C.loadImageFromBlob(blob).then(function (img) {
            state.items.push({
              id: 'i' + (++state.seq),
              origName: C.baseName(file.name),
              blob: blob,
              origBlob: blob,
              width: img.naturalWidth,
              height: img.naturalHeight,
              thumb: C.thumbDataURL(img),
              status: 'wait',
              detRaw: null,
              detTried: false,
              faceCount: null,      // 마지막으로 찾은 얼굴 수 (null = 아직 안 찾음)
              adjust: { b: 100, c: 100, s: 100 },
              history: [],
              stash: null,
              checked: false
            });
            C.releaseImage(img);
            added++;
          }).catch(function () { toast(T('사진을 열지 못했습니다') + ' — ' + file.name); });
        });
      });
    });

    return chain.then(function () {
      progress(null);
      busy(false);
      renderQueue();
      if (state.index < 0 && state.items.length) return selectItem(0);
    });
  }

  var STATUS_TEXT = { wait: '대기', ready: '대기', busy: '처리하는 중입니다', done: '처리함', err: '오류' };

  function renderQueue() {
    var box = $('#queueList');
    box.innerHTML = '';
    state.items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'qitem' + (i === state.index ? ' on' : '') + (it.status === 'err' ? ' bad' : '');

      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!it.checked;
      cb.title = T('전·후 붙이기');
      cb.addEventListener('click', function (e) {
        e.stopPropagation(); it.checked = cb.checked; renderQueue();
      });

      var im = document.createElement('img');
      im.className = 'th'; im.src = it.thumb; im.alt = '';

      var meta = document.createElement('div');
      meta.className = 'meta';
      var nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = it.origName; nm.title = it.origName;
      var mt = document.createElement('div');
      var noFace = (it.faceCount === 0);
      mt.className = 'mt' + (noFace ? ' bad' : it.status === 'done' ? ' done' : it.status === 'err' ? ' bad' : '');
      var tail = it.width + '×' + it.height;
      if (it.faceCount === 0) tail = T('얼굴 못 찾음');
      else if (it.faceCount > 0) tail = TF('얼굴 {n}', { n: it.faceCount });
      mt.textContent = T(STATUS_TEXT[it.status] || '대기') + ' · ' + tail;
      mt.title = it.width + '×' + it.height;
      meta.appendChild(nm); meta.appendChild(mt);

      var idx = document.createElement('span');
      idx.className = 'idx num'; idx.textContent = i + 1;

      row.appendChild(cb); row.appendChild(idx); row.appendChild(im); row.appendChild(meta);
      row.addEventListener('click', function () { selectItem(i); });
      box.appendChild(row);
      if (i === state.index) setTimeout(function () {
        if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      }, 0);
    });
    $('#queueCount').textContent = state.items.length;
    $('#posLabel').textContent = (state.items.length ? state.index + 1 : 0) + ' / ' + state.items.length;
    $('#btnPrev').disabled = state.index <= 0;
    $('#btnNext').disabled = state.index < 0 || state.index >= state.items.length - 1;
    setToolsEnabled(state.items.length > 0);
    var picked = state.items.filter(function (i) { return i.checked; }).length;
    var mg = $('#btnMerge');
    mg.disabled = (picked !== 2);
    mg.title = picked === 2 ? '' : T('왼쪽 목록에서 두 장을 체크해 주세요');
    $('#dropZone').classList.toggle('slim', state.items.length > 0);
    $('#queueHint').hidden = state.items.length > 0;
    updateApplyState();
    updateGuide();
    updateNamePreview();
  }

  /* ── 사진 열기 ─────────────────────────────────────────── */
  function releaseCurrent() {
    if (!cur) return;
    cur.item.stash = E.hasPending() ? E.stash() : null;
    cur.item.adjust = Object.assign({}, state.settings.adjLive);
    C.releaseImage(cur.img);
    cur = null;
  }

  function selectItem(i) {
    if (i < 0 || i >= state.items.length) return Promise.resolve();
    if (cur && cur.item === state.items[i]) return Promise.resolve();
    releaseCurrent();
    E.cancelCrop();
    setCropUI(false);
    E.clearAll();
    state.index = i;
    var item = state.items[i];
    renderQueue();

    return C.loadImageFromBlob(item.blob).then(function (img) {
      var ps = C.previewSize(item.width, item.height);
      var preview = C.drawAdjusted(img, ps.w, ps.h, null);
      state.settings.adjLive = Object.assign({ b: 100, c: 100, s: 100 }, item.adjust);
      syncAdjustUI();
      var adjusted = C.isNeutral(state.settings.adjLive)
        ? preview : C.drawAdjusted(img, ps.w, ps.h, state.settings.adjLive);
      cur = { item: item, img: img, preview: preview, previewAdjusted: adjusted, scale: ps.scale };
      E.setSource(adjusted);
      $('#stageEmpty').hidden = true;
      $('#stageName').textContent = item.origName;
      $('#stageName').title = item.origName;
      $('#stageDims').textContent = item.width + ' × ' + item.height;

      if (item.stash) {
        return E.restore(item.stash).then(function () { item.stash = null; updateDetectLabel(); });
      }
      return autoDetect();
    }).catch(function (e) {
      console.error(e);
      item.status = 'err';
      renderQueue();
      toast(T('사진을 열지 못했습니다') + ' — ' + item.origName);
    });
  }

  /* ── 얼굴 찾기 ─────────────────────────────────────────── */
  function currentDef() {
    var s = state.settings;
    return { type: s.maskType, cols: s.cols, blurPct: s.blurPct, iconId: s.iconId, customURL: s.customURL };
  }

  function autoDetect(force) {
    if (!cur) return Promise.resolve();
    var item = cur.item;
    if (item.detTried && !force && item.detRaw) return rebuildDetectionMasks();
    var el = $('#detectState');
    el.textContent = T('얼굴을 찾는 중입니다');
    // 축소본이 아니라 원본을 넘긴다 — 잘라 넣을 때 원본이 더 잘 잡힌다
    return F.detectMulti(cur.img, state.settings.range, function (i, n) {
      if (n > 1) el.textContent = TF('얼굴을 찾는 중입니다 {i}/{n}', { i: i, n: n });
    }).then(function (raw) {
      item.detRaw = raw;            // 원본 좌표계
      item.detTried = true;
      item.faceCount = F.toBoxes(raw, state.settings.conf, 1, item.width, item.height).length;
      renderQueue();
      setEngine('준비 완료', true);
      return rebuildDetectionMasks().then(function () {
        var n = E.masks().filter(function (o) { return o.data.fromDetect; }).length;
        if (!n) toast(T('찾은 얼굴이 없습니다. 칸을 직접 그려 주세요'));
      });
    }).catch(function (e) {
      console.warn('face detect failed', e);
      item.detTried = true;
      item.detRaw = [];
      setEngine('얼굴 찾기 못 씀', false);
      updateDetectLabel();
      toast(T('얼굴 찾기를 불러오지 못했습니다. 주소창이 file:// 이면 http:// 로 열어 주세요'));
    });
  }

  function rebuildDetectionMasks() {
    if (!cur) return Promise.resolve();
    E.masks().forEach(function (o) { if (o.data.fromDetect) E.canvas.remove(o); });
    // detRaw 는 원본 좌표계이므로 미리보기 배율을 곱한다
    var boxes = F.toBoxes(cur.item.detRaw || [], state.settings.conf, cur.scale, E.previewW, E.previewH);
    var def = currentDef();
    return F.ensureAssets(def).then(function () {
      boxes.forEach(function (b) {
        var o = E.addMask(b, def);
        if (o) o.data.fromDetect = true;
      });
      E.canvas.requestRenderAll();
      updateDetectLabel();
    });
  }

  function updateDetectLabel() {
    var el = $('#detectState');
    if (!state.items.length) { el.textContent = T('사진을 넣어 주세요'); el.classList.remove('ok'); return; }
    var all = E.masks();
    var it = currentItem();
    if (!all.length && it && it.status === 'done') {
      el.textContent = T('가림 처리함');
      el.classList.add('ok');
    } else {
      var det = all.filter(function (o) { return o.data.fromDetect; }).length;
      el.textContent = TF('얼굴 {n} · 표시 {b}', { n: det, b: all.length });
      el.classList.toggle('ok', all.length > 0);
    }
    updateApplyState();
    updateGuide();
  }

  function setToolsEnabled(on) {
    NEEDS_PHOTO.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !on;
    });
    $$('.filebtn[data-needs-photo]').forEach(function (el) { el.classList.toggle('off', !on); });
  }

  /* 아직 굽지 않은 변경이 있는지 — 적용/되돌리기 버튼에 그대로 비춘다 */
  function hasPending() {
    return !!cur && (E.hasPending() || !C.isNeutral(state.settings.adjLive));
  }

  function updateApplyState() {
    var p = hasPending();
    var b = $('#btnApply');
    b.disabled = !p;
    b.classList.toggle('pending', p);
    $('#btnUndo').disabled = !p && !(currentItem() && currentItem().history.length);
    $('#btnRevert').disabled = !currentItem();
    $('#btnApply').title = p ? T('바꾼 것을 사진에 굽습니다') : T('적용할 것이 없습니다');
  }

  /* ── 밝기·색 미리보기 ──────────────────────────────────── */
  var adjTimer = null;
  function onAdjustChange() {
    if (!cur) return;
    clearTimeout(adjTimer);
    adjTimer = setTimeout(function () {
      cur.previewAdjusted = C.isNeutral(state.settings.adjLive)
        ? cur.preview
        : C.drawAdjusted(cur.img, cur.preview.width, cur.preview.height, state.settings.adjLive);
      E.refreshSource(cur.previewAdjusted);
      updateApplyState();
    }, 90);
  }

  /* ── 굽기 ──────────────────────────────────────────────── */
  function renderFullRes(img, w, h, adjust, maskItems, annotImg) {
    var out = C.drawAdjusted(img, w, h, adjust);
    maskItems.forEach(function (m) {
      try { F.bakeMask(out, m); } catch (e) { console.warn('mask bake failed', e); }
    });
    if (annotImg) out.getContext('2d').drawImage(annotImg, 0, 0, out.width, out.height);
    return out;
  }

  function commit(item, canvas, blob) {
    item.history.push(item.blob);
    if (item.history.length > 8) item.history.shift();
    item.blob = blob;
    item.width = canvas.width;
    item.height = canvas.height;
    item.thumb = C.thumbDataURL(canvas);
    item.status = 'done';
  }

  function bakeCurrent() {
    if (!cur) { toast(T('사진을 먼저 넣어 주세요')); return Promise.resolve(false); }
    var item = cur.item;
    if (!E.hasPending() && C.isNeutral(state.settings.adjLive)) {
      toast(T('적용할 것이 없습니다'));
      return Promise.resolve(false);
    }

    busy(true);
    var mult = item.width / E.previewW;
    var maskItems = E.maskItemsAt(mult);
    var annotURL = E.renderAnnotations(mult);

    return (annotURL ? C.loadImage(annotURL) : Promise.resolve(null)).then(function (annotImg) {
      var out = renderFullRes(cur.img, item.width, item.height, state.settings.adjLive, maskItems, annotImg);
      return C.canvasToBlob(out, 'image/png').then(function (blob) {
        commit(item, out, blob);
        item.detRaw = [];            // 이미 가렸으므로 다시 찾을 필요가 없다
        item.stash = null;
        state.settings.adjLive = { b: 100, c: 100, s: 100 };
        syncAdjustUI();
        return reloadCurrent().then(function () {
          busy(false); renderQueue(); toast(T('적용했습니다'));
          return true;
        });
      });
    }).catch(function (e) {
      busy(false); console.error(e); toast(String(e && e.message || e));
      return false;
    });
  }

  /* 열려 있는 사진을 닫는다. 아직 적용하지 않은 것은 버린다.
   * 굽기·일괄처리 뒤에는 item.blob 이 바뀌어 있어서 화면의 cur.img 가 낡은 것이 된다.
   * 이때 selectItem 은 "같은 item" 이라고 판단해 그냥 돌아가 버리므로,
   * 다시 열기 전에 반드시 여기를 먼저 지나야 한다. */
  function dropCurrent() {
    if (!cur) return;
    cur.item.stash = null;
    C.releaseImage(cur.img);
    cur = null;
    E.clearAll();
    state.index = -1;
  }

  function reloadCurrent() {
    if (!cur) return Promise.resolve();
    var i = state.items.indexOf(cur.item);
    dropCurrent();
    return selectItem(i);
  }


  function flushPending() {
    if (!cur) return Promise.resolve();
    if (!E.hasPending() && C.isNeutral(state.settings.adjLive)) return Promise.resolve();
    toast(T('미적용분을 먼저 적용합니다'));
    return bakeCurrent().then(function () {});
  }

  /* ── 한꺼번에 처리 ─────────────────────────────────────── */
  /* quiet: 부르는 쪽이 자기 문구로 알릴 때는 기본 완료 토스트를 내지 않는다 */
  function forEachItem(fn, label, quiet) {
    var items = state.items.slice();
    if (!items.length) { toast(T('사진을 먼저 넣어 주세요')); return Promise.resolve({ ok: 0, total: 0 }); }
    var back = Math.max(0, state.index);
    dropCurrent();                 // 처리 중에는 낡은 화면을 들고 있지 않는다
    var ok = 0, fail = 0;
    var chain = Promise.resolve();
    busy(true);
    items.forEach(function (it, i) {
      chain = chain.then(function () {
        progress(i, items.length, label, it.origName);
        it.status = 'busy';
        return Promise.resolve(fn(it, i)).then(
          function () { ok++; it.status = 'done'; },
          function (e) { console.error(e); fail++; it.status = 'err'; }   // 한 장 실패해도 계속
        );
      });
    });
    return chain.then(function () {
      progress(items.length, items.length, label);
      setTimeout(function () { progress(null); }, 600);
      busy(false);
      renderQueue();
      if (fail) toast(TF('{ok}장 했습니다. {fail}장은 실패했습니다', { ok: ok, fail: fail }));
      else if (!quiet) toast(TF('{ok}장 모두 했습니다', { ok: ok }));
      return (state.items.length ? selectItem(Math.min(back, state.items.length - 1)) : Promise.resolve())
        .then(function () { return { ok: ok, total: items.length }; });
    });
  }

  function batchAutoMask() {
    var def = currentDef();
    if (def.type === 'image' && !def.customURL) { toast(T('쓸 이미지를 먼저 골라 주세요')); return Promise.resolve(); }

    // 열려 있는 사진에 '자동으로 찾아 놓은 칸' 만 있으면 그냥 버린다.
    // 일괄이 어차피 다시 찾아 굽기 때문에, 여기서 구워 두면 같은 사진을
    // 두 번 굽게 되고(엉뚱한 곳에 덧칠될 수 있다) 가린 얼굴 수도 틀어진다.
    // 사람이 직접 그린 칸·주석·색 보정이 섞여 있으면 그건 먼저 구워서 지킨다.
    var onlyAuto = !!cur &&
      E.masks().length > 0 &&
      E.masks().every(function (o) { return o.data.fromDetect; }) &&
      E.annots().length === 0 &&
      C.isNeutral(state.settings.adjLive);

    var prep = onlyAuto ? (dropCurrent(), Promise.resolve()) : flushPending();

    return prep
      .then(function () { return F.ensureAssets(def); })
      .then(function () {
        return forEachItem(function (item) {
          return withImage(item, function (img) {
            return F.detectMulti(img, state.settings.range).catch(function () { return []; }).then(function (raw) {
              item.detRaw = raw; item.detTried = true;      // 원본 좌표계
              var boxes = F.toBoxes(raw, state.settings.conf, 1, item.width, item.height);
              item.faceCount = boxes.length;
              if (!boxes.length) return;
              var maskItems = boxes.map(function (b) {
                var d = Object.assign({}, def);
                d.cols = F.clampCols(d.cols);
                return {
                  rect: {
                    cx: b.cx, cy: b.cy, w: b.w, h: b.h,
                    angle: (d.type === 'icon' || d.type === 'image') ? b.angle : 0
                  }, def: d
                };
              });
              var out = renderFullRes(img, item.width, item.height, null, maskItems, null);
              return C.canvasToBlob(out, 'image/png').then(function (blob) {
                commit(item, out, blob);
                item.detRaw = []; item.stash = null;
              });
            });
          });
        }, T('얼굴 가리기'), true);
      })
      .then(function () {
        // 검출기가 다 잡아 주지는 않는다. 몇 개를 가렸는지 알려 주고 확인을 권한다.
        var n = state.items.reduce(function (a, it) { return a + (it.faceCount || 0); }, 0);
        var blank = state.items.filter(function (it) { return it.faceCount === 0; }).length;
        toast(blank
          ? TF('얼굴 {n}개를 가렸습니다. {b}장은 얼굴을 못 찾았으니 넘겨 보며 확인해 주세요', { n: n, b: blank })
          : TF('얼굴 {n}개를 가렸습니다. 놓친 얼굴이 없는지 넘겨 보며 확인해 주세요', { n: n }));
      });
  }

  /* ── 크기·용량 ─────────────────────────────────────────── */
  function flatten(canvas) {
    var flat = C.makeCanvas(canvas.width, canvas.height);
    var g = flat.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, flat.width, flat.height);
    g.drawImage(canvas, 0, 0);
    return flat;
  }

  function convertItem(item) {
    var s = state.settings;
    return withImage(item, function (img) {
      var canvas = C.drawAdjusted(img, item.width, item.height, null);
      canvas = C.resizeCanvas(canvas, s.resizeLong);
      if (s.format === 'image/jpeg') canvas = flatten(canvas);
      return C.encodeToTarget(canvas, s.format, s.quality / 100, s.targetKB)
        .then(function (blob) { commit(item, canvas, blob); });
    });
  }

  /* ── 사진 아래 표기(스탬프) ────────────────────────────── */
  function stampText() {
    var st = state.settings.stamp;
    return [st.project, st.school, st.date]
      .filter(function (v) { return v && String(v).trim(); }).join(' | ');
  }

  function drawStampOnCanvas(canvas, text) {
    var g = canvas.getContext('2d');
    var size = Math.max(12, Math.round(canvas.height * 0.032));
    var pad = Math.max(6, Math.round(canvas.width * 0.012));
    g.font = '600 ' + size + 'px "Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif';
    g.textBaseline = 'middle';
    var tw = g.measureText(text).width;
    var bw = tw + pad * 2, bh = size + pad * 1.4;
    var bx = canvas.width - pad - bw, by = canvas.height - pad - bh;
    g.fillStyle = 'rgba(28,32,36,0.62)';   // --ink 62%
    if (g.roundRect) { g.beginPath(); g.roundRect(bx, by, bw, bh, 4); g.fill(); }
    else g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#ffffff';
    g.fillText(text, bx + pad, by + bh / 2);
  }

  function stampAll() {
    var text = stampText();
    if (!text) { toast(T('사업명·학교명·날짜 중 하나는 적어 주세요')); return Promise.resolve(); }
    return flushPending().then(function () {
      return forEachItem(function (item) {
        return withImage(item, function (img) {
          var out = C.drawAdjusted(img, item.width, item.height, null);
          drawStampOnCanvas(out, text);
          return C.canvasToBlob(out, 'image/png').then(function (blob) { commit(item, out, blob); });
        });
      }, T('사진 아래 표기'));
    });
  }

  /* ── 내보내기 ──────────────────────────────────────────── */
  function outputCanvas(item) {
    var s = state.settings;
    return withImage(item, function (img) {
      var canvas = C.drawAdjusted(img, item.width, item.height, null);
      canvas = C.resizeCanvas(canvas, s.resizeLong);
      if (s.format === 'image/jpeg') canvas = flatten(canvas);
      return canvas;
    });
  }

  function nameVars(item, n) {
    var st = state.settings.stamp;
    return { school: st.school, project: st.project, date: st.date, n: n, orig: item.origName };
  }

  function exportBlob(item, n) {
    var s = state.settings;
    return outputCanvas(item).then(function (canvas) {
      return C.encodeToTarget(canvas, s.format, s.quality / 100, s.targetKB).then(function (blob) {
        return { blob: blob, name: X.buildName(s.nameTemplate, nameVars(item, n), s.format) };
      });
    });
  }

  function dateTag() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  function headerLine() {
    var st = state.settings.stamp;
    return [st.project, st.school, st.date].filter(Boolean).join(' | ');
  }

  function downloadCurrent() {
    if (!currentItem()) { toast(T('사진을 먼저 넣어 주세요')); return; }
    flushPending().then(function () {
      busy(true);
      return exportBlob(currentItem(), state.index + 1).then(function (r) {
        X.saveBlob(r.blob, r.name); busy(false);
      });
    }).catch(function (e) { busy(false); toast(String(e)); });
  }

  function downloadZip() {
    if (!state.items.length) { toast(T('사진을 먼저 넣어 주세요')); return; }
    flushPending().then(function () {
      busy(true);
      var files = [], used = {};
      var chain = Promise.resolve();
      state.items.forEach(function (it, i) {
        chain = chain.then(function () {
          progress(i, state.items.length, 'ZIP', it.origName);
          return exportBlob(it, i + 1).then(function (r) {
            var nm = r.name;
            if (used[r.name]) nm = nm.replace(/(\.[^.]+)$/, '_' + (++used[r.name]) + '$1');
            else used[r.name] = 1;
            files.push({ name: nm, blob: r.blob });
          }).catch(function (e) { console.error(e); });
        });
      });
      return chain.then(function () {
        progress(state.items.length, state.items.length, 'ZIP');
        return X.zip(files).then(function (blob) {
          X.saveBlob(blob, 'snap-box_' + dateTag() + '.zip');
          progress(null); busy(false);
          toast(TF('{n}장을 ZIP으로 저장했습니다', { n: files.length }));
        });
      });
    }).catch(function (e) { progress(null); busy(false); toast(String(e)); });
  }

  function collectForPdf(maxPx) {
    var out = [];
    var chain = Promise.resolve();
    state.items.forEach(function (it, i) {
      chain = chain.then(function () {
        progress(i, state.items.length, 'PDF', it.origName);
        return withImage(it, function (img) {
          var cv = C.resizeCanvas(C.drawAdjusted(img, it.width, it.height, null), maxPx);
          out.push({
            canvas: cv,
            caption: X.buildName(state.settings.nameTemplate, nameVars(it, i + 1), state.settings.format)
          });
        }).catch(function (e) { console.error(e); });
      });
    });
    return chain.then(function () { progress(null); return out; });
  }

  function makeContactSheet() {
    if (!state.items.length) { toast(T('사진을 먼저 넣어 주세요')); return; }
    flushPending().then(function () {
      busy(true);
      return collectForPdf(1000).then(function (items) {
        X.contactSheet(items, state.settings.sheetLayout, headerLine())
          .save('snap-box_대지_' + dateTag() + '.pdf');
        busy(false); toast(T('PDF를 저장했습니다'));
      });
    }).catch(function (e) { busy(false); toast(String(e)); });
  }

  function makePhotoPdf() {
    if (!state.items.length) { toast(T('사진을 먼저 넣어 주세요')); return; }
    flushPending().then(function () {
      busy(true);
      return collectForPdf(1800).then(function (items) {
        X.photoPdf(items, headerLine()).save('snap-box_사진_' + dateTag() + '.pdf');
        busy(false); toast(T('PDF를 저장했습니다'));
      });
    }).catch(function (e) { busy(false); toast(String(e)); });
  }

  function mergeChecked() {
    var sel = state.items.filter(function (i) { return i.checked; });
    if (sel.length !== 2) { toast(T('두 장만 골라 주세요')); return; }
    flushPending().then(function () {
      busy(true);
      return withImage(sel[0], function (a) {
        var ca = C.drawAdjusted(a, sel[0].width, sel[0].height, null);
        return withImage(sel[1], function (b) {
          var cb = C.drawAdjusted(b, sel[1].width, sel[1].height, null);
          var out = X.mergeSideBySide(ca, cb, Math.round(Math.max(ca.width, cb.width) * 0.02), '#ffffff');
          return C.canvasToBlob(out, 'image/png').then(function (blob) {
            state.items.push({
              id: 'i' + (++state.seq),
              origName: sel[0].origName + '_' + sel[1].origName,
              blob: blob, origBlob: blob,
              width: out.width, height: out.height,
              thumb: C.thumbDataURL(out),
              status: 'done', detRaw: [], detTried: true,
              adjust: { b: 100, c: 100, s: 100 },
              history: [], stash: null, checked: false
            });
            renderQueue(); busy(false); toast(T('붙인 사진을 목록에 넣었습니다'));
          });
        });
      });
    }).catch(function (e) { busy(false); toast(String(e)); });
  }

  /* ── 돌리기 · 뒤집기 · 자르기 ──────────────────────────── */
  function geomOp(op) {
    if (!currentItem()) { toast(T('사진을 먼저 넣어 주세요')); return; }
    flushPending().then(function () {
      busy(true);
      var it = currentItem();
      return withImage(it, function (img) {
        var out = op(C.drawAdjusted(img, it.width, it.height, null));
        if (!out) { busy(false); return; }
        return C.canvasToBlob(out, 'image/png').then(function (blob) {
          commit(it, out, blob);
          it.detRaw = null; it.detTried = false;
          return reloadCurrent().then(function () { busy(false); renderQueue(); });
        });
      });
    }).catch(function (e) { busy(false); console.error(e); toast(String(e)); });
  }

  function setCropUI(on) {
    $('#btnCropStart').hidden = on;
    $('#btnCropApply').hidden = !on;
    $('#btnCropCancel').hidden = !on;
  }

  function applyCrop() {
    var r = E.cropRect();
    if (!r || !cur) { setCropUI(false); return; }
    var mult = cur.item.width / E.previewW;
    var x = Math.max(0, Math.round(r.x * mult));
    var y = Math.max(0, Math.round(r.y * mult));
    var w = Math.min(cur.item.width - x, Math.round(r.w * mult));
    var h = Math.min(cur.item.height - y, Math.round(r.h * mult));
    E.cancelCrop(); setCropUI(false);
    if (w < 16 || h < 16) { toast(T('자를 곳이 너무 작습니다')); return; }
    geomOp(function (src) { return C.cropCanvas(src, x, y, w, h); });
  }

  /* ── 되돌리기 · 원본으로 ───────────────────────────────── */
  function undo() {
    var item = currentItem();
    if (!item) { toast(T('사진을 먼저 넣어 주세요')); return; }
    if (E.hasPending()) {
      E.clearMasks();
      E.annots().forEach(function (o) { E.canvas.remove(o); });
      E.canvas.requestRenderAll();
      state.settings.adjLive = { b: 100, c: 100, s: 100 };
      syncAdjustUI(); onAdjustChange();
      updateDetectLabel();
      toast(T('아직 적용하지 않은 것을 지웠습니다'));
      return;
    }
    if (!item.history.length) { toast(T('더 되돌릴 것이 없습니다')); return; }
    busy(true);
    item.blob = item.history.pop();
    reloadFromBlob(item).then(function () { busy(false); toast(T('되돌렸습니다')); })
      .catch(function (e) { busy(false); toast(String(e)); });
  }

  function revertOriginal() {
    var item = currentItem();
    if (!item) { toast(T('사진을 먼저 넣어 주세요')); return; }
    if (!confirm(T('이 사진을 처음 넣었을 때로 되돌릴까요?'))) return;
    busy(true);
    item.history.push(item.blob);
    item.blob = item.origBlob;
    item.status = 'wait';
    reloadFromBlob(item).then(function () { busy(false); toast(T('원본으로 되돌렸습니다')); })
      .catch(function (e) { busy(false); toast(String(e)); });
  }

  function reloadFromBlob(item) {
    return C.loadImageFromBlob(item.blob).then(function (img) {
      item.width = img.naturalWidth; item.height = img.naturalHeight;
      item.thumb = C.thumbDataURL(img);
      C.releaseImage(img);
      item.detRaw = null; item.detTried = false; item.stash = null;
      return reloadCurrent();
    }).then(function () { renderQueue(); });
  }

  /* ── 단계(도구) 이동 ───────────────────────────────────── */
  function goStep(name) {
    if (STEPS.indexOf(name) < 0) return;
    if (state.step !== name) { E.cancelCrop(); setCropUI(false); }
    state.step = name;
    var at = STEPS.indexOf(name);
    $$('#toolTabs .tab').forEach(function (b, i) {
      b.classList.toggle('on', i === at);
      b.classList.toggle('done', i < at);
    });
    STEPS.forEach(function (s) { $('#tool-' + s).hidden = (s !== name); });
    $('#toolTitle').textContent = T(STEP_META[name].title);
    $('#toolIcon').className = 'fa-solid ' + STEP_META[name].icon;
    E.setDrawMode(name === 'face' && $('#btnDrawBox').classList.contains('on'));
    $('#stageWrap').classList.toggle('drawing', E.getDrawMode());
    if (name === 'out') updateOutSummary();
  }

  /* 내보내기 단계에서 지금 설정을 한눈에 보여 준다 */
  function updateOutSummary() {
    var s = state.settings;
    var box = $('#outSummary');
    if (!box) return;
    var rows = [
      [T('저장 형식'), s.format === 'image/png' ? 'PNG' : 'JPG ' + s.quality],
      [T('긴 변'), s.resizeLong ? s.resizeLong + ' px' : T('원래대로')],
      [T('목표 용량'), s.targetKB ? s.targetKB + ' KB' : T('쓰지 않음')],
      [T('파일 이름'), X.buildName(s.nameTemplate, nameVars(
        currentItem() || { origName: 'IMG_0001' }, Math.max(1, state.index + 1)), s.format)]
    ];
    box.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'srow';
      var k = document.createElement('span'); k.className = 'sk'; k.textContent = r[0];
      var v = document.createElement('span'); v.className = 'sv mono'; v.textContent = r[1];
      d.appendChild(k); d.appendChild(v); box.appendChild(d);
    });
  }


  /* ── 지금 할 일 한 줄 ────────────────────────────────────
   * 도구가 스스로 다음 동작을 제시한다. 처음 쓰는 사람은 이 줄만 따라가면
   * 넣기 → 가리기 → 받기 가 끝난다. 나머지 설정은 안 건드려도 된다. */
  var guideAction = null;

  function updateGuide() {
    var txt = $('#guideText'), btn = $('#guideBtn'), ico = $('#guideIcon');
    if (!txt) return;
    var n = state.items.length;

    function set(icon, message, label, btnIcon, act, primary) {
      ico.className = 'fa-solid ' + icon;
      txt.textContent = message;
      btn.innerHTML = '<i class="fa-solid ' + btnIcon + '"></i>';
      btn.appendChild(document.createTextNode(label));
      btn.className = 'db ' + (primary === false ? '' : 'go');
      btn.hidden = false;
      guideAction = act;
    }

    if (!n) {
      $('#guide').className = 'guide';
      set('fa-images', T('먼저 사진을 넣습니다'), T('사진 넣기'), 'fa-plus',
          function () { $('#fileInput').click(); });
      return;
    }

    var left = state.items.filter(function (it) { return it.status !== 'done'; }).length;
    var it = currentItem();

    if (left) {
      // 얼굴을 못 찾았다면, 어디를 만져야 하는지 버튼 하나로 대신해 준다.
      // '자세한 설정' 안의 얼굴 크기를 직접 찾아 들어가라고 하면 아무도 못 찾는다.
      if (it && it.faceCount === 0 && !E.masks().length && state.settings.range !== 'group') {
        $('#guide').className = 'guide warn';
        set('fa-triangle-exclamation', T('얼굴을 못 찾았습니다. 더 작은 얼굴까지 찾아볼까요?'),
            T('더 찾아보기'), 'fa-magnifying-glass-plus', function () {
              state.settings.range = 'group';
              setPick('#detectRange', 'group');
              $('#faceMore').open = true;
              saveSettings();
              autoDetect(true);
            });
        return;
      }
      if (it && it.faceCount === 0 && !E.masks().length) {
        $('#guide').className = 'guide warn';
        set('fa-triangle-exclamation', T('얼굴을 못 찾았습니다. 사진 위를 끌어서 직접 표시해 주세요'),
            T('전체 가리기'), 'fa-layer-group', batchAutoMask, false);
        return;
      }
      $('#guide').className = 'guide';
      set('fa-user-large', TF('사진 {n}장이 있습니다. 찾은 얼굴을 한꺼번에 가립니다', { n: n }),
          T('전체 가리기'), 'fa-layer-group', batchAutoMask);
      return;
    }

    var blank = state.items.filter(function (x) { return x.faceCount === 0; }).length;
    $('#guide').className = 'guide ' + (blank ? 'warn' : 'done');
    set('fa-circle-check',
        blank ? TF('다 가렸습니다. {b}장은 얼굴을 못 찾았으니 넘겨 보며 확인해 주세요', { b: blank })
              : T('다 가렸습니다. 넘겨 보며 확인한 뒤 내려받으세요'),
        T('전체 내려받기'), 'fa-file-zipper',
        function () { goStep('out'); downloadZip(); });
  }

  /* ── 작은 UI 도우미 ────────────────────────────────────── */
  function bindPick(sel, onPick) {
    $$(sel + ' .db').forEach(function (b) {
      b.addEventListener('click', function () {
        $$(sel + ' .db').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onPick(b.dataset.v);
      });
    });
  }
  function setPick(sel, v) {
    $$(sel + ' .db').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
  }

  function syncAdjustUI() {
    var a = state.settings.adjLive;
    $('#adjBright').value = a.b; $('#adjBrightOut').value = a.b;
    $('#adjContrast').value = a.c; $('#adjContrastOut').value = a.c;
    $('#adjSat').value = a.s; $('#adjSatOut').value = a.s;
  }

  function showMaskOptions() {
    $$('.opt[data-for]').forEach(function (el) { el.hidden = el.dataset.for !== state.settings.maskType; });
  }

  function buildIconPicker() {
    var box = $('#iconPicker');
    box.innerHTML = '';
    SnapLab.ICONS.forEach(function (ic) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = ic.id === state.settings.iconId ? 'on' : '';
      var im = document.createElement('img');
      im.src = ic.url; im.alt = '';
      b.appendChild(im);
      b.addEventListener('click', function () {
        state.settings.iconId = ic.id;
        saveSettings();
        buildIconPicker();
        if (state.settings.maskType === 'icon') applyDefToAllBoxes();
      });
      box.appendChild(b);
    });
  }

  function applyDefToSelected() {
    var sel = E.selectedMasks();
    if (!sel.length) { toast(T('고른 칸이 없습니다')); return; }
    var def = currentDef();
    if (def.type === 'image' && !def.customURL) { toast(T('쓸 이미지를 먼저 골라 주세요')); return; }
    F.ensureAssets(def).then(function () { E.setDefOn(sel, def); });
  }

  function applyDefToAllBoxes() {
    var all = E.masks();
    if (!all.length) { toast(T('칸이 없습니다')); return; }
    var def = currentDef();
    if (def.type === 'image' && !def.customURL) { toast(T('쓸 이미지를 먼저 골라 주세요')); return; }
    F.ensureAssets(def).then(function () { E.setDefOn(all, def); });
  }

  function updateNamePreview() {
    var it = state.items[state.index >= 0 ? state.index : 0];
    var vars = it ? nameVars(it, (state.index >= 0 ? state.index : 0) + 1)
                  : { school: state.settings.stamp.school, project: state.settings.stamp.project,
                      date: state.settings.stamp.date, n: 1, orig: 'IMG_0001' };
    $('#namePreview').textContent = X.buildName(state.settings.nameTemplate, vars, state.settings.format);
    var sp = $('#stampPreview');
    if (sp) sp.textContent = stampText() || '—';
  }

  /* ── 이벤트 연결 ───────────────────────────────────────── */
  function bindUI() {
    $$('#toolTabs .tab').forEach(function (b) {
      b.addEventListener('click', function () { goStep(b.dataset.step); });
    });

    $('#guideBtn').addEventListener('click', function () { if (guideAction) guideAction(); });

    var dz = $('#dropZone');
    dz.addEventListener('click', function (e) { if (e.target.tagName !== 'INPUT') $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    document.addEventListener('dragleave', function (e) {
      if (e.target === document.documentElement) dz.classList.remove('over');
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault(); dz.classList.remove('over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    $('#btnClearQueue').addEventListener('click', function () {
      if (state.items.length && !confirm(T('사진을 모두 뺄까요? 되돌릴 수 없습니다.'))) return;
      releaseCurrent(); E.clearAll();
      state.items = []; state.index = -1;
      $('#stageEmpty').hidden = false;
      $('#stageName').textContent = T('미리보기');
      $('#stageDims').textContent = '';
      renderQueue(); updateDetectLabel();
    });
    $('#btnRemoveSel').addEventListener('click', function () {
      var n = state.items.filter(function (i) { return i.checked; }).length;
      if (!n) { toast(T('뺄 사진을 체크해 주세요')); return; }
      if (!confirm(TF('체크한 {n}장을 뺄까요?', { n: n }))) return;
      var keep = currentItem();
      state.items = state.items.filter(function (i) { return !i.checked; });
      if (state.items.indexOf(keep) < 0) {
        releaseCurrent(); E.clearAll(); state.index = -1;
        $('#stageEmpty').hidden = state.items.length > 0;
        if (state.items.length) selectItem(0); else { renderQueue(); updateDetectLabel(); }
      } else { state.index = state.items.indexOf(keep); renderQueue(); }
    });

    /* 1. 얼굴 가리기 */
    $('#confSlider').addEventListener('input', function (e) {
      state.settings.conf = sensToConf(e.target.value);
      $('#confOut').value = e.target.value;
    });
    $('#confSlider').addEventListener('change', function () { saveSettings(); rebuildDetectionMasks(); });
    bindPick('#detectRange', function (v) {
      state.settings.range = v; saveSettings();
      if (cur) autoDetect(true);
    });
    $('#btnRedetect').addEventListener('click', function () { autoDetect(true); });
    $('#btnDrawBox').addEventListener('click', function () {
      var on = !$('#btnDrawBox').classList.contains('on');
      $('#btnDrawBox').classList.toggle('on', on);
      E.setDrawMode(on);
      $('#stageWrap').classList.toggle('drawing', on);
    });
    bindPick('#maskType', function (v) { state.settings.maskType = v; saveSettings(); showMaskOptions(); });
    $('#pixelStrength').addEventListener('input', function (e) {
      state.settings.cols = strengthToCols(e.target.value);
      $('#pixelStrengthOut').value = e.target.value;
    });
    $('#pixelStrength').addEventListener('change', function () {
      saveSettings(); if (state.settings.maskType === 'pixelate') applyDefToAllBoxes();
    });
    $('#blurStrength').addEventListener('input', function (e) {
      state.settings.blurPct = +e.target.value; $('#blurStrengthOut').value = e.target.value;
    });
    $('#blurStrength').addEventListener('change', function () {
      saveSettings(); if (state.settings.maskType === 'blur') applyDefToAllBoxes();
    });
    $('#customMaskFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        state.settings.customURL = fr.result;
        F.customImage(fr.result).then(function () {
          var box = $('#customMaskPrev');
          box.innerHTML = '';
          var im = document.createElement('img'); im.src = fr.result; im.alt = '';
          box.appendChild(im);
          if (state.settings.maskType === 'image') applyDefToAllBoxes();
        });
      };
      fr.readAsDataURL(f);
    });
    $('#btnApplyToSelected').addEventListener('click', applyDefToSelected);
    $('#btnApplyToAll').addEventListener('click', applyDefToAllBoxes);
    $('#btnDelBox').addEventListener('click', function () {
      if (!E.deleteSelected()) toast(T('고른 칸이 없습니다'));
      updateDetectLabel();
    });
    $('#btnClearBoxes').addEventListener('click', function () { E.clearMasks(); updateDetectLabel(); });

    /* 2. 다듬기 */
    $('#btnRotate').addEventListener('click', function () { geomOp(C.rotate90); });
    $('#btnFlip').addEventListener('click', function () { geomOp(C.flipH); });
    $('#btnCropStart').addEventListener('click', function () {
      if (!cur) { toast(T('사진을 먼저 넣어 주세요')); return; }
      E.startCrop(); setCropUI(true);
    });
    $('#btnCropApply').addEventListener('click', applyCrop);
    $('#btnCropCancel').addEventListener('click', function () { E.cancelCrop(); setCropUI(false); });

    [['adjBright', 'b'], ['adjContrast', 'c'], ['adjSat', 's']].forEach(function (p) {
      $('#' + p[0]).addEventListener('input', function (e) {
        state.settings.adjLive[p[1]] = +e.target.value;
        $('#' + p[0] + 'Out').value = e.target.value;
        onAdjustChange();
      });
    });
    $('#btnAdjReset').addEventListener('click', function () {
      state.settings.adjLive = { b: 100, c: 100, s: 100 };
      syncAdjustUI(); onAdjustChange();
    });

    function annotStyle() {
      var s = state.settings.annot;
      s.color = $('#annotColor').value;
      s.width = +$('#annotWidth').value;
      s.size = +$('#annotSize').value;
      saveSettings();
      return s;
    }
    $('#btnAddText').addEventListener('click', function () {
      if (!cur) { toast(T('사진을 먼저 넣어 주세요')); return; }
      E.addText(T('내용'), annotStyle());
    });
    $('#btnAddRect').addEventListener('click', function () {
      if (!cur) { toast(T('사진을 먼저 넣어 주세요')); return; }
      E.addRect(annotStyle());
    });
    $('#btnAddArrow').addEventListener('click', function () {
      if (!cur) { toast(T('사진을 먼저 넣어 주세요')); return; }
      E.addArrow(annotStyle());
    });
    $$('.filebtn[data-needs-photo]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (el.classList.contains('off')) { e.preventDefault(); toast(T('사진을 먼저 넣어 주세요')); }
      });
    });
    $('#logoFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!cur) { toast(T('사진을 먼저 넣어 주세요')); e.target.value = ''; return; }
      var fr = new FileReader();
      fr.onload = function () { C.loadImage(fr.result).then(function (img) { E.addImageObject(img); }); };
      fr.readAsDataURL(f);
      e.target.value = '';
    });

    ['stampProject', 'stampSchool', 'stampDate'].forEach(function (id) {
      $('#' + id).addEventListener('input', function (e) {
        state.settings.stamp[id.replace('stamp', '').toLowerCase()] = e.target.value;
        saveSettings(); updateNamePreview();
      });
    });
    $('#btnAddStamp').addEventListener('click', function () {
      if (!cur) { toast(T('사진을 먼저 넣어 주세요')); return; }
      var t = stampText();
      if (!t) { toast(T('사업명·학교명·날짜 중 하나는 적어 주세요')); return; }
      E.addStamp(t);
    });
    $('#btnStampAll').addEventListener('click', stampAll);

    /* 3. 크기·용량 */
    $('#resizeLong').addEventListener('change', function (e) {
      state.settings.resizeLong = Math.max(0, +e.target.value || 0); saveSettings(); updateOutSummary();
    });
    $('#targetKB').addEventListener('change', function (e) {
      state.settings.targetKB = Math.max(0, +e.target.value || 0); saveSettings(); updateOutSummary();
    });
    bindPick('#outFormat', function (v) {
      state.settings.format = v; saveSettings(); updateNamePreview(); updateOutSummary();
    });
    $('#outQuality').addEventListener('input', function (e) {
      state.settings.quality = +e.target.value; $('#outQualityOut').value = e.target.value;
    });
    $('#outQuality').addEventListener('change', function () { saveSettings(); updateOutSummary(); });
    $('#nameTemplate').addEventListener('input', function (e) {
      state.settings.nameTemplate = e.target.value; saveSettings(); updateNamePreview(); updateOutSummary();
    });
    $('#btnConvertCurrent').addEventListener('click', function () {
      if (!currentItem()) { toast(T('사진을 먼저 넣어 주세요')); return; }
      flushPending()
        .then(function () { busy(true); return convertItem(currentItem()); })
        .then(function () { return reloadCurrent(); })
        .then(function () { busy(false); renderQueue(); toast(T('적용했습니다')); })
        .catch(function (e) { busy(false); toast(String(e)); });
    });
    $('#btnConvertAll').addEventListener('click', function () {
      flushPending()
        .then(function () { return forEachItem(convertItem, T('크기·용량')); });
    });

    /* 4. 내보내기 */
    $('#btnDownloadCurrent').addEventListener('click', downloadCurrent);
    $('#btnDownloadZip').addEventListener('click', downloadZip);
    bindPick('#sheetLayout', function (v) { state.settings.sheetLayout = v; saveSettings(); });
    $('#btnContactSheet').addEventListener('click', makeContactSheet);
    $('#btnPhotoPdf').addEventListener('click', makePhotoPdf);
    $('#btnMerge').addEventListener('click', mergeChecked);

    /* 아래 작업 줄 */
    $('#btnPrev').addEventListener('click', function () { if (state.index > 0) selectItem(state.index - 1); });
    $('#btnNext').addEventListener('click', function () {
      if (state.index < state.items.length - 1) selectItem(state.index + 1);
    });
    $('#btnApply').addEventListener('click', bakeCurrent);
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRevert').addEventListener('click', revertOriginal);

    /* 키보드 */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      var act = E.canvas && E.canvas.getActiveObject();
      if (act && act.isEditing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (E.deleteSelected()) { e.preventDefault(); updateDetectLabel(); }
      } else if (e.key === 'ArrowLeft') {
        if (state.index > 0) selectItem(state.index - 1);
      } else if (e.key === 'ArrowRight') {
        if (state.index < state.items.length - 1) selectItem(state.index + 1);
      }
    });

    window.addEventListener('beforeunload', function (e) {
      if (state.items.length) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function syncUIFromSettings() {
    var s = state.settings;
    $('#confSlider').value = confToSens(s.conf);
    $('#confOut').value = confToSens(s.conf);
    setPick('#detectRange', s.range);
    setPick('#maskType', s.maskType);
    $('#pixelStrength').value = colsToStrength(s.cols);
    $('#pixelStrengthOut').value = colsToStrength(s.cols);
    $('#blurStrength').value = s.blurPct; $('#blurStrengthOut').value = s.blurPct;
    $('#annotColor').value = s.annot.color;
    $('#annotWidth').value = s.annot.width;
    $('#annotSize').value = s.annot.size;
    $('#stampProject').value = s.stamp.project || '';
    $('#stampSchool').value = s.stamp.school || '';
    $('#stampDate').value = s.stamp.date || new Date().toISOString().slice(0, 10);
    s.stamp.date = $('#stampDate').value;
    $('#resizeLong').value = s.resizeLong;
    $('#targetKB').value = s.targetKB;
    setPick('#outFormat', s.format);
    $('#outQuality').value = s.quality; $('#outQualityOut').value = s.quality;
    $('#nameTemplate').value = s.nameTemplate;
    setPick('#sheetLayout', s.sheetLayout);
    showMaskOptions();
    syncAdjustUI();
    updateNamePreview();
  }

  /* ── 시작 ──────────────────────────────────────────────── */
  function boot() {
    loadSettings();
    E.init($('#c'), $('#stageWrap'), function () { updateDetectLabel(); });
    E.setDefProvider(currentDef);
    buildIconPicker();
    bindUI();
    syncUIFromSettings();
    var more = $('#faceMore');
    try { more.open = localStorage.getItem('snapbox.faceMore') === '1'; } catch (e) {}
    more.addEventListener('toggle', function () {
      try { localStorage.setItem('snapbox.faceMore', more.open ? '1' : '0'); } catch (e) {}
    });
    goStep('face');
    renderQueue();
    updateDetectLabel();
    F.preloadIcons();
    // 얼굴 찾기 모듈을 미리 데워 둔다. 실패해도 나머지 기능은 그대로 쓴다.
    F.warmUp().then(function () { setEngine('준비 완료', true); },
                    function () { setEngine('얼굴 찾기 못 씀', false); });
    SnapLab.state = state;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
