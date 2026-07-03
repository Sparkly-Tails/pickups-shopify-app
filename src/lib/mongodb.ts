import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!
if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined')

const cache = global as typeof global & {
  mongooseConn: typeof mongoose | null
  mongoosePromise: Promise<typeof mongoose> | null
}

if (!cache.mongooseConn) {
  cache.mongooseConn = null
  cache.mongoosePromise = null
}

export async function connectDB() {
  if (cache.mongooseConn) return cache.mongooseConn
  if (!cache.mongoosePromise) {
    cache.mongoosePromise = mongoose.connect(MONGODB_URI, { bufferCommands: false })
  }
  cache.mongooseConn = await cache.mongoosePromise
  return cache.mongooseConn
}
