/**
 * JARVIS API Service — connects to the live JARVIS Flask backend on Render.
 *
 * Base URL: https://jarvis-command-center-1-0.onrender.com
 *
 * Endpoints used:
 *   GET /sportivi-status  → 7 agents, recent GitHub Actions runs, settings
 *   GET /system-status    → brain status, memory files, tools
 *   POST /trigger-affiliate → manually fire a workflow run
 */

const JARVIS_BASE = 'https://jarvis-command-center-1-0.onrender.com'

// ── Helpers ────────────────────────────────────────────────────────────────────

function toRelativeTime(iso) {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 2)   return 'עכשיו'
    if (mins < 60)  return `לפני ${mins} דק'`
    const hrs = Math.floor(mins / 60)
    if (hrs  < 24)  return `לפני ${hrs} שעות`
    return `לפני ${Math.floor(hrs / 24)} ימים`
  } catch { return '' }
}

// ── Sportivi status ────────────────────────────────────────────────────────────

/**
 * Fetch live JARVIS agent status + recent GitHub Actions runs.
 * Returns:
 *   { ok, agents, recentRuns, settings, schedule, actionsUrl, error? }
 */
export async function fetchJarvisStatus() {
  try {
    const res = await fetch(`${JARVIS_BASE}/sportivi-status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    // Map agents to dashboard format
    const agents = (data.agents || []).map(a => ({
      id:       a.id,
      name:     a.name,
      role:     a.role,
      icon:     a.icon || '🤖',
      status:   a.status === 'scheduled' ? 'idle' : (a.status || 'idle'),
      desc:     a.description || '',
      tasks:    0,   // will be enriched by vault data
      success:  0,
    }))

    // Map recent GitHub Actions runs to insight format
    const recentRuns = (data.recent_runs || []).slice(0, 8).map(r => ({
      id:         r.id,
      name:       r.name,
      status:     r.status,
      conclusion: r.conclusion,           // 'success' | 'failure' | 'cancelled'
      startedAt:  r.started_at,
      url:        r.url,
      time:       toRelativeTime(r.started_at),
    }))

    return {
      ok:         true,
      agents,
      recentRuns,
      settings:   data.settings   || {},
      schedule:   data.schedule   || [],
      actionsUrl: data.actions_url || '',
      hasToken:   data.has_token   || false,
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ── System status ──────────────────────────────────────────────────────────────

/**
 * Fetch JARVIS brain + tools status.
 * Returns: { ok, brain, tools, timestamp, error? }
 */
export async function fetchJarvisSystem() {
  try {
    const res = await fetch(`${JARVIS_BASE}/system-status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      ok:        true,
      brain:     data.brain      || {},
      tools:     data.tools      || {},
      timestamp: data.timestamp  || '',
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ── Trigger workflow ───────────────────────────────────────────────────────────

/**
 * Manually trigger a JARVIS affiliate workflow run.
 * Returns: { ok, message, error? }
 */
export async function triggerAffiliateRun() {
  try {
    const res = await fetch(`${JARVIS_BASE}/trigger-affiliate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
    return { ok: true, message: data.message || 'הריצה הופעלה' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
