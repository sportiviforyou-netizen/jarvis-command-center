/**
 * JARVIS Zustand store — multi-source data with fallback to mock.
 *
 * Data priority (highest → lowest):
 *   1. GitHub Vault  (real agent output — refreshes every 10 min)
 *   2. Telegram      (community members — refreshes every 1 min)
 *   3. AliExpress    (commission — refreshes every 1 min, via Vite proxy)
 *   4. Mock          (instant fallback when sources fail)
 */
import { create } from 'zustand'
import { DS }              from '../config/dataSources'
import { fetchVaultData }  from '../services/githubVaultService'
import { fetchSheetsData } from '../services/sheetsService'
import { fetchTelegramStats } from '../services/telegramService'
import { fetchCommissionSummary, fetchTrafficStats } from '../services/aliexpressService'
import { fetchJarvisStatus, fetchJarvisSystem } from '../services/jarvisApiService'

// ── Mock data (fallback / initial state) ──────────────────────────────────────

const MOCK_AGENTS = [
  { id: 1, name: 'TALIA', role: 'מחפשת מוצרים', icon: '🔍', status: 'active', tasks: 47, success: 94 },
  { id: 2, name: 'GAL',   role: 'מדרגת מוצרים', icon: '⚖️', status: 'active', tasks: 38, success: 87 },
  { id: 3, name: 'SHIR',  role: 'תוכן שיווקי',  icon: '✍️', status: 'active', tasks: 33, success: 91 },
  { id: 4, name: 'PELEG', role: 'מפרסם לטלגרם', icon: '📢', status: 'active', tasks: 29, success: 96 },
  { id: 5, name: 'ROMI',  role: 'אנליטיקס',     icon: '📊', status: 'idle',   tasks: 12, success: 88 },
  { id: 6, name: 'AGAM',  role: 'מוניטורינג',   icon: '👁️', status: 'active', tasks: 24, success: 100 },
  { id: 7, name: 'OLIVE', role: 'ניתוח טרנדים', icon: '📈', status: 'idle',   tasks: 8,  success: 82 },
  { id: 8, name: 'ANDY',  role: 'אחזור נתונים', icon: '🔗', status: 'active', tasks: 55, success: 98 },
]

const MOCK_PRODUCTS = [
  { id: 'P001', name: 'אגרוף אבזם MMA',     keyword: 'combat sport',  price: 89,  score: 92, clicks: 342, sales: 18, ctr: '5.3%', trend: 'up' },
  { id: 'P002', name: 'כפפות אגרוף פרו',   keyword: 'boxing gloves', price: 145, score: 88, clicks: 287, sales: 14, ctr: '4.9%', trend: 'up' },
  { id: 'P003', name: 'חגורת כוח ספורט',   keyword: 'weightlifting', price: 67,  score: 85, clicks: 198, sales: 11, ctr: '5.6%', trend: 'up' },
  { id: 'P004', name: 'חבל קפיצה מהיר',    keyword: 'jump rope',     price: 34,  score: 79, clicks: 156, sales: 9,  ctr: '5.8%', trend: 'flat' },
  { id: 'P005', name: 'ספורט טייטס',       keyword: 'compression',   price: 55,  score: 74, clicks: 134, sales: 7,  ctr: '5.2%', trend: 'up' },
  { id: 'P006', name: 'מגן פה אגרוף',      keyword: 'mouth guard',   price: 28,  score: 71, clicks: 112, sales: 6,  ctr: '5.4%', trend: 'down' },
  { id: 'P007', name: 'כרית אגרוף עמידה',  keyword: 'punching bag',  price: 178, score: 68, clicks: 98,  sales: 4,  ctr: '4.1%', trend: 'flat' },
  { id: 'P008', name: 'שמן מסאז׳ ספורט',  keyword: 'massage oil',   price: 42,  score: 65, clicks: 87,  sales: 5,  ctr: '5.7%', trend: 'down' },
  { id: 'P009', name: 'אוזניות ספורט',     keyword: 'sport earbuds', price: 89,  score: 61, clicks: 76,  sales: 3,  ctr: '3.9%', trend: 'up' },
  { id: 'P010', name: 'שעון דופק ספורט',   keyword: 'heart rate',    price: 234, score: 58, clicks: 65,  sales: 2,  ctr: '3.1%', trend: 'flat' },
]

const MOCK_INSIGHTS = [
  { type: 'critical', agent: 'AGAM',  msg: 'מוצר P003 - CTR ירד ב-23% ב-24 שעות האחרונות', time: 'לפני 8 דק׳' },
  { type: 'warning',  agent: 'ROMI',  msg: 'קמפיין MMA - עלות לקליק גבוהה מהמטרה ב-15%',  time: 'לפני 22 דק׳' },
  { type: 'info',     agent: 'OLIVE', msg: '3 טרנדים חדשים זוהו: CrossFit, Recovery, Yoga', time: 'לפני 1 שעה' },
  { type: 'success',  agent: 'PELEG', msg: 'פוסט P001 הגיע ל-847 חשיפות ביום הראשון',       time: 'לפני 2 שעות' },
  { type: 'info',     agent: 'GAL',   msg: '12 מוצרים חדשים אושרו להפצה ביום הבא',          time: 'לפני 3 שעות' },
]

// KPI starts at 0 — real data fills in within seconds.
// Fake numbers would mislead; "0" is honest until the API responds.
const MOCK_KPI = {
  revenueToday:    0,  revenueWeek:  0,  revenueMonth: 0,
  ordersToday:     0,  clicksToday:  0,
  ctr:             0,  roas:         0,
  communityMembers:0,  whatsappCtr:  0,
  profitPerProduct:0,
  topProduct:      '—',
  decliningProduct:'—',
}

const MOCK_PERFORMANCE = [
  { date: '06/05', clicks: 420, sales: 8,  revenue: 680  },
  { date: '07/05', clicks: 380, sales: 6,  revenue: 540  },
  { date: '08/05', clicks: 510, sales: 11, revenue: 890  },
  { date: '09/05', clicks: 490, sales: 9,  revenue: 780  },
  { date: '10/05', clicks: 620, sales: 14, revenue: 1120 },
  { date: '11/05', clicks: 580, sales: 12, revenue: 980  },
  { date: '12/05', clicks: 690, sales: 15, revenue: 1247 },
]

const MOCK_CATEGORIES = [
  { name: 'אגרוף',     score: 88, products: 12 },
  { name: 'כושר כללי', score: 82, products: 18 },
  { name: 'ריצה',      score: 76, products: 9  },
  { name: 'שחייה',     score: 71, products: 6  },
  { name: 'יוגה',      score: 68, products: 8  },
]

// ── Merge helpers ─────────────────────────────────────────────────────────────

/**
 * Merge KPI from overlay into base.
 * - null/undefined → keep base (explicitly "unknown, keep previous")
 * - 0              → use 0 (explicitly "zero is the real value")
 * - any other      → use overlay value
 */
function mergeKPI(base, overlay) {
  if (!overlay) return base
  const merged = { ...base }
  for (const [k, v] of Object.entries(overlay)) {
    if (v !== null && v !== undefined) merged[k] = v
  }
  return merged
}

// ── Source status initial values ──────────────────────────────────────────────

const mkSources = () => ({
  jarvis:   { status: 'idle', lastSync: null, brain: null, error: null },
  vault:    { status: DS.vault.enabled      ? 'idle' : 'disabled', lastSync: null, meta: null,  error: null },
  telegram: { status: DS.telegram.enabled   ? 'idle' : 'disabled', members: null, lastSync: null, error: null },
  aliexpress:{ status: DS.aliexpress.enabled ? 'idle' : 'disabled', lastSync: null, error: null },
  sheets:   { status: DS.sheets.enabled     ? 'idle' : 'disabled', lastSync: null, error: null },
})

// ── Store ─────────────────────────────────────────────────────────────────────

export const useJarvisStore = create((set, get) => ({
  // ── Data ──
  agents:        MOCK_AGENTS,
  products:      MOCK_PRODUCTS,
  insights:      MOCK_INSIGHTS,
  kpi:           MOCK_KPI,
  performance:   MOCK_PERFORMANCE,
  categories:    MOCK_CATEGORIES,
  recentRuns:    [],        // GitHub Actions recent runs from JARVIS API
  jarvisSettings:{},        // JARVIS config (products_per_day, min_score, etc.)
  jarvisBrain:   null,      // { active, model, status, version }
  jarvisSchedule:[],        // 15 daily run times

  // ── Pipeline health (from /pipeline-health — refreshes every 5 min) ──
  pipelineHealth: {
    lastRunAt:       null,    // ISO timestamp of last run
    lastRunStatus:   'unknown', // 'success' | 'failed' | 'unknown'
    lastSuccessAt:   null,
    lastFailureAt:   null,
    todayPublished:  0,
    todayDiscovered: 0,
    todayRuns:       0,
    todayFailed:     0,
    agentStatus:          {},  // TALIA/GAL/SHIR/ANDY/PELEG → {status, detail, ts}
    scheduledAgentStatus: {},  // ROMI/AGAM/OLIVE → {status, detail, ts}
    alerts:               [],  // active alerts [{type, msg, ts}]
    lastSync:        null,
  },
  lastHealthSync: 0,          // timestamp — rate-limit to 5 min

  // ── UI state ──
  activeTab:   'overview',
  loading:     false,
  lastUpdate:  new Date().toLocaleTimeString('he-IL'),
  dataSource:  'mock',   // 'mock' | 'vault' | 'live'

  // ── Connection status ──
  sources:       mkSources(),
  lastVaultSync: 0,      // 0 = force fetch on first load
  lastJarvisSync:0,      // 0 = force fetch on first load

  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Main refresh ────────────────────────────────────────────────────────────
  refreshData: async () => {
    if (get().loading) return
    set({ loading: true })

    const updates = {}
    const src = JSON.parse(JSON.stringify(get().sources))  // deep clone

    const now = Date.now()
    const vaultAge  = get().lastVaultSync  ? now - get().lastVaultSync  : Infinity
    const jarvisAge = get().lastJarvisSync ? now - get().lastJarvisSync : Infinity
    const vaultRefreshMs  = DS.refresh.vault
    const jarvisRefreshMs = DS.refresh.jarvis

    // ── 0. JARVIS Flask API (Render) — agents status + recent runs ────────────
    if (jarvisAge > jarvisRefreshMs) {
      try {
        src.jarvis.status = 'syncing'
        set({ sources: { ...src } })

        const [jarvisStatus, jarvisSystem] = await Promise.all([
          fetchJarvisStatus(),
          fetchJarvisSystem(),
        ])

        if (jarvisStatus.ok) {
          // Merge JARVIS agent definitions with vault activity data
          const vaultAgents = get().agents
          const mergedAgents = jarvisStatus.agents.map(ja => {
            // Match by name (TALYA=TALIA normalise)
            const normalise = n => n.replace(/Y$/i, 'A').toUpperCase()
            const vaultMatch = vaultAgents.find(
              va => normalise(va.name) === normalise(ja.name)
            )
            return {
              ...ja,
              tasks:   vaultMatch?.tasks   || ja.tasks   || 0,
              success: vaultMatch?.success || ja.success || 85,
            }
          })

          updates.agents      = mergedAgents
          updates.recentRuns  = jarvisStatus.recentRuns
          updates.jarvisSettings = jarvisStatus.settings
          updates.jarvisSchedule = jarvisStatus.schedule

          src.jarvis = {
            status:   'live',
            lastSync: new Date().toLocaleTimeString('he-IL'),
            brain:    jarvisSystem.ok ? jarvisSystem.brain : null,
            error:    null,
          }
          updates.jarvisBrain = jarvisSystem.ok ? jarvisSystem.brain : null
          updates.lastJarvisSync = now
          if (!updates.dataSource) updates.dataSource = 'vault'
        } else {
          src.jarvis = { status: 'error', lastSync: new Date().toLocaleTimeString('he-IL'),
                         brain: null, error: jarvisStatus.error || 'unknown' }
        }
      } catch (err) {
        src.jarvis = { status: 'error', lastSync: new Date().toLocaleTimeString('he-IL'),
                       brain: null, error: err.message }
      }
    }

    // ── 1. GitHub Vault (primary data — rate-limited to every 10 min) ─────────
    if (DS.vault.enabled && vaultAge > vaultRefreshMs) {
      try {
        src.vault.status = 'syncing'
        set({ sources: { ...src } })

        const vault = await fetchVaultData()

        if (vault.ok) {
          if (vault.products?.length > 0)   updates.products    = vault.products
          if (vault.insights?.length > 0)   updates.insights    = vault.insights
          if (vault.agents?.length > 0)     updates.agents      = vault.agents
          if (vault.performance?.length > 0) updates.performance = vault.performance
          if (vault.kpi)                    updates.kpi         = mergeKPI(get().kpi, vault.kpi)

          updates.dataSource = 'vault'
          src.vault = {
            status:   'live',
            lastSync: new Date().toLocaleTimeString('he-IL'),
            meta:     vault.meta,
            error:    null,
          }
          updates.lastVaultSync = now
        } else {
          src.vault = { status: 'error', lastSync: new Date().toLocaleTimeString('he-IL'),
                        meta: null, error: vault.reason }
        }
      } catch (err) {
        src.vault = { status: 'error', lastSync: new Date().toLocaleTimeString('he-IL'),
                      meta: null, error: err.message }
      }
    } else if (DS.vault.enabled && vaultAge <= vaultRefreshMs) {
      // Already fresh — keep existing status
      src.vault.status = src.vault.status === 'syncing' ? 'live' : src.vault.status
    }

    // ── 2. Google Sheets (optional — only if VITE_SHEET_ID is configured) ──────
    if (DS.sheets.enabled) {
      try {
        src.sheets.status = 'syncing'
        const sheets = await fetchSheetsData()
        if (sheets.source.ok) {
          if (sheets.products?.length > 0 && !updates.products) updates.products = sheets.products
          if (sheets.insights?.length > 0 && !updates.insights) updates.insights = sheets.insights
          if (sheets.kpi) updates.kpi = mergeKPI(updates.kpi || get().kpi, sheets.kpi)
          src.sheets = { status: 'live', lastSync: new Date().toLocaleTimeString('he-IL'),
                         tabsLoaded: sheets.source.tabsLoaded, totalTabs: sheets.source.totalTabs, error: null }
          if (!updates.dataSource) updates.dataSource = 'sheets'
        } else {
          src.sheets = { status: 'error', lastSync: new Date().toLocaleTimeString('he-IL'), error: 'No data' }
        }
      } catch (err) {
        src.sheets = { status: 'error', lastSync: new Date().toLocaleTimeString('he-IL'), error: err.message }
      }
    }

    // ── 3. Telegram members — via GARVIS backend (token stays server-side) ──────
    //    Falls back to direct Telegram API if GARVIS endpoint not available.
    {
      try {
        src.telegram.status = 'syncing'
        const garvisBase = DS.jarvis.baseUrl
        let tgMembers = null
        let tgUsername = ''

        // Primary: GARVIS server-side endpoint (no token in browser)
        try {
          const res  = await fetch(`${garvisBase}/telegram-members`, { cache: 'no-store' })
          const json = await res.json()
          if (json.ok && json.members > 0) {
            tgMembers  = json.members
            tgUsername = json.username || ''
          }
        } catch (_) { /* fall through to direct API */ }

        // Fallback: direct Telegram Bot API (if VITE_TELEGRAM_TOKEN is in build)
        if (tgMembers === null && DS.telegram.enabled) {
          const tg = await fetchTelegramStats()
          if (tg.ok && tg.memberCount) {
            tgMembers  = tg.memberCount
            tgUsername = tg.username || ''
          }
        }

        if (tgMembers !== null) {
          const kpi = updates.kpi || get().kpi
          updates.kpi = { ...kpi, communityMembers: tgMembers }
          src.telegram = { status: 'live', members: tgMembers, channel: tgUsername,
                           lastSync: new Date().toLocaleTimeString('he-IL'), error: null }
          if (!updates.dataSource) updates.dataSource = 'vault'
        } else {
          src.telegram = { status: 'error', members: null,
                           lastSync: new Date().toLocaleTimeString('he-IL'),
                           error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL not set on Render' }
        }
      } catch (err) {
        src.telegram.status = 'error'
        src.telegram.error  = err.message
      }
    }

    // ── 4. AliExpress — real revenue/orders/clicks from GARVIS /ae-analytics ──
    //    This single endpoint returns today, this week, this month, year-to-date.
    //    Does NOT rely on VITE_AE_APP_KEY in the build — keys stay on Render.
    {
      try {
        src.aliexpress.status = 'syncing'
        const garvisBase = DS.jarvis.baseUrl
        const res  = await fetch(`${garvisBase}/ae-analytics`, { cache: 'no-store' })
        const json = await res.json()
        if (json.ok && json.data) {
          const d   = json.data
          const kpi = updates.kpi || get().kpi

          // Revenue in ILS (calendar periods)
          const revenueToday  = d.revenue_today_ils  ?? 0
          const revenueWeek   = d.revenue_week_ils   ?? 0
          const revenueMonth  = d.revenue_month_ils  ?? 0

          // Orders
          const ordersToday   = d.orders_today  ?? 0
          const ordersWeek    = d.orders_week   ?? 0
          const ordersMonth   = d.orders_month  ?? 0

          // Clicks (Bitly)
          const clicksToday   = d.clicks_today  ?? 0
          const clicksWeek    = d.clicks_week   ?? 0
          const clicksMonth   = d.clicks_month  ?? 0

          // CTR: orders this month / clicks this month
          const ctr = clicksMonth > 0
            ? Math.round((ordersMonth / clicksMonth) * 100 * 10) / 10
            : 0

          // Top product name
          const topProduct = d.top_products?.[0]?.name || kpi.topProduct || '—'

          updates.kpi = {
            ...kpi,
            revenueToday,
            revenueWeek,
            revenueMonth,
            ordersToday,
            clicksToday,
            ctr,
            topProduct,
          }
          updates.dataSource = 'live'
          src.aliexpress = {
            status:   'live',
            lastSync: new Date().toLocaleTimeString('he-IL'),
            error:    Object.keys(d.errors || {}).length
                        ? JSON.stringify(d.errors) : null,
          }
        } else {
          src.aliexpress = {
            status:   'error',
            lastSync: new Date().toLocaleTimeString('he-IL'),
            error:    json.error || 'ae-analytics failed',
          }
        }
      } catch (err) {
        src.aliexpress.status = 'error'
        src.aliexpress.error  = err.message
      }
    }

    // ── 5. Pipeline health — refreshes every 5 min ───────────────────────────
    {
      const HEALTH_TTL = 5 * 60 * 1000
      const healthAge  = get().lastHealthSync ? now - get().lastHealthSync : Infinity
      if (healthAge > HEALTH_TTL) {
        try {
          const garvisBase = DS.jarvis.baseUrl
          const res  = await fetch(`${garvisBase}/pipeline-health`, { cache: 'no-store' })
          const json = await res.json()
          if (json.ok) {
            const s = json.summary || {}
            const newAlerts = json.alerts || []

            // Inject pipeline alerts into the insights feed
            if (newAlerts.length > 0 && !updates.insights) {
              const existingInsights = get().insights || []
              const alertInsights = newAlerts.map(a => ({
                type:  a.type === 'critical' ? 'critical' : 'warning',
                agent: 'AGAM',
                msg:   a.msg,
                time:  a.ts || 'כעת',
              }))
              // Prepend alerts, keep max 10 total
              const dedupedInsights = [
                ...alertInsights,
                ...existingInsights.filter(i => i.type !== 'critical'),
              ].slice(0, 10)
              updates.insights = dedupedInsights
            }

            // Fetch ROMI/AGAM/OLIVE health in parallel (GAP-07 fix)
            let scheduledStatus = get().pipelineHealth?.scheduledAgentStatus || {}
            try {
              const schRes  = await fetch(`${garvisBase}/scheduled-agents-health`, { cache: 'no-store' })
              const schJson = await schRes.json()
              if (schJson.ok && schJson.agents) scheduledStatus = schJson.agents
            } catch (_) { /* non-blocking */ }

            updates.pipelineHealth = {
              lastRunAt:            s.last_run_at       || null,
              lastRunStatus:        s.last_run_status   || 'unknown',
              lastSuccessAt:        s.last_success_at   || null,
              lastFailureAt:        s.last_failure_at   || null,
              todayPublished:       s.today_published   || 0,
              todayDiscovered:      s.today_discovered  || 0,
              todayRuns:            s.today_runs        || 0,
              todayFailed:          s.today_failed_runs || 0,
              agentStatus:          json.agent_status   || {},
              scheduledAgentStatus: scheduledStatus,
              alerts:               newAlerts,
              lastSync:             new Date().toLocaleTimeString('he-IL'),
            }
            updates.lastHealthSync = now
          }
        } catch (_) {
          // non-blocking — pipeline health is informational only
        }
      }
    }

    // ── Commit ────────────────────────────────────────────────────────────────
    set({
      ...updates,
      loading:    false,
      lastUpdate: new Date().toLocaleTimeString('he-IL'),
      sources:    { ...src },
      dataSource: updates.dataSource || get().dataSource,
    })
  },
}))
