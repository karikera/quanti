## Quanti

Quanti the [color quantization](https://en.wikipedia.org/wiki/Color_quantization) library

| Original                        | Quantized to 8 colors                      |
| ------------------------------- | ------------------------------------------ |
| ![original](./image/sample.png) | ![quantized](./image/sample_quantized.png) |

### Example with Jimp

```ts
const Jimp = require("jimp");
const quanti = require("quanti");

(async () => {
  const image = await Jimp.read("./image/sample.png");
  const data = image.bitmap.data;
  const palette = quanti(data, 8, 4);
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
    mapIndex(color: ArrayLike<number>, offset: number = 0): number; // mapping one color to the palette index
    map(color: ArrayLike<number>, offset: number = 0): ArrayLike<number>; // mapping one color
    process(data: WritableArrayLike<number>): void; // mapping pixels data
    ditherProcess(data: WritableArrayLike<number>, width: number): void; // mapping pixels data with dithering
  }
  function srgb_to_linear(n: number): number;
  function linear_to_srgb(n: number): number;
}
```
