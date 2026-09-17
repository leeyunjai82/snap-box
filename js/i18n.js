/* i18n.js — 모든 UI 문자열은 여기 한 곳에만 둔다. (영어 추가 대비) */
window.SnapLab = window.SnapLab || {};

(function () {
  'use strict';

  var ko = {
    'app.tagline': '브라우저 안에서 끝내는 보고서용 사진 처리',
    'app.privacy': '사진은 이 브라우저 안에서만 처리되며 어디에도 전송되지 않습니다.',

    'queue.title': '파일 큐',
    'queue.drop': '여기로 사진을 끌어다 놓으세요',
    'queue.pick': '파일 선택',
    'queue.clear': '큐 비우기',
    'queue.removeSel': '선택 삭제',

    'stage.empty': '이미지 없음',
    'stage.hint': '왼쪽에서 사진을 추가하면 여기에 표시됩니다.',

    'tab.face': '얼굴',
    'tab.edit': '편집',
    'tab.conv': '변환',
    'tab.out': '내보내기',

    'face.detect': '얼굴 검출',
    'face.conf': '신뢰도',
    'face.redetect': '다시 검출',
    'face.drawbox': '박스 그리기',
    'face.hint': '빈 곳을 드래그하면 수동 박스가 추가됩니다. 검출 박스는 상하좌우 15% 확장됩니다.',
    'face.mode': '가림 모드',
    'face.pixelate': '픽셀화',
    'face.blur': '블러',
    'face.icon': '아이콘',
    'face.image': '이미지',
    'face.block': '블록',
    'face.blurAmt': '강도',
    'face.toSelected': '선택 박스에 적용',
    'face.toAll': '모든 박스에 적용',
    'face.boxes': '박스',
    'face.delBox': '선택 삭제',
    'face.clearBoxes': '전체 삭제',
    'face.delHint': '박스를 고른 뒤 Delete 키로도 지울 수 있습니다.',

    'edit.geom': '자르기 · 회전',
    'edit.rotate': '회전 90°',
    'edit.flip': '좌우반전',
    'edit.cropStart': '자르기',
    'edit.cropApply': '자르기 확정',
    'edit.cropCancel': '취소',
    'edit.adjust': '색 보정',
    'edit.bright': '밝기',
    'edit.contrast': '대비',
    'edit.sat': '채도',
    'edit.reset': '초기화',
    'edit.annot': '주석',
    'edit.text': '텍스트',
    'edit.rect': '사각형',
    'edit.arrow': '화살표',
    'edit.color': '색',
    'edit.width': '굵기',
    'edit.size': '크기',
    'edit.logo': '로고',
    'edit.stamp': '스탬프',
    'edit.project': '사업명',
    'edit.school': '학교명',
    'edit.date': '날짜',
    'edit.addStamp': '현재 사진에 추가',
    'edit.stampAll': '큐 전체 일괄',
    'edit.stampHint': '우하단에 `사업명 | 학교명 | 날짜` 한 줄. 입력값은 이 브라우저에 기억됩니다.',

    'conv.resize': '리사이즈',
    'conv.long': '긴 변(px)',
    'conv.target': '목표(KB)',
    'conv.targetHint': '0이면 품질 슬라이더를 그대로 씁니다. 값을 넣으면 품질을 낮춰가며 맞춥니다(JPG만).',
    'conv.format': '포맷 · 품질',
    'conv.quality': '품질',
    'conv.name': '파일명 규칙',
    'conv.nameHint': '{school} {project} {date} {n} {orig} 사용 가능. {n}은 2자리 번호.',
    'conv.applyCur': '현재 사진에 적용',
    'conv.applyAll': '큐 전체 적용',
    'conv.applyHint': '적용하면 원본 픽셀이 축소·재압축됩니다. 되돌리기로 한 단계 복구할 수 있습니다.',

    'out.image': '이미지 다운로드',
    'out.current': '현재 이미지',
    'out.zip': '큐 전체 ZIP',
    'out.exifHint': '내보낼 때 항상 캔버스로 다시 인코딩하므로 EXIF(GPS 포함)는 남지 않습니다.',
    'out.sheet': '콘택트시트 PDF',
    'out.sheetMake': 'A4 콘택트시트 만들기',
    'out.pdf': '사진 PDF',
    'out.pdfMake': '1장/페이지 PDF 만들기',
    'out.merge': '전/후 합치기',
    'out.mergeHint': '큐에서 체크박스로 2장을 고른 뒤 실행하면 좌우로 나란히 붙입니다.',
    'out.mergeMake': '선택한 2장 합치기',

    'bar.apply': '적용',
    'bar.undo': '되돌리기',
    'bar.revert': '원본 복구',
    'bar.batch': '전체 일괄 가림',

    'st.wait': '대기',
    'st.ready': '준비',
    'st.busy': '처리 중',
    'st.done': '완료',
    'st.err': '오류',

    'msg.noImage': '먼저 사진을 추가하세요.',
    'msg.unsupported': '지원하지 않는 형식: {name}',
    'msg.heicFail': 'HEIC 변환 실패: {name}',
    'msg.loadFail': '이미지를 열 수 없습니다: {name}',
    'msg.added': '{n}장 추가',
    'msg.detecting': '얼굴 검출 중…',
    'msg.detected': '얼굴 {n}개 검출',
    'msg.detectNone': '검출된 얼굴 없음 — 수동 박스를 쓰세요.',
    'msg.detectFail': '얼굴 검출 모듈을 불러오지 못했습니다. http:// 로 열면 동작합니다. (수동 박스는 계속 사용 가능)',
    'msg.applied': '적용 완료',
    'msg.nothingToApply': '적용할 변경이 없습니다.',
    'msg.undone': '한 단계 되돌렸습니다.',
    'msg.noUndo': '되돌릴 단계가 없습니다.',
    'msg.reverted': '원본으로 되돌렸습니다.',
    'msg.noBox': '박스가 없습니다.',
    'msg.noSel': '선택된 박스가 없습니다.',
    'msg.batchDone': '일괄 처리 완료 ({ok}/{total})',
    'msg.batchFail': '{n}장 실패 — 나머지는 계속 처리했습니다.',
    'msg.needTwo': '큐에서 정확히 2장을 체크하세요.',
    'msg.merged': '합친 이미지를 큐에 추가했습니다.',
    'msg.cropTooSmall': '자르기 영역이 너무 작습니다.',
    'msg.noCustom': '먼저 대체 이미지를 업로드하세요.',
    'msg.pdfDone': 'PDF를 저장했습니다.',
    'msg.zipDone': 'ZIP {n}장 저장 완료',
    'msg.stampEmpty': '사업명/학교명/날짜 중 하나는 입력해야 합니다.',
    'msg.working': '처리 중…',
    'msg.pendingApply': '미적용 변경을 먼저 굽습니다.',

    'ph.detectIdle': '',
    'ph.faces': '얼굴 {n} · 박스 {b}'
  };

  var en = {
    'app.tagline': 'Report photo prep, entirely in your browser',
    'app.privacy': 'Photos are processed only inside this browser and are never uploaded.',
    'queue.title': 'Queue',
    'queue.drop': 'Drop photos here',
    'queue.pick': 'Choose files',
    'queue.clear': 'Clear queue',
    'queue.removeSel': 'Remove checked',
    'stage.empty': 'No image',
    'stage.hint': 'Add photos on the left to start.',
    'tab.face': 'Faces', 'tab.edit': 'Edit', 'tab.conv': 'Convert', 'tab.out': 'Export',
    'face.detect': 'Detection', 'face.conf': 'Confidence', 'face.redetect': 'Re-detect',
    'face.drawbox': 'Draw box',
    'face.hint': 'Drag on empty area to add a manual box. Detected boxes are expanded 15%.',
    'face.mode': 'Mask mode', 'face.pixelate': 'Pixelate', 'face.blur': 'Blur',
    'face.icon': 'Icon', 'face.image': 'Image', 'face.block': 'Block', 'face.blurAmt': 'Amount',
    'face.toSelected': 'Apply to selected', 'face.toAll': 'Apply to all',
    'face.boxes': 'Boxes', 'face.delBox': 'Delete selected', 'face.clearBoxes': 'Delete all',
    'face.delHint': 'Select a box and press Delete.',
    'edit.geom': 'Crop / Rotate', 'edit.rotate': 'Rotate 90°', 'edit.flip': 'Flip H',
    'edit.cropStart': 'Crop', 'edit.cropApply': 'Apply crop', 'edit.cropCancel': 'Cancel',
    'edit.adjust': 'Adjust', 'edit.bright': 'Bright', 'edit.contrast': 'Contrast', 'edit.sat': 'Saturate',
    'edit.reset': 'Reset', 'edit.annot': 'Annotate', 'edit.text': 'Text', 'edit.rect': 'Rect',
    'edit.arrow': 'Arrow', 'edit.color': 'Color', 'edit.width': 'Width', 'edit.size': 'Size',
    'edit.logo': 'Logo', 'edit.stamp': 'Stamp', 'edit.project': 'Project', 'edit.school': 'School',
    'edit.date': 'Date', 'edit.addStamp': 'Add to current', 'edit.stampAll': 'Apply to queue',
    'edit.stampHint': 'One line at bottom-right. Values are remembered in this browser.',
    'conv.resize': 'Resize', 'conv.long': 'Long edge', 'conv.target': 'Target KB',
    'conv.targetHint': '0 keeps the quality slider. Otherwise quality is lowered to fit (JPG only).',
    'conv.format': 'Format / Quality', 'conv.quality': 'Quality', 'conv.name': 'Filename rule',
    'conv.nameHint': 'Use {school} {project} {date} {n} {orig}. {n} is a 2-digit index.',
    'conv.applyCur': 'Apply to current', 'conv.applyAll': 'Apply to queue',
    'conv.applyHint': 'This re-encodes the full-resolution pixels. One undo step is kept.',
    'out.image': 'Download', 'out.current': 'Current image', 'out.zip': 'Whole queue (ZIP)',
    'out.exifHint': 'Every export is re-encoded through a canvas, so no EXIF (incl. GPS) survives.',
    'out.sheet': 'Contact sheet PDF', 'out.sheetMake': 'Build A4 contact sheet',
    'out.pdf': 'Photo PDF', 'out.pdfMake': 'One photo per page',
    'out.merge': 'Before / After', 'out.mergeHint': 'Check exactly 2 items in the queue.',
    'out.mergeMake': 'Merge checked 2',
    'bar.apply': 'Apply', 'bar.undo': 'Undo', 'bar.revert': 'Revert to original',
    'bar.batch': 'Batch mask all',
    'st.wait': 'waiting', 'st.ready': 'ready', 'st.busy': 'working', 'st.done': 'done', 'st.err': 'error',
    'msg.noImage': 'Add a photo first.',
    'msg.unsupported': 'Unsupported file: {name}',
    'msg.heicFail': 'HEIC conversion failed: {name}',
    'msg.loadFail': 'Cannot open image: {name}',
    'msg.added': '{n} added',
    'msg.detecting': 'Detecting faces…',
    'msg.detected': '{n} face(s) detected',
    'msg.detectNone': 'No face detected — use manual boxes.',
    'msg.detectFail': 'Face detector failed to load. Serve over http:// (manual boxes still work).',
    'msg.applied': 'Applied',
    'msg.nothingToApply': 'Nothing to apply.',
    'msg.undone': 'Undone one step.',
    'msg.noUndo': 'Nothing to undo.',
    'msg.reverted': 'Reverted to original.',
    'msg.noBox': 'No boxes.',
    'msg.noSel': 'No box selected.',
    'msg.batchDone': 'Batch done ({ok}/{total})',
    'msg.batchFail': '{n} failed — the rest were processed.',
    'msg.needTwo': 'Check exactly 2 items.',
    'msg.merged': 'Merged image added to the queue.',
    'msg.cropTooSmall': 'Crop area is too small.',
    'msg.noCustom': 'Upload a replacement image first.',
    'msg.pdfDone': 'PDF saved.',
    'msg.zipDone': 'ZIP saved ({n} files)',
    'msg.stampEmpty': 'Fill at least one of project / school / date.',
    'msg.working': 'Working…',
    'msg.pendingApply': 'Baking pending changes first.',
    'ph.detectIdle': '',
    'ph.faces': '{n} face(s) · {b} box(es)'
  };

  var dict = { ko: ko, en: en };
  var lang = 'ko';

  function t(key, vars) {
    var s = (dict[lang] && dict[lang][key]) || (dict.ko[key]) || key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
      });
    }
    return s;
  }

  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }

  function setLang(l) { if (dict[l]) { lang = l; apply(document); } }

  SnapLab.i18n = { t: t, apply: apply, setLang: setLang, get lang() { return lang; } };
})();
