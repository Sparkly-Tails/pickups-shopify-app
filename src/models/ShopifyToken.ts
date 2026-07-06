import mongoose, { Schema, Document } from 'mongoose'

export interface IShopifyToken extends Document {
  shop: string
  accessToken: string
}

const ShopifyTokenSchema = new Schema<IShopifyToken>(
  {
    shop: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
  },
  { timestamps: true },
)

export const ShopifyTokenModel =
  mongoose.models.ShopifyToken ||
  mongoose.model<IShopifyToken>('ShopifyToken', ShopifyTokenSchema)
