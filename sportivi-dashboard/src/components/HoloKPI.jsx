import { useState, useEffect, useRef } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

function useMorphingCounter(target) {
  const [display, setDisplay] = useState(target)
  const prev = useRef(target)

  useEffect(() => {
    if (prev.current === target) return
    const steps = 20
    const diff = target - prev.current
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplay(Math.round(prev.current + diff * (i / steps)))
      if (i >= steps) { clearInterval(id); prev.current = target }
    }, 30)
    return () => clearInterval(id)
  }, [target])

  return display
}

function MiniSparkline({ data, color, height = 28 }) {
  if (!data?.length) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${w},${height}`}
        fill={`url(#sg-${color.replace('#','')})`}
      />
      <polyline
        points={points}
        fill="none" stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      {/* Last point dot */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1]
        const x = w
        const y = height - ((last - min) / range) * height
        return <circle cx={x} cy={y} r={2.5} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      })()}
    </svg>
  )
}

function KpiModule({ label, value, unit = '', color, icon, delta, sparkData, big = false }) {
  const numericVal = typeof value === 'number' ? value : 0
  const rawNum = useMorphingCounter(numericVal)
  const num = typeof value === 'number' ? rawNum : null

  return (
    <div className="kpi-module" style={{
      position: 'relative',
      background: 'rgba(0,10,30,0.8)',
      border: `1px solid ${color}25`,
      borderRadius: 6,
      padding: big ? '14px 16px' : '10px 14px',
      overflow: 'hidden',
      /* Emil: specify exact transition properties */
      transition: `border-color 160ms var(--ease-out), box-shadow 160ms var(--ease-out)`,
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = `${color}60`
      e.currentTarget.style.boxShadow = `0 0 20px ${color}20`
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = `${color}25`
      e.currentTarget.style.boxShadow = 'none'
    }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
      }} />

      {/* Corner bracket */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 8, height: 8,
        borderTop: `1px solid ${color}80`,
        borderRight: `1px solid ${color}80`,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        width: 8, height: 8,
        borderBottom: `1px solid ${color}40`,
        borderLeft: `1px solid ${color}40`,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontSize: 8, letterSpacing: 2, color: `${color}80`, textTransform: 'uppercase' }}>
          {label}
        </div>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{icon}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: big ? 26 : 20,
            fontWeight: 800,
            color,
            textShadow: `0 0 16px ${color}80`,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 1,
          }}>
            {num !== null ? num.toLocaleString() : value}{unit}
          </div>
          {delta !== undefined && (
            <div style={{ fontSize: 9, marginTop: 2, color: delta >= 0 ? '#06ffa5' : '#ff4444' }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
            </div>
          )}
        </div>
        {sparkData && <MiniSparkline data={sparkData} color={color} />}
      </div>
    </div>
  )
}

export default function HoloKPI() {
  const { kpi, performance } = useJarvisStore()
  const revData  = performance.map(p => p.revenue)
  const clkData  = performance.map(p => p.clicks)
  const salesData = performance.map(p => p.sales)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 9, letterSpacing: 4, color: 'rgba(0,212,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>
        ◈ LIVE INTEL ◈
      </div>

      <KpiModule label="הכנסה היום"   value={kpi.revenueToday}  unit="₪" color="#00d4ff" icon="💰" delta={12} sparkData={revData} big />
      <KpiModule label="הכנסה שבוע"   value={kpi.revenueWeek}   unit="₪" color="#7c3aed" icon="📅" delta={8}  sparkData={revData.map(v=>v*6.5|0)} />
      <KpiModule label="קליקים היום"  value={kpi.clicksToday}          color="#06ffa5" icon="👆" delta={-3} sparkData={clkData} />
      <KpiModule label="הזמנות"       value={kpi.ordersToday}          color="#f59e0b" icon="🛍" delta={5}  sparkData={salesData} />

      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.2), transparent)', margin: '4px 0' }} />

      <KpiModule label="CTR"          value={kpi.ctr}         unit="%" color="#ec4899" icon="🎯" delta={2} />
      <KpiModule label="ROAS"         value={kpi.roas}        unit="x" color="#00d4ff" icon="📊" delta={15} />
      <KpiModule label="חברי קהילה"   value={kpi.communityMembers}     color="#06b6d4" icon="👥" delta={7} />
      <KpiModule label="WhatsApp CTR" value={kpi.whatsappCtr} unit="%" color="#25d366" icon="💬" delta={-1} />

      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.2), transparent)', margin: '4px 0' }} />

      {/* Top product */}
      <div style={{
        background: 'rgba(0,10,30,0.8)',
        border: '1px solid rgba(6,255,165,0.2)',
        borderRadius: 6, padding: '10px 14px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, #06ffa580, transparent)' }} />
        <div style={{ fontSize: 8, letterSpacing: 2, color: 'rgba(6,255,165,0.5)', marginBottom: 4 }}>🏆 TOP PRODUCT</div>
        <div style={{ fontSize: 11, color: '#06ffa5', fontWeight: 700, textShadow: '0 0 10px #06ffa5' }}>
          {kpi.topProduct}
        </div>
      </div>
    </div>
  )
}
