import { Schema, model, models, Types } from 'mongoose'

export interface IPickupItem {
  productName: string
  qty: number
  status: 'picked' | 'skipped' | 'swapped'
  replacement: { name: string } | null
  imageUrl?: string
}

export interface IPickupEvent {
  _id: Types.ObjectId
  shopifyCustomerId: string
  shopifyOrderId: string
  customerEmail: string
  customerName: string
  date: Date
  notes: string
  emailSent: boolean
  items: IPickupItem[]
  createdAt: Date
}

const PickupEventSchema = new Schema<IPickupEvent>({
  shopifyCustomerId: { type: String, required: true, index: true },
  shopifyOrderId: { type: String, required: true, index: true },
  customerEmail: { type: String, required: true },
  customerName: { type: String, required: true },
  date: { type: Date, required: true },
  notes: { type: String, default: '' },
  emailSent: { type: Boolean, default: false },
  items: [
    {
      productName: String,
      qty: Number,
      status: { type: String, enum: ['picked', 'skipped', 'swapped'], default: 'picked' },
      replacement: { type: { name: String }, default: null },
      imageUrl: { type: String, default: null },
    },
  ],
  createdAt: { type: Date, default: Date.now },
})

export const PickupEventModel =
  models.PickupEvent || model<IPickupEvent>('PickupEvent', PickupEventSchema)
