// Skalerer et billede fra kameraet ned til højst 1600 px og gemmer det som JPEG,
// så det fylder et par hundrede kB i stedet for flere MB.

export const PHOTO_MAX_SIDE = 1600;
const MAX_BYTES = 4 * 1024 * 1024;

export type PreparedPhoto = { blob: Blob; width: number; height: number };

function loadImage(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_unreadable"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function preparePhoto(file: Blob, maxSide = PHOTO_MAX_SIDE): Promise<PreparedPhoto> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    // Drejer billedet efter EXIF, så telefonbilleder ikke ligger ned.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    // Ældre browsere: <img> følger selv EXIF-retningen.
    const img = await loadImage(file);
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  }
  if (!width || !height) throw new Error("image_unreadable");

  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("image_unreadable");
  // JPEG har ingen gennemsigtighed, så PNG'er får en lys baggrund i stedet for sort.
  ctx.fillStyle = "#FBF5E6";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  let blob = await toBlob(canvas, 0.8);
  if (blob && blob.size > MAX_BYTES) blob = await toBlob(canvas, 0.6);
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("image_unreadable");
  return { blob, width: w, height: h };
}
