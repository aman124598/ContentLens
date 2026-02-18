// scripts/generate-icons.js
// Generates ContentLens PNG icons using ONLY Node.js built-ins (no canvas/sharp needed).
// Design: deep indigo rounded square + white lens ring + scan line + magnifier handle.
// Run: node scripts/generate-icons.js

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Minimal PNG encoder (pure Node, no deps) ─────────────────────────────────

function makeCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC_TABLE = makeCrcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(pixels, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((1 + w * 4) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (w * 4 + 1) + 1 + x * 4;
      raw[di] = pixels[si]; raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2]; raw[di + 3] = pixels[si + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function Bitmap(w, h) {
  const d = new Uint8Array(w * h * 4);
  function blend(i, r, g, b, a) {
    const sa = a / 255, da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa < 0.001) return;
    d[i] = Math.round((r * sa + d[i] * da * (1 - sa)) / oa);
    d[i + 1] = Math.round((g * sa + d[i + 1] * da * (1 - sa)) / oa);
    d[i + 2] = Math.round((b * sa + d[i + 2] * da * (1 - sa)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }
  return {
    data: d, w, h,
    px(x, y, r, g, b, a = 255) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      blend((y * w + x) * 4, r, g, b, a);
    },
    aaSet(x, y, r, g, b, alpha) {
      const fx = Math.floor(x), fy = Math.floor(y);
      const dx = x - fx, dy = y - fy;
      this.px(fx, fy, r, g, b, Math.round(alpha * (1 - dx) * (1 - dy) * 255));
      this.px(fx + 1, fy, r, g, b, Math.round(alpha * dx * (1 - dy) * 255));
      this.px(fx, fy + 1, r, g, b, Math.round(alpha * (1 - dx) * dy * 255));
      this.px(fx + 1, fy + 1, r, g, b, Math.round(alpha * dx * dy * 255));
    },
  };
}

function fillRoundRect(bmp, x0, y0, x1, y1, r, col, a = 255) {
  const [cr, cg, cb] = col;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const qx = Math.max(x0 + r - x, 0, x - (x1 - r));
      const qy = Math.max(y0 + r - y, 0, y - (y1 - r));
      const d = Math.sqrt(qx * qx + qy * qy) - r;
      const alpha = Math.max(0, Math.min(1, 0.5 - d)) * (a / 255);
      if (alpha > 0) bmp.px(x, y, cr, cg, cb, Math.round(alpha * 255));
    }
  }
}

function fillCircle(bmp, cx, cy, cr, col, a = 255) {
  const [r, g, b] = col;
  for (let y = Math.floor(cy - cr - 1); y <= Math.ceil(cy + cr + 1); y++) {
    for (let x = Math.floor(cx - cr - 1); x <= Math.ceil(cx + cr + 1); x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - cr;
      const alpha = Math.max(0, Math.min(1, 0.5 - d)) * (a / 255);
      if (alpha > 0) bmp.px(x, y, r, g, b, Math.round(alpha * 255));
    }
  }
}

function strokeCircle(bmp, cx, cy, cr, lw, col, a = 255) {
  const [r, g, b] = col;
  const steps = Math.ceil(2 * Math.PI * (cr + lw) * 6);
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    for (let t = -lw / 2; t <= lw / 2; t += 0.3) {
      const px = cx + Math.cos(angle) * (cr + t);
      const py = cy + Math.sin(angle) * (cr + t);
      const edgeFade = Math.min(1, (lw / 2 - Math.abs(t)) + 0.5);
      bmp.aaSet(px, py, r, g, b, edgeFade * (a / 255));
    }
  }
}

function drawLine(bmp, x0, y0, x1, y1, lw, col, a = 255) {
  const [r, g, b] = col;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const steps = Math.ceil(len * 5);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t, py = y0 + dy * t;
    for (let oy = -Math.ceil(lw); oy <= Math.ceil(lw); oy++) {
      for (let ox = -Math.ceil(lw); ox <= Math.ceil(lw); ox++) {
        const d = Math.sqrt(ox * ox + oy * oy) - lw / 2;
        const alpha = Math.max(0, Math.min(1, 0.5 - d)) * (a / 255);
        if (alpha > 0) bmp.px(Math.round(px + ox), Math.round(py + oy), r, g, b, Math.round(alpha * 255));
      }
    }
  }
}

// ─── Icon design ──────────────────────────────────────────────────────────────
//
//  Background : #1e1b4b  deep indigo (indigo-950)
//  Accent glow: #6366f1  indigo-500
//  Foreground : #ffffff  white
//
//  Visual:  magnifying glass with a horizontal scan line through the lens
//           → "ContentLens scans content for AI patterns"

function renderIcon(size) {
  const bmp = Bitmap(size, size);
  const s = size;

  // 1. Background ─────────────────────────────────────────────────────────────
  fillRoundRect(bmp, 0, 0, s - 1, s - 1, s * 0.20, [30, 27, 75], 255);

  // 2. Subtle inner glow layer (lighter indigo in top-left quadrant)
  fillRoundRect(bmp, s * 0.05, s * 0.05, s * 0.75, s * 0.55, s * 0.15, [99, 102, 241], 22);

  // 3. Lens ring ───────────────────────────────────────────────────────────────
  const cx = s * 0.42;
  const cy = s * 0.42;
  const lensR = s * 0.245;
  const ringW = Math.max(1.5, s * 0.062);

  // Soft glow halo behind ring
  strokeCircle(bmp, cx, cy, lensR + ringW * 0.4, ringW * 2.2, [99, 102, 241], 40);
  // Ring itself
  strokeCircle(bmp, cx, cy, lensR, ringW, [255, 255, 255], 235);

  // 4. Scan line through lens ──────────────────────────────────────────────────
  //    Thin indigo-tinted line at lens center — the "scanning" metaphor
  const scanW = Math.max(0.8, s * 0.028);
  const scanX0 = cx - lensR * 0.72;
  const scanX1 = cx + lensR * 0.72;
  drawLine(bmp, scanX0, cy, scanX1, cy, scanW, [165, 180, 252], 210); // indigo-300

  // 5. Center pupil dot ────────────────────────────────────────────────────────
  const pupilR = Math.max(1.2, s * 0.062);
  fillCircle(bmp, cx, cy, pupilR * 1.3, [99, 102, 241], 80); // glow
  fillCircle(bmp, cx, cy, pupilR, [255, 255, 255], 245);

  // 6. Magnifier handle ────────────────────────────────────────────────────────
  //    Diagonal stroke from bottom-right of lens outward (SE direction)
  const angle = Math.PI * 0.755;  // ~136° — bottom-right
  const hStart = lensR + ringW * 0.5;
  const hEnd = hStart + s * 0.22;
  const hx0 = cx + Math.cos(angle) * hStart;
  const hy0 = cy + Math.sin(angle) * hStart;
  const hx1 = cx + Math.cos(angle) * hEnd;
  const hy1 = cy + Math.sin(angle) * hEnd;
  const handleW = Math.max(1.2, s * 0.065);

  drawLine(bmp, hx0, hy0, hx1, hy1, handleW, [255, 255, 255], 225);
  // Rounded cap at end of handle
  fillCircle(bmp, hx1, hy1, handleW * 0.6, [255, 255, 255], 215);

  return bmp;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

[16, 32, 48, 128].forEach((size) => {
  const bmp = renderIcon(size);
  const png = encodePNG(bmp.data, size, size);
  const outPath = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`  icon${size}.png  →  ${png.length} bytes`);
});

console.log('\nDone. Icons written to public/icons/');
