'use server'

import { searchProducts } from '@/lib/shopify'

export async function searchProductsAction(query: string): Promise<string[]> {
  if (query.trim().length < 2) return []
  return searchProducts(query)
}
