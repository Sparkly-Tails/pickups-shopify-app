import 'dotenv/config'
import { connectDB } from '../src/lib/mongodb'
import { loopGetAllActiveSubscriptions } from '../src/lib/loop'
import { syncSubscription } from '../src/lib/syncSubscription'

async function main() {
  await connectDB()
  console.log('Fetching active subscriptions from Loop…')
  const subs = await loopGetAllActiveSubscriptions()
  console.log(`Found ${subs.length} subscriptions. Syncing…`)
  for (const sub of subs) {
    try {
      await syncSubscription(sub.id)
      console.log(`✓ ${sub.id}`)
    } catch (err) {
      console.error(`✗ ${sub.id}:`, err)
    }
  }
  console.log('Done.')
  process.exit(0)
}

main()
