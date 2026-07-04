import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { getSubscriptionContract } from '@/lib/shopify'

const STATUS_MAP: Record<string, 'active' | 'paused' | 'cancelled'> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  FAILED: 'cancelled',
  EXPIRED: 'cancelled',
}

export async function syncSubscription(shopifyContractId: string): Promise<void> {
  await connectDB()
  const contract = await getSubscriptionContract(shopifyContractId)

  const lines = contract.lines.map(line => ({
    loopLineId: line.id,
    shopifyVariantId: line.variantId,
    productName: line.title,
    qty: line.quantity,
    unit: 'unit',
    price: parseFloat(line.currentPrice.amount),
    imageUrl: line.productVariant?.image?.url ?? '',
  }))

  await SubscriptionModel.findOneAndUpdate(
    { _id: shopifyContractId },
    {
      _id: shopifyContractId,
      customerId: contract.customer.id,
      customer: {
        name: contract.customer.displayName,
        email: contract.customer.email,
        shopifyId: contract.customer.id,
      },
      status: STATUS_MAP[contract.status] ?? 'cancelled',
      interval: {
        frequency: contract.billingPolicy.intervalCount,
        unit: contract.billingPolicy.interval,
      },
      nextOrderDate: new Date(contract.nextBillingDate),
      lines,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}
