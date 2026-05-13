import { useState } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

export default function ProductsTable() {
  const { products } = useJarvisStore()
  const [sortBy, setSortBy] = useState('score')

  const sorted = [...products].sort((a, b) => b[sortBy] - a[sortBy])

  const cols = [
    { key: 'rank',    label: '#' },
    { key: 'name',    label: 'שם מוצר' },
    { key: 'price',   label: 'מחיר' },
    { key: 'score',   label: 'ציון', sort: true },
    { key: 'clicks',  label: 'קליקים', sort: true },
    { key: 'sales',   label: 'מכירות', sort: true },
    { key: 'ctr',     label: 'CTR' },
    { key: 'trend',   label: 'טרנד' },
  ]

  const trendIcon = (t) => t === 'up' ? '↑' : t === 'down' ? '↓' : '→'
  const trendColor = (t) => t === 'up' ? '#10b981' : t === 'down' ? '#ef4444' : '#6b7280'

  const scoreColor = (s) => s >= 85 ? '#10b981' : s >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>🏆 טופ מוצרים</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['score', 'clicks', 'sales'].map(k => (
            <button key={k} onClick={() => setSortBy(k)} style={{
              background: sortBy === k ? 'rgba(0,212,255,0.15)' : 'transparent',
              border: `1px solid ${sortBy === k ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: sortBy === k ? '#00d4ff' : 'rgba(255,255,255,0.4)',
              padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit',
            }}>
              {k === 'score' ? 'ציון' : k === 'clicks' ? 'קליקים' : 'מכירות'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {cols.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id}>
                <td style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{i + 1}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{p.keyword}</div>
                </td>
                <td style={{ color: '#f59e0b' }}>₪{p.price}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${scoreColor(p.score)}20`, border: `1px solid ${scoreColor(p.score)}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: scoreColor(p.score) }}>
                      {p.score}
                    </div>
                  </div>
                </td>
                <td style={{ color: '#00d4ff' }}>{p.clicks.toLocaleString()}</td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>{p.sales}</td>
                <td>{p.ctr}</td>
                <td style={{ color: trendColor(p.trend), fontWeight: 700, fontSize: 16 }}>
                  {trendIcon(p.trend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
