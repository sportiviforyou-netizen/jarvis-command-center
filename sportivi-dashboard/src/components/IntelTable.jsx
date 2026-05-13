/**
 * IntelTable — impeccable: no side-stripes, no hero-metric rows.
 * Rank number leads each row, score shown as a compact pill.
 * Emil: stagger entry, specific transitions, hover on pointer devices only.
 */
import { useState } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

function ScorePill({ score }) {
  const color = score >= 85 ? 'var(--green)' : score >= 70 ? 'var(--amber)' : 'var(--red)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 32, height: 22, borderRadius: 3,
      background: `${color.replace('var(', '').replace(')', '')} / 0.1`.includes('var')
        ? `oklch(0% 0 0 / 0)` : 'transparent',
      border: `1px solid ${color}`,
      fontSize: 10, fontWeight: 800, color,
      textShadow: `0 0 6px ${color}`,
    }}>{score}</span>
  )
}

export default function IntelTable() {
  const { products } = useJarvisStore()
  const [sortKey, setSortKey] = useState('score')
  const [hovered, setHovered] = useState(null)

  const sorted = [...products].sort((a, b) => b[sortKey] - a[sortKey])

  return (
    <div style={{
      background: 'oklch(9% 0.012 250)',
      border: '1px solid oklch(20% 0.02 250)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid oklch(18% 0.015 250)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="dot dot-green" style={{ width: 5, height: 5 }} />
          <span style={{ fontSize: 8, letterSpacing: 4, color: 'oklch(60% 0.1 210)' }}>
            PRODUCT INTELLIGENCE
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['score','SCORE'], ['clicks','CLICKS'], ['sales','SALES']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSortKey(k)} style={{
              background: sortKey === k ? 'oklch(78% 0.15 210 / 0.1)' : 'transparent',
              border: `1px solid ${sortKey === k ? 'oklch(78% 0.15 210 / 0.4)' : 'oklch(20% 0.02 250)'}`,
              color: sortKey === k ? 'var(--cyan)' : 'var(--text-dim)',
              padding: '3px 10px', borderRadius: 2,
              fontSize: 8, letterSpacing: 2, fontFamily: 'inherit',
              textShadow: sortKey === k ? '0 0 6px var(--cyan)' : 'none',
              boxShadow: sortKey === k ? '0 0 10px oklch(78% 0.15 210 / 0.15)' : 'none',
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'מוצר', 'מחיר', 'SCORE', 'קליקים', 'מכירות', 'CTR', ''].map((h, i) => (
              <th key={i} style={{
                padding: '7px 12px',
                fontSize: 8, letterSpacing: 2, textTransform: 'uppercase',
                color: 'var(--text-dim)', textAlign: 'right', fontWeight: 400,
                borderBottom: '1px solid oklch(16% 0.015 250)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const isHovered = hovered === p.id
            const trendColor = p.trend === 'up' ? 'var(--green)' : p.trend === 'down' ? 'var(--red)' : 'var(--text-dim)'
            return (
              <tr key={p.id} className="intel-row"
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isHovered ? 'oklch(14% 0.018 250)' : 'transparent',
                  transition: 'background 120ms var(--ease-out)',
                }}
              >
                <td style={{ padding: '9px 12px', fontSize: 11, color: isHovered ? 'var(--cyan)' : 'var(--text-dim)', transition: 'color 120ms var(--ease-out)', fontWeight: isHovered ? 700 : 400 }}>
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{
                    fontFamily: 'var(--font-heb)',
                    fontSize: 13, fontWeight: 700,
                    color: isHovered ? 'var(--text)' : 'oklch(84% 0.02 250)',
                    transition: 'color 120ms var(--ease-out)',
                  }}>
                    {p.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9, letterSpacing: 1,
                    color: 'oklch(45% 0.08 210)', marginTop: 2,
                  }}>
                    {p.keyword.toUpperCase()}
                  </div>
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>₪{p.price}</td>
                <td style={{ padding: '9px 12px' }}><ScorePill score={p.score} /></td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--cyan)' }}>{p.clicks.toLocaleString()}</td>
                <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{p.sales}</td>
                <td style={{ padding: '9px 12px', fontSize: 11, color: 'oklch(70% 0.04 250)' }}>{p.ctr}</td>
                <td style={{ padding: '9px 12px', fontSize: 14, color: trendColor, textShadow: `0 0 6px ${trendColor}` }}>
                  {p.trend === 'up' ? '▲' : p.trend === 'down' ? '▼' : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
