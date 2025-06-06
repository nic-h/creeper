// File: coindeploy.js

import fetch from 'node-fetch'
import dotenv from 'dotenv'
import PinataSDK from '@pinata/sdk'
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
  'PINATA_API_KEY',
  'PINATA_API_SECRET',
  'IMAGE_URL'
]

const missing = requiredEnvVars.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '))
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

// ─── 2. Initialize Pinata & Viem clients ───────────────────────────────────────
const pinata = new PinataSDK(PINATA_API_KEY, PINATA_API_SECRET)

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

    const imgRes = await fetch(imageUrlWithTimestamp)
    if (!imgRes.ok) {
      throw new Error(`Failed to download image: HTTP ${imgRes.status} ${imgRes.statusText}`)
    }
    const contentType = imgRes.headers.get('content-type')
    console.log(`✓ Image downloaded (Content-Type: ${contentType})`)

    const imgBuffer = await imgRes.buffer()
    const sizeKB = (imgBuffer.length / 1024).toFixed(1)
    console.log(`✓ Image size: ${sizeKB}KB`)

    // 3.2) Pin the PNG to IPFS via Pinata
    console.log('→ Pinning image to IPFS...')
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

    // 3.3) Build metadata JSON pointing at the HTTPS image
    const metadata = {
      name: "CREEPER",
      description: "Creeper is a 4 x CCTV Camera work that updates every five minutes",
      image: `https://cloudflare-ipfs.com/ipfs/${imageCID}`,
      animation_url: `https://cloudflare-ipfs.com/ipfs/${imageCID}`,
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

    // 3.4) Pin metadata JSON to IPFS
    console.log('→ Pinning metadata JSON to IPFS...')
    const pinJsonRes = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: { name: `creeper-metadata-${timestamp}.json` }
    })
    const metadataCID = pinJsonRes.IpfsHash
    console.log('✓ Metadata pinned to IPFS:', metadataCID)

    // ── WAIT 60 SECONDS ── allow public gateways to pick up the new CID
    console.log('⏳ Waiting 60 seconds for IPFS propagation...')
    await new Promise(resolve => setTimeout(resolve, 60000))

    // 3.5) Update coin URI on-chain using ipfs://<CID> now that it’s propagated
    const newURI = `ipfs://${metadataCID}`
    console.log('→ Updating coin URI on-chain to:', newURI)

    const result = await updateCoinURI(
      { coin: COIN_ADDRESS, newURI },
      walletClient,
      publicClient
    )
    console.log('✓ Transaction submitted:', result.hash)
    console.log('✅ Creeper coin metadata updated successfully!')

    // 3.6) Log a summary
    console.log('\n📊 Update Summary:')
    console.log(`- PNG (IPFS):      ipfs://${imageCID}`)
    console.log(`- Metadata (IPFS): ipfs://${metadataCID}`)
    console.log(`- Tx Hash:         ${result.hash}`)
    console.log(`- Timestamp:       ${new Date().toISOString()}`)

  } catch (err) {
    console.error('\n❌ Error in coindeploy.js:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

main()
