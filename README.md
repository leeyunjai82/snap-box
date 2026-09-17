# snap-box

보고서에 넣을 사진의 얼굴 가림·편집·용량 정리·PDF 첨부를 브라우저 한 페이지에서 끝냅니다.

![snap-box](assets/screenshot.png)

## 사진은 브라우저 밖으로 나가지 않습니다

얼굴 찾기, 가림, 리사이즈, 압축, PDF 만들기까지 **전부 이 브라우저 안에서** 돌아갑니다.
서버도 API도 없고, 사진이 올라가는 경로가 아예 없습니다.

라이브러리와 얼굴 찾기 모델까지 전부 이 저장소에 담아 두었기 때문에,
**실행 중 바깥으로 나가는 요청이 하나도 없습니다.** (개발자 도구 네트워크 탭에서 확인할 수 있습니다)

- 내보내는 파일은 항상 캔버스로 다시 저장하므로 **촬영 정보(EXIF·GPS)가 남지 않습니다.**
- 브라우저에 기억하는 것은 사업명·학교명·날짜와 마지막 설정값뿐입니다. 사진은 저장하지 않습니다.
- 새로고침하면 목록의 사진은 모두 사라집니다.

## GitHub Pages

<https://leeyunjai82.github.io/snap-box/>

로컬에서는 `python -m http.server` 로 열거나, `index.html` 을 그대로 더블클릭해도 됩니다.

## 쓰는 순서

1. **사진 넣기** — 왼쪽에 끌어다 놓습니다. JPG · PNG · WEBP · HEIC. HEIC는 넣는 즉시 JPG로 바뀝니다.
2. **얼굴 가리기** — 넣자마자 얼굴을 찾아 칸을 올립니다. 못 찾은 얼굴은 사진 위를 끌어서 직접 칸을 그립니다.
   모자이크 · 흐리게 · 그림 · 내 이미지 중에 고르고, 아래 **전체 한꺼번에 가리기**로 목록 전부를 처리합니다.
3. **다듬기** — 자르기, 90° 돌리기, 좌우 뒤집기, 밝기·대비·채도, 글자·네모·화살표·로고,
   오른쪽 아래 `사업명 | 학교명 | 날짜` 한 줄.
4. **크기·용량** — 긴 변 픽셀과 목표 용량(KB)을 정하면 품질을 낮춰가며 맞춥니다. 파일 이름 규칙도 여기서 정합니다.
5. **내보내기** — 한 장씩, 또는 전체 ZIP. A4 붙임 사진 대지 PDF, 한 쪽에 한 장 PDF, 전·후 좌우 붙이기.

가림은 바로 굽지 않고 미리보기로 올라갑니다. **적용**을 눌러야 원본 픽셀에 들어가고,
**되돌리기**로 여덟 단계까지, **원본으로**로 처음 넣었을 때까지 돌아갑니다.

## 쓰는 라이브러리 (전부 이 저장소에 담겨 있습니다)

| 라이브러리 | 버전 | 쓰임 | 위치 |
|---|---|---|---|
| [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) | 0.10.14 | FaceDetector (`blaze_face_short_range`) | `vendor/tasks-vision/`, `models/` |
| [fabric.js](https://fabricjs.com/) | 5.3.0 | 캔버스 편집 | `vendor/fabric/` |
| [heic2any](https://github.com/alexcorvi/heic2any) | 0.0.4 | HEIC → JPG | `vendor/heic2any/` |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | PDF · 붙임 사진 대지 | `vendor/jspdf/` |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | 전체 내려받기 | `vendor/jszip/` |
| [Pretendard](https://github.com/orioncactus/pretendard) | — | 본문 글꼴 | `assets/fonts/` |
| [Font Awesome Free](https://fontawesome.com/) | 6.2.0 | 아이콘 (Solid만) | `css/all.min.css`, `webfonts/` |

얼굴 대체 그림(`assets/icons/`)과 서비스 마크(`assets/img/snap-box-mark.svg`)는 자체 제작입니다.

## 디자인

**업무 도구 킷**([`css/maker-tool.css`](css/maker-tool.css))을 씁니다.
`themakerrobot/sense-lab` 의 교육용 킷과 **같은 집안, 다른 킷**입니다 —
브랜드 남색·Pretendard·헤더 구성·클래스 이름·토큰 이름은 그대로 물려받고,
학습지 장식(미색 종이·점무늬·갈색 괘선·명조 서비스명·원형 단계 번호)은 업무 화면에 맞게 바꿨습니다.
토큰 **이름**이 같아서 서비스는 CSS 한 줄만 바꿔 결을 고릅니다.

자매 서비스(clip-box 등)를 만들 때의 기준은 [`design/README.md`](design/README.md) 에 있고,
컴포넌트 실물은 [`design/preview.html`](design/preview.html) 을 서버로 띄워서 봅니다.

## 알아둘 점

- 데스크톱 Chrome / Edge 기준입니다. 모바일은 고려하지 않았습니다.
- `file://` 로 열면 **얼굴 자동 찾기만** 쓸 수 없습니다.
  Chrome 이 `file://` 에서 로컬 모듈과 `fetch` 를 막기 때문이고, 모델을 셀프호스팅하는 한 피할 수 없습니다.
  칸 직접 그리기·가림·다듬기·내보내기는 그대로 됩니다. 자동 찾기가 필요하면 `python -m http.server` 로 여세요.
- 사진을 넣은 채로 창을 닫으면 브라우저가 한 번 묻습니다. 사진은 어디에도 남지 않습니다.
