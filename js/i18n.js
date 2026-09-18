// ═══════════════════════════════════════════════════════════
// 다국어 (한국어 / English) — sense-lab lib/i18n.js 와 같은 방식
// ═══════════════════════════════════════════════════════════
// 설계 (sense-lab · 파이보 랩과 동일)
//  · 한국어 원문을 그대로 '키' 로 쓴다 → 사전에 없으면 한국어가 그대로 나오므로
//    번역이 빠져도 화면이 깨지지 않는다.
//  · HTML 은 손대지 않는다. 페이지가 뜨면 DOM 을 훑어서 텍스트를 바꾼다.
//  · 언어 설정은 같은 localStorage 키 'language' 를 쓴다.
//  · 사용자가 적은 사업명·학교명·파일 이름은 사전에 없으므로 번역되지 않는다 (의도된 동작).
//
// 주의: 번역할 문장 안에 <span> 같은 인라인 요소를 넣지 말 것.
//       텍스트 노드가 쪼개져 사전 키와 맞지 않는다.

window.SnapLab = window.SnapLab || {};

var GL_LANG = (function () {
  try {
    var saved = localStorage.getItem('language');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch (e) {}
  var nav = (navigator.language || navigator.userLanguage || 'ko');
  return nav.toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
})();

var GL_I18N = {
  // ── 페이지 · 헤더 ──
  'snap-box — 사진 정리': 'snap-box — Photo prep',
  '보고서 사진 정리': 'Report photo prep',
  '준비 중…': 'Getting ready…',
  '준비 완료': 'Ready',
  '얼굴 찾기 못 씀': 'Face finder off',
  '전체화면': 'Full screen',

  // ── 단계 ──
  '얼굴 가리기': 'Hide faces',
  '다듬기': 'Touch up',
  '크기·용량': 'Size',
  '내보내기': 'Export',

  // ── 사진 목록 ──
  '사진 목록': 'Photos',
  '사진을 여기에 놓거나 눌러서 고릅니다': 'Drop photos here, or click to choose',
  'JPG · PNG · WEBP · HEIC를 받습니다. HEIC는 넣는 즉시 JPG로 바꿉니다.':
    'Takes JPG, PNG, WEBP and HEIC. HEIC is converted to JPG on the spot.',
  '고른 것 빼기': 'Remove checked',
  '모두 비우기': 'Clear all',
  '대기': 'waiting',
  '처리함': 'done',
  '오류': 'error',

  // ── 미리보기 ──
  '미리보기': 'Preview',
  '사진을 넣어 주세요': 'Add a photo',
  '사진은 이 브라우저 안에서만 처리되며 어디에도 전송되지 않습니다.':
    'Photos are processed only inside this browser and are never uploaded.',
  '왼쪽에 사진을 넣으면 여기에 나옵니다.': 'Add photos on the left and they show up here.',
  '이전 사진': 'Previous',
  '다음 사진': 'Next',
  '적용': 'Apply',
  '되돌리기': 'Undo',
  '처음 상태로': 'Back to original',
  '원본 보기': 'Peek original',
  '누르고 있으면 원본이 보입니다': 'Hold to see the original',

  // ── 얼굴 가리기 ──
  '민감도': 'Sensitivity',
  '자세한 설정': 'More settings',
  '오른쪽으로 갈수록 더 많이 찾습니다. 엉뚱한 곳까지 잡히면 왼쪽으로 옮기세요.':
    'Further right finds more. Move left if it starts boxing things that are not faces.',
  '다시 찾기': 'Find again',
  '사진 속 얼굴 크기': 'How big are the faces',
  '크게': 'Large',
  '보통': 'Normal',
  '작게': 'Small',
  '단체사진처럼 얼굴이 작게 찍혔으면 작게로 두세요. 더 꼼꼼히 보는 대신 느려집니다. 얼굴이 사진 너비의 2%보다 작으면 그래도 못 찾습니다.':
    'Pick Small for group photos where faces are tiny. It looks harder and takes longer. Faces under 2% of the photo width are missed even then.',
  '못 찾은 얼굴이 있으면': 'If a face was missed',
  '사진 위를 끌어서 직접 표시': 'Drag on the photo to mark it',
  '얼굴 위를 대각선으로 끌면 그 자리를 가립니다. 표시를 고른 뒤 Delete 키로 지웁니다.':
    'Drag diagonally across a face to hide it. Select a mark and press Delete to remove it.',
  '어떻게 가릴까요': 'How should faces be hidden',
  '모자이크': 'Mosaic',
  '흐리게': 'Blur',
  '그림': 'Picture',
  '내 이미지': 'My image',
  '가림 세기': 'Strength',
  '오른쪽으로 갈수록 더 굵게 가립니다.': 'Further right hides more coarsely.',
  '가림 처리함': 'Faces hidden',
  '바꾼 것을 사진에 굽습니다': 'Bake the changes into the photo',
  'PNG 고르기': 'Choose a PNG',
  '아직 고른 이미지가 없습니다': 'No image chosen yet',
  '고른 것만 바꾸기': 'Change selected',
  '전체 바꾸기': 'Change all',
  '가리는 방법을 바꾼 뒤 누르면 이미 놓인 표시에 반영됩니다.': 'Applies a new style to marks already placed.',
  '그림·내 이미지는 두 눈 위치로 기울기를 맞춥니다.': 'Pictures are tilted to match the eyes.',
  '고른 것 지우기': 'Delete selected',
  '모두 지우기': 'Delete all',

  // ── 다듬기 ──
  '돌리기·자르기': 'Rotate & crop',
  '90° 돌리기': 'Rotate 90°',
  '좌우 뒤집기': 'Flip',
  '자르기': 'Crop',
  '이대로 자르기': 'Crop here',
  '그만두기': 'Cancel',
  '밝기·색': 'Brightness & color',
  '밝기': 'Bright',
  '대비': 'Contrast',
  '채도': 'Color',
  '표시 넣기': 'Markup',
  '글자': 'Text',
  '네모': 'Box',
  '화살표': 'Arrow',
  '색': 'Color',
  '굵기': 'Width',
  '글자 크기': 'Size',
  '학교 로고 넣기': 'Add a logo',
  '사진 아래 표기': 'Caption line',
  '사업명': 'Program',
  '학교명': 'School',
  '날짜': 'Date',
  '이 사진에': 'This photo',
  '전체에': 'All photos',
  '오른쪽 아래에 한 줄로 들어갑니다. 적은 값은 이 브라우저에 기억해 둡니다.':
    'Goes in one line at the bottom right. What you type is remembered in this browser.',
  '예) 늘봄 로봇교실': 'e.g. Robotics club',
  '예) 서울초등학교': 'e.g. Seoul Elementary',
  '내용': 'Text',

  // ── 크기·용량 ──
  '크기': 'Size',
  '긴 변': 'Long edge',
  '목표 용량': 'Target',
  '목표 용량이 0이면 아래 품질을 그대로 씁니다. 값을 적으면 그 아래로 내려갈 때까지 품질을 낮춥니다. JPG에만 해당합니다.':
    'Leave the target at 0 to keep the quality below. Give a number and quality is lowered until it fits. JPG only.',
  '저장 형식': 'Format',
  '품질': 'Quality',
  '파일 이름': 'File name',
  '쓸 수 있는 자리는 아래와 같습니다. {번호}는 두 자리입니다.':
    'You can use the fields below. {n} is two digits.',
  '{학교명} {사업명} {날짜} {번호} {원래이름}': '{school} {program} {date} {n} {original}',
  '이렇게 저장됩니다': 'Saved as',
  '적용하면 원본 크기가 실제로 줄어듭니다. 되돌리기로 한 단계 복구할 수 있습니다.':
    'Applying actually shrinks the full-size pixels. Undo restores one step.',

  // ── 내보내기 ──
  '사진으로': 'As photos',
  '이 사진': 'This photo',
  '전체 ZIP': 'All as ZIP',
  '내보낼 때 항상 다시 저장하므로 촬영 정보(EXIF·GPS)는 남지 않습니다.':
    'Every export is re-encoded, so no camera data (EXIF, GPS) survives.',
  '붙임 사진 대지 (PDF)': 'Contact sheet (PDF)',
  '한 쪽에 4장': '4 per page',
  '한 쪽에 6장': '6 per page',
  '대지 만들기': 'Build the sheet',
  'A4 세로, 사진 아래에 파일 이름, 맨 위에 사업명·학교명·날짜가 들어갑니다.':
    'A4 portrait, file name under each photo, program and school on top.',
  '한 쪽에 한 장 (PDF)': 'One per page (PDF)',
  'PDF 만들기': 'Build the PDF',
  '전·후 붙이기': 'Before & after',
  '왼쪽 목록에서 두 장을 고른 뒤 누르면 좌우로 나란히 붙입니다.':
    'Check two photos on the left to place them side by side.',
  '고른 두 장 붙이기': 'Join the two',

  // ── 알림 ──
  '처리하는 중입니다': 'Working',
  '사진을 먼저 넣어 주세요': 'Add a photo first',
  '받을 수 없는 형식입니다': 'This file type is not supported',
  'HEIC를 바꾸지 못했습니다': 'Could not convert the HEIC file',
  '사진을 열지 못했습니다': 'Could not open the photo',
  '얼굴을 찾는 중입니다': 'Looking for faces',
  '찾은 얼굴이 없습니다. 칸을 직접 그려 주세요': 'No face found. Please draw a box',
  '얼굴 찾기를 불러오지 못했습니다. 주소창이 file:// 이면 http:// 로 열어 주세요':
    'Could not load the face finder. If the address starts with file://, open it over http://',
  '적용했습니다': 'Applied',
  '적용할 것이 없습니다': 'Nothing to apply',
  '되돌렸습니다': 'Undone',
  '더 되돌릴 것이 없습니다': 'Nothing left to undo',
  '원본으로 되돌렸습니다': 'Back to the original',
  '칸이 없습니다': 'There are no boxes',
  '고른 칸이 없습니다': 'No box is selected',
  '두 장만 골라 주세요': 'Please check exactly two photos',
  '붙인 사진을 목록에 넣었습니다': 'The joined photo is in the list',
  '자를 곳이 너무 작습니다': 'The crop area is too small',
  '쓸 이미지를 먼저 골라 주세요': 'Choose an image to use first',
  'PDF를 저장했습니다': 'PDF saved',
  '사업명·학교명·날짜 중 하나는 적어 주세요': 'Fill in at least one of program, school or date',
  '미적용분을 먼저 적용합니다': 'Applying what is pending first',
  '아직 적용하지 않은 것을 지웠습니다': 'Cleared what had not been applied',
  '사진을 모두 뺄까요? 되돌릴 수 없습니다.': 'Remove every photo? This cannot be undone.',
  '뺄 사진을 체크해 주세요': 'Check the photos you want to remove',
  '이 사진을 처음 넣었을 때로 되돌릴까요?': 'Put this photo back the way it came in?',
  '왼쪽 목록에서 두 장을 체크해 주세요': 'Check two photos on the left',
  '지금 설정': 'Current settings',
  '원래대로': 'unchanged',
  '쓰지 않음': 'off',
  '단축키': 'Shortcuts',
  '← → 이전·다음 사진 · Delete 고른 표시 지우기 · \\ 누르고 있으면 원본': '← → previous / next photo · Delete removes the selected mark · hold \\ to peek at the original',

  // ── 자리 채우기가 있는 문장 (GL_TF) ──
  '얼굴 {n} · 표시 {b}': '{n} face(s) · {b} mark(s)',
  '{ok}장 모두 했습니다': 'Done — {ok} photo(s)',
  '{ok}장 했습니다. {fail}장은 실패했습니다': 'Done {ok}, failed {fail}',
  '{n}장을 ZIP으로 저장했습니다': 'Saved {n} photo(s) as ZIP',
  '얼굴을 찾는 중입니다 {i}/{n}': 'Looking for faces {i}/{n}',
  '얼굴 {n}': '{n} face(s)',
  '얼굴 못 찾음': 'no face found',

  // ── 지금 할 일 한 줄 ──
  '먼저 사진을 넣습니다': 'Start by adding photos',
  '사진 넣기': 'Add photos',
  '전체 가리기': 'Hide in all',
  '더 찾아보기': 'Look harder',
  '얼굴을 못 찾았습니다. 더 작은 얼굴까지 찾아볼까요?':
    'No face found. Shall we look for smaller faces?',
  '전체 내려받기': 'Download all',
  '사진 {n}장이 있습니다. 찾은 얼굴을 한꺼번에 가립니다': '{n} photo(s) ready — hide every face found',
  '얼굴을 못 찾았습니다. 사진 위를 끌어서 직접 표시해 주세요':
    'No face found. Please drag on the photo to mark it',
  '다 가렸습니다. 넘겨 보며 확인한 뒤 내려받으세요':
    'All hidden. Flip through to check, then download',
  '다 가렸습니다. {b}장은 얼굴을 못 찾았으니 넘겨 보며 확인해 주세요':
    'All hidden. {b} photo(s) had no face found — please check them',
  '얼굴 {n}개를 가렸습니다. 놓친 얼굴이 없는지 넘겨 보며 확인해 주세요':
    'Hid {n} face(s). Flip through the photos and check nothing was missed',
  '얼굴 {n}개를 가렸습니다. {b}장은 얼굴을 못 찾았으니 넘겨 보며 확인해 주세요':
    'Hid {n} face(s). {b} photo(s) had no face found — please check them',
  '체크한 {n}장을 뺄까요?': 'Remove the {n} checked photo(s)?'
};

// 한국어 원문 → 현재 언어. 사전에 없으면 원문 그대로.
function GL_T(ko) {
  if (GL_LANG === 'ko') return ko;
  var v = GL_I18N[ko];
  return (v === undefined) ? ko : v;
}

// 자리 채우기용 — GL_T 로 번역한 뒤 {키} 를 값으로 바꾼다.
function GL_TF(ko, vars) {
  var s = GL_T(ko);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, function (m, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
  });
}

// ── 화면(HTML) 자동 번역 — sense-lab 과 동일 ──
function localizeDOM(root) {
  if (GL_LANG === 'ko') return;
  var scope = root || document.body;
  if (!scope) return;

  var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
  var hits = [], n;
  while ((n = walker.nextNode())) {
    var tag = n.parentNode && n.parentNode.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    var raw = n.nodeValue.trim();
    if (!raw || GL_I18N[raw] === undefined) continue;
    hits.push([n, n.nodeValue.replace(raw, GL_I18N[raw])]);
  }
  hits.forEach(function (h) { h[0].nodeValue = h[1]; });

  ['title', 'placeholder'].forEach(function (attr) {
    scope.querySelectorAll('[' + attr + ']').forEach(function (el) {
      var v = GL_I18N[el.getAttribute(attr).trim()];
      if (v !== undefined) el.setAttribute(attr, v);
    });
  });

  if (document.title && GL_I18N[document.title.trim()] !== undefined)
    document.title = GL_I18N[document.title.trim()];
}

// ── 언어 토글 버튼 (sense-lab 과 같은 버튼·위치·저장 키) ──
function setLanguage(v) {
  try { localStorage.setItem('language', v); } catch (e) {}
  location.reload();
}

function mountLangToggle() {
  var bar = document.querySelector('header');
  if (!bar || document.getElementById('langToggle')) return;

  var toKo = (GL_LANG !== 'ko');
  var b = document.createElement('button');
  b.id = 'langToggle';
  b.type = 'button';
  b.textContent = toKo ? '한' : 'EN';
  b.title = '한국어 / English';
  b.addEventListener('click', function () { setLanguage(toKo ? 'ko' : 'en'); });
  bar.appendChild(b);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { localizeDOM(); mountLangToggle(); });
} else { localizeDOM(); mountLangToggle(); }

SnapLab.i18n = { t: GL_T, tf: GL_TF, localizeDOM: localizeDOM, get lang() { return GL_LANG; } };
