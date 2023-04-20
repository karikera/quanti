import Jimp = require("jimp");
import quanti = require("./quanti");

function average(data: Uint8Array) {
  let R = 0;
  let G = 0;
  let B = 0;
  let A = 0;
  const n = data.length;
  for (let i = 0; i < n; ) {
    const r = data[i++];
    const g = data[i++];
    const b = data[i++];
    const a = data[i++];
    R += quanti.srgb_to_linear(r);
    G += quanti.srgb_to_linear(g);
    B += quanti.srgb_to_linear(b);
    A += quanti.srgb_to_linear(a);
  }
  const size = n / 4;
  R = quanti.linear_to_srgb(R / size);
  G = quanti.linear_to_srgb(G / size);
  B = quanti.linear_to_srgb(B / size);
  A = quanti.linear_to_srgb(A / size);
  return [R, G, B, A];
}

(async () => {
  const image = await Jimp.read("./image/sample.png");
  const data = image.bitmap.data;
  const orig = average(data);
  const palette = quanti(data, 8, 4);
  palette.ditherProcess(data, image.getWidth());
  const conv = average(data);
  await image.writeAsync("./image/sample_quantized.png");

  const r = orig[0] - conv[0];
  const g = orig[1] - conv[1];
  const b = orig[2] - conv[2];
  const a = orig[3] - conv[3];
  console.log(`diff: (${r}, ${g}, ${b}, ${a})`);
})();
