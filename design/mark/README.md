# 서비스 마크

형태 규칙과 쓰는 법은 [`../README.md` §5](../README.md) 에 있습니다.

| 파일 | 쓰임 |
|---|---|
| `snap-box-mark.svg` | snap-box 마크 사본. 실제로 쓰이는 원본은 `assets/img/snap-box-mark.svg` |
| `clip-box-mark.svg` | 자매 서비스 본보기. 같은 바탕·같은 흰 판에 글리프만 다릅니다 |

새 서비스를 만들 때는 `clip-box-mark.svg` 를 복사해 **흰 판 안의 글리프만** 바꾸세요.
바탕 사각형(`rx 9.5`, `#1F5F7A`)과 흰 판(`7.5,10,25,20`, `rx 3`)은 건드리지 않습니다.

## PNG 다시 뽑기

SVG 를 고치면 파비콘도 다시 뽑아야 합니다. 브라우저 콘솔에서:

```js
// 64 · 180 · 512 를 각각
const svg = await (await fetch('assets/img/snap-box-mark.svg')).text();
const img = new Image();
img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
await img.decode();
const size = 64, c = document.createElement('canvas');
c.width = c.height = size;
c.getContext('2d').drawImage(img, 0, 0, size, size);
c.toBlob(b => { const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'icon-' + size + '.png'; a.click(); });
```
