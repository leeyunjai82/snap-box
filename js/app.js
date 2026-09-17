/* app.js — 상태, 파일 큐, 탭/라우팅, 굽기 파이프라인, 일괄 처리 */
(function () {
  'use strict';

  var C = SnapLab.convert;
  var F = SnapLab.face;
  var E = SnapLab.editor;
  var X = SnapLab.exporter;
  var T = SnapLab.i18n.t;

  var LS_KEY = 'snapbox.settings';

  /* ── 상태 ──────────────────────────────────────────────── */
  var state = {
    items: [],
    index: -1,
    seq: 0,
    settings: {
      conf: 0.5,
      maskType: 'pixelate',
      block: 14,
      blurPct: 45,
      iconId: 'smile',
      customURL: '',
      adjLive: { b: 100, c: 100, s: 100 },
      annot: { color: '#ff3b30', width: 4, size: 36 },
      stamp: { project: '', school: '', date: '' },
      resizeLong: 1600,
      targetKB: 0,
      format: 'image/jpeg',
      quality: 88,
      nameTemplate: '{school}_{date}_{n}',
      sheetLayout: '2x2'
    }
  };

  var cur = null;   // {item, img, preview, previewAdjusted, scale}
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ── 알림 / 진행률 ─────────────────────────────────────── */
  function toast(msg, kind) {
    var d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(function () {
      d.style.transition = 'opacity .3s'; d.style.opacity = '0';
      setTimeout(function () { d.remove(); }, 320);
    }, 3200);
  }

  function busy(on, text) {
    $('#busy').hidden = !on;
    $('#busyText').textContent = text || T('msg.working');
  }

  function progress(i, n, label) {
    var w = $('#progressWrap');
    if (n == null) { w.hidden = true; return; }
    w.hidden = false;
    $('#progressBar').firstElementChild.style.width = (n ? (i / n * 100) : 0) + '%';
    $('#progressText').textContent = (label ? label + ' ' : '') + i + ' / ' + n;
  }

  /* ── 설정 저장 ─────────────────────────────────────────── */
  function loadSettings() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      // 이미지 데이터는 저장하지 않는다. 입력값·마지막 설정만.
      delete s.customURL;
      Object.keys(s).forEach(function (k) {
        if (k in state.settings) {
          if (typeof state.settings[k] === 'object' && state.settings[k] !== null) {
            Object.assign(state.settings[k], s[k]);
          } else state.settings[k] = s[k];
        }
      });
    } catch (e) { /* 무시 */ }
  }

  function saveSettings() {
    try {
      var s = Object.assign({}, state.settings);
      delete s.customURL;
      delete s.adjLive;
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) { /* 무시 */ }
  }

  /* ── 파일 큐 ───────────────────────────────────────────── */
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
    var accepted = files.filter(C.isSupported);
    files.filter(function (f) { return !C.isSupported(f); })
      .forEach(function (f) { toast(T('msg.unsupported', { name: f.name }), 'err'); });
    if (!accepted.length) return Promise.resolve();

    busy(true);
    var added = 0;
    var chain = Promise.resolve();
    accepted.forEach(function (file, i) {
      chain = chain.then(function () {
        progress(i, accepted.length, 'load');
        return C.toWebSafeBlob(file).catch(function () {
          toast(T('msg.heicFail', { name: file.name }), 'err');
          return null;
        }).then(function (blob) {
          if (!blob) return;
          return C.loadImageFromBlob(blob).then(function (img) {
            var item = {
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
              adjust: { b: 100, c: 100, s: 100 },
              history: [],
              stash: null,
              checked: false
            };
            C.releaseImage(img);
            state.items.push(item);
            added++;
          }).catch(function () {
            toast(T('msg.loadFail', { name: file.name }), 'err');
          });
        });
      });
    });

    return chain.then(function () {
      progress(null);
      busy(false);
      renderQueue();
      if (added) toast(T('msg.added', { n: added }), 'ok');
      if (state.index < 0 && state.items.length) return selectItem(0);
    });
  }

  function renderQueue() {
    var ul = $('#queueList');
    ul.innerHTML = '';
    state.items.forEach(function (it, i) {
      var li = document.createElement('li');
      li.className = (i === state.index ? 'active' : '') + (it.status === 'err' ? ' err' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!it.checked;
      cb.addEventListener('click', function (e) { e.stopPropagation(); it.checked = cb.checked; });
      var img = document.createElement('img');
      img.src = it.thumb; img.alt = '';
      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<div class="nm"></div><div class="st"></div>';
      meta.querySelector('.nm').textContent = it.origName;
      var st = meta.querySelector('.st');
      st.textContent = T('st.' + it.status) + ' · ' + it.width + '×' + it.height;
      st.className = 'st ' + (it.status === 'done' ? 'done' : it.status === 'busy' ? 'busy' : it.status === 'err' ? 'err' : '');
      li.appendChild(cb); li.appendChild(img); li.appendChild(meta);
      li.addEventListener('click', function () { selectItem(i); });
      ul.appendChild(li);
    });
    $('#queueCount').textContent = state.items.length;
    updateNamePreview();
  }

  /* ── 이미지 선택/로드 ──────────────────────────────────── */
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
      $('#stageDims').textContent = item.width + ' × ' + item.height;

      if (item.stash) {
        return E.restore(item.stash).then(function () { item.stash = null; updateDetectLabel(); });
      }
      return autoDetect();
    }).catch(function (e) {
      console.error(e);
      item.status = 'err';
      renderQueue();
      toast(T('msg.loadFail', { name: item.origName }), 'err');
    });
  }

  /* ── 얼굴 검출 ─────────────────────────────────────────── */
  function currentDef() {
    var s = state.settings;
    return {
      type: s.maskType, block: s.block, blurPct: s.blurPct,
      iconId: s.iconId, customURL: s.customURL
    };
  }

  function autoDetect(force) {
    if (!cur) return Promise.resolve();
    var item = cur.item;
    if (item.detTried && !force && item.detRaw) return rebuildDetectionMasks();
    $('#detectState').textContent = T('msg.detecting');
    return F.detect(cur.preview).then(function (raw) {
      item.detRaw = raw;
      item.detTried = true;
      return rebuildDetectionMasks().then(function () {
        var n = E.masks().filter(function (o) { return o.data.fromDetect; }).length;
        if (!n) toast(T('msg.detectNone'));
      });
    }).catch(function (e) {
      console.warn('face detect failed', e);
      item.detTried = true;
      item.detRaw = [];
      $('#detectState').textContent = '';
      toast(T('msg.detectFail'), 'err');
    });
  }

  function rebuildDetectionMasks() {
    if (!cur) return Promise.resolve();
    var item = cur.item;
    E.masks().forEach(function (o) {
      if (o.data.fromDetect) E.canvas.remove(o);
    });
    var raw = item.detRaw || [];
    var boxes = F.toBoxes(raw, state.settings.conf, 1, E.previewW, E.previewH);
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
    var all = E.masks();
    var det = all.filter(function (o) { return o.data.fromDetect; }).length;
    $('#detectState').textContent = T('ph.faces', { n: det, b: all.length });
  }

  /* ── 색 보정 미리보기 ──────────────────────────────────── */
  var adjTimer = null;
  function onAdjustChange() {
    if (!cur) return;
    clearTimeout(adjTimer);
    adjTimer = setTimeout(function () {
      var ps = { w: cur.preview.width, h: cur.preview.height };
      cur.previewAdjusted = C.isNeutral(state.settings.adjLive)
        ? cur.preview : C.drawAdjusted(cur.img, ps.w, ps.h, state.settings.adjLive);
      E.refreshSource(cur.previewAdjusted);
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
    if (!cur) { toast(T('msg.noImage')); return Promise.resolve(false); }
    var item = cur.item;
    var pending = E.hasPending();
    var adjusted = !C.isNeutral(state.settings.adjLive);
    if (!pending && !adjusted) { toast(T('msg.nothingToApply')); return Promise.resolve(false); }

    busy(true);
    var mult = item.width / E.previewW;
    var maskItems = E.maskItemsAt(mult);
    var annotURL = E.renderAnnotations(mult);

    var p = annotURL ? C.loadImage(annotURL) : Promise.resolve(null);
    return p.then(function (annotImg) {
      var out = renderFullRes(cur.img, item.width, item.height,
        state.settings.adjLive, maskItems, annotImg);
      return C.canvasToBlob(out, 'image/png').then(function (blob) {
        commit(item, out, blob);
        item.detRaw = [];      // 이미 가려졌으므로 재검출 불필요
        item.stash = null;
        state.settings.adjLive = { b: 100, c: 100, s: 100 };
        syncAdjustUI();
        return reloadCurrent().then(function () {
          busy(false);
          renderQueue();
          toast(T('msg.applied'), 'ok');
          return true;
        });
      });
    }).catch(function (e) {
      busy(false); console.error(e);
      toast(String(e && e.message || e), 'err');
      return false;
    });
  }

  /* 현재 이미지를 blob 기준으로 다시 로드 (마스크/주석은 비운다) */
  function reloadCurrent() {
    if (!cur) return Promise.resolve();
    var item = cur.item;
    var i = state.items.indexOf(item);
    C.releaseImage(cur.img);
    cur = null;
    E.clearAll();
    state.index = -1;
    return selectItemForce(i);
  }

  function selectItemForce(i) {
    state.index = -1;
    return selectItem(i);
  }

  /* 미적용 변경이 있으면 먼저 굽는다 (내보내기/변환 직전) */
  function flushPending() {
    if (!cur) return Promise.resolve();
    if (!E.hasPending() && C.isNeutral(state.settings.adjLive)) return Promise.resolve();
    toast(T('msg.pendingApply'));
    return bakeCurrent().then(function () {});
  }

  /* ── 일괄 처리 공통 ────────────────────────────────────── */
  function forEachItem(fn, label) {
    var items = state.items.slice();
    if (!items.length) { toast(T('msg.noImage')); return Promise.resolve({ ok: 0, total: 0 }); }
    var ok = 0, fail = 0;
    var chain = Promise.resolve();
    busy(true);
    items.forEach(function (it, i) {
      chain = chain.then(function () {
        progress(i, items.length, label);
        it.status = 'busy';
        return Promise.resolve(fn(it, i)).then(function () {
          ok++; it.status = 'done';
        }, function (e) {
          console.error(e); fail++; it.status = 'err';
        });
      });
    });
    return chain.then(function () {
      progress(items.length, items.length, label);
      setTimeout(function () { progress(null); }, 500);
      busy(false);
      renderQueue();
      if (fail) toast(T('msg.batchFail', { n: fail }), 'err');
      toast(T('msg.batchDone', { ok: ok, total: items.length }), 'ok');
      return { ok: ok, total: items.length };
    });
  }

  /* 큐 전체 자동 가림 (헤드리스) */
  function batchAutoMask() {
    var def = currentDef();
    return flushPending()
      .then(function () { return F.ensureAssets(def); })
      .then(function () {
        return forEachItem(function (item) {
          return withImage(item, function (img) {
            var ps = C.previewSize(item.width, item.height);
            var prev = C.drawAdjusted(img, ps.w, ps.h, null);
            return F.detect(prev).catch(function () { return []; }).then(function (raw) {
              item.detRaw = raw; item.detTried = true;
              var boxes = F.toBoxes(raw, state.settings.conf, 1 / ps.scale, item.width, item.height);
              if (!boxes.length) return;
              var maskItems = boxes.map(function (b) {
                var d = Object.assign({}, def);
                d.cols = F.colsFor(b.w * ps.scale, d.block);
                return {
                  rect: {
                    cx: b.cx, cy: b.cy, w: b.w, h: b.h,
                    angle: (d.type === 'icon' || d.type === 'image') ? b.angle : 0
                  },
                  def: d
                };
              });
              var out = renderFullRes(img, item.width, item.height, null, maskItems, null);
              return C.canvasToBlob(out, 'image/png').then(function (blob) {
                commit(item, out, blob);
                item.detRaw = [];
                item.stash = null;
              });
            });
          });
        }, 'mask');
      })
      .then(function () {
        var i = state.index >= 0 ? state.index : 0;
        if (state.items.length) return selectItemForce(i);
      });
  }

  /* ── 변환(리사이즈/압축/포맷) ──────────────────────────── */
  function convertItem(item) {
    var s = state.settings;
    return withImage(item, function (img) {
      var canvas = C.drawAdjusted(img, item.width, item.height, null);
      canvas = C.resizeCanvas(canvas, s.resizeLong);
      if (s.format === 'image/jpeg') {
        var flat = C.makeCanvas(canvas.width, canvas.height);
        var g = flat.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, flat.width, flat.height);
        g.drawImage(canvas, 0, 0);
        canvas = flat;
      }
      return C.encodeToTarget(canvas, s.format, s.quality / 100, s.targetKB)
        .then(function (blob) { commit(item, canvas, blob); });
    });
  }

  /* ── 스탬프 (전체 일괄, 원본 해상도 직접 그리기) ─────────── */
  function stampText() {
    var st = state.settings.stamp;
    var parts = [st.project, st.school, st.date].filter(function (v) { return v && String(v).trim(); });
    return parts.join(' | ');
  }

  function drawStampOnCanvas(canvas, text) {
    var g = canvas.getContext('2d');
    var size = Math.max(12, Math.round(canvas.height * 0.032));
    var pad = Math.max(6, Math.round(canvas.width * 0.012));
    g.font = '600 ' + size + 'px Pretendard, "Malgun Gothic", sans-serif';
    g.textBaseline = 'middle';
    var tw = g.measureText(text).width;
    var bw = tw + pad * 2, bh = size + pad * 1.4;
    var bx = canvas.width - pad - bw, by = canvas.height - pad - bh;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    if (g.roundRect) { g.beginPath(); g.roundRect(bx, by, bw, bh, 4); g.fill(); }
    else g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#ffffff';
    g.fillText(text, bx + pad, by + bh / 2);
  }

  function stampAll() {
    var text = stampText();
    if (!text) { toast(T('msg.stampEmpty'), 'err'); return Promise.resolve(); }
    return flushPending().then(function () {
      return forEachItem(function (item) {
        return withImage(item, function (img) {
          var out = C.drawAdjusted(img, item.width, item.height, null);
          drawStampOnCanvas(out, text);
          return C.canvasToBlob(out, 'image/png').then(function (blob) { commit(item, out, blob); });
        });
      }, 'stamp');
    }).then(function () {
      if (state.items.length) return selectItemForce(state.index >= 0 ? state.index : 0);
    });
  }

  /* ── 내보내기 ──────────────────────────────────────────── */
  function outputCanvas(item) {
    var s = state.settings;
    return withImage(item, function (img) {
      var canvas = C.drawAdjusted(img, item.width, item.height, null);
      var r = C.resizeCanvas(canvas, s.resizeLong);
      if (r !== canvas) canvas = r;
      if (s.format === 'image/jpeg') {
        var flat = C.makeCanvas(canvas.width, canvas.height);
        var g = flat.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, flat.width, flat.height);
        g.drawImage(canvas, 0, 0);
        canvas = flat;
      }
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

  function downloadCurrent() {
    var item = currentItem();
    if (!item) { toast(T('msg.noImage')); return; }
    flushPending().then(function () {
      busy(true);
      return exportBlob(currentItem(), state.index + 1).then(function (r) {
        X.saveBlob(r.blob, r.name);
        busy(false);
      });
    }).catch(function (e) { busy(false); toast(String(e), 'err'); });
  }

  function downloadZip() {
    if (!state.items.length) { toast(T('msg.noImage')); return; }
    flushPending().then(function () {
      busy(true);
      var files = [];
      var chain = Promise.resolve();
      var used = {};
      state.items.forEach(function (it, i) {
        chain = chain.then(function () {
          progress(i, state.items.length, 'zip');
          return exportBlob(it, i + 1).then(function (r) {
            var nm = r.name;
            if (used[nm]) { nm = nm.replace(/(\.[^.]+)$/, '_' + (++used[r.name]) + '$1'); }
            else used[r.name] = 1;
            files.push({ name: nm, blob: r.blob });
          }).catch(function (e) { console.error(e); });
        });
      });
      return chain.then(function () {
        progress(state.items.length, state.items.length, 'zip');
        return X.zip(files).then(function (blob) {
          X.saveBlob(blob, 'snap-box_' + dateTag() + '.zip');
          progress(null); busy(false);
          toast(T('msg.zipDone', { n: files.length }), 'ok');
        });
      });
    }).catch(function (e) { progress(null); busy(false); toast(String(e), 'err'); });
  }

  function dateTag() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  function headerLine() {
    var st = state.settings.stamp;
    return [st.project, st.school, st.date].filter(Boolean).join(' | ');
  }

  function collectForPdf(maxPx) {
    var out = [];
    var chain = Promise.resolve();
    state.items.forEach(function (it, i) {
      chain = chain.then(function () {
        progress(i, state.items.length, 'pdf');
        return withImage(it, function (img) {
          var cv = C.drawAdjusted(img, it.width, it.height, null);
          cv = C.resizeCanvas(cv, maxPx);
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
    if (!state.items.length) { toast(T('msg.noImage')); return; }
    flushPending().then(function () {
      busy(true);
      return collectForPdf(1000).then(function (items) {
        var pdf = X.contactSheet(items, state.settings.sheetLayout, headerLine());
        pdf.save('snap-box_sheet_' + dateTag() + '.pdf');
        busy(false); toast(T('msg.pdfDone'), 'ok');
      });
    }).catch(function (e) { busy(false); toast(String(e), 'err'); });
  }

  function makePhotoPdf() {
    if (!state.items.length) { toast(T('msg.noImage')); return; }
    flushPending().then(function () {
      busy(true);
      return collectForPdf(1800).then(function (items) {
        var pdf = X.photoPdf(items, headerLine());
        pdf.save('snap-box_photos_' + dateTag() + '.pdf');
        busy(false); toast(T('msg.pdfDone'), 'ok');
      });
    }).catch(function (e) { busy(false); toast(String(e), 'err'); });
  }

  function mergeChecked() {
    var sel = state.items.filter(function (i) { return i.checked; });
    if (sel.length !== 2) { toast(T('msg.needTwo'), 'err'); return; }
    flushPending().then(function () {
      busy(true);
      return withImage(sel[0], function (a) {
        var ca = C.drawAdjusted(a, sel[0].width, sel[0].height, null);
        return withImage(sel[1], function (b) {
          var cb = C.drawAdjusted(b, sel[1].width, sel[1].height, null);
          var out = X.mergeSideBySide(ca, cb, Math.round(Math.max(ca.width, cb.width) * 0.02), '#ffffff');
          return C.canvasToBlob(out, 'image/png').then(function (blob) {
            var item = {
              id: 'i' + (++state.seq),
              origName: sel[0].origName + '_' + sel[1].origName,
              blob: blob, origBlob: blob,
              width: out.width, height: out.height,
              thumb: C.thumbDataURL(out),
              status: 'done', detRaw: [], detTried: true,
              adjust: { b: 100, c: 100, s: 100 },
              history: [], stash: null, checked: false
            };
            state.items.push(item);
            renderQueue();
            busy(false);
            toast(T('msg.merged'), 'ok');
          });
        });
      });
    }).catch(function (e) { busy(false); toast(String(e), 'err'); });
  }

  /* ── 편집: 기하 변환 ───────────────────────────────────── */
  function geomOp(op) {
    var item = currentItem();
    if (!item) { toast(T('msg.noImage')); return; }
    flushPending().then(function () {
      busy(true);
      var it = currentItem();
      return withImage(it, function (img) {
        var src = C.drawAdjusted(img, it.width, it.height, null);
        var out = op(src);
        if (!out) { busy(false); return; }
        return C.canvasToBlob(out, 'image/png').then(function (blob) {
          commit(it, out, blob);
          it.detRaw = null; it.detTried = false;
          return reloadCurrent().then(function () { busy(false); renderQueue(); });
        });
      });
    }).catch(function (e) { busy(false); console.error(e); toast(String(e), 'err'); });
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
    E.cancelCrop();
    setCropUI(false);
    if (w < 16 || h < 16) { toast(T('msg.cropTooSmall'), 'err'); return; }
    geomOp(function (src) { return C.cropCanvas(src, x, y, w, h); });
  }

  /* ── 되돌리기 / 원본 복구 ──────────────────────────────── */
  function undo() {
    var item = currentItem();
    if (!item) { toast(T('msg.noImage')); return; }
    if (E.hasPending()) {  // 아직 굽지 않은 변경이 있으면 그것부터 취소
      E.clearMasks();
      E.annots().forEach(function (o) { E.canvas.remove(o); });
      E.canvas.requestRenderAll();
      updateDetectLabel();
      toast(T('msg.undone'), 'ok');
      return;
    }
    if (!item.history.length) { toast(T('msg.noUndo')); return; }
    busy(true);
    item.blob = item.history.pop();
    C.loadImageFromBlob(item.blob).then(function (img) {
      item.width = img.naturalWidth; item.height = img.naturalHeight;
      item.thumb = C.thumbDataURL(img);
      C.releaseImage(img);
      item.detRaw = null; item.detTried = false;
      return reloadCurrent();
    }).then(function () { busy(false); renderQueue(); toast(T('msg.undone'), 'ok'); })
      .catch(function (e) { busy(false); toast(String(e), 'err'); });
  }

  function revertOriginal() {
    var item = currentItem();
    if (!item) { toast(T('msg.noImage')); return; }
    busy(true);
    item.history.push(item.blob);
    item.blob = item.origBlob;
    C.loadImageFromBlob(item.blob).then(function (img) {
      item.width = img.naturalWidth; item.height = img.naturalHeight;
      item.thumb = C.thumbDataURL(img);
      C.releaseImage(img);
      item.detRaw = null; item.detTried = false;
      item.status = 'wait';
      return reloadCurrent();
    }).then(function () { busy(false); renderQueue(); toast(T('msg.reverted'), 'ok'); })
      .catch(function (e) { busy(false); toast(String(e), 'err'); });
  }

  /* ── UI 바인딩 ─────────────────────────────────────────── */
  function bindSeg(sel, onPick) {
    $$(sel + ' .seg-b').forEach(function (b) {
      b.addEventListener('click', function () {
        $$(sel + ' .seg-b').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        onPick(b.dataset.v);
      });
    });
  }

  function setSegActive(sel, v) {
    $$(sel + ' .seg-b').forEach(function (b) {
      b.classList.toggle('active', b.dataset.v === v);
    });
  }

  function syncAdjustUI() {
    var a = state.settings.adjLive;
    $('#adjBright').value = a.b; $('#adjBrightOut').value = a.b;
    $('#adjContrast').value = a.c; $('#adjContrastOut').value = a.c;
    $('#adjSat').value = a.s; $('#adjSatOut').value = a.s;
  }

  function showMaskOptions() {
    $$('.opt[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for !== state.settings.maskType;
    });
  }

  function buildIconPicker() {
    var box = $('#iconPicker');
    box.innerHTML = '';
    SnapLab.ICONS.forEach(function (ic) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = ic.id === state.settings.iconId ? 'active' : '';
      b.title = ic.id;
      var im = document.createElement('img');
      im.src = ic.url; im.alt = ic.id;
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
    if (!sel.length) { toast(T('msg.noSel'), 'err'); return; }
    var def = currentDef();
    if (def.type === 'image' && !def.customURL) { toast(T('msg.noCustom'), 'err'); return; }
    F.ensureAssets(def).then(function () { E.setDefOn(sel, def); });
  }

  function applyDefToAllBoxes() {
    var all = E.masks();
    if (!all.length) { toast(T('msg.noBox')); return; }
    var def = currentDef();
    if (def.type === 'image' && !def.customURL) { toast(T('msg.noCustom'), 'err'); return; }
    F.ensureAssets(def).then(function () { E.setDefOn(all, def); });
  }

  function updateNamePreview() {
    var it = state.items[0];
    var vars = it ? nameVars(it, 1) : { school: '학교명', project: '사업명', date: state.settings.stamp.date, n: 1, orig: 'IMG_0001' };
    $('#namePreview').textContent = X.buildName(state.settings.nameTemplate, vars, state.settings.format);
  }

  function bindUI() {
    /* 탭 */
    $$('#tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('#tabs .tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        $$('.tabbody').forEach(function (b) { b.hidden = b.id !== 'tab-' + t.dataset.tab; });
        E.setDrawMode(t.dataset.tab === 'face' && $('#btnDrawBox').classList.contains('on'));
      });
    });

    /* 파일 입력 + 드래그앤드롭 */
    $('#btnPick').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) {
      addFiles(e.target.files); e.target.value = '';
    });
    var dz = $('#dropZone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('hot'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'drop' || e.target === document.documentElement) dz.classList.remove('hot');
      });
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    $('#btnClearQueue').addEventListener('click', function () {
      releaseCurrent(); E.clearAll();
      state.items = []; state.index = -1;
      $('#stageEmpty').hidden = false;
      $('#stageName').textContent = T('stage.empty');
      $('#stageDims').textContent = ''; $('#detectState').textContent = '';
      renderQueue();
    });
    $('#btnRemoveSel').addEventListener('click', function () {
      var curItem = currentItem();
      state.items = state.items.filter(function (i) { return !i.checked; });
      if (state.items.indexOf(curItem) < 0) {
        releaseCurrent(); E.clearAll(); state.index = -1;
        $('#stageEmpty').hidden = state.items.length > 0;
        if (state.items.length) selectItem(0); else renderQueue();
      } else {
        state.index = state.items.indexOf(curItem);
        renderQueue();
      }
    });

    /* 얼굴 탭 */
    $('#confSlider').addEventListener('input', function (e) {
      state.settings.conf = e.target.value / 100;
      $('#confOut').value = state.settings.conf.toFixed(2);
    });
    $('#confSlider').addEventListener('change', function () {
      saveSettings(); rebuildDetectionMasks();
    });
    $('#btnRedetect').addEventListener('click', function () { autoDetect(true); });
    $('#btnDrawBox').addEventListener('click', function () {
      var on = !$('#btnDrawBox').classList.contains('on');
      $('#btnDrawBox').classList.toggle('on', on);
      E.setDrawMode(on);
    });
    bindSeg('#maskType', function (v) {
      state.settings.maskType = v; saveSettings(); showMaskOptions();
    });
    $('#pixelBlock').addEventListener('input', function (e) {
      state.settings.block = +e.target.value; $('#pixelBlockOut').value = e.target.value;
    });
    $('#pixelBlock').addEventListener('change', function () {
      saveSettings();
      if (state.settings.maskType === 'pixelate') applyDefToAllBoxes();
    });
    $('#blurStrength').addEventListener('input', function (e) {
      state.settings.blurPct = +e.target.value; $('#blurStrengthOut').value = e.target.value;
    });
    $('#blurStrength').addEventListener('change', function () {
      saveSettings();
      if (state.settings.maskType === 'blur') applyDefToAllBoxes();
    });
    $('#customMaskFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        state.settings.customURL = fr.result;
        F.customImage(fr.result).then(function () {
          $('#customMaskPrev').innerHTML = '<img src="' + fr.result + '" alt="">';
          if (state.settings.maskType === 'image') applyDefToAllBoxes();
        });
      };
      fr.readAsDataURL(f);
    });
    $('#btnApplyToSelected').addEventListener('click', applyDefToSelected);
    $('#btnApplyToAll').addEventListener('click', applyDefToAllBoxes);
    $('#btnDelBox').addEventListener('click', function () {
      if (!E.deleteSelected()) toast(T('msg.noSel'));
      updateDetectLabel();
    });
    $('#btnClearBoxes').addEventListener('click', function () { E.clearMasks(); updateDetectLabel(); });

    /* 편집 탭 */
    $('#btnRotate').addEventListener('click', function () { geomOp(C.rotate90); });
    $('#btnFlip').addEventListener('click', function () { geomOp(C.flipH); });
    $('#btnCropStart').addEventListener('click', function () {
      if (!cur) { toast(T('msg.noImage')); return; }
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
      return {
        color: $('#annotColor').value,
        width: +$('#annotWidth').value,
        size: +$('#annotSize').value
      };
    }
    $('#btnAddText').addEventListener('click', function () {
      if (!cur) { toast(T('msg.noImage')); return; }
      E.addText('내용', annotStyle());
    });
    $('#btnAddRect').addEventListener('click', function () {
      if (!cur) { toast(T('msg.noImage')); return; }
      E.addRect(annotStyle());
    });
    $('#btnAddArrow').addEventListener('click', function () {
      if (!cur) { toast(T('msg.noImage')); return; }
      E.addArrow(annotStyle());
    });
    $('#logoFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f || !cur) return;
      var fr = new FileReader();
      fr.onload = function () { C.loadImage(fr.result).then(function (img) { E.addImageObject(img); }); };
      fr.readAsDataURL(f);
      e.target.value = '';
    });

    ['stampProject', 'stampSchool', 'stampDate'].forEach(function (id) {
      $('#' + id).addEventListener('input', function (e) {
        var k = id.replace('stamp', '').toLowerCase();
        state.settings.stamp[k] = e.target.value;
        saveSettings(); updateNamePreview();
      });
    });
    $('#btnAddStamp').addEventListener('click', function () {
      if (!cur) { toast(T('msg.noImage')); return; }
      var t = stampText();
      if (!t) { toast(T('msg.stampEmpty'), 'err'); return; }
      E.addStamp(t);
    });
    $('#btnStampAll').addEventListener('click', stampAll);

    /* 변환 탭 */
    $('#resizeLong').addEventListener('change', function (e) {
      state.settings.resizeLong = Math.max(0, +e.target.value || 0); saveSettings();
    });
    $('#targetKB').addEventListener('change', function (e) {
      state.settings.targetKB = Math.max(0, +e.target.value || 0); saveSettings();
    });
    bindSeg('#outFormat', function (v) {
      state.settings.format = v; saveSettings(); updateNamePreview();
    });
    $('#outQuality').addEventListener('input', function (e) {
      state.settings.quality = +e.target.value; $('#outQualityOut').value = e.target.value;
    });
    $('#outQuality').addEventListener('change', saveSettings);
    $('#nameTemplate').addEventListener('input', function (e) {
      state.settings.nameTemplate = e.target.value; saveSettings(); updateNamePreview();
    });
    $('#btnConvertCurrent').addEventListener('click', function () {
      var it = currentItem();
      if (!it) { toast(T('msg.noImage')); return; }
      flushPending().then(function () {
        busy(true);
        return convertItem(currentItem());
      }).then(function () {
        return reloadCurrent();
      }).then(function () { busy(false); renderQueue(); toast(T('msg.applied'), 'ok'); })
        .catch(function (e) { busy(false); toast(String(e), 'err'); });
    });
    $('#btnConvertAll').addEventListener('click', function () {
      flushPending()
        .then(function () { return forEachItem(convertItem, 'convert'); })
        .then(function () { if (state.items.length) return selectItemForce(Math.max(0, state.index)); });
    });

    /* 내보내기 탭 */
    $('#btnDownloadCurrent').addEventListener('click', downloadCurrent);
    $('#btnDownloadZip').addEventListener('click', downloadZip);
    bindSeg('#sheetLayout', function (v) { state.settings.sheetLayout = v; saveSettings(); });
    $('#btnContactSheet').addEventListener('click', makeContactSheet);
    $('#btnPhotoPdf').addEventListener('click', makePhotoPdf);
    $('#btnMerge').addEventListener('click', mergeChecked);

    /* 하단 바 */
    $('#btnPrev').addEventListener('click', function () { if (state.index > 0) selectItem(state.index - 1); });
    $('#btnNext').addEventListener('click', function () { if (state.index < state.items.length - 1) selectItem(state.index + 1); });
    $('#btnApply').addEventListener('click', bakeCurrent);
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRevert').addEventListener('click', revertOriginal);
    $('#btnBatchAll').addEventListener('click', batchAutoMask);

    /* 개인정보 안내 */
    $('#privacyClose').addEventListener('click', function () {
      $('#privacyNote').hidden = true;
      try { localStorage.setItem('snapbox.noticeSeen', '1'); } catch (e) {}
    });

    /* 키보드 */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (E.canvas && E.canvas.getActiveObject() && E.canvas.getActiveObject().isEditing) return;
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
    $('#confSlider').value = Math.round(s.conf * 100);
    $('#confOut').value = s.conf.toFixed(2);
    setSegActive('#maskType', s.maskType);
    $('#pixelBlock').value = s.block; $('#pixelBlockOut').value = s.block;
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
    setSegActive('#outFormat', s.format);
    $('#outQuality').value = s.quality; $('#outQualityOut').value = s.quality;
    $('#nameTemplate').value = s.nameTemplate;
    setSegActive('#sheetLayout', s.sheetLayout);
    showMaskOptions();
    syncAdjustUI();
    updateNamePreview();
  }

  /* ── 시작 ──────────────────────────────────────────────── */
  function boot() {
    SnapLab.i18n.apply(document);
    loadSettings();
    E.init($('#c'), $('#stageWrap'), function () { updateDetectLabel(); });
    E.setDefProvider(currentDef);
    E.setDrawMode(true);
    buildIconPicker();
    bindUI();
    syncUIFromSettings();
    F.preloadIcons();
    $('#stageName').textContent = T('stage.empty');
    try {
      if (localStorage.getItem('snapbox.noticeSeen')) { /* 계속 표시해도 무해하므로 유지 */ }
    } catch (e) {}
    SnapLab.state = state;   // 디버그용
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
