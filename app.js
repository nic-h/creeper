// File: app.js
import express from 'express'
import fetch from 'node-fetch'
import { createCanvas, loadImage } from 'canvas'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()
const app = express()

// ─── Config ────────────────────────────────────────────────────────────────────
const CAMERAS = JSON.parse(process.env.CAMERAS)
const PORT = Number(process.env.PORT) || 3000
const SIZE = 2048
const GRID = SIZE / 2      // 2×2 → each cell is 1024×1024
const INTERVAL = 5 * 60 * 1000 // 5 minutes
const OUTPUT = 'snapshots'
const OUTPUT_IMG = 'creeper.jpg'

// Ensure snapshots folder exists
if (!fs.existsSync(OUTPUT)) {
  fs.mkdirSync(OUTPUT, { recursive: true })
}

// Utility: draw text with background for camera labels
function drawLabel(ctx, text, x, y) {
  ctx.save()
  ctx.font = '48px sans-serif'
  ctx.textBaseline = 'top'
  const metrics = ctx.measureText(text)
  const labelWidth = metrics.width + 20
  const labelHeight = 60
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(x - 10, y - 10, labelWidth, labelHeight)
  ctx.fillStyle = 'white'
  ctx.fillText(text, x, y)
  ctx.restore()
}

// Generate the 2×2 grid image
async function generateGrid() {
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')

  // Fill background black
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SIZE, SIZE)

  for (let i = 0; i < CAMERAS.length; i++) {
    const cam = CAMERAS[i]
    const row = Math.floor(i / 2)
    const col = i % 2
    const x = col * GRID
    const y = row * GRID

    try {
      const url = cam.url.replace('COUNTER', Date.now())
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const buffer = await resp.buffer()
      const img = await loadImage(buffer)
      ctx.drawImage(img, x, y, GRID, GRID)
      drawLabel(ctx, cam.location, x + 10, y + 10)
    } catch (err) {
      console.error(`❌ [cam ${i}] Error:`, err.message)
    }
  }

  // Write JPEG to disk
  const outPath = path.join(OUTPUT, OUTPUT_IMG)
  const outStream = fs.createWriteStream(outPath)
  const jpegStream = canvas.createJPEGStream({ quality: 0.8 })
  jpegStream.pipe(outStream)

  return new Promise((resolve, reject) => {
    outStream.on('finish', () => resolve(outPath))
    outStream.on('error', reject)
  })
}

// Immediately generate once, then every INTERVAL
;(async () => {
  try {
    console.log('📸 Starting snapshot generation...')
    const imgPath = await generateGrid()
    console.log(`✅ ${OUTPUT_IMG} written (${imgPath})`)

    setInterval(async () => {
      console.log('🔄 Generating new snapshot...')
      const newPath = await generateGrid()
      console.log(`✅ ${OUTPUT_IMG} written (${newPath})`)
    }, INTERVAL)
  } catch (err) {
    console.error('❌ Error generating initial snapshot:', err)
  }
})()

// Serve the latest image at /latest.png
app.get('/latest.png', (req, res) => {
  res.sendFile(path.resolve(OUTPUT, OUTPUT_IMG))
})

// (Optional) Serve a static metadata JSON at /metadata.json
app.get('/metadata.json', (req, res) => {
  const json = fs.readFileSync(path.resolve('metadata.json'), 'utf8')
  res.setHeader('Content-Type', 'application/json')
  res.end(json)
})

// Start HTTP server
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`)
  console.log(`📷 Cameras configured: ${CAMERAS.length}`)
  console.log(`🔄 Snapshot interval: ${INTERVAL / 1000 / 60} minutes`)
})