// creeper/generateGridSVG.js
// 2×2 grid → grayscale → overlay “CREEPER” via SVG → snapshots/latest.png

import fetch from 'node-fetch';
import { createCanvas, loadImage } from 'canvas';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// ES-module __dirname hack
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function run() {
  const CAMERAS = JSON.parse(process.env.CAMERAS || '[]');
  const SIZE    = 2048;
  const GRID    = SIZE / 2;
  const BORDER  = 20;
  const ts      = Date.now();

  // 1) Canvas & gutters
  const canvas = createCanvas(SIZE, SIZE);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 2) Fetch & draw feeds (or gray box)
  for (let i = 0; i < 4; i++) {
    const cam   = CAMERAS[i] || {};
    const dx    = (i % 2) * GRID + BORDER;
    const dy    = Math.floor(i / 2) * GRID + BORDER;
    const inner = GRID - 2 * BORDER;

    if (!cam.url) {
      ctx.fillStyle = '#444';
      ctx.fillRect(dx, dy, inner, inner);
      continue;
    }
    const url = cam.url.replace('COUNTER', ts);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await res.buffer();
      const img = await loadImage(buf);
      // center-crop
      const side = Math.min(img.width, img.height);
      const sx   = (img.width - side) / 2;
      const sy   = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, dx, dy, inner, inner);
    } catch {
      ctx.fillStyle = '#444';
      ctx.fillRect(dx, dy, inner, inner);
    }
  }

  // 3) Grayscale
  const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = imageData.data;
  for (let p = 0; p < d.length; p += 4) {
    const lum = 0.299*d[p] + 0.587*d[p+1] + 0.114*d[p+2];
    d[p] = d[p+1] = d[p+2] = lum;
  }
  ctx.putImageData(imageData, 0, 0);

  // 4) Write SVG for CREEPER only
  const svg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .creeper { fill: #0F0; font-family: monospace; font-size:128px; font-weight:bold; }
  </style>
  <text class="creeper"
        x="${SIZE/3}" y="${SIZE/3}"
        text-anchor="middle"
        dominant-baseline="middle">
    CREEPER
  </text>
</svg>`.trim();
  const svgPath = path.join(__dirname, 'overlay.svg');
  fs.writeFileSync(svgPath, svg);

  // 5) Load & draw the SVG
  const overlay = await loadImage(svgPath);
  ctx.drawImage(overlay, 0, 0);

  // 6) Save PNG
  const outDir  = path.join(__dirname, 'snapshots');
  const outPath = path.join(outDir, 'latest.png');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log('✅ snapshots/latest.png updated with grayscale grid + CREEPER');
}

run();
