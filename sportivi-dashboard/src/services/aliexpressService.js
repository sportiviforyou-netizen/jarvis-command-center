/**
 * AliExpress Portals Affiliate API service.
 *
 * SETUP:
 * 1. Go to https://portals.aliexpress.com → Tools → API Management
 * 2. Create an app → get App Key + App Secret
 * 3. Set VITE_AE_APP_KEY, VITE_AE_APP_SECRET, VITE_AE_TRACKING_ID in .env.local
 *
 * Note: AliExpress Portals API requires HMAC-SHA256 signature on every request.
 * This service handles signing automatically.
 *
 * Available data:
 *   - Commission reports (today's earnings, orders)
 *   - Traffic stats (clicks, impressions)
 *   - Top performing products
 *   - New trending products in a category
 */

import { DS } from '../config/dataSources'

// Route through GARVIS Flask backend (server-side proxy, no CORS issues).
// In dev the Vite proxy also rewrites /ae-api → api-sg.aliexpress.com, but
// using the backend proxy is safer and works in production too.
const GARVIS_BASE = 'https://jarvis-command-center-1-0.onrender.com'
const API_BASE = `${GARVIS_BASE}/ae-proxy`

// ── HMAC-SHA256 signing (required by AliExpress API) ──────────────────────────

async function hmacSHA256(key, message) {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

async function buildSignedParams(method, params) {
  const { appKey, appSecret } = DS.aliexpress
  const timestamp = Date.now()

  const allParams = {
    app_key:   appKey,
    method,
    timestamp: String(timestamp),
    sign_method: 'sha256',
    ...params,
  }

  // Sort keys alphabetically and concatenate
  const sortedKeys = Object.keys(allParams).sort()
  const signStr = appSecret + sortedKeys.map(k => `${k}${allParams[k]}`).join('') + appSecret

  const sign = await hmacSHA256(appSecret, signStr)
  return { ...allParams, sign }
}

async function aeGet(method, params = {}) {
  // Send only the domain params — GARVIS backend handles signing
  const query = new URLSearchParams({ method, ...params }).toString()
  const res = await fetch(`${API_BASE}?${query}`)
  if (!res.ok) throw new Error(`AliExpress proxy HTTP ${res.status}`)
  const data = await res.json()
  if (data.error_response) throw new Error(data.error_response.msg)
  return data
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch today's commission summary.
 * Returns { ok, revenue, orders, clicks, conversionRate }
 */
export async function fetchCommissionSummary() {
  if (!DS.aliexpress.enabled) return { ok: false, reason: 'not_configured' }

  try {
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const data = await aeGet('aliexpress.affiliate.order.list', {
      start_time: `${dateStr} 00:00:00`,
      end_time:   `${dateStr} 23:59:59`,
      status:     'order_paid',
      page_size:  '50',
      tracking_id: DS.aliexpress.trackingId,
    })

    const orders = data?.aliexpress_affiliate_order_list_response?.resp_result?.result?.orders?.order || []
    const revenue = orders.reduce((sum, o) => sum + Number(o.estimated_paid_commission || 0), 0)

    return {
      ok: true,
      revenue:        Math.round(revenue * 3.7), // USD → ILS approx
      orders:         orders.length,
      clicks:         null, // from traffic report
      commissionUSD:  revenue,
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Fetch traffic stats (clicks, impressions).
 * Returns { ok, clicks, impressions, ctr }
 */
export async function fetchTrafficStats() {
  if (!DS.aliexpress.enabled) return { ok: false, reason: 'not_configured' }

  try {
    const today = new Date().toISOString().split('T')[0]

    const data = await aeGet('aliexpress.affiliate.traffic.statistics', {
      start_time:  today,
      end_time:    today,
      tracking_id: DS.aliexpress.trackingId,
    })

    const stats = data?.aliexpress_affiliate_traffic_statistics_response?.resp_result?.result
    return {
      ok:          true,
      clicks:      Number(stats?.total_click      || 0),
      impressions: Number(stats?.total_impression || 0),
      ctr:         stats?.total_click && stats?.total_impression
        ? ((stats.total_click / stats.total_impression) * 100).toFixed(1)
        : null,
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Search for hot products in a category.
 * category: 'Sports' | 'Fitness' | etc.
 */
export async function fetchHotProducts(category = 'Sports', limit = 10) {
  if (!DS.aliexpress.enabled) return { ok: false, products: [], reason: 'not_configured' }

  try {
    const data = await aeGet('aliexpress.affiliate.hotproduct.query', {
      category_ids:  '66', // 66 = Sports & Entertainment
      tracking_id:   DS.aliexpress.trackingId,
      page_size:     String(limit),
      sort:          'SALE_PRICE_ASC',
    })

    const products = data
      ?.aliexpress_affiliate_hotproduct_query_response
      ?.resp_result?.result?.products?.product || []

    return {
      ok: true,
      products: products.map(p => ({
        id:        p.product_id,
        name:      p.product_title,
        price:     Math.round(Number(p.target_sale_price || p.sale_price) * 3.7),
        priceUSD:  Number(p.target_sale_price || p.sale_price),
        imageUrl:  p.product_main_image_url,
        detailUrl: p.promotion_link || p.product_detail_url,
        rating:    Number(p.evaluate_rate?.replace('%', '') || 0),
        orders:    Number(p.lastest_volume || 0),
        commission:Number(p.commission_rate?.replace('%', '') || 0),
      })),
    }
  } catch (err) {
    return { ok: false, products: [], reason: err.message }
  }
}
