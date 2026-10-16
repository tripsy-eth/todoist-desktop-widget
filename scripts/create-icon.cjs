// Generate a dependency-free Windows ICO asset with a 32-bit BGRA bitmap.
const fs = require('node:fs');
const path = require('node:path');
const size = 32;
const pixels = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const check = (x >= 7 && x <= 14 && Math.abs(y - (x + 8)) <= 2) ||
      (x >= 13 && x <= 25 && Math.abs(y - (35 - x)) <= 2);
    const offset = ((size - 1 - y) * size + x) * 4;
    pixels.set(check ? [255, 255, 255, 255] : [50, 67, 228, 255], offset);
  }
}
const mask = Buffer.alloc(size * 4);
const bitmap = Buffer.alloc(40);
bitmap.writeUInt32LE(40, 0);
bitmap.writeInt32LE(size, 4);
bitmap.writeInt32LE(size * 2, 8);
bitmap.writeUInt16LE(1, 12);
bitmap.writeUInt16LE(32, 14);
bitmap.writeUInt32LE(pixels.length + mask.length, 20);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = size;
header[7] = size;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(bitmap.length + pixels.length + mask.length, 14);
header.writeUInt32LE(header.length, 18);
const directory = path.join(__dirname, '../src-tauri/icons');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'icon.ico'), Buffer.concat([header, bitmap, pixels, mask]));
