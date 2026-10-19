import fs from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
const png = await sharp('build/icon-source.png').resize(1024).png().toBuffer();
await fs.writeFile('build/icon.png', png);
const buffers = await Promise.all(
  [16, 24, 32, 48, 64, 128, 256].map((size) => sharp(png).resize(size).png().toBuffer()),
);
await fs.writeFile('build/icon.ico', await pngToIco(buffers));
const chunks = await Promise.all(
  [
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ].map(async ([type, size]) => {
    const data = await sharp(png).resize(size).png().toBuffer();
    const header = Buffer.alloc(8);
    header.write(type, 0);
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  }),
);
const header = Buffer.alloc(8);
header.write('icns');
header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
await fs.writeFile('build/icon.icns', Buffer.concat([header, ...chunks]));
console.log('Generated PNG, ICO and ICNS icons.');
