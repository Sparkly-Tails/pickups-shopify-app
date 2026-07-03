const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_SHOP}/admin/api/2024-10/graphql.json`

async function shopifyQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(SHOPIFY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data as T
}

export interface ShopifyVariant {
  name: string
  imageUrl: string
  price: number
}

const VARIANTS_QUERY = `
  query getVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        price
        product {
          title
          featuredImage { url }
        }
      }
    }
  }
`

type VariantNode = {
  id: string
  price: string
  product: { title: string; featuredImage: { url: string } | null }
}

export async function getShopifyVariants(variantIds: string[]): Promise<Map<string, ShopifyVariant>> {
  if (variantIds.length === 0) return new Map()
  const data = await shopifyQuery<{ nodes: (VariantNode | null)[] }>(VARIANTS_QUERY, { ids: variantIds })
  const map = new Map<string, ShopifyVariant>()
  for (const node of data.nodes) {
    if (node) {
      map.set(node.id, {
        name: node.product.title,
        imageUrl: node.product.featuredImage?.url ?? '',
        price: parseFloat(node.price),
      })
    }
  }
  return map
}

export async function getShopifyCustomer(shopifyId: string): Promise<{ displayName: string; email: string }> {
  const data = await shopifyQuery<{ customer: { displayName: string; email: string } }>(
    `query { customer(id: "${shopifyId}") { displayName email } }`
  )
  return data.customer
}
