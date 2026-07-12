'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import { CustomerModel } from '@/models/Customer'
import { PickupEventModel } from '@/models/PickupEvent'
import { getCustomerByEmail, getCustomerUnfulfilledOrders } from '@/lib/shopify'

export async function addCustomerByEmail(email: string): Promise<{ error?: string; customerId?: string }> {
  await connectDB()

  const shopifyCustomer = await getCustomerByEmail(email.trim().toLowerCase())
  if (!shopifyCustomer) return { error: 'No Shopify customer found with that email' }

  const existing = await CustomerModel.findOne({ shopifyCustomerId: shopifyCustomer.id })
  if (existing) return { customerId: String(existing._id) }

  const orders = await getCustomerUnfulfilledOrders(shopifyCustomer.id)

  let currentOrderId: string | null = null
  let currentOrderItems: { shopifyLineItemId: string; productName: string; qty: number }[] = []

  if (orders.length === 1) {
    currentOrderId = orders[0].id
    currentOrderItems = orders[0].lineItems.map(li => ({
      shopifyLineItemId: li.id,
      productName: li.title,
      qty: li.quantity,
      imageUrl: li.imageUrl,
    }))
  }

  const customer = await CustomerModel.create({
    shopifyCustomerId: shopifyCustomer.id,
    email: shopifyCustomer.email,
    name: shopifyCustomer.displayName,
    status: 'active',
    currentOrderId,
    currentOrderItems,
  })

  return { customerId: String(customer._id) }
}

export async function loadNewOrder(customerId: string, orderId: string, orderItems: { shopifyLineItemId: string; productName: string; qty: number; imageUrl?: string }[]): Promise<void> {
  await connectDB()
  await CustomerModel.updateOne(
    { _id: customerId },
    { currentOrderId: orderId, currentOrderItems: orderItems }
  )
  revalidatePath(`/customer/${customerId}`)
}

export async function resetCycle(customerId: string): Promise<void> {
  await connectDB()
  const customer = await CustomerModel.findById(customerId).lean()
  if (!customer) return
  if (customer.currentOrderId) {
    await PickupEventModel.deleteMany({
      shopifyCustomerId: customer.shopifyCustomerId,
      shopifyOrderId: customer.currentOrderId,
    })
  }
  await CustomerModel.updateOne(
    { _id: customerId },
    { currentOrderId: null, currentOrderItems: [] }
  )
  revalidatePath(`/customer/${customerId}`)
}

export async function cancelSubscription(customerId: string): Promise<void> {
  await connectDB()
  await CustomerModel.updateOne({ _id: customerId }, { status: 'cancelled' })
  redirect('/')
}
