const KLAVIYO_API_URL = 'https://a.klaviyo.com/api/events/'
const KLAVIYO_REVISION = '2024-02-15'

export interface PickupItem {
  product: string
  quantity: number
  unit: string
  replaced_for?: string
}

export interface SendPickupParams {
  email: string
  customerName: string
  weekNumber: number
  subscriptionMonth: string
  itemsPickedUp: PickupItem[]
  itemsRemaining: PickupItem[]
}

export async function sendPickupConfirmedEvent(params: SendPickupParams): Promise<void> {
  const [firstName, ...rest] = params.customerName.trim().split(' ')
  const payload = {
    data: {
      type: 'event',
      attributes: {
        metric: { data: { type: 'metric', attributes: { name: 'Pickup Confirmed' } } },
        profile: {
          data: {
            type: 'profile',
            attributes: { email: params.email, first_name: firstName, last_name: rest.join(' ') },
          },
        },
        properties: {
          week_number: params.weekNumber,
          subscription_month: params.subscriptionMonth,
          items_picked_up: params.itemsPickedUp,
          items_remaining: params.itemsRemaining,
          has_remaining: params.itemsRemaining.length > 0,
        },
      },
    },
  }

  const res = await fetch(KLAVIYO_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
      revision: KLAVIYO_REVISION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (res.status !== 202) {
    const body = await res.text()
    throw new Error(`Klaviyo ${res.status}: ${body}`)
  }
}
