// ═══════════════════════════════════════════════════════════
// 이 기기에 남기는 기록 — 이름 옮기기 · 전체 삭제
// ═══════════════════════════════════════════════════════════
// dibrain.dev 는 모든 앱이 같은 출처(origin)를 쓴다. localStorage 가 한 통이므로
// 이 앱이 쓰는 키는 전부 'snap-box:' 로 시작한다
// (블로그 저장소 brand/README.md "기록 전체 삭제").
//
//  localStorage   snap-box:settings    사업명·학교명·날짜 스탬프, 가림·크기·파일 이름 설정 (app.js)
//                 snap-box:faceMore    '더 보기'를 펼쳐 두었는지 (app.js)
//                 snap-box:language    언어 (i18n.js)
//  사진은 어디에도 저장하지 않는다. IndexedDB·Cache 는 쓰지 않는다.
//
// 이 파일은 i18n.js · app.js 보다 먼저 읽혀서, 옛 이름을 먼저 옮겨 둔다.

window.SnapLab = window.SnapLab || {};

(function () {
  'use strict';

  var NS = 'snap-box:';
  var LEGACY = { 'snapbox.settings': NS + 'settings', 'snapbox.faceMore': NS + 'faceMore' };

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ── 옛 이름 → 새 이름 (한 번만) ──
  // 'snapbox.*' 는 이 앱만 쓰던 키라 옮기고 지운다.
  Object.keys(LEGACY).forEach(function (from) {
    if (get(from) === null) return;
    if (get(LEGACY[from]) === null) set(LEGACY[from], get(from));
    del(from);
  });
  // 'language' 는 클립박스도 같이 읽던 공용 키다. 우리 몫만 복사해 두고 옛 키는 남긴다 —
  // 클립박스가 자기 몫을 옮겨 갈 때까지 필요하다. 클립박스도 이미 옮겼으면(clip-box:language)
  // 더 쓸 앱이 없으므로 그때 지운다. (클립박스 js/records.js 도 같은 규칙)
  if (get('language') !== null) {
    if (get(NS + 'language') === null) set(NS + 'language', get('language'));
    if (get('clip-box:language') !== null) del('language');
  }

  // ── 전체 삭제 ──
  function clearAll() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf(NS) === 0 || LEGACY.hasOwnProperty(k))) keys.push(k);
      }
    } catch (e) {}
    keys.forEach(del);
    // 공용 'language' 는 지우지 않는다(클립박스 몫). 다만 클립박스가 이미 옮겼다면
    // 아무도 안 쓰는 키라 지운다 — 남겨 두면 새로고침 때 우리 언어로 다시 복사된다.
    if (get('clip-box:language') !== null) del('language');
  }

  SnapLab.records = { clearAll: clearAll };

  // ── 맨 아래 줄의 버튼 (#dbReset) ──
  function wire() {
    var b = document.getElementById('dbReset');
    if (!b) return;
    var T = function (s) { return typeof GL_T === 'function' ? GL_T(s) : s; };
    b.addEventListener('click', function () {
      if (!confirm(T('이 앱에 저장된 기록을 모두 지웁니다(사업명·학교명·날짜 스탬프, 가림·크기·파일 이름 설정, 언어). 되돌릴 수 없습니다. 계속할까요?'))) return;
      clearAll();
      location.reload();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
