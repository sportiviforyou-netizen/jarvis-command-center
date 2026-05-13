/**
 * Central configuration for all data sources.
 * Values come from .env.local — see .env.example for setup instructions.
 *
 * Data priority:
 *   1. JARVIS API (Render Flask)         ← live agent status + GitHub Actions runs
 *   2. GitHub Vault (jarvis-vault repo)  ← primary — real JARVIS agent output
 *   3. Telegram Bot API                  ← community members
 *   4. AliExpress Portals API            ← commission data (optional)
 *   5. Google Sheets (optional)          ← if sheet is public + configured
 */

export const DS = {
  // ── JARVIS Flask API (Render) ─────────────────────────────────────────────
  jarvis: {
    baseUrl: 'https://jarvis-command-center-1-0.onrender.com',
    enabled: true,   // always on — no token needed
  },

  // ── GitHub Vault ────────────────────────────────────────────────────────────
  vault: {
    token:  import.meta.env.VITE_GITHUB_TOKEN       || '',
    repo:   import.meta.env.VITE_GITHUB_VAULT_REPO  || 'sportiviforyou-netizen/jarvis-vault',
    get enabled() { return !!this.token },
  },

  // ── Google Sheets (public GViz API) ─────────────────────────────────────────
  // Only works if the sheet is shared publicly. Leave VITE_SHEET_ID empty to skip.
  sheets: {
    sheetId: import.meta.env.VITE_SHEET_ID || '',
    tabs: {
      kpi:         'KPI_Daily',
      products:    'Products',
      insights:    'Insights',
      performance: 'Performance_7D',
      agents:      'Agents',
    },
    get enabled() { return !!this.sheetId },
  },

  // ── Telegram Bot ─────────────────────────────────────────────────────────────
  telegram: {
    botToken:  import.meta.env.VITE_TELEGRAM_TOKEN   || '',
    channelId: import.meta.env.VITE_TELEGRAM_CHANNEL || '',
    get enabled() { return !!(this.botToken && this.channelId) },
  },

  // ── AliExpress Portals API ───────────────────────────────────────────────────
  // Calls are routed via Vite proxy (/ae-api → api-sg.aliexpress.com) to avoid CORS.
  aliexpress: {
    appKey:     import.meta.env.VITE_AE_APP_KEY     || '',
    appSecret:  import.meta.env.VITE_AE_APP_SECRET  || '',
    trackingId: import.meta.env.VITE_AE_TRACKING_ID || '',
    get enabled() { return !!(this.appKey && this.appSecret) },
  },

  // ── Refresh intervals ────────────────────────────────────────────────────────
  refresh: {
    kpi:      Number(import.meta.env.VITE_REFRESH_KPI)      || 60_000,    // 1 min
    vault:    Number(import.meta.env.VITE_REFRESH_VAULT)    || 600_000,   // 10 min
    jarvis:   Number(import.meta.env.VITE_REFRESH_JARVIS)   || 120_000,   // 2 min
    products: Number(import.meta.env.VITE_REFRESH_PRODUCTS) || 300_000,   // 5 min
    insights: Number(import.meta.env.VITE_REFRESH_INSIGHTS) || 120_000,   // 2 min
  },
}
