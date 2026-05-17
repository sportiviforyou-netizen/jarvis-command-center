/**
 * Central configuration for all data sources.
 *
 * SECURITY: No secrets are baked into this file or the browser bundle.
 * GitHub token, Telegram bot token, and AliExpress app secret are all
 * handled server-side by GARVIS (Render). The frontend only calls GARVIS
 * endpoints — no direct API calls with credentials from the browser.
 *
 * Data priority:
 *   1. JARVIS API (Render Flask)         ← live agent status + GitHub Actions runs
 *   2. GitHub Vault (via /vault-proxy)   ← primary — real JARVIS agent output
 *   3. Telegram (via /telegram-members)  ← community members (token server-side)
 *   4. AliExpress (via /ae-proxy)        ← commission data (secret server-side)
 *   5. Google Sheets (optional)          ← if sheet is public + configured
 */

export const DS = {
  // ── JARVIS Flask API (Render) ─────────────────────────────────────────────
  jarvis: {
    baseUrl: 'https://jarvis-command-center-1-0.onrender.com',
    enabled: true,   // always on — no token needed
  },

  // ── GitHub Vault (reads via GARVIS /vault-proxy — token stays server-side) ──
  vault: {
    repo:    import.meta.env.VITE_GITHUB_VAULT_REPO || 'sportiviforyou-netizen/jarvis-vault',
    enabled: true,   // always on — GARVIS adds GitHub token server-side
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

  // ── Telegram (member count via GARVIS /telegram-members — token stays server-side) ──
  telegram: {
    channelId: import.meta.env.VITE_TELEGRAM_CHANNEL || '',
    enabled:   true,   // always on — GARVIS adds Telegram token server-side
  },

  // ── AliExpress Portals API (via GARVIS /ae-proxy — secret stays server-side) ────
  aliexpress: {
    appKey:     import.meta.env.VITE_AE_APP_KEY     || '',
    trackingId: import.meta.env.VITE_AE_TRACKING_ID || '',
    enabled:    true,   // always on — GARVIS adds app secret server-side
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
