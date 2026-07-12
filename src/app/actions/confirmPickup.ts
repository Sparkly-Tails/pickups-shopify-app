'use server'

import { connectDB } from '@/lib/mongodb'
import { PickupEventModel, IPickupItem } from '@/models/PickupEvent'
import { CustomerModel, IOrderItem } from '@/models/Customer'
import { sendPickupConfirmedEvent } from '@/lib/klaviyo'
import { appendOrderNote } from '@/lib/shopify'

export interface ConfirmPickupInput {
  customerId: string
  notes: string
  items: IPickupItem[]
  testEmail?: string
}

function calcRemaining(
  orderItems: IOrderItem[],
  allPickedItems: IPickupItem[]
): IOrderItem[] {
  const consumed = new Map<string, number>()
  for (const item of allPickedItems) {
    if (item.status === 'picked' || item.status === 'swapped') {
      consumed.set(item.productName, (consumed.get(item.productName) ?? 0) + item.qty)
    }
  }
  return orderItems
    .map(oi => ({
      shopifyLineItemId: oi.shopifyLineItemId,
      productName: oi.productName,
      qty: oi.qty - (consumed.get(oi.productName) ?? 0),
      imageUrl: oi.imageUrl,
    }))
    .filter(oi => oi.qty > 0)
}

export async function confirmPickup(
  input: ConfirmPickupInput
): Promise<{ ok: boolean; emailSent: boolean }> {
  await connectDB()

  const customer = await CustomerModel.findById(input.customerId)
  if (!customer) throw new Error('Customer not found')
  if (!customer.currentOrderId) throw new Error('No active order')

  const weekNumber =
    (await PickupEventModel.countDocuments({
      shopifyCustomerId: customer.shopifyCustomerId,
      shopifyOrderId: customer.currentOrderId,
    })) + 1

  const subscriptionMonth = new Date().toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const event = await PickupEventModel.create({
    shopifyCustomerId: customer.shopifyCustomerId,
    shopifyOrderId: customer.currentOrderId,
    customerEmail: customer.email,
    customerName: customer.name,
    date: new Date(),
    notes: input.notes,
    emailSent: false,
    items: input.items,
  })

  // Recalculate remaining after this session
  const previousItems = await PickupEventModel.find({
    shopifyCustomerId: customer.shopifyCustomerId,
    shopifyOrderId: customer.currentOrderId,
    _id: { $ne: event._id },
  }).lean()

  const allPickedItems = [...previousItems.flatMap(e => e.items), ...input.items]
  const remaining = calcRemaining(customer.currentOrderItems, allPickedItems)

  // Auto-complete cycle when nothing left
  if (remaining.length === 0) {
    await CustomerModel.updateOne(
      { _id: customer._id },
      { currentOrderId: null, currentOrderItems: [] }
    )
  }

  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const pickedSummary = input.items
    .filter(i => i.status === 'picked' || i.status === 'swapped')
    .map(i => `${i.qty}× ${i.replacement?.name ?? i.productName}`)
    .join('\n')
  if (pickedSummary) {
    try {
      await appendOrderNote(customer.currentOrderId, `[${dateStr}] Picked up: ${pickedSummary}`)
    } catch (err) {
      console.error('Shopify note error:', err)
    }
  }

  const itemsPickedUp = input.items
    .filter(i => i.status === 'picked' || i.status === 'swapped')
    .map(i => ({
      product: i.replacement?.name ?? i.productName,
      quantity: i.qty,
      unit: i.qty === 1 ? 'item' : 'items',
      ...(i.status === 'swapped' ? { replaced_for: i.productName } : {}),
      ...(i.imageUrl ? { image_url: `${i.imageUrl}&width=130` } : {}),
    }))

  const itemsRemaining = remaining.map(i => ({
    product: i.productName,
    quantity: i.qty,
    unit: i.qty === 1 ? 'item' : 'items',
    ...(i.imageUrl ? { image_url: `${i.imageUrl}&width=130` } : {}),
  }))

  let emailSent = false
  try {
    await sendPickupConfirmedEvent({
      email: input.testEmail?.trim() || customer.email,
      customerName: customer.name,
      weekNumber,
      subscriptionMonth,
      itemsPickedUp,
      itemsRemaining,
    })
    await PickupEventModel.updateOne({ _id: event._id }, { emailSent: true })
    emailSent = true
  } catch (err) {
    console.error('Klaviyo error:', err)
  }

  return { ok: true, emailSent }
}
