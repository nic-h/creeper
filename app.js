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
const CAMERAS   = JSON.parse(process.env.CAMERAS)
const PORT      = Number(process.env.PORT) || 3000
const SIZE      = 2048
const GRID      = SIZE / 2      // each cell = 1024×1024
const BORDER    = 8             // padding inside each cell
const INTERVAL  = 1000 * 60 * 5 // 5 minutes for snapshots

// ─── Helper: Fetch with timeout ────────────────────────────────────────────────
async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// ─── Helper: Validate image buffer ─────────────────────────────────────────────
async function validateAndLoadImage(buffer, cameraIndex) {
  try {
    // Check if buffer has content
    if (!buffer || buffer.length < 100) {
      throw new Error('Buffer too small to be valid image');
    }
    
    // Check for common image headers
    const header = buffer.slice(0, 4).toString('hex');
    const isJPEG = header.startsWith('ffd8ff');
    const isPNG = header === '89504e47';
    const isGIF = header.startsWith('474946');
    
    if (!isJPEG && !isPNG && !isGIF) {
      console.log(`❌ [cam ${cameraIndex}] Invalid image header: ${header}`);
      throw new Error('Invalid image format');
    }
    
    // Try to load the image
    const img = await loadImage(buffer);
    
    // Validate dimensions
    if (img.width < 10 || img.height < 10) {
      throw new Error(`Image too small: ${img.width}x${img.height}`);
    }
    
    return img;
  } catch (error) {
    console.error(`❌ [cam ${cameraIndex}] Image validation failed:`, error.message);
    throw error;
  }
}

// ─── Helper: draw one snapshot ─────────────────────────────────────────────────
async function snapshotGrid() {
  console.log('\n📸 Starting snapshot generation...');
  
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

    let retries = 2;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        const ts    = Date.now()
        const url   = cam.url.replace('COUNTER', ts)
        console.log(`→ [cam ${i}] Fetching ${cam.location} (attempt ${3 - retries})`)
        
        const res = await fetchWithTimeout(url)
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`)
        }
        
        const contentType = res.headers.get('content-type')
        console.log(`  [cam ${i}] Content-Type: ${contentType}`)
        
        const buf = await res.buffer()
        console.log(`  [cam ${i}] Buffer size: ${(buf.length / 1024).toFixed(1)}KB`)
        
        // Validate and load image
        const img = await validateAndLoadImage(buf, i)
        
        console.log(`✓ [cam ${i}] Loaded successfully (${img.width}×${img.height})`)
        
        // Center crop and draw
        const side = Math.min(img.width, img.height)
        const sx   = (img.width  - side) / 2
        const sy   = (img.height - side) / 2
        ctx.drawImage(img, sx, sy, side, side, dx, dy, inner, inner)
        console.log(`✓ [cam ${i}] Drawn at (${dx},${dy}) size ${inner}`)
        
        success = true;
      } catch (err) {
        console.error(`❌ [cam ${i}] Error:`, err.message)
        retries--;
        
        if (retries > 0) {
          console.log(`  [cam ${i}] Retrying in 2 seconds...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        } else {
          // Final fallback: draw error box with text
          ctx.fillStyle = '#222'
          ctx.fillRect(dx, dy, inner, inner)
          
          // Add error text
          ctx.fillStyle = '#666'
          ctx.font = '24px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('OFFLINE', dx + inner/2, dy + inner/2)
          ctx.fillText(err.message.substring(0, 20), dx + inner/2, dy + inner/2 + 30)
        }
      }
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
  console.log('✓ Applied grayscale filter')

  // 5) Light green tint overlay
  ctx.save()
  ctx.globalAlpha = 0.1
  ctx.fillStyle   = '#00FF00'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.restore()
  console.log('✓ Applied green tint')

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
  console.log('✓ Drew location labels')

  // 7) CREEPER overlay
  try {
    const svgImg = await loadImage(path.resolve('overlay.svg'))
    ctx.drawImage(svgImg, 0, 0, SIZE, SIZE)
    console.log('✓ Drew CREEPER overlay')
  } catch (err) {
    console.error('❌ Failed to draw overlay:', err.message)
  }

  // 8) Save as JPEG with timestamp
  fs.mkdirSync('snapshots', { recursive: true })
  
  // Save as JPEG with good quality
  const jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.85 })
  fs.writeFileSync(path.join('snapshots', 'creeper.jpg'), jpegBuffer)
  
  const sizeKB = (jpegBuffer.length / 1024).toFixed(1)
  console.log(`✅ creeper.jpg written (${sizeKB}KB)`)
  
  // Also save a debug PNG if needed
  if (process.env.DEBUG === 'true') {
    fs.writeFileSync(path.join('snapshots', 'debug.png'), canvas.toBuffer('image/png'))
    console.log('📝 Debug PNG also saved')
  }
}

// run once + schedule
snapshotGrid()
setInterval(snapshotGrid, INTERVAL)

// Serve the latest snapshot (keep the endpoint name for compatibility)
app.get('/latest.png', (req, res) => {
  const file = path.resolve('snapshots', 'creeper.jpg')
  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.sendFile(file)
})

// Health check endpoint
app.get('/health', async (req, res) => {
  const statuses = []
  
  for (let i = 0; i < CAMERAS.length; i++) {
    const cam = CAMERAS[i]
    const startTime = Date.now()
    
    try {
      const url = cam.url.replace('COUNTER', Date.now())
      const response = await fetchWithTimeout(url, 5000)
      
      statuses.push({
        camera: i,
        location: cam.location,
        status: response.ok ? 'online' : 'error',
        statusCode: response.status,
        responseTime: Date.now() - startTime,
        contentType: response.headers.get('content-type')
      })
    } catch (error) {
      statuses.push({
        camera: i,
        location: cam.location,
        status: 'offline',
        error: error.message,
        responseTime: Date.now() - startTime
      })
    }
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    cameras: statuses
  })
})

// Serve metadata.json with strict JSON header
app.get('/metadata.json', (req, res) => {
  const json = fs.readFileSync(path.resolve('metadata.json'), 'utf8')
  res.setHeader('Content-Type', 'application/json')
  res.end(json)
})

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`)
  console.log(`📷 Cameras configured: ${CAMERAS.length}`)
  console.log(`🔄 Snapshot interval: ${INTERVAL / 1000 / 60} minutes`)
})