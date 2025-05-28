// File: coindeploy.js
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { PinataClient } from 'pinata-web3'
import { updateCoinURI } from '@zoralabs/coins-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

dotenv.config()

// ─── Load & validate environment variables ─────────────────────────────────────
const RPC_URL        = process.env.RPC_URL
const PRIVATE_KEY    = process.env.PRIVATE_KEY
const COIN_ADDRESS   = process.env.COIN_ADDRESS
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET  = process.env.PINATA_API_SECRET

if (!RPC_URL || !PRIVATE_KEY || !COIN_ADDRESS) {
  console.error('Error: Missing RPC_URL, PRIVATE_KEY, or COIN_ADDRESS in .env')
  process.exit(1)
}
if (!PINATA_API_KEY || !PINATA_SECRET) {
  console.error('Error: Missing Pinata credentials in .env')
  process.exit(1)
}

// ─── Initialize Pinata and Viem clients ────────────────────────────────────────
const pinata = new PinataClient({ apiKey: PINATA_API_KEY, apiSecret: PINATA_SECRET })
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) })
const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account: privateKeyToAccount(PRIVATE_KEY)
})

// ─── Pin image and metadata, then update on-chain ────────────────────────────────
async function main() {
  // 1) Pin the latest snapshot image
  const imagePath = path.resolve('snapshots','creeper.png')
  console.log('→ Pinning image:', imagePath)
  const pinFileRes = await pinata.pinFileToIPFS(fs.createReadStream(imagePath))
  const imageCID = pinFileRes.IpfsHash ?? pinFileRes.cid
  console.log('✓ Image pinned at', imageCID)

  // 2) Load and update metadata.json
  const metadata = JSON.parse(fs.readFileSync('metadata.json','utf8'))
  metadata.image = `ipfs://${imageCID}`

  // 3) Pin the updated JSON
  console.log('→ Pinning updated metadata JSON…')
  const pinJsonRes = await pinata.pinJSONToIPFS(metadata)
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
}

main().catch(err => {
  console.error('❌ Error in coindeploy:', err)
  process.exit(1)
})
