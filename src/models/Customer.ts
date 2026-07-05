import { Schema, model, models, Types } from 'mongoose'

export interface IOrderItem {
  shopifyLineItemId: string
  productName: string
  qty: number
}

export interface ICustomer {
  _id: Types.ObjectId
  shopifyCustomerId: string
  email: string
  name: string
  status: 'active' | 'cancelled'
  currentOrderId: string | null
  currentOrderItems: IOrderItem[]
  createdAt: Date
}

const CustomerSchema = new Schema<ICustomer>({
  shopifyCustomerId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, index: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  currentOrderId: { type: String, default: null },
  currentOrderItems: [
    {
      shopifyLineItemId: String,
      productName: String,
      qty: Number,
    },
  ],
  createdAt: { type: Date, default: Date.now },
})

export const CustomerModel =
  models.Customer || model<ICustomer>('Customer', CustomerSchema)
