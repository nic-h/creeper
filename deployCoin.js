// creeper/deployCoin.js
import dotenv from 'dotenv'
dotenv.config()

import { createCoin } from '@zoralabs/coins-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// ─── Load & validate environment variables ─────────────────────────────────────
const RPC_URL             = process.env.RPC_URL
const PRIVATE_KEY         = process.env.PRIVATE_KEY
const SALE_RECIPIENT      = process.env.SALE_RECIPIENT
const METADATA_URI        = process.env.METADATA_URI
const NAME                = process.env.NAME || 'CREEPER'
const SYMBOL              = process.env.SYMBOL || 'CREEP'
const INITIAL_MINT_AMOUNT = BigInt(process.env.INITIAL_MINT_AMOUNT || '1')

if (!RPC_URL || !PRIVATE_KEY || !SALE_RECIPIENT || !METADATA_URI) {
  console.error('Error: Missing one of RPC_URL, PRIVATE_KEY, SALE_RECIPIENT, METADATA_URI in .env')
  process.exit(1)
}

// ─── Setup Viem clients ─────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
})

const account = privateKeyToAccount(PRIVATE_KEY)
const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account,
})

// ─── Deploy Zora Coin ───────────────────────────────────────────────────────────
async function deployCoin() {
  console.log('🚀 Deploying Zora coin...')
  const { address } = await createCoin(
    {
      name:              NAME,
      symbol:            SYMBOL,
      uri:               METADATA_URI,
      payoutRecipient:   SALE_RECIPIENT,
      initialMintAmount: INITIAL_MINT_AMOUNT,
    },
    walletClient,
    publicClient
  )
  console.log('✅ Coin deployed at:', address)
}

deployCoin().catch(err => {
  console.error('❌ Deployment failed:', err)
  process.exit(1)
})
