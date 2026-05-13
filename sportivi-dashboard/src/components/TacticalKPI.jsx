/**
 * TacticalKPI — Heebo for Hebrew labels, interactive expand on click.
 * Emil: stagger entry, specific transitions, scale(0.97) on active.
 * Impeccable: no hero-metric, horizontal readout strips.
 */
import { useState, useEffect, useRef } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

function useMorphCounter(target) {
  const [val, setVal] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    if (prev.current === target) return
    const diff = target - prev.current
    let i = 0; const steps = 18
    const id = setInterval(() => {
      i++; setVal(Math.round(prev.current + diff * (i / steps)))
      if (i >= steps) { clearInterval(id); prev.current = target }
    }, 28)
    return () => clearInterval(id)
  }, [target])
  return val
}

function Sparkline({ data, color, width = 68, height = 22 }) {
  if (!data?.length) return null
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x},${y}`
  }).join(' ')
  const last = data[data.length - 1]
  const lx = width
  const ly = height - ((last - min) / range) * (height - 2) - 1
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', opacity: 0.85 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
      <circle cx={lx} cy={ly} r={2.5} fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  )
}

function Strip({ label, value, unit = '', max100 = 0, color, delta, spark, small, expandData }) {
  // Always call hook unconditionally — Rules of Hooks
  const animated = useMorphCounter(typeof value === 'number' ? value : 0)
  const num = typeof value === 'number' ? animated : null
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="kpi-strip"
      onClick={() => expandData && setExpanded(e => !e)}
      style={{
        padding: '9px 4px',
        borderBottom: '1px solid oklch(18% 0.015 250)',
        cursor: expandData ? 'pointer' : 'default',
        transition: 'background 160ms var(--ease-out)',
      }}
    >
      {/* Top row: Hebrew label + delta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{
          fontFamily: 'var(--font-heb)',
          fontSize: 12,
          fontWeight: 600,
          color: 'oklch(68% 0.04 250)',
          letterSpacing: 0,
        }}>
          {label}
          {expandData && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.5, marginRight: 4 }}>
              {expanded ? ' ▴' : ' ▾'}
            </span>
          )}
        </span>
        {delta !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: delta >= 0 ? 'var(--green)' : 'var(--red)',
            textShadow: delta >= 0 ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
          }}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta)}%
          </span>
        )}
      </div>

      {/* Middle row: value + sparkline */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{
          fontSize: small ? 19 : 26, fontWeight: 900, lineHeight: 1,
          color, textShadow: `0 0 18px ${color}50`,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--font-mono)',
          letterSpacing: -0.5,
        }}>
          {num !== null ? num.toLocaleString() : value}{unit}
        </div>
        {spark && <Sparkline data={spark} color={color} />}
      </div>

      {/* Progress bar */}
      {max100 > 0 && (
        <div style={{ marginTop: 7, height: 2, background: 'oklch(16% 0.015 250)', borderRadius: 1 }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: color,
            boxShadow: `0 0 6px ${color}80`,
            width: `${Math.min(max100, 100)}%`,
            transition: 'width 0.8s var(--ease-out)',
          }} />
        </div>
      )}

      {/* Expanded 7-day bar chart */}
      {expanded && expandData && (
        <div className="kpi-expand" style={{
          marginTop: 8, padding: '8px 0 4px',
          borderTop: '1px solid oklch(18% 0.015 250)',
        }}>
          <div style={{
            fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 8,
            fontFamily: 'var(--font-mono)',
          }}>
            7 ימים אחרונים
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40 }}>
            {expandData.map((v, i) => {
              const maxV = Math.max(...expandData)
              const pct = maxV ? v / maxV : 0
              const isLast = i === expandData.length - 1
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%', borderRadius: '2px 2px 0 0',
                    height: `${Math.max(pct * 36, 3)}px`,
                    background: color,
                    boxShadow: isLast ? `0 0 6px ${color}` : 'none',
                    opacity: 0.3 + pct * 0.7,
                    transition: 'height 0.6s var(--ease-out)',
                  }} />
                  <span style={{ fontSize: 7, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {(v / 1000).toFixed(1)}k
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TacticalKPI() {
  const { kpi, performance } = useJarvisStore()
  const rev = performance.map(p => p.revenue)
  const clk = performance.map(p => p.clicks)
  const sal = performance.map(p => p.sales)

  return (
    <div>
      <div style={{
        fontSize: 8, letterSpacing: 4, color: 'oklch(55% 0.12 210)',
        marginBottom: 12, fontFamily: 'var(--font-mono)',
      }}>
        ◈ LIVE READOUT
      </div>

      <Strip label="הכנסה היום"   value={kpi.revenueToday}  unit="₪" max100={Math.round(kpi.revenueToday/40)} color="var(--cyan)"   delta={12} spark={rev} expandData={rev} />
      <Strip label="הכנסה שבוע"   value={kpi.revenueWeek}   unit="₪" max100={62} color="var(--purple)" delta={8}  />
      <Strip label="הכנסה חודש"   value={kpi.revenueMonth}  unit="₪" max100={78} color="var(--purple)" delta={23} small />

      <div style={{ height: 10 }} />

      <Strip label="קליקים היום"  value={kpi.clicksToday}            max100={74} color="var(--cyan)"   delta={-3} spark={clk} expandData={clk} />
      <Strip label="הזמנות"       value={kpi.ordersToday}            max100={58} color="var(--amber)"  delta={5}  spark={sal} expandData={sal} />
      <Strip label="CTR"          value={kpi.ctr}        unit="%"    max100={kpi.ctr * 10} color="var(--green)"  delta={2}  />
      <Strip label="ROAS"         value={kpi.roas}       unit="x"    max100={kpi.roas * 25} color="var(--cyan)"  delta={15} />

      <div style={{ height: 10 }} />

      <Strip label="חברי קהילה"   value={kpi.communityMembers}       max100={47} color="var(--amber)"  delta={7}  small />
      <Strip label="WhatsApp CTR" value={kpi.whatsappCtr} unit="%"   max100={kpi.whatsappCtr * 10} color="var(--green)"  delta={-1} />

      {/* Top product callout */}
      <div style={{ marginTop: 14, padding: '10px 4px', borderTop: '1px solid oklch(20% 0.02 250)' }}>
        <div style={{
          fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 6,
          fontFamily: 'var(--font-mono)',
        }}>
          TOP PRODUCT TODAY
        </div>
        <div style={{
          fontFamily: 'var(--font-heb)',
          fontSize: 14, fontWeight: 800,
          color: 'var(--green)',
          textShadow: '0 0 12px var(--green)',
          lineHeight: 1.3,
        }}>
          {kpi.topProduct}
        </div>
      </div>
    </div>
  )
}
