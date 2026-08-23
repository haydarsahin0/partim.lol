/**
 * Yüklenen logoyu tarayıcıda küçültüp data URI'ye çevirir.
 *
 * Sunucuya ham dosya göndermiyoruz: logolar haritada ve listelerde en fazla
 * birkaç düzine piksel olarak görünüyor, 128px fazlasıyla yetiyor. Böylece
 * hem depolama hem de mobil yükleme süresi küçük kalıyor.
 */
export const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const OUTPUT_SIZE = 128;

export async function fileToSquareDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Yalnızca görsel dosyası yükleyebilirsin.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo en fazla 4 MB olabilir.");
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Görsel okunamadı.");
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işlenemedi.");

  // Kısa kenardan kırp: logo ortalanmış ve kare olsun
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  bitmap.close();

  return canvas.toDataURL("image/png");
}
