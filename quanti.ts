class ColorGroup {
  public readonly axisLength: number;
  private readonly axis: number;
  private readonly axisMin: number;

  constructor(
    public readonly colors: number[],
    public readonly counts: number[],
    public readonly channelCount: number
  ) {
    if (colors.length <= 0) throw Error("unexpected colors length");
    if (counts.length !== colors.length)
      throw Error("unexpected counts length");

    // get min/max
    const mins = new Int32Array(channelCount);
    const maxs = new Int32Array(channelCount);

    const pixel = colors[0];
    for (let i = 0; i < channelCount; i++) {
      const v = (pixel >> (i << 3)) & 0xff;
      maxs[i] = mins[i] = v;
    }
    for (const pixel of colors) {
      for (let c = 0; c < channelCount; c++) {
        const v = (pixel >> (c << 3)) & 0xff;
        if (mins[c] > v) {
          mins[c] = v;
        } else if (maxs[c] < v) {
          maxs[c] = v;
        }
      }
    }

    // find longest
    let longest = 0;
    let longestLen = maxs[0] - mins[0];
    for (let i = 1; i < longestLen; i++) {
      const len = maxs[i] - mins[i];
      if (len > longestLen) {
        longest = i;
        longestLen = len;
      }
    }
    this.axisLength = longestLen;
    this.axis = longest;
    this.axisMin = mins[longest];
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
        colorSum[c] += v * count;
      }
    }
    for (let i = 0; i < this.channelCount; i++) {
      let c = colorSum[i] / total;
      if (c > 255) c = 255;
      out[i] = c;
    }
  }

  split(): [ColorGroup, ColorGroup] {
    const axisShift = this.axis << 3;
    const half = this.axisMin + this.axisLength / 2;
    const g1: number[] = [];
    const g2: number[] = [];
    const c1: number[] = [];
    const c2: number[] = [];
    const n = this.colors.length;
    for (let i = 0; i < n; i++) {
      const color = this.colors[i];
      const count = this.counts[i];
      const v = (color >> axisShift) & 0xff;
      if (v < half) {
        g1.push(color);
        c1.push(count);
      } else {
        g2.push(color);
        c2.push(count);
      }
    }
    return [
      new ColorGroup(g1, c1, this.channelCount),
      new ColorGroup(g2, c2, this.channelCount),
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

function colorDistance(
  pixel: ArrayLike<number>,
  offset: number,
  pcolor: ArrayLike<number>
): number {
  const n = pcolor.length;
  let v = 0;
  for (let i = 0; i !== n; i++) {
    const d = pixel[offset++] - pcolor[i];
    v += d * d;
  }
  return v;
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
    let maxLen = group.axisLength;
    for (let i = 1; i < groups.length; i++) {
      if (group.axisLength > maxLen) {
        group = groups[i];
        groupIdx = i;
        maxLen = group.axisLength;
      }
    }
    if (maxLen === 0) break; // no more colors
    const last = groups.pop();
    if (groupIdx !== groups.length) groups[groupIdx] = last!;
    groups.push(...group.split());
  }

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

namespace quanti {
  export class Palette<Color extends ArrayLike<number> = Uint8Array> {
    constructor(public readonly palette: Color[]) {
      if (palette.length === 0) throw Error("empty palette");
    }
    map(color: ArrayLike<number>, offset: number = 0): Color {
      const palette = this.palette;
      let target = palette[0];
      let distance = colorDistance(color, offset, target);
      const n = palette.length;
      for (let i = 1; i < n; i++) {
        const p = palette[i];
        const dist = colorDistance(color, offset, p);
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

      const TOO_HIGH = 256;

      const lastLine = n - widthBytes;
      for (let i = 0; i < n; ) {
        const bottomExists = i < lastLine;
        for (let x = 0; x < widthBytes; x++) {
          errors1[x] += data[i++];
        }
        i -= widthBytes;
        for (let x = 0; x < widthBytes; ) {
          const mapped = this.map(errors1, x);
          const leftExists = x === 0;
          const rightExists = x < widthBytes;
          for (let c = 0; c < cc; c++) {
            const ocolor = errors1[x];
            const ncolor = mapped[c];
            data[i++] = ncolor;
            let error = ocolor - ncolor;

            // limit too high error
            if (error < -TOO_HIGH) {
              error = -TOO_HIGH;
            } else if (error > 255 + TOO_HIGH) {
              error = 255 + TOO_HIGH;
            }

            // Floyd–Steinberg dithering

            // right
            if (rightExists) {
              errors1[x + cc] += (error * 7) / 16;
            }
            // bottom
            if (bottomExists) {
              errors2[x] += (error * 5) / 16;

              // right-bottom
              if (rightExists) {
                errors2[x + cc] += (error * 1) / 16;
              }

              // left-bottom
              if (leftExists) {
                errors2[x - cc] += (error * 1) / 16;
              }
            }
            x++;
          }
        }

        const t = errors1;
        errors1 = errors2;
        errors2 = t;
        errors2.fill(0);
      }
    }
  }
}

export = quanti;
