// File: coindeploy.js
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import pinataSDK from '@pinata/sdk'
import { updateCoinURI } from '@zoralabs/coins-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

dotenv.config()

// Load & validate environment variables
const {
  RPC_URL,
  PRIVATE_KEY,
  COIN_ADDRESS,
  PINATA_API_KEY,
  PINATA_API_SECRET,
  IMAGE_URL // e.g. https://creeper-7pr1.onrender.com/latest.png
} = process.env

if (!RPC_URL || !PRIVATE_KEY || !COIN_ADDRESS || !PINATA_API_KEY || !PINATA_API_SECRET || !IMAGE_URL) {
  console.error('Error: Missing one of RPC_URL, PRIVATE_KEY, COIN_ADDRESS, PINATA_API_KEY, PINATA_API_SECRET, or IMAGE_URL')
  process.exit(1)
}

// Initialize Pinata and Viem clients
const pinata = new pinataSDK(PINATA_API_KEY, PINATA_API_SECRET)
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) })
const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account: privateKeyToAccount(PRIVATE_KEY)
})

async function main() {
  try {
    // 1) Download the latest snapshot image
    console.log('→ Downloading image from:', IMAGE_URL)
    const imgRes = await fetch(IMAGE_URL)
    if (!imgRes.ok) throw new Error(`Failed to download image: HTTP ${imgRes.status}`)
    const imgStream = imgRes.body

    // 2) Pin the image
    console.log('→ Pinning image...')
    const pinFileRes = await pinata.pinFileToIPFS(
      imgStream,
      { pinataMetadata: { name: path.basename(IMAGE_URL) } }
    )
    const imageCID = pinFileRes.IpfsHash ?? pinFileRes.cid
    console.log('✓ Image pinned at', imageCID)

    // 3) Load and update metadata.json
    const metadataPath = path.resolve('metadata.json')
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    metadata.image = `ipfs://${imageCID}`

    // 4) Pin the updated JSON metadata
    console.log('→ Pinning updated metadata JSON...')
    const pinJsonRes = await pinata.pinJSONToIPFS(
      metadata,
      { pinataMetadata: { name: 'metadata.json' } }
    )
    const metadataCID = pinJsonRes.IpfsHash ?? pinJsonRes.cid
    console.log('✓ Metadata JSON pinned at', metadataCID)

    // 5) Update the coin's metadata URI on-chain
    const newURI = `ipfs://${metadataCID}`
    console.log('→ Updating coin URI to', newURI)
    const result = await updateCoinURI(
      { coin: COIN_ADDRESS, newURI },
      walletClient,
      publicClient
    )
    console.log('✓ Transaction hash:', result.hash)
    console.log('✅ Metadata updated')
  } catch (err) {
    console.error('❌ Error in coindeploy.js:', err)
    process.exit(1)
  }
}

main()
