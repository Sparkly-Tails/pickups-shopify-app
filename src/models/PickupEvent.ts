import { Schema, model, models, Types } from 'mongoose'

export interface IPickupItem {
  productName: string
  qty: number
  unit: string
  replacement: { name: string; price: number } | null
  escaped: boolean
}

export interface IPickupEvent {
  _id: Types.ObjectId
  subscriptionId: string
  customerId: string
  customerName: string
  date: Date
  weekNumber: number
  subscriptionMonth: string
  notes: string
  emailSent: boolean
  items: IPickupItem[]
  createdAt: Date
}

const PickupEventSchema = new Schema<IPickupEvent>({
  subscriptionId: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  customerName: { type: String, required: true },
  date: { type: Date, required: true },
  weekNumber: { type: Number, required: true },
  subscriptionMonth: { type: String, required: true },
  notes: { type: String, default: '' },
  emailSent: { type: Boolean, default: false },
  items: [
    {
      productName: String,
      qty: Number,
      unit: String,
      replacement: { type: { name: String, price: Number }, default: null },
      escaped: { type: Boolean, default: false },
    },
  ],
  createdAt: { type: Date, default: Date.now },
})

export const PickupEventModel =
  models.PickupEvent || model<IPickupEvent>('PickupEvent', PickupEventSchema)
