import { useJarvisStore } from '../store/useJarvisStore'

function KpiCard({ label, value, sub, color = '#00d4ff', icon, delta, big = false }) {
  const isPositive = delta > 0
  const isNegative = delta < 0

  return (
    <div className="glass-card" style={{ padding: big ? 20 : 16, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: big ? 20 : 16 }}>{icon}</div>
      </div>
      <div style={{ fontSize: big ? 28 : 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      {(sub || delta !== undefined) && (
        <div style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          {delta !== undefined && (
            <span style={{ color: isPositive ? '#10b981' : isNegative ? '#ef4444' : '#6b7280' }}>
              {isPositive ? '↑' : isNegative ? '↓' : '→'} {Math.abs(delta)}%
            </span>
          )}
          {sub && <span style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

export default function KpiCards() {
  const { kpi } = useJarvisStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Row 1 — Revenue */}
      <div style={{ display: 'flex', gap: 12 }}>
        <KpiCard label="הכנסה היום" value={`₪${kpi.revenueToday.toLocaleString()}`} icon="💰" color="#10b981" delta={12} sub="מאתמול" big />
        <KpiCard label="הכנסה השבוע" value={`₪${kpi.revenueWeek.toLocaleString()}`} icon="📅" color="#00d4ff" delta={8} />
        <KpiCard label="הכנסה החודש" value={`₪${kpi.revenueMonth.toLocaleString()}`} icon="📆" color="#8b5cf6" delta={23} />
      </div>

      {/* Row 2 — Performance */}
      <div style={{ display: 'flex', gap: 12 }}>
        <KpiCard label="הזמנות היום" value={kpi.ordersToday} icon="🛍️" color="#f59e0b" delta={5} />
        <KpiCard label="קליקים היום" value={kpi.clicksToday.toLocaleString()} icon="👆" color="#00d4ff" delta={-3} />
        <KpiCard label="CTR ממוצע" value={`${kpi.ctr}%`} icon="🎯" color="#10b981" delta={2} />
        <KpiCard label="ROAS" value={`${kpi.roas}x`} icon="📊" color="#8b5cf6" delta={15} />
      </div>

      {/* Row 3 — Community & Products */}
      <div style={{ display: 'flex', gap: 12 }}>
        <KpiCard label="חברי קהילה" value={kpi.communityMembers.toLocaleString()} icon="👥" color="#06b6d4" delta={7} sub="הצטרפו השבוע" />
        <KpiCard label="WhatsApp CTR" value={`${kpi.whatsappCtr}%`} icon="💬" color="#25d366" delta={-1} />
        <KpiCard label="רווח למוצר" value={`₪${kpi.profitPerProduct}`} icon="💎" color="#f59e0b" delta={4} />
        <KpiCard label="מוצר מוביל" value={kpi.topProduct} icon="🏆" color="#10b981" sub="היום" />
      </div>
    </div>
  )
}
