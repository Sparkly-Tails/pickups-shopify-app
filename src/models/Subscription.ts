import { Schema, model, models } from 'mongoose'

export interface ISubscriptionLine {
  loopLineId: string
  shopifyVariantId: string
  productName: string
  qty: number
  unit: string
  price: number
  imageUrl: string
}

export interface ISubscription {
  _id: string
  customerId: string
  customer: { name: string; email: string; shopifyId: string }
  status: 'active' | 'paused' | 'cancelled'
  interval: { frequency: number; unit: string }
  nextOrderDate: Date
  lines: ISubscriptionLine[]
  updatedAt: Date
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    _id: { type: String },
    customerId: { type: String, required: true, index: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      shopifyId: String,
    },
    status: { type: String, enum: ['active', 'paused', 'cancelled'], required: true },
    interval: { frequency: { type: Number, required: true }, unit: { type: String, required: true } },
    nextOrderDate: { type: Date, index: true },
    lines: [
      {
        loopLineId: String,
        shopifyVariantId: String,
        productName: String,
        qty: Number,
        unit: { type: String, default: 'unit' },
        price: Number,
        imageUrl: String,
      },
    ],
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

export const SubscriptionModel =
  models.Subscription || model<ISubscription>('Subscription', SubscriptionSchema)
