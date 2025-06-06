// File: coindeploy.js

import fetch from 'node-fetch'
import dotenv from 'dotenv'
import { create as createIpfsClient } from 'ipfs-http-client'
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
  'INFURA_IPFS_PROJECT_ID',
  'INFURA_IPFS_PROJECT_SECRET',
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
  INFURA_IPFS_PROJECT_ID,
  INFURA_IPFS_PROJECT_SECRET,
  IMAGE_URL
} = process.env

// ─── 2. Initialize Infura IPFS client & Viem clients ──────────────────────────
// Build Basic auth header for Infura
const auth =
  'Basic ' +
  Buffer.from(`${INFURA_IPFS_PROJECT_ID}:${INFURA_IPFS_PROJECT_SECRET}`).toString('base64')

const ipfs = createIpfsClient({
  host: 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  headers: {
    authorization: auth
  },
  timeout: 60000 // 60 second timeout
})

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL)
})

const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account: privateKeyToAccount(PRIVATE_KEY)
})

// ─── 3. Main update function ───────────────────────────────────────────────────
async function main() {
  try {
    console.log('🚀 Starting Creeper coin update...')
    console.log(`📸 Image URL: ${IMAGE_URL}`)
    console.log(`🪙 Coin address: ${COIN_ADDRESS}`)

    // 3.1) Download the latest grid PNG (cache-busted)
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

    const imgBuffer = await imgRes.buffer()
    const sizeKB = (imgBuffer.length / 1024).toFixed(1)
    console.log(`✓ Image size: ${sizeKB}KB`)

    // Validate we actually got an image
    if (imgBuffer.length < 1000) {
      throw new Error(`Image too small (${imgBuffer.length} bytes), likely an error response`)
    }

    // 3.2) Pin the PNG to IPFS via Infura
    console.log('→ Pinning image to IPFS (Infura)...')
    const imageAddResult = await ipfs.add(imgBuffer, { 
      pin: true,
      timeout: 30000
    })
    const imageCID = imageAddResult.cid.toString()
    console.log('✓ Image pinned to IPFS:', imageCID)

    // 3.3) Build metadata JSON pointing at the PNG on IPFS
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

    // 3.4) Pin metadata JSON to IPFS via Infura
    console.log('→ Pinning metadata JSON to IPFS (Infura)...')
    const metadataAddResult = await ipfs.add(JSON.stringify(metadata, null, 2), { 
      pin: true,
      timeout: 30000
    })
    const metadataCID = metadataAddResult.cid.toString()
    console.log('✓ Metadata pinned to IPFS:', metadataCID)

    // 3.5) Wait ~5 seconds to propagate the JSON CID to public IPFS gateways
    console.log('⏳ Waiting 5 seconds for IPFS propagation...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 3.6) Update coin URI on‐chain with "ipfs://<metadataCID>"
    const newURI = `ipfs://${metadataCID}`
    console.log('→ Updating coin URI on-chain to:', newURI)

    const result = await updateCoinURI(
      { coin: COIN_ADDRESS, newURI },
      walletClient,
      publicClient
    )
    
    console.log('✓ Transaction submitted:', result.hash)
    console.log('✅ Creeper coin metadata updated successfully!')

    // 3.7) Log a summary
    console.log('\n📊 Update Summary:')
    console.log(`- PNG (IPFS):      ipfs://${imageCID}`)
    console.log(`- Metadata (IPFS): ipfs://${metadataCID}`)
    console.log(`- Tx Hash:         ${result.hash}`)
    console.log(`- Timestamp:       ${timestamp}`)
    console.log(`- Image Size:      ${sizeKB}KB`)

    // Verify the metadata is accessible
    console.log('\n🔍 Verification URLs:')
    console.log(`- Infura Gateway:  https://ipfs.infura.io/ipfs/${metadataCID}`)
    console.log(`- Public Gateway:  https://ipfs.io/ipfs/${metadataCID}`)

  } catch (err) {
    console.error('\n❌ Error in coindeploy.js:', err.message)
    console.error('Stack trace:', err.stack)
    
    // More specific error handling
    if (err.message.includes('fetch')) {
      console.error('💡 Image download failed - check IMAGE_URL and network connectivity')
    } else if (err.message.includes('IPFS') || err.message.includes('Infura')) {
      console.error('💡 IPFS upload failed - check Infura credentials and network')
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