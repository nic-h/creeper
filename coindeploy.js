// creeper/coinDeploy.js
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import pinataSDK from '@pinata/sdk'
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
const pinata = pinataSDK(PINATA_API_KEY, PINATA_SECRET)
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) })
const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account: privateKeyToAccount(PRIVATE_KEY)
})

// ─── Pin and update URI ────────────────────────────────────────────────────────
async function main() {
  // 1) Pin the latest snapshot image (creeper.png)
  const filePath = path.resolve('snapshots', 'creeper.png')
  console.log('→ Pinning', filePath)
  const { IpfsHash } = await pinata.pinFileToIPFS(fs.createReadStream(filePath))
  const newURI = `ipfs://${IpfsHash}`
  console.log('✓ Pinned image. CID:', IpfsHash)

  // 2) Update the coin's metadata URI on-chain
  console.log(`→ Updating coin URI to ${newURI}`)
  const result = await updateCoinURI(
    { coin: COIN_ADDRESS, newURI },
    walletClient,
    publicClient
  )
  console.log('✓ Transaction hash:', result.hash)
  console.log('✅ Coin metadata updated')
}

main().catch(err => {
  console.error('❌ Error in coinDeploy:', err)
  process.exit(1)
})