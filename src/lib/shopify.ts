import { connectDB } from './mongodb'
import { ShopifyTokenModel } from '@/models/ShopifyToken'

const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_SHOP}/admin/api/2025-10/graphql.json`;

async function getAccessToken(): Promise<string> {
  const shop = process.env.SHOPIFY_SHOP
  if (shop) {
    try {
      await connectDB()
      const record = await ShopifyTokenModel.findOne({ shop }).lean()
      if (record && 'accessToken' in record && record.accessToken) {
        return record.accessToken as string
      }
    } catch {
      // Fall through to env var
    }
  }
  return process.env.SHOPIFY_ACCESS_TOKEN!
}

async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(SHOPIFY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface ShopifyCustomer {
  id: string;
  displayName: string;
  email: string;
}

export async function getCustomerByEmail(
  email: string,
): Promise<ShopifyCustomer | null> {
  const data = await shopifyQuery<{
    customers: { edges: { node: ShopifyCustomer }[] };
  }>(
    `query searchCustomer($q: String!) {
      customers(first: 1, query: $q) {
        edges { node { id displayName email } }
      }
    }`,
    { q: `email:${email}` },
  );
  return data.customers.edges[0]?.node ?? null;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface ShopifyOrderLineItem {
  id: string;
  title: string;
  quantity: number;
  imageUrl?: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  lineItems: ShopifyOrderLineItem[];
}

const ORDER_LINE_ITEMS = `
  lineItems(first: 30) {
    edges { node { id title quantity image { url } } }
  }
`;

function parseOrder(raw: Record<string, unknown>): ShopifyOrder {
  const lineItems = raw.lineItems as {
    edges: { node: Record<string, unknown> }[];
  };
  return {
    ...(raw as Omit<ShopifyOrder, "lineItems">),
    lineItems: lineItems.edges.map((e) => ({
      id: e.node.id as string,
      title: e.node.title as string,
      quantity: e.node.quantity as number,
      imageUrl: (e.node.image as { url: string } | null)?.url,
    })),
  };
}

export async function getCustomerUnfulfilledOrders(
  shopifyCustomerId: string,
): Promise<ShopifyOrder[]> {
  const data = await shopifyQuery<{
    customer: {
      orders: { edges: { node: Record<string, unknown> }[] };
    };
  }>(
    `query getCustomerOrders($id: ID!) {
      customer(id: $id) {
        orders(first: 10, query: "fulfillment_status:unfulfilled") {
          edges {
            node {
              id name createdAt displayFulfillmentStatus
              ${ORDER_LINE_ITEMS}
            }
          }
        }
      }
    }`,
    { id: shopifyCustomerId },
  );
  return data.customer.orders.edges.map((e) => parseOrder(e.node));
}

export async function searchProducts(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const data = await shopifyQuery<{
    products: { edges: { node: { title: string } }[] };
  }>(
    `query searchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges { node { title } }
      }
    }`,
    { q: query },
  );
  console.log("data:::", data);
  return data.products.edges.map((e) => e.node.title);
}

export async function appendOrderNote(orderId: string, entry: string): Promise<void> {
  const data = await shopifyQuery<{ order: { note: string | null } }>(
    `query getOrderNote($id: ID!) { order(id: $id) { note } }`,
    { id: orderId },
  )
  const existing = data.order?.note ?? ''
  const updated = existing ? `${existing}\n${entry}` : entry
  await shopifyQuery(
    `mutation updateOrderNote($input: OrderInput!) {
      orderUpdate(input: $input) {
        userErrors { field message }
      }
    }`,
    { input: { id: orderId, note: updated } },
  )
}

export async function getOrderById(
  orderId: string,
): Promise<ShopifyOrder | null> {
  const data = await shopifyQuery<{ order: Record<string, unknown> | null }>(
    `query getOrder($id: ID!) {
      order(id: $id) {
        id name createdAt displayFulfillmentStatus
        ${ORDER_LINE_ITEMS}
      }
    }`,
    { id: orderId },
  );
  return data.order ? parseOrder(data.order) : null;
}
