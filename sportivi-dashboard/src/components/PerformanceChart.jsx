import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { useJarvisStore } from '../store/useJarvisStore'

function HudTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'oklch(9% 0.012 250)',
      border: '1px solid oklch(78% 0.15 210 / 0.2)',
      borderRadius: 3, padding: '7px 11px', fontSize: 11,
      fontFamily: 'Courier New, monospace',
    }}>
      <div style={{ color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, letterSpacing: 1 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

/* Bar palette — OKLCH hex approximations for recharts (it uses hex/rgb) */
const BAR_COLORS = [
  'oklch(78% 0.15 210)',   /* cyan   */
  'oklch(55% 0.22 290)',   /* purple */
  'oklch(80% 0.18 160)',   /* green  */
  'oklch(72% 0.16 65)',    /* amber  */
  'oklch(65% 0.22 340)',   /* pink   */
]

export default function PerformanceChart() {
  const { performance, categories } = useJarvisStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Revenue area chart */}
      <div style={{
        background: 'oklch(9% 0.012 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 8, letterSpacing: 3, color: 'oklch(55% 0.1 210)', marginBottom: 12 }}>
          ▸ REVENUE · 7D PERFORMANCE
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={performance} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="gr-rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="oklch(78% 0.15 210)" stopOpacity={0.22} />
                <stop offset="95%" stopColor="oklch(78% 0.15 210)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gr-clk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="oklch(55% 0.22 290)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="oklch(55% 0.22 290)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke="oklch(78% 0.15 210 / 0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'oklch(40% 0.06 210)', fontSize: 9, fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fill: 'oklch(40% 0.06 210)', fontSize: 9, fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<HudTooltip />} />
            <Area
              type="monotone" dataKey="revenue" name="₪ Revenue"
              stroke="oklch(78% 0.15 210)" strokeWidth={1.5} fill="url(#gr-rev)"
            />
            <Area
              type="monotone" dataKey="clicks" name="Clicks"
              stroke="oklch(55% 0.22 290)" strokeWidth={1.5} fill="url(#gr-clk)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Category opportunity score */}
      <div style={{
        background: 'oklch(9% 0.012 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 8, letterSpacing: 3, color: 'oklch(55% 0.1 210)', marginBottom: 12 }}>
          ▸ CATEGORIES · OPPORTUNITY SCORE
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={categories} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="oklch(78% 0.15 210 / 0.05)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: 'oklch(40% 0.06 210)', fontSize: 9, fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'oklch(40% 0.06 210)', fontSize: 9, fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<HudTooltip />} />
            <Bar dataKey="score" name="Score" radius={[2, 2, 0, 0]}
              background={{ fill: 'oklch(12% 0.015 250)' }}>
              {categories.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
