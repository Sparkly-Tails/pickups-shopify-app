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

// ── Subscription Contracts ────────────────────────────────────────────────────

export interface ShopifySubscriptionLine {
  id: string
  variantId: string
  title: string
  quantity: number
  currentPrice: { amount: string }
  productVariant: { image: { url: string } | null } | null
}

export interface ShopifySubscriptionContract {
  id: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'FAILED' | 'EXPIRED'
  nextBillingDate: string
  customer: { id: string; displayName: string; email: string }
  billingPolicy: { interval: string; intervalCount: number }
  lines: ShopifySubscriptionLine[]
}

const CONTRACT_FIELDS = `
  id
  status
  nextBillingDate
  customer { id displayName email }
  billingPolicy { interval intervalCount }
  lines(first: 20) {
    edges {
      node {
        id
        variantId
        title
        quantity
        currentPrice { amount }
        productVariant { image { url } }
      }
    }
  }
`

function parseContract(raw: Record<string, unknown>): ShopifySubscriptionContract {
  const lines = raw.lines as { edges: { node: ShopifySubscriptionLine }[] }
  return {
    ...(raw as Omit<ShopifySubscriptionContract, 'lines'>),
    lines: lines.edges.map(e => e.node),
  }
}

export async function getSubscriptionContract(id: string): Promise<ShopifySubscriptionContract> {
  const data = await shopifyQuery<{ subscriptionContract: Record<string, unknown> }>(
    `query getContract($id: ID!) { subscriptionContract(id: $id) { ${CONTRACT_FIELDS} } }`,
    { id }
  )
  return parseContract(data.subscriptionContract)
}

type ContractsPage = {
  subscriptionContracts: {
    pageInfo: { hasNextPage: boolean; endCursor: string }
    edges: { node: Record<string, unknown> }[]
  }
}

export async function getAllSubscriptionContracts(): Promise<ShopifySubscriptionContract[]> {
  const results: ShopifySubscriptionContract[] = []
  let cursor: string | null = null

  while (true) {
    const data: ContractsPage = await shopifyQuery<ContractsPage>(
      `query getContracts($cursor: String) {
        subscriptionContracts(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node { ${CONTRACT_FIELDS} } }
        }
      }`,
      { cursor }
    )

    for (const edge of data.subscriptionContracts.edges) {
      results.push(parseContract(edge.node))
    }

    if (!data.subscriptionContracts.pageInfo.hasNextPage) break
    cursor = data.subscriptionContracts.pageInfo.endCursor
  }

  return results
}

// ── Products & Customers ──────────────────────────────────────────────────────

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
