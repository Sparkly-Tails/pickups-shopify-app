import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { connectDB } from '@/lib/mongodb'
import { ShopifyTokenModel } from '@/models/ShopifyToken'

async function verifyWebhookHmac(req: NextRequest, body: string): Promise<boolean> {
  const secret = process.env.SHOPIFY_API_SECRET_KEY
  if (!secret) return false
  const header = req.headers.get('x-shopify-hmac-sha256')
  if (!header) return false
  const digest = createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(header))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  const valid = await verifyWebhookHmac(req, body)
  if (!valid) {
    console.error('[webhook] HMAC verification failed')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic')
  const shop = req.headers.get('x-shopify-shop-domain')

  console.log('[webhook] received', topic, 'for shop:', shop)

  if (topic === 'app/uninstalled' && shop) {
    await connectDB()
    await ShopifyTokenModel.deleteOne({ shop })
    console.log('[webhook] app/uninstalled — token wiped for shop:', shop)
  }

  return new NextResponse('OK', { status: 200 })
}
