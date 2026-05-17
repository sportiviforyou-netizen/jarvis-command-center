/**
 * Telegram service — calls GARVIS backend which uses server-side TELEGRAM_BOT_TOKEN.
 *
 * SECURITY: No Telegram bot token is ever in the browser bundle.
 * All Telegram API calls go through GARVIS /telegram-members endpoint (Render).
 */

const GARVIS_BASE = 'https://jarvis-command-center-1-0.onrender.com'

/**
 * Fetch community stats from Telegram channel via GARVIS server-side proxy.
 * Returns { ok, memberCount, title, username, description }
 */
export async function fetchTelegramStats() {
  try {
    const res  = await fetch(`${GARVIS_BASE}/telegram-members`, { cache: 'no-store' })
    const data = await res.json()
    if (!data.ok) return { ok: false, reason: data.error || 'TG error' }
    return {
      ok:          true,
      memberCount: data.members  || 0,
      title:       data.title    || '',
      username:    data.username || '',
      description: data.description || '',
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Recent posts — not available without a webhook/polling setup server-side.
 * Returns { ok: false } so callers fall back to vault data.
 */
export async function fetchRecentPosts(limit = 5) {
  return { ok: false, posts: [], reason: 'use_vault' }
}
