// ═══════════════════════════════════════════════════════════
// 상단 바 — DigitalBrain 공통 .db-bar (마크업은 index.html 에 있다)
// ═══════════════════════════════════════════════════════════
// 왼쪽: 브랜드 마크(https://dibrain.dev/) + 앱 이름 + 부제
// 오른쪽: #engine(얼굴 찾기 준비 상태, app.js 가 바꾼다) · #fsBtn(전체화면) · #langToggle(i18n.js)
// 여기서는 전체화면 버튼만 붙인다. 지원하지 않는 브라우저에서는 숨긴 채로 둔다.

(function () {
  'use strict';

  var fs = document.getElementById('fsBtn');
  if (!fs || !document.documentElement.requestFullscreen) return;

  function paint() {
    fs.innerHTML = document.fullscreenElement
      ? '<i class="fa-solid fa-compress"></i>'
      : '<i class="fa-solid fa-expand"></i>';
  }

  fs.hidden = false;
  fs.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  });
  document.addEventListener('fullscreenchange', paint);
})();
