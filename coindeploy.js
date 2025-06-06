// File: coindeploy.js

import fetch from 'node-fetch'
import dotenv from 'dotenv'
import { updateCoinURI } from '@zoralabs/coins-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

dotenv.config()

// ─── 1. Validate required environment variables ────────────────────────────────
const requiredEnvVars = [
  'RPC_URL',
  'PRIVATE_KEY',
  'COIN_ADDRESS',
  'LIGHTHOUSE_API_KEY',
  'IMAGE_URL'
]

const missing = requiredEnvVars.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '))
  console.error('Required vars:', requiredEnvVars.join(', '))
  process.exit(1)
}

const {
  RPC_URL,
  PRIVATE_KEY,
  COIN_ADDRESS,
  LIGHTHOUSE_API_KEY,
  IMAGE_URL
} = process.env

// ─── 2. Initialize Viem clients ──────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL)
})

const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account: privateKeyToAccount(PRIVATE_KEY)
})

// ─── 3. Lighthouse IPFS functions ─────────────────────────────────────────────────
async function uploadToLighthouse(buffer, filename) {
  const formData = new FormData()
  const blob = new Blob([buffer], { type: 'image/jpeg' })
  formData.append('file', blob, filename)

  const response = await fetch('https://node.lighthouse.storage/api/v0/add', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LIGHTHOUSE_API_KEY}`,
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Lighthouse upload failed: ${response.status} ${error}`)
  }

  const result = await response.json()
  return result.Hash
}

async function uploadJSONToLighthouse(json, filename) {
  const formData = new FormData()
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  formData.append('file', blob, filename)

  const response = await fetch('https://node.lighthouse.storage/api/v0/add', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LIGHTHOUSE_API_KEY}`,
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Lighthouse JSON upload failed: ${response.status} ${error}`)
  }

  const result = await response.json()
  return result.Hash
}

// ─── 4. Main update function ───────────────────────────────────────────────────
async function main() {
  try {
    console.log('🚀 Starting Creeper coin update...')
    console.log(`📸 Image URL: ${IMAGE_URL}`)
    console.log(`🪙 Coin address: ${COIN_ADDRESS}`)

    // 4.1) Download the latest grid PNG (cache-busted)
    const imageUrlWithTimestamp = `${IMAGE_URL}?t=${Date.now()}`
    console.log('→ Downloading image from:', imageUrlWithTimestamp)

    const imgRes = await fetch(imageUrlWithTimestamp, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Creeper-Updater/1.0'
      }
    })
    
    if (!imgRes.ok) {
      throw new Error(`Failed to download image: HTTP ${imgRes.status} ${imgRes.statusText}`)
    }
    
    const contentType = imgRes.headers.get('content-type')
    console.log(`✓ Image downloaded (Content-Type: ${contentType})`)

    const imgBuffer = await imgRes.arrayBuffer()
    const sizeKB = (imgBuffer.byteLength / 1024).toFixed(1)
    console.log(`✓ Image size: ${sizeKB}KB`)

    // Validate we actually got an image
    if (imgBuffer.byteLength < 1000) {
      throw new Error(`Image too small (${imgBuffer.byteLength} bytes), likely an error response`)
    }

    // 4.2) Upload the PNG to IPFS via Lighthouse
    console.log('→ Uploading image to IPFS (Lighthouse)...')
    const imageCID = await uploadToLighthouse(new Uint8Array(imgBuffer), `creeper-${Date.now()}.jpg`)
    console.log('✓ Image uploaded to IPFS:', imageCID)

    // 4.3) Build metadata JSON pointing at the PNG on IPFS
    const timestamp = new Date().toISOString()
    const metadata = {
      name: "CREEPER",
      description: "Creeper is a 4 x CCTV Camera work that updates every five minutes",
      image: `ipfs://${imageCID}`,
      animation_url: `ipfs://${imageCID}`,
      external_url: "https://github.com/nic-h/creeper",
      properties: {
        updateInterval: "5m",
        layout: "2x2",
        lastUpdated: timestamp,
        imageCID: imageCID
      },
      attributes: [
        { trait_type: "Update Frequency", value: "5 minutes" },
        { trait_type: "Grid Size", value: "2x2" },
        { trait_type: "Format", value: "JPEG" },
        { trait_type: "Last Updated", value: timestamp }
      ]
    }

    // 4.4) Upload metadata JSON to IPFS via Lighthouse
    console.log('→ Uploading metadata JSON to IPFS (Lighthouse)...')
    const metadataCID = await uploadJSONToLighthouse(metadata, `creeper-metadata-${Date.now()}.json`)
    console.log('✓ Metadata uploaded to IPFS:', metadataCID)

    // 4.5) Lighthouse is fast, wait 3 seconds for propagation
    console.log('⏳ Waiting 3 seconds for IPFS propagation...')
    await new Promise(resolve => setTimeout(resolve, 3000))

    // 4.6) Update coin URI on‐chain with "ipfs://<metadataCID>"
    const newURI = `ipfs://${metadataCID}`
    console.log('→ Updating coin URI on-chain to:', newURI)

    const result = await updateCoinURI(
      { coin: COIN_ADDRESS, newURI },
      walletClient,
      publicClient
    )
    
    console.log('✓ Transaction submitted:', result.hash)
    console.log('✅ Creeper coin metadata updated successfully!')

    // 4.7) Log a summary
    console.log('\n📊 Update Summary:')
    console.log(`- PNG (IPFS):      ipfs://${imageCID}`)
    console.log(`- Metadata (IPFS): ipfs://${metadataCID}`)
    console.log(`- Tx Hash:         ${result.hash}`)
    console.log(`- Timestamp:       ${timestamp}`)
    console.log(`- Image Size:      ${sizeKB}KB`)

    // Verify the metadata is accessible
    console.log('\n🔍 Verification URLs:')
    console.log(`- Lighthouse:      https://gateway.lighthouse.storage/ipfs/${metadataCID}`)
    console.log(`- Public Gateway:  https://ipfs.io/ipfs/${metadataCID}`)

  } catch (err) {
    console.error('\n❌ Error in coindeploy.js:', err.message)
    console.error('Stack trace:', err.stack)
    
    // More specific error handling
    if (err.message.includes('fetch')) {
      console.error('💡 Image download failed - check IMAGE_URL and network connectivity')
    } else if (err.message.includes('Lighthouse')) {
      console.error('💡 Lighthouse upload failed - check LIGHTHOUSE_API_KEY')
    } else if (err.message.includes('viem') || err.message.includes('updateCoinURI')) {
      console.error('💡 Blockchain transaction failed - check RPC_URL, PRIVATE_KEY, and COIN_ADDRESS')
    }
    
    process.exit(1)
  }
}

// Add graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

main()