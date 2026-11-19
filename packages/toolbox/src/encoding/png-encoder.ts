import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 3;

const crcTable: readonly number[] = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

/**
 * Encodes an 8-bit RGB PNG whose rows are each a single colour. Enough for the
 * title-card backgrounds; no image dependency needed.
 */
export function encodeRowColorPng(options: { width: number; height: number; rowColor: (row: number) => RgbColor }): Buffer {
  const { width, height } = options;
  const stride = width * BYTES_PER_PIXEL + 1;
  const raw = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const { red, green, blue } = options.rowColor(row);
    const offset = row * stride;
    raw[offset] = 0; // filter type: none
    for (let column = 0; column < width; column += 1) {
      const pixel = offset + 1 + column * BYTES_PER_PIXEL;
      raw[pixel] = red;
      raw[pixel + 1] = green;
      raw[pixel + 2] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
