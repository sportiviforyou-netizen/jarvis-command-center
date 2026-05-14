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
 * Format a Date as "YYYY-MM-DD HH:MM:SS" (Israel time, used by AliExpress order API)
 */
function fmtDate(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Fetch today's commission summary.
 * Returns { ok, revenue, orders, commissionUSD }
 */
export async function fetchCommissionSummary() {
  if (!DS.aliexpress.enabled) return { ok: false, reason: 'not_configured' }

  try {
    const now   = new Date()
    const start = new Date(now); start.setHours(0, 0, 0, 0)

    const data = await aeGet('aliexpress.affiliate.order.query', {
      start_time: fmtDate(start),
      end_time:   fmtDate(now),
      format:     'json',
      v:          '2.0',
      fields:     'order_id,product_id,estimated_paid_commission,order_status,created_time',
      page_no:    '1',
      page_size:  '50',
    })

    const resp   = data?.aliexpress_affiliate_order_query_response?.resp_result
    if (resp?.resp_code !== 200) throw new Error(resp?.resp_msg || 'order query failed')

    const orders  = resp?.result?.orders?.order || []
    const revenue = orders.reduce((s, o) => s + Number(o.estimated_paid_commission || 0), 0)

    return {
      ok:            true,
      revenue:       Math.round(revenue * 3.7), // USD → ILS
      orders:        orders.length,
      commissionUSD: revenue,
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Traffic stats — AliExpress has no public traffic API.
 * Clicks are tracked via Bitly and stored in the Obsidian vault.
 * This returns { ok: false } so the store falls back to vault data.
 */
export async function fetchTrafficStats() {
  return { ok: false, reason: 'use_vault' }
}

/**
 * Search for hot products in a category.
 * category: 'Sports' | 'Fitness' | etc.
 */
export async function fetchHotProducts(category = 'Sports', limit = 10) {
  if (!DS.aliexpress.enabled) return { ok: false, products: [], reason: 'not_configured' }

  try {
    const data = await aeGet('aliexpress.affiliate.product.query', {
      keywords:    'sport fitness',
      tracking_id: DS.aliexpress.trackingId || '',
      page_size:   String(limit),
    })

    const products = data
      ?.aliexpress_affiliate_product_query_response
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
