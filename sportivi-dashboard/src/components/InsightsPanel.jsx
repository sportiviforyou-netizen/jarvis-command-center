import { useJarvisStore } from '../store/useJarvisStore'

const TYPE_STYLES = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: '🚨', border: '#ef4444' },
  warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '⚠️', border: '#f59e0b' },
  info:     { color: '#00d4ff', bg: 'rgba(0,212,255,0.1)',  icon: '💡', border: '#00d4ff' },
  success:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '✅', border: '#10b981' },
}

export default function InsightsPanel() {
  const { insights } = useJarvisStore()

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div className="section-title">🧠 תובנות JARVIS AI</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.map((insight, i) => {
          const style = TYPE_STYLES[insight.type] || TYPE_STYLES.info
          return (
            <div key={i} style={{
              background: style.bg,
              borderRight: `3px solid ${style.border}`,
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{style.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.4 }}>{insight.msg}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, display: 'flex', gap: 8 }}>
                  <span style={{ color: style.color }}>{insight.agent}</span>
                  <span>·</span>
                  <span>{insight.time}</span>
                </div>
              </div>
              <div style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                background: style.bg, color: style.color, border: `1px solid ${style.border}50`,
                flexShrink: 0, alignSelf: 'flex-start',
              }}>
                {insight.type === 'critical' ? 'קריטי' : insight.type === 'warning' ? 'אזהרה' : insight.type === 'success' ? 'הצלחה' : 'מידע'}
              </div>
            </div>
          )
        })}
      </div>

      {/* AI Chat bubble */}
      <div style={{ marginTop: 16, padding: 14, background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10 }}>
        <div style={{ fontSize: 11, color: '#00d4ff', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="animate-blink" style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4ff' }} />
          JARVIS ממליץ
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
          על פי הנתונים הנוכחיים, מומלץ להגביר תקציב קמפיין עבור קטגוריית אגרוף ולהפחית קמפיין MMA ביום הבא. מוצר P001 מציג ביצועים מעולים.
        </div>
      </div>
    </div>
  )
}
