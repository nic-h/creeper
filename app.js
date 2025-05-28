// File: app.js
import express from 'express'
import fetch    from 'node-fetch'
import { createCanvas, loadImage } from 'canvas'
import fs       from 'fs'
import path     from 'path'
import dotenv   from 'dotenv'

dotenv.config()
const app = express()

// ─── Config ────────────────────────────────────────────────────────────────────
const CAMERAS   = JSON.parse(process.env.CAMERAS)
const PORT      = Number(process.env.PORT) || 3000
const SIZE      = 2048
const GRID      = SIZE / 2      // each cell = 1024×1024
const BORDER    = 8             // padding inside each cell
const INTERVAL  = 1000 * 60 * 5 // 5 minutes for snapshots

// ─── Helper: draw one snapshot ─────────────────────────────────────────────────
async function snapshotGrid() {
  // 1) Create canvas
  const canvas = createCanvas(SIZE, SIZE)
  const ctx    = canvas.getContext('2d')

  // 2) Clear to black
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SIZE, SIZE)

  // 3) Fetch & draw each camera, with per-camera try/catch
  for (let i = 0; i < 4; i++) {
    const cam = CAMERAS[i]
    if (!cam) continue

    const dx    = (i % 2) * GRID + BORDER
    const dy    = Math.floor(i / 2) * GRID + BORDER
    const inner = GRID - 2 * BORDER

    try {
      const ts    = Date.now()
      const url   = cam.url.replace('COUNTER', ts)
      console.log(`→ [cam ${i}] fetch ${url}`)
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.buffer()
      const img = await loadImage(buf)
      console.log(`✓ [cam ${i}] loaded (${img.width}×${img.height})`)
      const side = Math.min(img.width, img.height)
      const sx   = (img.width  - side) / 2
      const sy   = (img.height - side) / 2
      ctx.drawImage(img, sx, sy, side, side, dx, dy, inner, inner)
      console.log(`✓ [cam ${i}] drawn at (${dx},${dy}) size ${inner}`)
    } catch (err) {
      console.error(`❌ [cam ${i}] error:`, err.message)
      // fallback: draw gray box so it isn't pure black
      ctx.fillStyle = '#444'
      ctx.fillRect(dx, dy, inner, inner)
    }
  }

  // 4) Grayscale conversion
  const data = ctx.getImageData(0, 0, SIZE, SIZE)
  const pix  = data.data
  for (let i = 0; i < pix.length; i += 4) {
    const avg = (pix[i] + pix[i+1] + pix[i+2]) / 3
    pix[i]   = avg
    pix[i+1] = avg
    pix[i+2] = avg
  }
  ctx.putImageData(data, 0, 0)
  console.log('✓ applied grayscale')

  // 5) Light green tint overlay
  ctx.save()
  ctx.globalAlpha = 0.1
  ctx.fillStyle   = '#00FF00'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.restore()
  console.log('✓ applied green tint')

  // 6) Location labels
  ctx.fillStyle    = '#00FF00'
  ctx.font         = '24px monospace'
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'bottom'
  CAMERAS.forEach(({ location }, i) => {
    const x = (i % 2) * GRID + BORDER + 8
    const y = Math.floor(i / 2) * GRID + GRID - BORDER - 8
    ctx.fillText(location, x, y)
  })
  console.log('✓ drew locations')

  // 7) CREEPER overlay
  const svgImg = await loadImage(path.resolve('overlay.svg'))
  ctx.drawImage(svgImg, 0, 0, SIZE, SIZE)
  console.log('✓ drew CREEPER overlay')

  // 8) Save PNG
  fs.mkdirSync('snapshots', { recursive: true })
  fs.writeFileSync(
    path.join('snapshots', 'latest.png'),
    canvas.toBuffer('image/png')
  )
  console.log('✅ latest.png written')
}

// run once + schedule
snapshotGrid()
setInterval(snapshotGrid, INTERVAL)

// Serve the latest snapshot
app.get('/latest.png', (req, res) => {
  const file = path.resolve('snapshots', 'latest.png')
  res.sendFile(file)
})

// Serve metadata.json
app.get('/metadata.json', (req, res) => {
  const file = path.resolve('metadata.json')
  res.sendFile(file)
})

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`)
})