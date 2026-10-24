// Picture work on the phone (web): preparing a picked QR for saving, and building a saved copy.
// Nothing here talks to a server. Kenshin's save/share ruling 3.5: white background, whole-number
// scaling, smoothing off, lossless PNG, and the finished picture is decoded again before it is used.
import { copyCaption, copyLayout, cropBox, MAX_QR_BYTES } from './qr';
import { decodeQr } from './qrDecode';

const MAX_PICK_BYTES = 5 * 1024 * 1024;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const toPng = (c: HTMLCanvasElement): Promise<Blob | null> => new Promise((res) => c.toBlob((b) => res(b), 'image/png'));

export type Prepared = { png: Blob; text: string } | { error: string };

/**
 * A picked picture becomes the QR alone (cropped, with a quiet zone) as a PNG under 256 KB. Cropping also
 * leaves out whatever else was on a wallet screenshot. The result must decode to the same text.
 */
export async function preparePicked(file: Blob): Promise<Prepared> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { error: 'That file isn’t a picture Patas can read. Use a PNG or JPG.' };
  if (file.size > MAX_PICK_BYTES) return { error: 'That picture is over 5 MB. Try a screenshot instead.' };
  const found = await decodeQr(file);
  if (!found) return { error: 'No QR code found in that picture. Try a clear screenshot of the QR.' };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return { error: 'Patas could not open that picture.' };
  }
  const box = cropBox(found.corners, bmp.width, bmp.height);
  let size = Math.min(1000, Math.max(box.w, box.h));
  for (let tries = 0; tries < 8; tries++) {
    const k = size / Math.max(box.w, box.h);
    const c = canvas(box.w * k, box.h * k);
    const g = c.getContext('2d');
    if (!g) break;
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
    const png = await toPng(c);
    if (png && png.size <= MAX_QR_BYTES) {
      const back = await decodeQr(png);
      bmp.close();
      return back && back.text === found.text ? { png, text: found.text } : { error: 'Patas couldn’t make a clean copy of that QR. Try another picture.' };
    }
    size = Math.floor(size * 0.8);
    if (size < 200) break;
  }
  bmp.close();
  return { error: 'That QR picture is too detailed to save. Try a plain screenshot of the QR.' };
}

export type Copy = { blob: Blob; text: string | null };

/** The copy to save or share: the stored PNG on white, scaled by a whole number, margin, date caption. */
export async function buildCopy(stored: Blob, today: string): Promise<Copy | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(stored);
  } catch {
    return null;
  }
  const L = copyLayout(bmp.width, bmp.height);
  const c = canvas(L.width, L.height);
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(bmp, L.margin, L.margin, bmp.width * L.scale, bmp.height * L.scale);
  bmp.close();
  g.fillStyle = '#5B6270';
  g.font = `500 ${Math.max(14, Math.round(L.caption * 0.42))}px Manrope_500, Inter, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(copyCaption(today), c.width / 2, L.height - L.caption / 2 - Math.round(L.margin / 4));
  const blob = await toPng(c);
  if (!blob) return null;
  const back = await decodeQr(blob);
  return { blob, text: back ? back.text : null };
}
