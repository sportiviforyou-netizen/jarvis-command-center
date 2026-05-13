/**
 * DataSourceStatus — compact row below HUD header.
 * Shows live/error/disabled state for each data source.
 */
import { useJarvisStore } from '../store/useJarvisStore'
import { DS } from '../config/dataSources'

const STATUS_CFG = {
  live:     { dot: 'dot-green', label: 'LIVE',   color: 'var(--green)'    },
  syncing:  { dot: 'dot-amber', label: 'SYNC…',  color: 'var(--amber)'    },
  error:    { dot: 'dot-red',   label: 'ERROR',  color: 'oklch(62% 0.22 25)' },
  idle:     { dot: 'dot-amber', label: 'IDLE',   color: 'var(--text-dim)' },
  disabled: { dot: 'dot-cyan',  label: 'OFF',    color: 'var(--text-dim)' },
  mock:     { dot: 'dot-amber', label: 'DEMO',   color: 'var(--amber)'    },
}

function SourceChip({ icon, name, status, detail, error }) {
  const cfg    = STATUS_CFG[status] || STATUS_CFG.idle
  const isLive = status === 'live'
  const isErr  = status === 'error'
  const isOff  = status === 'disabled'

  return (
    <div
      title={error ? `Error: ${error}` : (isOff ? 'לא מוגדר — הוסף ב-.env.local' : (detail || ''))}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 10px',
        background: isLive ? 'oklch(80% 0.18 160 / 0.06)'
                  : isErr  ? 'oklch(60% 0.22 25 / 0.06)'
                  : 'transparent',
        border: `1px solid ${
          isLive ? 'oklch(80% 0.18 160 / 0.2)' :
          isErr  ? 'oklch(60% 0.22 25 / 0.2)'  :
                   'oklch(20% 0.02 250)'
        }`,
        borderRadius: 3,
        opacity: isOff ? 0.4 : 1,
        transition: 'all 200ms var(--ease-out)',
        cursor: error ? 'help' : 'default',
      }}
    >
      <div className={`dot ${cfg.dot}`} style={{ width: 4, height: 4 }} />
      <span style={{ fontSize: 7, letterSpacing: 2, color: cfg.color, fontFamily: 'var(--font-mono)' }}>
        {icon} {name}
      </span>
      <span style={{
        fontSize: 7, letterSpacing: 1, fontFamily: 'var(--font-mono)',
        color: isLive ? 'var(--green)' : isErr ? 'oklch(62% 0.22 25)' : 'var(--text-dim)',
      }}>
        {cfg.label}
        {isLive && detail && ` · ${detail}`}
      </span>
    </div>
  )
}

export default function DataSourceStatus() {
  const { sources, lastUpdate, refreshData, loading, dataSource } = useJarvisStore()

  // Vault detail: show scored products count if available
  const vaultDetail = sources.vault?.meta
    ? `${sources.vault.meta.scoredProducts} מוצרים · ${sources.vault.meta.publishedToday} פורסמו`
    : (sources.vault?.lastSync ? `עודכן ${sources.vault.lastSync}` : undefined)

  // Telegram detail
  const tgDetail = sources.telegram?.members
    ? `${Number(sources.telegram.members).toLocaleString()} חברים`
    : undefined

  const anyMisconfigured = !DS.vault.enabled || !DS.telegram.enabled

  return (
    <div style={{
      background: 'oklch(7% 0.01 250 / 0.96)',
      borderBottom: '1px solid oklch(16% 0.015 250)',
      padding: '4px 28px',
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap',
    }}>

      {/* Source chips */}
      <SourceChip
        icon="⬡" name="JARVIS"
        status={sources.jarvis?.status || 'idle'}
        detail={sources.jarvis?.brain ? `${sources.jarvis.brain.active} v${sources.jarvis.brain.version}` : undefined}
        error={sources.jarvis?.error}
      />
      <SourceChip
        icon="⬡" name="VAULT"
        status={DS.vault.enabled ? sources.vault.status : 'disabled'}
        detail={vaultDetail}
        error={sources.vault.error}
      />
      <SourceChip
        icon="✈" name="TELEGRAM"
        status={DS.telegram.enabled ? sources.telegram.status : 'disabled'}
        detail={tgDetail}
        error={sources.telegram.error}
      />
      <SourceChip
        icon="◎" name="ALIEXPRESS"
        status={DS.aliexpress.enabled ? sources.aliexpress.status : 'disabled'}
        error={sources.aliexpress.error}
      />
      {DS.sheets.enabled && (
        <SourceChip
          icon="⬣" name="SHEETS"
          status={sources.sheets.status}
          detail={sources.sheets.tabsLoaded
            ? `${sources.sheets.tabsLoaded}/${sources.sheets.totalTabs} tabs`
            : undefined}
          error={sources.sheets.error}
        />
      )}

      <div style={{ flex: 1 }} />

      {/* Data mode badge */}
      <div style={{
        fontSize: 7, letterSpacing: 2, fontFamily: 'var(--font-mono)',
        color: dataSource === 'vault' || dataSource === 'live'
          ? 'var(--green)' : 'var(--amber)',
        padding: '2px 6px',
        border: '1px solid',
        borderColor: dataSource === 'vault' || dataSource === 'live'
          ? 'oklch(80% 0.18 160 / 0.3)' : 'oklch(72% 0.16 65 / 0.3)',
        borderRadius: 2,
      }}>
        {dataSource === 'live'  ? '◉ LIVE'  :
         dataSource === 'vault' ? '◉ VAULT' : '◌ DEMO'}
      </div>

      {/* Last update + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {lastUpdate && (
          <span style={{ fontSize: 7, letterSpacing: 1, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {lastUpdate}
          </span>
        )}
        <button
          onClick={refreshData}
          disabled={loading}
          style={{
            background: 'transparent',
            border: '1px solid oklch(20% 0.02 250)',
            color: loading ? 'var(--text-dim)' : 'var(--cyan)',
            padding: '2px 8px', borderRadius: 2,
            fontSize: 7, letterSpacing: 2, fontFamily: 'var(--font-mono)',
            cursor: loading ? 'wait' : 'pointer',
            transition: 'all 160ms var(--ease-out)',
          }}
        >
          {loading ? '◌ SYNC' : '⟳ SYNC NOW'}
        </button>

        {anyMisconfigured && (
          <span style={{ fontSize: 7, color: 'var(--amber)', fontFamily: 'var(--font-heb)', opacity: 0.7 }}>
            הוסף API keys ב-.env.local
          </span>
        )}
      </div>
    </div>
  )
}
