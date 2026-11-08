import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { IMAGE_MIME } from "@vaultkeeper/shared/constants";
import { describe, expect, it } from "vitest";
import { MIN_SNIFF_BYTES, sniffImage } from "./image-sniff";

const FIXTURES = resolve(import.meta.dirname, "../../test/fixtures/images");

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(FIXTURES, name)));
}

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

describe("sniffImage: type from magic bytes (task 3.13, design 09)", () => {
  it.each([
    ["pixel.png", IMAGE_MIME.PNG],
    ["pixel.jpg", IMAGE_MIME.JPEG],
    ["pixel.webp", IMAGE_MIME.WEBP],
  ])("detects %s as %s", async (name, mime) => {
    expect(sniffImage(await fixture(name))).toBe(mime);
  });

  it.each(["pixel.gif", "not-an-image.txt"])("rejects %s (not an allowed image)", async (name) => {
    expect(sniffImage(await fixture(name))).toBeNull();
  });

  it(`rejects anything shorter than ${MIN_SNIFF_BYTES} bytes, even a valid prefix`, async () => {
    const png = await fixture("pixel.png");
    expect(sniffImage(png.slice(0, MIN_SNIFF_BYTES - 1))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("rejects a RIFF container that is not WEBP (e.g. WAVE audio)", () => {
    const wave = new Uint8Array([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WAVEfmt ")]);
    expect(sniffImage(wave)).toBeNull();
  });

  it("rejects WEBP at the wrong offset and a PNG signature with one wrong byte", async () => {
    const shifted = new Uint8Array([0, ...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]);
    expect(sniffImage(shifted)).toBeNull();
    const png = await fixture("pixel.png");
    const broken = png.slice();
    broken[7] = 0x00;
    expect(sniffImage(broken)).toBeNull();
  });
});
