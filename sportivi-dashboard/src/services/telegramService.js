/**
 * Telegram Bot API service.
 *
 * SETUP:
 * 1. Create a bot via @BotFather → /newbot → copy the token
 * 2. Add the bot as ADMIN to your Telegram channel
 * 3. Set VITE_TELEGRAM_TOKEN and VITE_TELEGRAM_CHANNEL in .env.local
 *
 * Channel ID format: @sportiviforyou  OR  -1001234567890
 */

import { DS } from '../config/dataSources'

const BASE = 'https://api.telegram.org/bot'

async function tgGet(method, params = {}) {
  const { botToken } = DS.telegram
  const query = new URLSearchParams(params).toString()
  const url = `${BASE}${botToken}/${method}${query ? '?' + query : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Telegram ${method} → HTTP ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram error: ${data.description}`)
  return data.result
}

/**
 * Fetch community stats from Telegram channel.
 * Returns { memberCount, title, username, lastPostViews }
 */
export async function fetchTelegramStats() {
  if (!DS.telegram.enabled) {
    return { ok: false, reason: 'not_configured' }
  }

  const { channelId } = DS.telegram

  try {
    const [chat, count] = await Promise.all([
      tgGet('getChat',             { chat_id: channelId }),
      tgGet('getChatMemberCount',  { chat_id: channelId }),
    ])

    return {
      ok: true,
      memberCount: count,
      title:       chat.title || '',
      username:    chat.username ? `@${chat.username}` : channelId,
      description: chat.description || '',
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Get the latest N messages from the channel (requires bot to have message history access).
 * Returns array of { date, views, text }
 */
export async function fetchRecentPosts(limit = 5) {
  if (!DS.telegram.enabled) return { ok: false, posts: [] }

  try {
    // getUpdates works for bots that receive messages forwarded to them
    const updates = await tgGet('getUpdates', { limit: 100 })
    const channelId = DS.telegram.channelId

    const posts = updates
      .filter(u => u.channel_post)
      .filter(u => !channelId || String(u.channel_post.chat.id) === String(channelId) ||
                   `@${u.channel_post.chat.username}` === channelId)
      .slice(-limit)
      .map(u => ({
        date:  new Date(u.channel_post.date * 1000).toLocaleTimeString('he-IL'),
        text:  (u.channel_post.text || u.channel_post.caption || '').slice(0, 80),
        views: u.channel_post.views || 0,
      }))

    return { ok: true, posts }
  } catch (err) {
    return { ok: false, posts: [], reason: err.message }
  }
}
