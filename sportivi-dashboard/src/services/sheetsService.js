/**
 * Google Sheets service — reads all dashboard data from a public Google Sheet.
 *
 * SHEET SCHEMA (create these tabs in your sheet):
 * ─────────────────────────────────────────────
 * Tab: KPI_Daily
 *   Columns: תאריך | הכנסה יומית | הזמנות | קליקים | CTR | ROAS | חברי קהילה | WhatsApp CTR | מוצר מוביל
 *
 * Tab: Products
 *   Columns: ID | שם | keyword | מחיר | score | קליקים | מכירות | CTR | trend
 *
 * Tab: Insights
 *   Columns: זמן | type | agent | הודעה
 *
 * Tab: Performance_7D
 *   Columns: תאריך | הכנסה | קליקים | מכירות
 *
 * Tab: Agents
 *   Columns: שם | role | status | tasks | success
 */

import { DS } from '../config/dataSources'

// ── Core reader ───────────────────────────────────────────────────────────────

async function readTab(tabName) {
  const { sheetId } = DS.sheets
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&_=${Date.now()}`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for tab "${tabName}"`)

  const text = await res.text()
  // Strip Google's JSONP wrapper: google.visualization.Query.setResponse({...});
  const jsonStr = text.replace(/^[^{]*/, '').replace(/\s*;\s*$/, '')
  const json = JSON.parse(jsonStr)

  if (!json?.table?.cols) throw new Error(`Empty table for tab "${tabName}"`)

  const cols = json.table.cols.map(c => (c.label || c.id || '').trim())
  const rows = (json.table.rows || [])
    .filter(r => r?.c?.some(c => c?.v != null))
    .map(r =>
      Object.fromEntries(
        cols.map((col, i) => [col, r.c?.[i]?.v ?? null])
      )
    )

  return rows
}

// ── Column lookup — handles Hebrew + English + aliases ────────────────────────

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return v
  }
  return null
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapKPI(row) {
  return {
    revenueToday:    Number(pick(row, 'הכנסה יומית', 'revenue_today', 'Revenue')) || 0,
    ordersToday:     Number(pick(row, 'הזמנות', 'orders', 'Orders'))              || 0,
    clicksToday:     Number(pick(row, 'קליקים', 'clicks', 'Clicks'))              || 0,
    ctr:             Number(pick(row, 'CTR', 'ctr'))                              || 0,
    roas:            Number(pick(row, 'ROAS', 'roas'))                            || 0,
    communityMembers:Number(pick(row, 'חברי קהילה', 'community', 'Members'))      || 0,
    whatsappCtr:     Number(pick(row, 'WhatsApp CTR', 'wa_ctr'))                  || 0,
    topProduct:      String(pick(row, 'מוצר מוביל', 'top_product') || ''),
    // Derived
    revenueWeek:     Number(pick(row, 'הכנסה שבוע', 'revenue_week'))              || 0,
    revenueMonth:    Number(pick(row, 'הכנסה חודש', 'revenue_month'))             || 0,
    profitPerProduct:Number(pick(row, 'רווח למוצר', 'profit_per_product'))        || 0,
  }
}

function mapProduct(row, index) {
  return {
    id:      String(pick(row, 'ID', 'id') || `P${String(index + 1).padStart(3, '0')}`),
    name:    String(pick(row, 'שם', 'name', 'Name') || ''),
    keyword: String(pick(row, 'keyword', 'Keyword', 'מילת מפתח') || ''),
    price:   Number(pick(row, 'מחיר', 'price', 'Price'))  || 0,
    score:   Number(pick(row, 'score', 'Score', 'ציון'))  || 0,
    clicks:  Number(pick(row, 'קליקים', 'clicks'))        || 0,
    sales:   Number(pick(row, 'מכירות', 'sales'))         || 0,
    ctr:     String(pick(row, 'CTR', 'ctr') || '0%'),
    trend:   String(pick(row, 'trend', 'Trend', 'טרנד') || 'flat'),
  }
}

function mapInsight(row) {
  return {
    time:  String(pick(row, 'זמן', 'time', 'Time') || ''),
    type:  String(pick(row, 'type', 'Type', 'סוג') || 'info').toLowerCase(),
    agent: String(pick(row, 'agent', 'Agent', 'סוכן') || ''),
    msg:   String(pick(row, 'הודעה', 'message', 'Message') || ''),
  }
}

function mapPerformance(row) {
  return {
    date:    String(pick(row, 'תאריך', 'date', 'Date') || ''),
    revenue: Number(pick(row, 'הכנסה', 'revenue', 'Revenue')) || 0,
    clicks:  Number(pick(row, 'קליקים', 'clicks', 'Clicks'))  || 0,
    sales:   Number(pick(row, 'מכירות', 'sales', 'Sales'))     || 0,
  }
}

function mapAgent(row) {
  return {
    id:      Number(pick(row, 'ID', 'id')) || 0,
    name:    String(pick(row, 'שם', 'name', 'Name') || '').toUpperCase(),
    role:    String(pick(row, 'role', 'Role', 'תפקיד') || ''),
    status:  String(pick(row, 'status', 'Status', 'סטטוס') || 'idle').toLowerCase(),
    tasks:   Number(pick(row, 'tasks', 'Tasks', 'משימות')) || 0,
    success: Number(pick(row, 'success', 'Success', 'הצלחה')) || 0,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all dashboard data from Google Sheets in parallel.
 * Returns { kpi, products, insights, performance, agents, sources }
 * where sources.sheets = { ok, error?, tabsLoaded }
 */
export async function fetchSheetsData() {
  const { tabs } = DS.sheets
  const results = {}
  let tabsLoaded = 0

  // Fetch all tabs in parallel, fail gracefully per-tab
  const [kpiRows, productRows, insightRows, perfRows, agentRows] = await Promise.all([
    readTab(tabs.kpi).catch(e => { results.kpiError = e.message; return [] }),
    readTab(tabs.products).catch(e => { results.productsError = e.message; return [] }),
    readTab(tabs.insights).catch(e => { results.insightsError = e.message; return [] }),
    readTab(tabs.performance).catch(e => { results.perfError = e.message; return [] }),
    readTab(tabs.agents).catch(e => { results.agentsError = e.message; return [] }),
  ])

  if (kpiRows.length)      tabsLoaded++
  if (productRows.length)  tabsLoaded++
  if (insightRows.length)  tabsLoaded++
  if (perfRows.length)     tabsLoaded++
  if (agentRows.length)    tabsLoaded++

  return {
    // Use latest row for KPI
    kpi: kpiRows.length > 0 ? mapKPI(kpiRows[kpiRows.length - 1]) : null,

    // All product rows, filter empty names
    products: productRows.map(mapProduct).filter(p => p.name),

    // Most recent insights (last 10, reversed for newest-first)
    insights: insightRows.slice(-10).reverse().map(mapInsight).filter(i => i.msg),

    // Last 7 days of performance
    performance: perfRows.slice(-7).map(mapPerformance),

    // All agents
    agents: agentRows.map(mapAgent).filter(a => a.name),

    // Source status
    source: {
      ok: tabsLoaded > 0,
      tabsLoaded,
      totalTabs: 5,
      errors: Object.keys(results).length > 0 ? results : null,
    },
  }
}
