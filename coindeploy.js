// coindeploy.js
import fetch from 'node-fetch'
import pinataSDK from '@pinata/sdk'
import { writeFileSync } from 'fs'
import { createClient, updateCoinURI } from 'zdk'  // adjust to your actual Zora SDK import

// 1. Grab only the vars you actually use
const {
  RPC_URL,
  PRIVATE_KEY,
  COIN_ADDRESS,
  PINATA_API_KEY,
  PINATA_API_SECRET,
  IMAGE_URL
} = process.env

if (![RPC_URL, PRIVATE_KEY, COIN_ADDRESS, PINATA_API_KEY, PINATA_API_SECRET, IMAGE_URL].every(Boolean)) {
  console.error('❌ Missing one of RPC_URL, PRIVATE_KEY, COIN_ADDRESS, PINATA_API_KEY, PINATA_API_SECRET, or IMAGE_URL')
  process.exit(1)
}

// 2. Correct Pinata instantiation
const pinata = pinataSDK(PINATA_API_KEY, PINATA_API_SECRET)

// Main
async function main() {
  console.log('⏳ Downloading image from', IMAGE_URL)
  const imageRes = await fetch(IMAGE_URL + '?cachebust=' + Date.now())
  if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`)
  const imageBuffer = await imageRes.buffer()
  console.log('  → got', imageBuffer.byteLength, 'bytes')

  // 3. Pin the new image
  const imgPin = await pinata.pinFileToIPFS(imageBuffer, {
    pinataMetadata: { name: `creeper-${Date.now()}.png` }
  })
  console.log('✅ Image pinned:', imgPin.IpfsHash)

  // 4. Build & pin updated metadata JSON
  const metadata = {
    name: 'CREEPER',
    description: 'Live CCTV grid that updates every 5m',
    image: `ipfs://${imgPin.IpfsHash}`,
    properties: { updated: new Date().toISOString() }
  }
  const jsonBuffer = Buffer.from(JSON.stringify(metadata))
  const metaPin = await pinata.pinFileToIPFS(jsonBuffer, {
    pinataMetadata: { name: `metadata-${Date.now()}.json` }
  })
  console.log('✅ Metadata pinned:', metaPin.IpfsHash)

  // 5. Push on-chain
  const client = createClient({ rpcUrl: RPC_URL, privateKey: PRIVATE_KEY })
  const tx = await updateCoinURI(client, COIN_ADDRESS, `ipfs://${metaPin.IpfsHash}`)
  console.log('🚀 On-chain update tx hash:', tx.hash)
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
