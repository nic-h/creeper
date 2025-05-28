// creeper/app.js
import express from 'express'
import fetch    from 'node-fetch'
import { createCanvas, loadImage } from 'canvas'
import fs       from 'fs'
import path     from 'path'
import dotenv   from 'dotenv'
dotenv.config()

// ─── Config ────────────────────────────────────────────────────────────────────
const CAMERAS   = JSON.parse(process.env.CAMERAS)
const PORT      = Number(process.env.PORT) || 3000
const SIZE      = 2048
const GRID      = SIZE / 2      // each cell = 1024×1024
const BORDER    = 20            // black gutter
const INTERVAL  = 5 * 60 * 1000 // 5 min

// ─── Core snapshot function ────────────────────────────────────────────────────
async function snapshotGrid() {
  console.log('🔄 snapshot start @', new Date().toISOString())

  // 1) Set up canvas
  const canvas = createCanvas(SIZE, SIZE)
  const ctx    = canvas.getContext('2d')

  // 2) Black gutters
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SIZE, SIZE)

  // 3) Fetch & draw each camera, with per-camera try/catch
  for (let i = 0; i < 4; i++) {
    const cam = CAMERAS[i]
    if (!cam) continue

    try {
      const ts    = Date.now()
      const url   = cam.url.replace('COUNTER', ts)
      console.log(`→ [cam ${i}] fetch ${url}`)
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.buffer()
      const img = await loadImage(buf)
      console.log(`✓ [cam ${i}] loaded (${img.width}×${img.height})`)

      // center-crop square
      const side = Math.min(img.width, img.height)
      const sx   = (img.width  - side) / 2
      const sy   = (img.height - side) / 2

      // dest coords & size
      const dx    = (i % 2) * GRID + BORDER
      const dy    = Math.floor(i / 2) * GRID + BORDER
      const inner = GRID - 2 * BORDER

      ctx.drawImage(img, sx, sy, side, side, dx, dy, inner, inner)
      console.log(`✓ [cam ${i}] drawn at (${dx},${dy}) size ${inner}`)
    } catch (err) {
      console.error(`❌ [cam ${i}] error:`, err.message)
      // continue to next camera
    }
  }

  // 4) Grayscale conversion
  const data = ctx.getImageData(0, 0, SIZE, SIZE)
  for (let p = 0; p < data.data.length; p += 4) {
    const r   = data.data[p]
    const g   = data.data[p+1]
    const b   = data.data[p+2]
    const lum = 0.299*r + 0.587*g + 0.114*b
    data.data[p] = data.data[p+1] = data.data[p+2] = lum
  }
  ctx.putImageData(data, 0, 0)
  console.log('✓ converted to grayscale')

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
    const x = (i % 2) * GRID + BORDER + 10
    const y = Math.floor(i / 2) * GRID + GRID - BORDER - 10
    ctx.fillText(location, x, y)
  })
  console.log('✓ drew location labels')

  // 7) Centered “CREEPER”
  ctx.fillStyle    = '#00FF00'
  ctx.font         = '96px monospace'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CREEPER', SIZE/2, SIZE/2)
  console.log('✓ drew CREEPER')

  // 8) Save PNG
  fs.mkdirSync('snapshots', { recursive: true })
  fs.writeFileSync(
    path.join('snapshots', 'latest.png'),
    canvas.toBuffer('image/png')
  )
  console.log('✅ latest.png written')
}

// run once
snapshotGrid()
