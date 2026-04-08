// シンプルなソリッドカラーの PNG アイコンを生成するスクリプト
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 48, 128];
const BG_COLOR = { r: 26, g: 152, b: 255 }; // #1a98ff

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function generatePng(size) {
  // PNG シグネチャ
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // ピクセルデータ（各行: フィルタバイト 0x00 + RGB * width）
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter = None
    for (let x = 0; x < size; x++) {
      rawData[offset + 1 + x * 3] = BG_COLOR.r;
      rawData[offset + 2 + x * 3] = BG_COLOR.g;
      rawData[offset + 3 + x * 3] = BG_COLOR.b;
    }
  }

  const compressed = deflateSync(rawData, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir('icons', { recursive: true });

for (const size of SIZES) {
  const pngData = generatePng(size);
  const path = `icons/icon${size}.png`;
  createWriteStream(path).end(pngData);
  console.log(`Generated ${path} (${size}x${size})`);
}
