import { useJarvisStore } from '../store/useJarvisStore'

export default function Header() {
  const { lastUpdate, loading, dataSource, refreshData, setActiveTab, activeTab } = useJarvisStore()

  const tabs = [
    { id: 'overview',  label: 'סקירה כללית' },
    { id: 'products',  label: 'מוצרים' },
    { id: 'agents',    label: 'סוכנים' },
    { id: 'analytics', label: 'אנליטיקס' },
    { id: 'insights',  label: 'תובנות AI' },
  ]

  return (
    <header style={{
      background: 'rgba(5,5,16,0.95)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '0 24px',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 24, height: 56 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 900, color: '#fff',
            boxShadow: '0 0 16px rgba(0,212,255,0.5)',
          }}>J</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: '#00d4ff' }}>JARVIS</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>SPORTIVI FOR YOU</div>
          </div>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              background: activeTab === t.id ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: activeTab === t.id ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
              color: activeTab === t.id ? '#00d4ff' : 'rgba(255,255,255,0.5)',
              padding: '5px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}>{t.label}</button>
          ))}
        </nav>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'left' }}>
            <div>עודכן: {lastUpdate}</div>
            <div style={{ color: dataSource === 'sheets' ? '#10b981' : '#f59e0b' }}>
              {dataSource === 'sheets' ? '● Sheets Live' : '● Demo Mode'}
            </div>
          </div>
          <button onClick={refreshData} disabled={loading} style={{
            background: 'rgba(0,212,255,0.1)',
            border: '1px solid rgba(0,212,255,0.3)',
            color: '#00d4ff',
            padding: '4px 12px',
            borderRadius: 6,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 11,
            fontFamily: 'inherit',
          }}>{loading ? '...' : '⟳ רענן'}</button>
        </div>
      </div>
    </header>
  )
}
