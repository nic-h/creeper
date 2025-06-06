// File: coindeploy.js
import fetch from 'node-fetch'
import fs from 'fs'
import dotenv from 'dotenv'
import pinataSDK from '@pinata/sdk'
import { updateCoinURI } from '@zoralabs/coins-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'


// ─── Load & validate environment ─────────────────────────────────────────────────
dotenv.config()

const requiredEnvVars = [
  'RPC_URL',
  'PRIVATE_KEY',
  'COIN_ADDRESS',
  'PINATA_API_KEY',
  'PINATA_API_SECRET',
  'IMAGE_URL'
]

const missingVars = requiredEnvVars.filter((k) => !process.env[k])
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '))
  console.error('Please set these in Render Environment Variables')
  process.exit(1)
}

const {
  RPC_URL,
  PRIVATE_KEY,
  COIN_ADDRESS,
  PINATA_API_KEY,
  PINATA_API_SECRET,
  IMAGE_URL
} = process.env

// ─── Initialize Pinata & Viem clients ─────────────────────────────────────────────
const pinata = new pinataSDK(PINATA_API_KEY, PINATA_API_SECRET)

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL)
})

const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account: privateKeyToAccount(PRIVATE_KEY)
})


// ─── Main update loop ──────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log('🚀 Starting Creeper coin update...')
    console.log(`📸 Image URL: ${IMAGE_URL}`)
    console.log(`🪙 Coin address: ${COIN_ADDRESS}`)

    // 1) Download fresh image (add cache-buster)
    const imageUrlWithTimestamp = `${IMAGE_URL}?t=${Date.now()}`
    console.log('→ Downloading image from:', imageUrlWithTimestamp)

    const imgRes = await fetch(imageUrlWithTimestamp)
    if (!imgRes.ok) {
      throw new Error(`Failed to download image: HTTP ${imgRes.status} ${imgRes.statusText}`)
    }

    const contentType = imgRes.headers.get('content-type')
    console.log(`✓ Image downloaded (Content-Type: ${contentType})`)

    const imgBuffer = await imgRes.buffer()
    const sizeKB = (imgBuffer.length / 1024).toFixed(1)
    console.log(`✓ Image size: ${sizeKB}KB`)

    // 2) Pin the image to IPFS
    console.log('→ Pinning image to IPFS...')
    // Create a readable stream from buffer
    const { Readable } = await import('stream')
    const imgStream = new Readable()
    imgStream.push(imgBuffer)
    imgStream.push(null)

    const timestamp = Date.now()
    const pinFileRes = await pinata.pinFileToIPFS(imgStream, {
      pinataMetadata: { name: `creeper-${timestamp}.jpg` }
    })
    const imageCID = pinFileRes.IpfsHash
    console.log('✓ Image pinned to IPFS:', imageCID)

    // 3) Build metadata JSON that points to the PNG’s CID (never to itself)
    const metadata = {
      name: "CREEPER",
      description: "Creeper is a 4 x CCTV Camera work that updates every five minutes",
      image: `ipfs://${imageCID}`,
      animation_url: `ipfs://${imageCID}`,
      external_url: "https://github.com/nic-h/creeper",
      properties: {
        updateInterval: "5m",
        layout: "2x2",
        lastUpdated: new Date().toISOString()
      },
      attributes: [
        { trait_type: "Update Frequency", value: "5 minutes" },
        { trait_type: "Grid Size",      value: "2x2"      },
        { trait_type: "Format",         value: "JPEG"     }
      ]
    }

    // 4) Pin that metadata JSON to IPFS
    console.log('→ Pinning metadata JSON to IPFS...')
    const pinJsonRes = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: { name: `creeper-metadata-${timestamp}.json` }
    })
    const metadataCID = pinJsonRes.IpfsHash
    console.log('✓ Metadata pinned to IPFS:', metadataCID)

    // 5) Push the new metadata URI on‐chain
    const newURI = `ipfs://${metadataCID}`
    console.log('→ Updating coin URI on-chain to:', newURI)

    const result = await updateCoinURI(
      { coin: COIN_ADDRESS, newURI },
      walletClient,
      publicClient
    )

    console.log('✓ Transaction submitted:', result.hash)
    console.log('✅ Creeper coin metadata updated successfully!')

    // 6) Log a summary
    console.log('\n📊 Update Summary:')
    console.log(`- Image:    ipfs://${imageCID}`)
    console.log(`- Metadata: ipfs://${metadataCID}`)
    console.log(`- Tx:       ${result.hash}`)
    console.log(`- At:       ${new Date().toISOString()}`)

  } catch (err) {
    console.error('\n❌ Error in coindeploy.js:', err.message)
    console.error('Stack trace:', err.stack)
    process.exit(1)
  }
}

// Run it
main()
