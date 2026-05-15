import { useJarvisStore } from '../store/useJarvisStore'

const AGENT_COLORS = {
  TALIA: '#00d4ff', GAL: '#8b5cf6', SHIR: '#f59e0b', PELEG: '#10b981',
  ROMI:  '#ec4899', AGAM: '#06b6d4', OLIVE: '#84cc16', ANDY: '#f97316',
}

// Maps agent name → pipeline stage key used by health_monitor.py
const PIPELINE_STAGE = {
  TALIA: 'TALIA', TALYA: 'TALIA',
  GAL:   'GAL',
  SHIR:  'SHIR',
  ANDY:  'ANDY',
  PELEG: 'PELEG',
}

function _fmtTs(ts) {
  if (!ts) return null
  // ts is "2026-05-15 14:32:18" — show just HH:MM or "DD/MM HH:MM"
  const m = ts.match(/(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})/)
  if (!m) return ts.slice(0, 16)
  const today = new Date().toISOString().slice(0, 10)
  return m[1] === today ? m[2] : `${m[1].slice(5)} ${m[2]}`
}

function AgentCard({ agent, pipelineHealth }) {
  const color = AGENT_COLORS[agent.name] || '#00d4ff'

  // Resolve live pipeline stage data for this agent
  const stageKey  = PIPELINE_STAGE[agent.name?.toUpperCase?.()] || null
  const stageData = stageKey ? (pipelineHealth?.agentStatus?.[stageKey] || null) : null

  // If we have live stage data, derive status/label from it
  let liveStatus = null   // 'ok' | 'fail' | null
  let liveLabel  = null
  let liveDetail = null
  let liveTs     = null

  if (stageData) {
    liveStatus = stageData.status        // 'ok' | 'fail'
    liveDetail = stageData.detail || ''
    liveTs     = _fmtTs(stageData.ts)
    liveLabel  = liveStatus === 'ok' ? 'תקין' : 'כשל'
  }

  // Dot color: green if ok, red if fail, amber if idle
  const dotColor = liveStatus === 'ok'
    ? '#10b981'
    : liveStatus === 'fail'
    ? '#ef4444'
    : agent.status === 'active' ? '#10b981' : '#f59e0b'

  const statusLabel = liveLabel
    || (agent.status === 'active' ? 'פעיל' : 'ממתין')

  return (
    <div className="glass-card" style={{
      padding: 14,
      borderRight: `3px solid ${color}`,
      transition: 'transform 0.2s',
      cursor: 'default',
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `${color}20`,
          border: `1px solid ${color}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}>{agent.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color }}>
            {agent.name}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {agent.role}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 4px ${dotColor}`,
          }} />
          <span style={{ fontSize: 9, color: dotColor }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '5px 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color }}>{agent.tasks}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>משימות</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '5px 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{agent.success}%</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>הצלחה</div>
        </div>
      </div>

      {/* Mini progress bar */}
      <div style={{ marginTop: 8, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
        <div style={{ width: `${agent.success}%`, height: '100%', background: color, borderRadius: 1, transition: 'width 0.5s' }} />
      </div>

      {/* Live pipeline stage detail — only for TALIA/GAL/SHIR/ANDY/PELEG */}
      {stageData && (
        <div style={{
          marginTop: 8,
          padding: '4px 6px',
          borderRadius: 4,
          background: liveStatus === 'ok'
            ? 'rgba(16,185,129,0.08)'
            : 'rgba(239,68,68,0.10)',
          border: `1px solid ${liveStatus === 'ok' ? '#10b98130' : '#ef444430'}`,
        }}>
          {liveDetail && (
            <div style={{ fontSize: 9, color: liveStatus === 'ok' ? '#10b981' : '#ef4444', lineHeight: 1.4, direction: 'rtl', textAlign: 'right' }}>
              {liveDetail.length > 55 ? liveDetail.slice(0, 52) + '…' : liveDetail}
            </div>
          )}
          {liveTs && (
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 1, direction: 'ltr', textAlign: 'right' }}>
              {liveTs}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pipeline summary bar ──────────────────────────────────────────────────────
function PipelineSummaryBar({ pipelineHealth }) {
  if (!pipelineHealth?.lastRunAt) return null

  const isOk   = pipelineHealth.lastRunStatus === 'success'
  const isFail = pipelineHealth.lastRunStatus === 'failed'
  const barColor = isOk ? '#10b981' : isFail ? '#ef4444' : '#f59e0b'
  const lastTs   = _fmtTs(pipelineHealth.lastRunAt)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 12px', borderRadius: 6, marginBottom: 12,
      background: `${barColor}12`,
      border: `1px solid ${barColor}30`,
      flexWrap: 'wrap',
    }}>
      {/* Status dot + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: barColor, boxShadow: `0 0 5px ${barColor}` }} />
        <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>
          {isOk ? 'Pipeline OK' : isFail ? 'Pipeline FAILED' : 'Pipeline Unknown'}
        </span>
      </div>

      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>|</span>

      {/* Today stats */}
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
        היום: <span style={{ color: '#fff' }}>{pipelineHealth.todayPublished}</span> פורסמו
        &nbsp;·&nbsp;
        <span style={{ color: '#fff' }}>{pipelineHealth.todayRuns}</span> ריצות
        {pipelineHealth.todayFailed > 0 && (
          <>&nbsp;·&nbsp;<span style={{ color: '#ef4444' }}>{pipelineHealth.todayFailed} נכשלו</span></>
        )}
      </span>

      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>|</span>

      {/* Last run timestamp */}
      {lastTs && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
          ריצה אחרונה: {lastTs}
        </span>
      )}

      {/* Last success/failure */}
      {pipelineHealth.lastSuccessAt && (
        <span style={{ fontSize: 9, color: 'rgba(16,185,129,0.6)' }}>
          הצלחה: {_fmtTs(pipelineHealth.lastSuccessAt)}
        </span>
      )}
      {isFail && pipelineHealth.lastSuccessAt && (
        <span style={{ fontSize: 9, color: '#ef4444' }}>
          ⚠ לא הצליח מאז {_fmtTs(pipelineHealth.lastSuccessAt)}
        </span>
      )}

      {/* Last sync */}
      {pipelineHealth.lastSync && (
        <span style={{ marginRight: 'auto', fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>
          sync {pipelineHealth.lastSync}
        </span>
      )}
    </div>
  )
}

export default function AgentsPanel() {
  const { agents, pipelineHealth } = useJarvisStore()

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div className="section-title">⚡ סוכני AI</div>

      {/* Live pipeline status bar — shown only when data is available */}
      <PipelineSummaryBar pipelineHealth={pipelineHealth} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} pipelineHealth={pipelineHealth} />
        ))}
      </div>
    </div>
  )
}
