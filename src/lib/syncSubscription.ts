import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { loopGetSubscription, loopGetCustomer } from '@/lib/loop'
import { getShopifyVariants, getShopifyCustomer } from '@/lib/shopify'

export async function syncSubscription(loopSubId: string): Promise<void> {
  await connectDB()
  const loopSub = await loopGetSubscription(loopSubId)

  const variantIds = loopSub.line_items.map(l => l.variant_id)
  const variantMap = await getShopifyVariants(variantIds)

  const lines = loopSub.line_items.map(line => {
    const shopify = variantMap.get(line.variant_id)
    return {
      loopLineId: line.id,
      shopifyVariantId: line.variant_id,
      productName: shopify?.name ?? 'Unknown product',
      qty: line.quantity,
      unit: 'unit',   // Loop doesn't expose unit — set via metafield or manually in DB
      price: shopify?.price ?? 0,
      imageUrl: shopify?.imageUrl ?? '',
    }
  })

  await SubscriptionModel.findOneAndUpdate(
    { _id: loopSub.id },
    {
      _id: loopSub.id,
      customerId: loopSub.customer_id,
      status: loopSub.status,
      interval: { frequency: loopSub.billing_policy.interval_count, unit: loopSub.billing_policy.interval },
      nextOrderDate: new Date(loopSub.next_billing_date),
      lines,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  // Enrich customer name/email — non-fatal if it fails
  try {
    const loopCust = await loopGetCustomer(loopSub.customer_id)
    const shopifyCust = await getShopifyCustomer(
      `gid://shopify/Customer/${loopCust.shopify_customer_id}`
    )
    await SubscriptionModel.updateOne(
      { _id: loopSub.id },
      {
        'customer.name': shopifyCust.displayName,
        'customer.email': shopifyCust.email,
        'customer.shopifyId': `gid://shopify/Customer/${loopCust.shopify_customer_id}`,
      }
    )
  } catch (err) {
    console.error('Customer enrichment failed:', loopSubId, err)
  }
}
