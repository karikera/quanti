class ColorGroup {
  public readonly lengthOfFarthest: number;
  private readonly point1: number;
  private readonly point2: number;

  constructor(
    public readonly colors: number[],
    public readonly counts: number[],
    public readonly channelCount: number
  ) {
    if (colors.length <= 0) throw Error("unexpected colors length");
    if (counts.length !== colors.length)
      throw Error("unexpected counts length");

    function findFarthest(axis: number): number {
      const n = colors.length;
      let farthest = 0;
      let distMax = -1;
      for (let i = 0; i < n; i++) {
        const color = colors[i];
        const dist = colorDistanceInt(axis, color);
        if (dist > distMax) {
          farthest = color;
          distMax = dist;
        }
      }
      return farthest;
    }

    // get min/max
    this.point1 = findFarthest(this.colors[0]);
    this.point2 = findFarthest(this.point1);
    this.lengthOfFarthest = colorDistanceInt(this.point1, this.point2);
  }

  calculateAverage(out: Uint8Array): void {
    let total = 0;
    const colorSum = new Float64Array(this.channelCount);
    const n = this.colors.length;
    for (let i = 0; i < n; i++) {
      const pixel = this.colors[i];
      const count = this.counts[i];
      total += count;
      for (let c = 0; c < this.channelCount; c++) {
        const v = (pixel >> (c << 3)) & 0xff;
        colorSum[c] += quanti.srgb_to_linear(v) * count;
      }
    }
    for (let i = 0; i < this.channelCount; i++) {
      let c = Math.round(quanti.linear_to_srgb(colorSum[i] / total));
      if (c > 255) c = 255;
      out[i] = c;
    }
  }

  split(): [ColorGroup, ColorGroup] {
    const channelCount = this.channelCount;
    const center = new Array<number>(channelCount);
    for (
      let o = 0, c1 = this.point1, c2 = this.point2;
      o < channelCount;
      o++, c1 >>= 8, c2 >>= 8
    ) {
      center[o] = ((c1 & 0xff) + (c2 & 0xff)) / 2;
    }

    const vector = new Array(channelCount);
    for (
      let o = 0, c1 = this.point1, c2 = this.point2;
      o < channelCount;
      o++, c1 >>= 8, c2 >>= 8
    ) {
      vector[o] = ((c2 & 0xff) - (c1 & 0xff)) / 2;
    }

    const c1: number[] = [];
    const c2: number[] = [];
    const n1: number[] = [];
    const n2: number[] = [];
    const n = this.colors.length;
    for (let i = 0; i < n; i++) {
      const color = this.colors[i];
      const count = this.counts[i];

      let dot = 0;
      for (let c = 0; c < channelCount; c++) {
        const shift = c << 3;
        const rpos = ((color >> shift) & 0xff) - center[c];
        dot += rpos * vector[c];
      }
      if (dot > 0) {
        c1.push(color);
        n1.push(count);
      } else {
        c2.push(color);
        n2.push(count);
      }
    }
    return [
      new ColorGroup(c1, n1, channelCount),
      new ColorGroup(c2, n2, channelCount),
    ];
  }

  static fromPixels(
    pixels: ArrayLike<number>,
    channelCount: number
  ): ColorGroup {
    const out = new Map<number, [number]>();
    const n = Math.floor(pixels.length / channelCount) * channelCount;
    for (let i = 0; i < n; ) {
      let v = 0;
      for (let c = 0; c < channelCount; c++) {
        v |= pixels[i++] << (c << 3);
      }

      const count = out.get(v);
      if (count !== undefined) count[0]++;
      else out.set(v, [1]);
    }
    const colors: number[] = [];
    const counts: number[] = [];
    for (const [color, [count]] of out) {
      colors.push(color);
      counts.push(count);
    }
    return new ColorGroup(colors, counts, channelCount);
  }
}

function quanti(
  pixels: ArrayLike<number>,
  colorCount: number,
  channelCount: number
): quanti.Palette {
  if (
    pixels == null ||
    typeof pixels !== "object" ||
    typeof pixels.length !== "number"
  )
    throw TypeError("invalid parameter, pixels must be an array of numbers");
  colorCount |= 0;
  channelCount |= 0;

  if (colorCount < 0)
    throw Error(`out of range, colorCount=${colorCount}, minimum=1`);
  if (channelCount < 1)
    throw Error(`out of range, channelCount=${channelCount}, minimum=1`);
  if (channelCount > 4)
    throw Error(`out of range, channelCount=${channelCount}, maximum=4`);
  if (pixels.length === 0) throw Error("empty pixels");

  const groups = [ColorGroup.fromPixels(pixels, channelCount)];
  while (groups.length < colorCount) {
    let group = groups[0];
    let groupIdx = 0;
    let maxLen = group.lengthOfFarthest;
    for (let i = 1; i < groups.length; i++) {
      const g = groups[i];
      if (g.lengthOfFarthest > maxLen) {
        group = g;
        groupIdx = i;
        maxLen = group.lengthOfFarthest;
      }
    }
    if (maxLen === 0) {
      break; // no more colors
    }
    const last = groups.pop();
    if (groupIdx !== groups.length) groups[groupIdx] = last!;
    groups.push(...group.split());
  }

  colorCount = groups.length;
  const fullArray = new Uint8Array(colorCount * channelCount);
  const n = fullArray.length;
  const palette8: Uint8Array[] = [];
  for (let i = 0; i < n; i += channelCount) {
    palette8.push(fullArray.subarray(i, i + channelCount));
  }

  for (let i = 0; i < colorCount; i++) {
    groups[i].calculateAverage(palette8[i]);
  }
  return new quanti.Palette(palette8);
}

interface WritableArrayLike<T> {
  readonly length: number;
  [key: number]: T;
}

const ERROR_LIMIT = 100;

namespace quanti {
  export class Palette<Color extends ArrayLike<number> = Uint8Array> {
    constructor(public readonly palette: Color[]) {
      if (palette.length === 0) throw Error("empty palette");
    }
    map(color: ArrayLike<number>, offset: number = 0): Color {
      const palette = this.palette;
      let target = palette[0];
      const channelCount = target.length;
      let distance = colorDistanceArray(color, offset, target, channelCount);
      const n = palette.length;
      for (let i = 1; i < n; i++) {
        const p = palette[i];
        const dist = colorDistanceArray(color, offset, p, channelCount);
        if (dist < distance) {
          distance = dist;
          target = p;
        }
      }
      return target;
    }
    process(data: WritableArrayLike<number>): void {
      const channelCount = this.palette[0].length;
      const n = Math.floor(data.length / channelCount) * channelCount;
      for (let i = 0; i < n; ) {
        const mapped = this.map(data, i);
        for (let c = 0; c < channelCount; c++) {
          data[i++] = mapped[c];
        }
      }
    }
    ditherProcess(data: WritableArrayLike<number>, width: number): void {
      const cc = this.palette[0].length;
      const n = Math.floor(data.length / cc) * cc;
      const widthBytes = width * cc;

      const array = new Float32Array(widthBytes * 2);
      let errors1 = array.subarray(0, widthBytes);
      let errors2 = array.subarray(widthBytes);

      const targetSgrb = new Float32Array(cc);
      const targetLinear = new Float32Array(cc);

      const lastLine = n - widthBytes;
      for (let i = 0; i < n; ) {
        const bottomExists = i < lastLine;
        for (let x = 0; x < widthBytes; ) {
          for (let c = 0; c < cc; c++, x++, i++) {
            const linear = errors1[x] + srgb_to_linear(data[i]);
            targetLinear[c] = linear;
            targetSgrb[c] = linear <= 0 ? 0 : linear_to_srgb(linear);
          }
          i -= cc;
          x -= cc;

          const mappedSrgb = this.map(targetSgrb);
          const leftExists = x === 0;
          const rightExists = x < widthBytes;
          for (let c = 0; c < cc; c++, x++, i++) {
            data[i] = mappedSrgb[c];
            let error = targetLinear[c] - srgb_to_linear(mappedSrgb[c]);

            // limit too high error
            if (error < -ERROR_LIMIT) {
              error = -ERROR_LIMIT;
            } else if (error > ERROR_LIMIT) {
              error = ERROR_LIMIT;
            }

            // Floyd–Steinberg dithering

            // right
            error /= 16;
            if (rightExists) {
              errors1[x + cc] += error * 7;
            }
            // bottom
            if (bottomExists) {
              errors2[x] += error * 5;
              // right-bottom
              if (rightExists) {
                errors2[x + cc] += error;
              }
              // left-bottom
              if (leftExists) {
                errors2[x - cc] += error * 3;
              }
            }
          }
        }

        const t = errors1;
        errors1 = errors2;
        errors2 = t;
        errors2.fill(0);
      }
    }
  }
  export function srgb_to_linear(n: number): number {
    n /= 255;
    if (n <= 0.04045) return n / 12.92;
    else return Math.pow((n + 0.055) / 1.055, 2.4);
  }

  export function linear_to_srgb(n: number): number {
    if (n < 0.0031308) n *= 12.92;
    else n = Math.pow(n, 1 / 2.4) * 1.055 - 0.055;
    return n * 255;
  }
}

export = quanti;

function colorDistanceInt(color1: number, color2: number) {
  const a = (color1 & 0xff) - (color2 & 0xff);
  const b = ((color1 >> 8) & 0xff) - ((color2 >> 8) & 0xff);
  const c = ((color1 >> 16) & 0xff) - ((color2 >> 16) & 0xff);
  const d = (color1 >>> 24) - (color2 >>> 24);
  return a * a + b * b + c * c + d * d;
}
function colorDistanceArray(
  pixels: ArrayLike<number>,
  offset: number,
  checkColor: ArrayLike<number>,
  channelCount: number
): number {
  let v = pixels[offset++] - checkColor[0];
  v *= v;
  let i = 1;
  while (i !== channelCount) {
    const d = pixels[offset++] - checkColor[i++];
    v += d * d;
  }
  return v;
}
