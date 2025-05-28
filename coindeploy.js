// File: coindeploy.js
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
  PINATA_API_SECRET
} = process.env

if (!RPC_URL || !PRIVATE_KEY || !COIN_ADDRESS || !PINATA_API_KEY || !PINATA_API_SECRET) {
  console.error('Error: Missing one of RPC_URL, PRIVATE_KEY, COIN_ADDRESS, PINATA_API_KEY, or PINATA_API_SECRET')
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
    // 1) Pin the latest snapshot image
    const imagePath = path.resolve('snapshots', 'creeper.png')
    console.log('→ Pinning image:', imagePath)
    const pinFileRes = await pinata.pinFileToIPFS(
      fs.createReadStream(imagePath),
      {
        pinataMetadata: { name: 'creeper.png' }
      }
    )
    const imageCID = pinFileRes.IpfsHash ?? pinFileRes.cid
    console.log('✓ Image pinned at', imageCID)

    // 2) Load and update metadata.json
    const metadataPath = path.resolve('metadata.json')
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    metadata.image = `ipfs://${imageCID}`

    // 3) Pin the updated JSON metadata
    console.log('→ Pinning updated metadata JSON...')
    const pinJsonRes = await pinata.pinJSONToIPFS(
      metadata,
      {
        pinataMetadata: { name: 'metadata.json' }
      }
    )
    const metadataCID = pinJsonRes.IpfsHash ?? pinJsonRes.cid
    console.log('✓ Metadata JSON pinned at', metadataCID)

    // 4) Update the coin's metadata URI on-chain
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
