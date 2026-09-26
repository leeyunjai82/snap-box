# snap-box

보고서에 넣을 사진의 **얼굴 가림 · 편집 · 용량 정리 · PDF 만들기**를 브라우저 한 페이지에서 끝냅니다.

### → [snap-box 열기](https://dibrain.dev/snap-box/)

설치 없이 바로 씁니다. 데스크톱 Chrome · Edge 기준입니다.

![snap-box](assets/screenshot.png)

## 사진은 브라우저 밖으로 나가지 않습니다

모든 처리가 이 브라우저 안에서만 돌아갑니다. 서버도 계정도 없고, 사진이 올라가는 경로가 없습니다.
얼굴 찾기 기능까지 사이트에 들어 있어서, 쓰는 동안 바깥으로 나가는 요청이 하나도 없습니다.

- 내보낸 사진에 **촬영 정보(EXIF·GPS)가 남지 않습니다.**
- 사업명·학교명·날짜와 설정만 기억하고, **사진은 저장하지 않습니다.** 새로고침하면 사라집니다.

## 쓰는 순서

**사진 위의 파란 줄이 다음에 할 일을 알려 줍니다.** 그 줄의 버튼만 눌러도
넣기 → 가리기 → 내려받기가 끝납니다.

사진을 왼쪽에 끌어다 놓으면 (JPG · PNG · WEBP · HEIC) 바로 얼굴을 찾습니다.
못 찾은 얼굴은 사진 위를 대각선으로 끌어서 직접 표시합니다.
아래는 더 손볼 때 쓰는 것들입니다.

- **1 얼굴 가리기** — 모자이크 · 흐리게 · 그림 · 내 이미지. **전체 한꺼번에 가리기**로 목록 전부 처리
- **2 다듬기** — 자르기 · 돌리기 · 밝기·색 · 글자·네모·화살표 · 사진 아래 `사업명 | 학교명 | 날짜` 한 줄
- **3 크기·용량** — 긴 변과 목표 용량(KB)을 정하면 알아서 맞춥니다. 파일 이름 규칙도 여기서 정합니다
- **4 내보내기** — 한 장씩 또는 전체 ZIP · A4 붙임 사진 대지 PDF · 한 쪽에 한 장 PDF · 전·후 붙이기

가림은 바로 저장되지 않습니다. **적용**을 눌러야 사진에 들어갑니다.
**원본 보기**를 누르고 있으면(또는 `\` 키) 원본이 보이고, 놓으면 작업이 그대로 돌아옵니다 — 가린 자리 확인용입니다.
잘못했으면 **되돌리기**(여덟 단계)나 **처음 상태로**(넣었을 때로) 를 씁니다.

---

<details>
<summary>개발자용</summary>

쓰는 라이브러리는 전부 이 저장소에 담겨 있습니다 —
[@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.0.1 (BlazeFace 풀레인지) ·
[fabric.js](https://fabricjs.com/) 5.3.0 ·
[heic2any](https://github.com/alexcorvi/heic2any) 0.0.4 ·
[jsPDF](https://github.com/parallax/jsPDF) 2.5.1 ·
[JSZip](https://stuk.github.io/jszip/) 3.10.1 ·
[Pretendard](https://github.com/orioncactus/pretendard) ·
[Font Awesome Free](https://fontawesome.com/) 6.2.0.
얼굴 대체 그림은 yjworks 가 직접 그렸습니다. 앱 아이콘과 상단 바는 DigitalBrain 브랜드 키트를 따릅니다.

`index.html` 을 그대로 열어도 되지만, 그때는 얼굴 자동 찾기만 못 씁니다
(Chrome 이 `file://` 에서 모델 읽기를 막습니다). 나머지는 그대로 동작합니다.

색·글꼴·상단 바는 DigitalBrain 공통 토큰(`css/db-tokens.css`, 원본 사본이라 고치지 않음)을 쓰고,
화면 틀은 `css/ui.css`, 이 앱에만 있는 것은 `css/app.css` 에 있습니다.
설정값(사업명·학교명·날짜 등)만 `localStorage` 에 두고 사진은 저장하지 않습니다.
키는 모두 `snap-box:` 로 시작합니다(`snap-box:settings`, `snap-box:faceMore`, `snap-box:language`).
페이지 맨 아래 **기록 전체 삭제**로 이 앱 것만 지웁니다(dibrain.dev 의 다른 앱 기록은 그대로).

얼굴 찾기 모델은 Google MediaPipe 의 BlazeFace(짧은 거리·긴 거리)이고
Apache License 2.0 입니다. `models/` 의 파일은 Google 이 배포한 원본 그대로입니다.

</details>
