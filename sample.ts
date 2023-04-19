import Jimp = require("jimp");
import quanti = require("./quanti");

(async () => {
  const image = await Jimp.read("./image/sample.png");
  const data = image.bitmap.data;
  const palette = quanti(data, 16, 4);
  palette.ditherProcess(data, image.getWidth());
  await image.writeAsync("./image/sample_quantized.png");
})();
