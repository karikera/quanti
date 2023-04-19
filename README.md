## Quanti

| Original                        | Quantized to 16 colors                     |
| ------------------------------- | ------------------------------------------ |
| ![original](./image/sample.png) | ![quantized](./image/sample_quantized.png) |

Quanti the [color quantization](https://en.wikipedia.org/wiki/Color_quantization) library

### Example with Jimp

```ts
const Jimp = require("jimp");
const quanti = require("quanti");

(async () => {
  const image = await Jimp.read("./image/sample.png");
  const data = image.bitmap.data;
  const palette = quanti(data, 16, 4);
  palette.ditherProcess(data, image.getWidth());
  await image.writeAsync("./image/sample_quantized.png");
})();
```

### Reference

```ts
// ArrayLike = Array<number>, Uint8Array, any other number indexed object with length

function quanti(
  pixels: ArrayLike<number>, // total pixels that are considered
  colorCount: number, // output palette size
  channelCount: number // 3 if RGB, 4 if RGBA, >=5 unsupported
): quanti.Palette;

namespace quanti {
  class Palette {
    palette: ArrayLike<number>[];

    constructor(palette: ArrayLike<number>[]);
    map(color: ArrayLike<number>, offset: number = 0): ArrayLike<number>; // mapping one color
    process(data: WritableArrayLike<number>): void; // mapping pixels data
    ditherProcess(data: WritableArrayLike<number>, width: number): void; // mapping pixels data with dithering
  }
}
```
