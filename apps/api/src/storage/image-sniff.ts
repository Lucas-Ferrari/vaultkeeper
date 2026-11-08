import { IMAGE_MIME, type ImageMime } from "@vaultkeeper/shared/constants";

/** Bytes needed to tell every allowed type apart (WEBP: "RIFF" ....  "WEBP" ends at byte 12). */
export const MIN_SNIFF_BYTES = 12;

interface Signature {
  offset: number;
  bytes: readonly number[];
}

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/** Magic bytes per allowed image type (design 09); every signature must match. */
const SIGNATURES: Readonly<Record<ImageMime, readonly Signature[]>> = {
  [IMAGE_MIME.PNG]: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  [IMAGE_MIME.JPEG]: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  [IMAGE_MIME.WEBP]: [
    { offset: 0, bytes: ascii("RIFF") },
    { offset: 8, bytes: ascii("WEBP") },
  ],
};

function matches(data: Uint8Array, signature: Signature): boolean {
  return signature.bytes.every((byte, index) => data[signature.offset + index] === byte);
}

/**
 * The image type the bytes actually are (R-CAT-6: never trust the declared content type), or null
 * for anything that is not png/jpeg/webp (gif, text, truncated headers, other RIFF containers).
 */
export function sniffImage(data: Uint8Array): ImageMime | null {
  if (data.byteLength < MIN_SNIFF_BYTES) return null;
  for (const [mime, signatures] of Object.entries(SIGNATURES) as [ImageMime, Signature[]][]) {
    if (signatures.every((signature) => matches(data, signature))) return mime;
  }
  return null;
}
