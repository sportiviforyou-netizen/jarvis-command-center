import { useEffect, useState } from 'react'
import { useJarvisStore } from './store/useJarvisStore'
import { useVoiceStore }  from './store/useVoiceStore'
import { triggerAffiliateRun } from './services/jarvisApiService'
import AnimatedBackground  from './components/AnimatedBackground'
import HUDHeader           from './components/HUDHeader'
import CoreOrb             from './components/CoreOrb'
import OrbitalAgents       from './components/OrbitalAgents'
import TacticalKPI         from './components/TacticalKPI'
import IntelTable          from './components/IntelTable'
import IntelFeed           from './components/IntelFeed'
import PerformanceChart    from './components/PerformanceChart'
import SaleToast           from './components/SaleToast'
import StatusTicker        from './components/StatusTicker'
import DataSourceStatus    from './components/DataSourceStatus'
import AliExpressPanel     from './components/AliExpressPanel'
import VoicePanelFloat     from './components/VoicePanelFloat'

/* ── COMMAND TAB ────────────────────────────────────────────────────────────── */
function CommandView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── HERO: KPI | ORB+AGENTS | FEED ───────────────────────────────── */}
      <div className="cmd-grid" style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 300px',
        gap: 16,
        alignItems: 'start',
      }}>

        {/* LEFT — Tactical KPI readout */}
        <div style={{
          background: 'oklch(9% 0.012 250)',
          border: '1px solid oklch(20% 0.02 250)',
          borderRadius: 4,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 8, letterSpacing: 4, color: 'oklch(55% 0.12 210)', marginBottom: 4 }}>
            ◈ TACTICAL KPI
          </div>
          <TacticalKPI />
        </div>

        {/* CENTER — Orbital agent map with orb */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', minHeight: 580,
        }}>
          {/* Fine crosshair */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `
              linear-gradient(to bottom, transparent calc(50% - 0.5px), oklch(78% 0.15 210 / 0.05) calc(50% - 0.5px), oklch(78% 0.15 210 / 0.05) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
              linear-gradient(to right,  transparent calc(50% - 0.5px), oklch(78% 0.15 210 / 0.05) calc(50% - 0.5px), oklch(78% 0.15 210 / 0.05) calc(50% + 0.5px), transparent calc(50% + 0.5px))
            `,
          }} />

          <div style={{ position: 'relative', width: 560, height: 560 }}>
            <OrbitalAgents />
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
            }}>
              <CoreOrb />
            </div>
          </div>
        </div>

        {/* RIGHT — Intel Feed */}
        <IntelFeed />
      </div>

      {/* ── BOTTOM: Table + Chart ────────────────────────────────────────── */}
      <div className="bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>
        <IntelTable />
        <PerformanceChart />
      </div>

    </div>
  )
}

/* ── INTEL TAB ──────────────────────────────────────────────────────────────── */
function IntelView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <IntelTable />
      <PerformanceChart />
    </div>
  )
}

/* ── JARVIS RUNS PANEL ──────────────────────────────────────────────────────── */
function JarvisRunsPanel() {
  const { recentRuns, jarvisSettings, jarvisSchedule, jarvisBrain, sources, refreshData } = useJarvisStore()
  const [triggering, setTriggering] = useState(false)
  const [trigMsg, setTrigMsg]       = useState(null)

  async function handleTrigger() {
    setTriggering(true)
    setTrigMsg(null)
    const result = await triggerAffiliateRun()
    setTriggering(false)
    setTrigMsg(result.ok ? '✓ הריצה הופעלה' : `✗ ${result.error}`)
    if (result.ok) setTimeout(() => { setTrigMsg(null); refreshData() }, 4000)
    else setTimeout(() => setTrigMsg(null), 5000)
  }

  const conclusionStyle = (c) => ({
    color: c === 'success'   ? 'var(--green)'
         : c === 'failure'   ? 'oklch(62% 0.22 25)'
         : c === 'cancelled' ? 'var(--amber)'
         : 'var(--text-dim)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Brain status + trigger */}
      <div style={{
        background: 'oklch(9% 0.012 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)' }}>JARVIS ENGINE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className={`dot ${sources.jarvis?.status === 'live' ? 'dot-green' : 'dot-amber'}`} style={{ width: 5, height: 5 }} />
            <span style={{ fontSize: 7, letterSpacing: 2, color: sources.jarvis?.status === 'live' ? 'var(--green)' : 'var(--amber)' }}>
              {sources.jarvis?.status?.toUpperCase() || 'IDLE'}
            </span>
          </div>
        </div>

        {jarvisBrain && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {[
              { l: 'BRAIN',    v: jarvisBrain.active  || '—' },
              { l: 'MODEL',    v: jarvisBrain.model    || '—' },
              { l: 'VERSION',  v: `v${jarvisBrain.version || '—'}` },
              { l: 'STATUS',   v: (jarvisBrain.status  || '—').toUpperCase() },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: 'oklch(7% 0.01 250)', borderRadius: 3, padding: '5px 8px' }}>
                <div style={{ fontSize: 6, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--cyan)', letterSpacing: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Settings */}
        {Object.keys(jarvisSettings).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
            {[
              { l: 'מוצרים/יום',    v: jarvisSettings.products_per_day },
              { l: 'ציון מינימום', v: jarvisSettings.min_score },
              { l: 'מחיר',         v: jarvisSettings.price_range },
              { l: 'מיון',         v: 'VOLUME ↓' },
            ].filter(s => s.v).map(({ l, v }) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                     padding: '3px 6px', borderBottom: '1px solid oklch(16% 0.015 250)' }}>
                <span style={{ fontSize: 7, color: 'var(--text-dim)', fontFamily: 'var(--font-heb)' }}>{l}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trigger button */}
        <button
          onClick={handleTrigger}
          disabled={triggering}
          style={{
            width: '100%',
            background: triggering ? 'transparent' : 'oklch(78% 0.15 210 / 0.08)',
            border: '1px solid oklch(78% 0.15 210 / 0.3)',
            color: trigMsg?.startsWith('✓') ? 'var(--green)'
                 : trigMsg?.startsWith('✗') ? 'oklch(62% 0.22 25)'
                 : 'var(--cyan)',
            padding: '7px 0', borderRadius: 3,
            fontSize: 8, letterSpacing: 3, fontFamily: 'var(--font-mono)',
            cursor: triggering ? 'wait' : 'pointer',
            transition: 'all 200ms var(--ease-out)',
          }}
        >
          {triggering ? '◌ מפעיל…' : trigMsg || '▶ TRIGGER RUN NOW'}
        </button>
      </div>

      {/* Recent GitHub Actions runs */}
      <div style={{
        background: 'oklch(9% 0.012 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4, padding: '12px 14px',
      }}>
        <div style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 10 }}>
          RECENT RUNS · GITHUB ACTIONS
        </div>
        {recentRuns.length === 0 ? (
          <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>
            טוען ריצות…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {recentRuns.slice(0, 8).map((r, i) => (
              <a
                key={r.id || i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 6px', borderRadius: 2,
                  background: 'oklch(7% 0.01 250)',
                  textDecoration: 'none',
                  border: '1px solid oklch(16% 0.015 250)',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'oklch(12% 0.015 250)'}
                onMouseLeave={e => e.currentTarget.style.background = 'oklch(7% 0.01 250)'}
              >
                <span style={{ fontSize: 9, ...conclusionStyle(r.conclusion) }}>
                  {r.conclusion === 'success' ? '✓' : r.conclusion === 'failure' ? '✗' : '◌'}
                </span>
                <span style={{ fontSize: 7, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flex: 1, letterSpacing: 1 }}>
                  {r.time}
                </span>
                <span style={{ fontSize: 7, letterSpacing: 1, ...conclusionStyle(r.conclusion), fontFamily: 'var(--font-mono)' }}>
                  {(r.conclusion || 'unknown').toUpperCase()}
                </span>
                <span style={{ fontSize: 7, color: 'oklch(40% 0.05 250)', fontFamily: 'var(--font-mono)' }}>↗</span>
              </a>
            ))}
          </div>
        )}
        {/* Schedule */}
        {jarvisSchedule.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 6px', background: 'oklch(7% 0.01 250)', borderRadius: 2 }}>
            <div style={{ fontSize: 6, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 4 }}>DAILY SCHEDULE IST</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {jarvisSchedule.map((t) => (
                <span key={t} style={{ fontSize: 6, fontFamily: 'var(--font-mono)', color: 'oklch(45% 0.08 210)',
                                       padding: '1px 4px', border: '1px solid oklch(18% 0.02 250)', borderRadius: 2 }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

/* ── AGENTS TAB — impeccable: no identical card grid ───────────────────────── */
function AgentsView() {
  const { agents } = useJarvisStore()

  // Impeccable: each agent has distinct visual treatment based on role/status
  // This is a status ROSTER, not a 4×2 identical card grid.
  const ROLE_COLORS = {
    TALIA:  'var(--cyan)',
    GAL:    'var(--purple)',
    SHIR:   'var(--amber)',
    PELEG:  'var(--green)',
    ROMI:   'oklch(65% 0.22 340)',
    AGAM:   'var(--cyan)',
    OLIVE:  'var(--green)',
    ANDY:   'var(--amber)',
  }

  const active  = agents.filter(a => a.status === 'active')
  const standby = agents.filter(a => a.status !== 'active')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

      {/* LEFT: Primary roster — active agents get more visual weight */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

        <div style={{ fontSize: 8, letterSpacing: 4, color: 'var(--text-dim)', marginBottom: 10 }}>
          ACTIVE AGENTS · {active.length}/{agents.length} ONLINE
        </div>

        {/* Active agents — full readout rows */}
        {active.map((a, i) => {
          const color = ROLE_COLORS[a.name] || 'var(--cyan)'
          return (
            <div key={a.id} style={{
              background: 'oklch(10% 0.015 250)',
              border: `1px solid ${color.includes('var') ? 'oklch(20% 0.02 250)' : color + '20'}`,
              borderRadius: 3,
              padding: '11px 14px',
              display: 'grid',
              gridTemplateColumns: '28px 1fr 80px 80px 60px',
              alignItems: 'center', gap: 12,
              animation: `stagger-in 200ms var(--ease-out) both`,
              animationDelay: `${i * 40}ms`,
            }}>
              {/* Rank */}
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>
                {String(i + 1).padStart(2, '0')}
              </div>

              {/* Identity */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <div className="dot dot-green" style={{ width: 5, height: 5 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: 2 }}>{a.name}</span>
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>{a.role}</div>
              </div>

              {/* Tasks */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: 1 }}>{a.tasks}</div>
                <div style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)' }}>TASKS</div>
              </div>

              {/* Success */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{a.success}%</div>
                <div style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)' }}>SUCCESS</div>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ height: 2, background: 'oklch(16% 0.015 250)', borderRadius: 1 }}>
                  <div style={{
                    width: `${a.success}%`, height: '100%', borderRadius: 1,
                    background: 'var(--green)',
                    boxShadow: '0 0 6px var(--green)',
                    transition: 'width 0.8s var(--ease-out)',
                  }} />
                </div>
              </div>
            </div>
          )
        })}

        {/* Standby agents — compact rows, less visual weight */}
        {standby.length > 0 && (
          <>
            <div style={{ fontSize: 8, letterSpacing: 4, color: 'var(--text-dim)', margin: '14px 0 8px' }}>
              STANDBY
            </div>
            {standby.map((a, i) => (
              <div key={a.id} style={{
                background: 'transparent',
                border: '1px solid oklch(16% 0.015 250)',
                borderRadius: 3, padding: '8px 14px',
                display: 'grid',
                gridTemplateColumns: '28px 1fr 80px 80px 60px',
                alignItems: 'center', gap: 12,
                opacity: 0.55,
                animation: `stagger-in 200ms var(--ease-out) both`,
                animationDelay: `${(active.length + i) * 40}ms`,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {String(active.length + i + 1).padStart(2, '0')}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <div className="dot dot-amber" style={{ width: 5, height: 5 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', letterSpacing: 2 }}>{a.name}</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>{a.role}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dim)' }}>{a.tasks}</div>
                  <div style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)' }}>TASKS</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--amber)' }}>{a.success}%</div>
                  <div style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)' }}>SUCCESS</div>
                </div>
                <div>
                  <div style={{ height: 2, background: 'oklch(16% 0.015 250)', borderRadius: 1 }}>
                    <div style={{ width: `${a.success}%`, height: '100%', borderRadius: 1, background: 'var(--amber)' }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* RIGHT: JARVIS live runs + trigger */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'TOTAL TASKS',   value: agents.reduce((s, a) => s + a.tasks, 0),   color: 'var(--cyan)'   },
            { label: 'AVG SUCCESS',   value: `${Math.round(agents.reduce((s,a) => s + a.success, 0) / (agents.length||1))}%`, color: 'var(--green)' },
            { label: 'ACTIVE',        value: `${active.length}/${agents.length}`,        color: 'var(--amber)'  },
            { label: 'PLATFORM',      value: 'GitHub',                                   color: 'var(--text-dim)' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'oklch(9% 0.012 250)',
              border: '1px solid oklch(20% 0.02 250)',
              borderRadius: 3, padding: '8px 10px',
            }}>
              <div style={{ fontSize: 6, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color, textShadow: `0 0 10px ${s.color}60` }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* JARVIS live runs panel */}
        <JarvisRunsPanel />
      </div>
    </div>
  )
}

/* ── METRICS TAB ────────────────────────────────────────────────────────────── */
function MetricsView() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{
        background: 'oklch(9% 0.012 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4, padding: '14px 16px',
      }}>
        <TacticalKPI />
      </div>
      <PerformanceChart />
    </div>
  )
}

/* ── AI CORE TAB ────────────────────────────────────────────────────────────── */
function AIView() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      <IntelFeed />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <JarvisRunsPanel />
        <PerformanceChart />
      </div>
    </div>
  )
}

/* ── ALIEXPRESS PERFORMANCE CENTER TAB ─────────────────────────────────────── */
function AliExpressView() {
  return (
    <div style={{ maxWidth: 1200 }}>
      <AliExpressPanel />
    </div>
  )
}

/* ── ROOT APP ───────────────────────────────────────────────────────────────── */
export default function App() {
  const { activeTab, refreshData } = useJarvisStore()
  const { voiceOpen, setVoiceOpen } = useVoiceStore()
  const REFRESH_MS = Number(import.meta.env.VITE_REFRESH_KPI) || 60_000

  useEffect(() => {
    refreshData()
    const id = setInterval(refreshData, REFRESH_MS)
    const ping = () => fetch('https://jarvis-command-center-1-0.onrender.com/ping', { cache: 'no-store' }).catch(() => {})
    ping()
    const pingId = setInterval(ping, 4 * 60 * 1000)
    return () => { clearInterval(id); clearInterval(pingId) }
  }, [])

  const views = {
    overview:   <CommandView />,
    products:   <IntelView />,
    agents:     <AgentsView />,
    aliexpress: <AliExpressView />,
    analytics:  <MetricsView />,
    insights:   <AIView />,
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <AnimatedBackground />
      <div className="scanlines" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <HUDHeader />
        <DataSourceStatus />
        <main style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 28px 80px' }}>
          {views[activeTab] || <CommandView />}
        </main>
      </div>
      {/* Fixed overlays */}
      <SaleToast />
      <StatusTicker />
      {/* ── Floating voice panel ─────────────────────────────────────────────── */}
      <VoicePanelFloat open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  )
}
