/**
 * StatusTicker — fixed bottom bar, scrolling JARVIS intel feed.
 * Impeccable: no border-right accent, full-width bar with contained sections.
 */
import { useJarvisStore } from '../store/useJarvisStore'

const FEED = [
  '🔍 TALIA · מנתחת 127 מוצרים חדשים מ-AliExpress',
  '📊 ROMI · CTR ממוצע 5.2% — מעל ממוצע תעשייה ב-38%',
  '⚖️ GAL · 23 מוצרים דורגו · 18 אושרו להפצה',
  '📈 OLIVE · טרנד CrossFit עולה 34% בחיפושים השבוע',
  '📢 PELEG · 8 פוסטים פורסמו לטלגרם · 2,340 חברי קהילה',
  '🔗 ANDY · אחזר נתוני מחיר עבור 45 מוצרים חדשים',
  '👁️ AGAM · מוניטורינג פעיל על 10 מוצרי TOP',
  '✍️ SHIR · כתבה 6 תיאורי מוצר בעברית + אנגלית',
]

export default function StatusTicker() {
  const { kpi, dataSource } = useJarvisStore()
  const text = FEED.join('   ·   ') + '   ·   '

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 32,
      background: 'oklch(6% 0.01 250 / 0.98)',
      borderTop: '1px solid oklch(20% 0.02 250)',
      display: 'flex', alignItems: 'center',
      zIndex: 300,
      /* iOS safe area */
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>

      {/* Left badge */}
      <div style={{
        flexShrink: 0,
        height: '100%',
        padding: '0 14px',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'oklch(9% 0.012 250)',
        borderRight: '1px solid oklch(20% 0.02 250)',
      }}>
        <div className="dot dot-cyan" style={{ width: 4, height: 4 }} />
        <span style={{ fontSize: 7, letterSpacing: 3, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
          JARVIS
        </span>
      </div>

      {/* Scrolling text */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left fade */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
          background: 'linear-gradient(to right, oklch(6% 0.01 250), transparent)',
          pointerEvents: 'none',
        }} />
        {/* Right fade */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
          background: 'linear-gradient(to left, oklch(6% 0.01 250), transparent)',
          pointerEvents: 'none',
        }} />
        <div className="ticker-track" style={{ fontSize: 10, color: 'oklch(62% 0.05 250)' }}>
          {/* Double for seamless loop */}
          <span>{text}</span>
          <span aria-hidden="true">{text}</span>
        </div>
      </div>

      {/* Right: KPI readout */}
      <div style={{
        flexShrink: 0,
        height: '100%',
        padding: '0 14px',
        display: 'flex', alignItems: 'center', gap: 16,
        borderLeft: '1px solid oklch(20% 0.02 250)',
        background: 'oklch(9% 0.012 250)',
      }}>
        <span style={{ fontSize: 8, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
          ₪{kpi.revenueToday.toLocaleString()}
        </span>
        <span style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
          ROAS {kpi.roas}x
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            className={`dot ${dataSource === 'vault' || dataSource === 'live' ? 'dot-green' : 'dot-amber'}`}
            style={{ width: 4, height: 4 }}
          />
          <span style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)' }}>
            {dataSource === 'live' ? 'LIVE' : dataSource === 'vault' ? 'VAULT' : 'DEMO'}
          </span>
        </div>
      </div>
    </div>
  )
}
