const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function generatePNG(size, primaryColor = [16, 185, 129]) {
  // Create raw RGBA buffer
  const width = size;
  const height = size;
  const buffer = Buffer.alloc(width * height * 4);

  const cx = width / 2;
  const cy = height / 2;
  const r = size * 0.45;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Dark circle background with emerald accent icon
        buffer[idx] = 18;     // R
        buffer[idx + 1] = 18; // G
        buffer[idx + 2] = 18; // B
        buffer[idx + 3] = 255;// A

        // Draw download arrow in center
        const nx = (x - cx) / r;
        const ny = (y - cy) / r;

        // Arrow vertical line
        if (Math.abs(nx) <= 0.12 && ny >= -0.4 && ny <= 0.25) {
          buffer[idx] = primaryColor[0];
          buffer[idx + 1] = primaryColor[1];
          buffer[idx + 2] = primaryColor[2];
        }
        // Arrow head left/right
        if (ny >= -0.1 && ny <= 0.3 && Math.abs(nx) <= (0.35 - (ny - 0.2))) {
          if (ny >= nx && ny >= -nx) {
            buffer[idx] = primaryColor[0];
            buffer[idx + 1] = primaryColor[1];
            buffer[idx + 2] = primaryColor[2];
          }
        }
        // Bottom bar
        if (Math.abs(nx) <= 0.45 && ny >= 0.4 && ny <= 0.55) {
          buffer[idx] = primaryColor[0];
          buffer[idx + 1] = primaryColor[1];
          buffer[idx + 2] = primaryColor[2];
        }
      } else {
        // Transparent
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }

  // Build PNG chunks
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0; // Filter type 0 (None)
    buffer.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressedData = zlib.deflateSync(scanlines);

  function crc32(buf) {
    let c = 0xffffffff;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let k = n;
      for (let m = 0; m < 8; m++) {
        k = (k & 1) ? (0xedb88320 ^ (k >>> 1)) : (k >>> 1);
      }
      table[n] = k;
    }
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = generatePNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon${size}.png`);
});
