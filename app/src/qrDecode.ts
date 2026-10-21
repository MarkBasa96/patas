// Reads a QR code from a picture with zxing-wasm (the decoder Kenshin named, used for every check).
// The engine file is served by Patas itself (/zxing_reader.wasm, copied by scripts/copy-wasm.mjs), never
// fetched from a CDN, so viewing a QR tells no third party anything and works offline.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

let prepared = false;
function prepare() {
  if (prepared) return;
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? '/zxing_reader.wasm' : prefix + path) } });
  prepared = true;
}

export type Decoded = { text: string; corners: { x: number; y: number }[] };

/** The one QR in a picture, or null (no QR, unreadable, or the engine failed to load). */
export async function decodeQr(input: Blob | ImageData): Promise<Decoded | null> {
  prepare();
  try {
    const found = await readBarcodes(input, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
    const hit = found.find((r) => r.isValid && r.text);
    if (!hit) return null;
    const p = hit.position;
    return { text: hit.text, corners: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft] };
  } catch {
    return null;
  }
}
