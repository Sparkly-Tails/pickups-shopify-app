import 'dotenv/config'
import { connectDB } from '../src/lib/mongodb'
import { getAllSubscriptionContracts } from '../src/lib/shopify'
import { syncSubscription } from '../src/lib/syncSubscription'

async function main() {
  await connectDB()
  console.log('Fetching subscription contracts from Shopify…')
  const contracts = await getAllSubscriptionContracts()
  console.log(`Found ${contracts.length} contracts. Syncing…`)
  for (const contract of contracts) {
    try {
      await syncSubscription(contract.id)
      console.log(`✓ ${contract.id}`)
    } catch (err) {
      console.error(`✗ ${contract.id}:`, err)
    }
  }
  console.log('Done.')
  process.exit(0)
}

main()
