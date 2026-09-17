// ═══════════════════════════════════════════════════════════
// 헤더 — sense-lab lib/nav.js 와 같은 구조를 그대로 쓴다
// ═══════════════════════════════════════════════════════════
// 각 페이지의 <header data-tab="..."> 를 sense-lab 의 헤더 마크업
// (h1 + .navlink + spacer + #engine + .hbtn) 과 같은 구조로 채운다.
// 클래스 이름·DOM 구조를 바꾸지 말 것 — css/maker-tool.css 가 그대로 입혀진다.
//
// 자매 서비스(clip-box 등)는 이 파일을 복사해 BRAND 와 TABS 만 고쳐 쓴다.
// 다른 서비스로 가는 링크는 넣지 않는다 — 배포 경로가 서로 달라
// 절대경로를 박아야 하는데, 공통 규칙이 절대경로를 금지한다.

(function () {
  'use strict';

  var BRAND = 'snap-box';
  var MARK  = 'assets/img/snap-box-mark.svg';   // design/README.md §4 의 마크 규격
  var TABS  = [];  // 하위 페이지가 생기면 { href, label } 을 채운다

  var header = document.querySelector('header[data-tab]');
  if (!header) return;
  var cur = header.getAttribute('data-tab');

  var h1 = document.createElement('h1');
  var logo = document.createElement('img');
  logo.src = MARK;
  logo.alt = '';
  h1.appendChild(logo);
  var txt = document.createElement('span');
  txt.className = 'brand-txt';
  txt.textContent = BRAND;
  h1.appendChild(txt);
  header.appendChild(h1);

  TABS.forEach(function (t) {
    var el;
    if (t.href === cur) {
      el = document.createElement('span');
      el.className = 'navlink on';
    } else {
      el = document.createElement('a');
      el.className = 'navlink';
      el.href = t.href;
    }
    el.textContent = t.label;
    header.appendChild(el);
  });

  var tagline = document.createElement('span');
  tagline.className = 'brand-sub';
  tagline.textContent = '보고서 사진 정리';
  header.appendChild(tagline);

  var sp = document.createElement('span');
  sp.style.flex = '1';
  header.appendChild(sp);

  // 얼굴 찾기 모듈 준비 상태 — app.js 가 값을 바꾼다
  var engine = document.createElement('span');
  engine.id = 'engine';
  engine.className = 'badge';
  engine.textContent = '준비 중…';
  header.appendChild(engine);

  // 전체화면 (지원하는 브라우저에서만)
  if (document.documentElement.requestFullscreen) {
    var fs = document.createElement('button');
    fs.className = 'hbtn';
    fs.id = 'fsBtn';
    fs.type = 'button';
    fs.title = '전체화면';
    fs.innerHTML = '<i class="fa-solid fa-expand"></i>';
    fs.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(function () {});
    });
    document.addEventListener('fullscreenchange', function () {
      fs.innerHTML = document.fullscreenElement
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
    });
    header.appendChild(fs);
  }
})();
