/**
 * AliExpressPanel — real-time AliExpress Performance Center.
 *
 * Fetches from GARVIS /ae-analytics (server-side, signed, no CORS).
 * Shows: financial, commission breakdown, orders, traffic, top products.
 * Auto-refreshes every 2 minutes.  No mock data.
 */
import { useEffect, useState, useCallback } from 'react'

const GARVIS = 'https://jarvis-command-center-1-0.onrender.com'
const REFRESH_MS = 120_000   // 2 min

/* ── tiny helpers ─────────────────────────────────────────────────────────── */
const fmt = (n, dec = 0) =>
  n == null ? '—' : Number(n).toLocaleString('he-IL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const usd = n => n == null ? '—' : `$${fmt(n, 2)}`
const ils = n => n == null ? '—' : `₪${fmt(n, 2)}`

/* ── one metric tile ──────────────────────────────────────────────────────── */
function Metric({ label, value, sub, color = 'var(--cyan)', wide, highlight }) {
  return (
    <div style={{
      gridColumn: wide ? 'span 2' : undefined,
      background: highlight
        ? `oklch(12% 0.03 210 / 0.5)`
        : 'oklch(9% 0.012 250)',
      border: `1px solid ${highlight ? 'oklch(78% 0.15 210 / 0.35)' : 'oklch(20% 0.02 250)'}`,
      borderRadius: 4,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: -0.5,
                    fontFamily: 'var(--font-mono)', textShadow: `0 0 14px ${color}60` }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-heb)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/* ── status badge ─────────────────────────────────────────────────────────── */
function Badge({ ok, text }) {
  const c = ok ? 'var(--green)' : 'oklch(62% 0.22 25)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                   fontSize: 9, color: c, letterSpacing: 1 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%',
                     background: c, boxShadow: `0 0 6px ${c}`, display: 'inline-block' }} />
      {text}
    </span>
  )
}

/* ── section heading ──────────────────────────────────────────────────────── */
function SectionHead({ children }) {
  return (
    <div style={{ fontSize: 8, letterSpacing: 4, color: 'oklch(55% 0.12 210)',
                  marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
      ◈ {children}
    </div>
  )
}

/* ── main component ───────────────────────────────────────────────────────── */
export default function AliExpressPanel() {
  const [state, setState] = useState({
    loading: true,
    error:   null,
    data:    null,
    syncAt:  null,
  })

  const fetchData = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res  = await fetch(`${GARVIS}/ae-analytics`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'AE analytics error')
      setState({ loading: false, error: null, data: json.data,
                 syncAt: new Date().toLocaleTimeString('he-IL') })
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message }))
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchData])

  const { loading, error, data, syncAt } = state

  /* ── error state ── */
  if (error) return (
    <div style={{ padding: 28, textAlign: 'center', color: 'oklch(62% 0.22 25)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
      <div style={{ fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>SYNC FAILED</div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', maxWidth: 360, margin: '0 auto' }}>{error}</div>
      <button onClick={fetchData} style={{
        marginTop: 16, background: 'oklch(78% 0.15 210 / 0.08)',
        border: '1px solid oklch(78% 0.15 210 / 0.3)', color: 'var(--cyan)',
        padding: '6px 18px', borderRadius: 3, cursor: 'pointer',
        fontSize: 8, letterSpacing: 2, fontFamily: 'inherit',
      }}>⟳ RETRY</button>
    </div>
  )

  /* ── skeleton while loading ── */
  const SkeletonTile = () => (
    <div style={{ background: 'oklch(9% 0.012 250)', border: '1px solid oklch(20% 0.02 250)',
                  borderRadius: 4, padding: '12px 14px', height: 72,
                  animation: 'pulse 1.4s ease-in-out infinite' }} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'oklch(9% 0.012 250)', border: '1px solid oklch(20% 0.02 250)',
                    borderRadius: 4, padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 20 }}>🛒</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3,
                          color: 'var(--cyan)', textShadow: '0 0 10px var(--cyan)' }}>
              ALIEXPRESS PERFORMANCE CENTER
            </div>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: 2 }}>
              REAL-TIME · AFFILIATE API · {data ? '30 DAY WINDOW' : 'CONNECTING…'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {data && <Badge ok text={`SYNC ${syncAt}`} />}
          {loading && <Badge ok={false} text="SYNCING…" />}
          <button onClick={fetchData} disabled={loading} style={{
            background: 'oklch(78% 0.15 210 / 0.06)',
            border: '1px solid oklch(78% 0.15 210 / 0.22)',
            color: 'var(--cyan)', padding: '5px 12px', borderRadius: 3,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 8, letterSpacing: 2, fontFamily: 'inherit',
          }}>{loading ? '◌' : '⟳'} SYNC NOW</button>
        </div>
      </div>

      {loading && !data ? (
        /* skeleton grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array(12).fill(0).map((_, i) => <SkeletonTile key={i} />)}
        </div>
      ) : data ? (
        <>
          {/* ── FINANCIAL ── */}
          <div>
            <SectionHead>FINANCIAL</SectionHead>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Metric label="הכנסה היום"   value={ils(data.revenue_today_ils)}  sub={usd(data.revenue_today_usd)}  color="var(--cyan)"   highlight />
              <Metric label="הכנסה שבוע"   value={ils(data.revenue_week_ils)}   sub={usd(data.revenue_week_usd)}   color="var(--purple)" />
              <Metric label="הכנסה חודש"   value={ils(data.revenue_month_ils)}  sub={usd(data.revenue_month_usd)}  color="var(--purple)" />
            </div>
          </div>

          {/* ── COMMISSION BREAKDOWN ── */}
          <div>
            <SectionHead>COMMISSION BREAKDOWN</SectionHead>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Metric label="עמלה משוערת (30י)"  value={usd(data.commission_estimated)} color="var(--cyan)" />
              <Metric label="עמלה מאושרת"         value={usd(data.commission_approved)}  color="var(--green)" />
              <Metric label="עמלה ממתינה"          value={usd(data.commission_pending)}   color="var(--amber)" />
            </div>

            {/* commission bar */}
            {(data.commission_estimated > 0) && (
              <div style={{ marginTop: 10, padding: '10px 14px',
                            background: 'oklch(9% 0.012 250)', border: '1px solid oklch(20% 0.02 250)', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 6 }}>
                  <span>APPROVED</span>
                  <span>PENDING</span>
                </div>
                <div style={{ height: 6, background: 'oklch(16% 0.015 250)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, var(--green), var(--cyan))',
                    width: `${Math.min((data.commission_approved / data.commission_estimated) * 100, 100)}%`,
                    transition: 'width 0.8s ease',
                    boxShadow: '0 0 8px var(--green)',
                  }} />
                </div>
                <div style={{ marginTop: 5, fontSize: 7, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  {Math.round((data.commission_approved / data.commission_estimated) * 100)}% approved
                </div>
              </div>
            )}
          </div>

          {/* ── TRAFFIC + ORDERS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Traffic */}
            <div>
              <SectionHead>TRAFFIC (BITLY)</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Metric label="קליקים סה״כ"  value={fmt(data.clicks_total)} color="var(--cyan)" />
                <Metric label="קליקים היום"  value={fmt(data.clicks_today)} color="var(--cyan)" />
              </div>
              {data.clicks_total === 0 && (
                <div style={{ marginTop: 8, fontSize: 8, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  BITLY_TOKEN not set → no click data
                </div>
              )}
            </div>

            {/* Orders */}
            <div>
              <SectionHead>ORDERS</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <Metric label="הזמנות היום"   value={fmt(data.orders_today)}   color="var(--amber)" />
                <Metric label="הזמנות שבוע"   value={fmt(data.orders_week)}    color="var(--amber)" />
                <Metric label="הזמנות חודש"   value={fmt(data.orders_month)}   color="var(--amber)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <Metric label="הזמנות מאושרות" value={fmt(data.orders_approved)} color="var(--green)" />
                <Metric label="הזמנות ממתינות" value={fmt(data.orders_pending)}  color="var(--amber)" />
              </div>
            </div>
          </div>

          {/* ── CONVERSION ── */}
          <div style={{ background: 'oklch(9% 0.012 250)',
                        border: '1px solid oklch(20% 0.02 250)', borderRadius: 4, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 4 }}>
                  CONVERSION RATE (CLICKS → ORDERS)
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--green)',
                              textShadow: '0 0 16px var(--green)', fontFamily: 'var(--font-mono)' }}>
                  {data.conversion_rate}%
                </div>
              </div>
              <div style={{ textAlign: 'left', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>
                <div>{fmt(data.orders_month)} הזמנות</div>
                <div>{fmt(data.clicks_total)} קליקים</div>
              </div>
            </div>
          </div>

          {/* ── TOP PRODUCTS ── */}
          {data.top_products?.length > 0 && (
            <div>
              <SectionHead>TOP PRODUCTS · 30 DAYS BY COMMISSION</SectionHead>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.top_products.map((p, i) => (
                  <div key={p.id || i} style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr 90px 90px 60px',
                    alignItems: 'center', gap: 12,
                    background: i === 0 ? 'oklch(12% 0.03 210 / 0.4)' : 'oklch(9% 0.012 250)',
                    border: `1px solid ${i === 0 ? 'oklch(78% 0.15 210 / 0.3)' : 'oklch(20% 0.02 250)'}`,
                    borderRadius: 3, padding: '9px 14px',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)' }}>
                      #{i + 1}
                    </div>
                    <div style={{ fontFamily: 'var(--font-heb)', fontSize: 11,
                                  color: i === 0 ? 'var(--cyan)' : 'var(--text)', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber)',
                                    fontFamily: 'var(--font-mono)' }}>
                        {p.orders}
                      </div>
                      <div style={{ fontSize: 6, letterSpacing: 2, color: 'var(--text-dim)' }}>ORDERS</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--green)',
                                    fontFamily: 'var(--font-mono)' }}>
                        {usd(p.commission_usd)}
                      </div>
                      <div style={{ fontSize: 6, letterSpacing: 2, color: 'var(--text-dim)' }}>COMM.</div>
                    </div>
                    <div style={{ height: 24, background: 'oklch(16% 0.015 250)', borderRadius: 2 }}>
                      <div style={{
                        height: '100%', borderRadius: 2, background: 'var(--green)',
                        width: `${Math.min((p.commission_usd / data.top_products[0].commission_usd) * 100, 100)}%`,
                        boxShadow: '0 0 6px var(--green)',
                        transition: 'width 0.8s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Errors / warnings ── */}
          {data.errors && Object.keys(data.errors).length > 0 && (
            <div style={{ padding: '10px 14px', background: 'oklch(12% 0.04 25 / 0.4)',
                          border: '1px solid oklch(62% 0.22 25 / 0.3)', borderRadius: 4 }}>
              <div style={{ fontSize: 8, letterSpacing: 3, color: 'oklch(62% 0.22 25)', marginBottom: 6 }}>
                SYNC WARNINGS
              </div>
              {Object.entries(data.errors).map(([k, v]) => (
                <div key={k} style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 2 }}>
                  [{k.toUpperCase()}] {v}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
