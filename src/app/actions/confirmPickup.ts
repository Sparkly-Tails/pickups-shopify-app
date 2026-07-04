'use server'

import { connectDB } from '@/lib/mongodb'
import { PickupEventModel, IPickupItem } from '@/models/PickupEvent'
import { SubscriptionModel } from '@/models/Subscription'
import { sendPickupConfirmedEvent } from '@/lib/klaviyo'

export interface ConfirmPickupInput {
  subscriptionId: string
  date: string
  weekNumber: number
  subscriptionMonth: string
  notes: string
  items: IPickupItem[]
}

export async function confirmPickup(input: ConfirmPickupInput): Promise<{ ok: boolean; emailSent: boolean }> {
  await connectDB()
  const sub = await SubscriptionModel.findById(input.subscriptionId)
  if (!sub) throw new Error('Subscription not found')

  const event = await PickupEventModel.create({
    subscriptionId: input.subscriptionId,
    customerId: sub.customerId,
    customerName: sub.customer.name,
    date: new Date(input.date),
    weekNumber: input.weekNumber,
    subscriptionMonth: input.subscriptionMonth,
    notes: input.notes,
    emailSent: false,
    items: input.items,
  })

  const itemsPickedUp = input.items
    .filter(i => !i.escaped)
    .map(i => ({
      product: i.replacement?.name ?? i.productName,
      quantity: i.qty,
      unit: i.unit,
      ...(i.replacement ? { replaced_for: i.productName } : {}),
    }))

  const pickedUpNames = new Set(input.items.filter(i => !i.escaped).map(i => i.productName))
  const itemsRemaining = sub.lines
    .filter((l: { productName: string; qty: number; unit: string }) => !pickedUpNames.has(l.productName))
    .map((l: { productName: string; qty: number; unit: string }) => ({ product: l.productName, quantity: l.qty, unit: l.unit }))

  let emailSent = false
  try {
    await sendPickupConfirmedEvent({
      email: sub.customer.email,
      customerName: sub.customer.name,
      weekNumber: input.weekNumber,
      subscriptionMonth: input.subscriptionMonth,
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
