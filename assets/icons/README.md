# 기본 아이콘

얼굴 대체용 SVG 아이콘. 전부 자체 제작(외부 저작물 없음).

`js/face.js` 의 `ICON_SVG` 에 동일한 내용이 data: URI 로 내장되어 있습니다.
`file://` 로 열었을 때 로컬 SVG를 캔버스에 그리면 캔버스가 오염되어(tainted)
`toBlob()` 이 SecurityError 로 실패하기 때문입니다.

**이 폴더의 파일을 고치면 `js/face.js` 의 `ICON_SVG` 도 같이 고쳐야 합니다.**
