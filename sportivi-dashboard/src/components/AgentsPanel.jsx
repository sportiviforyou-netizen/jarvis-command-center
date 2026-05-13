import { useJarvisStore } from '../store/useJarvisStore'

const AGENT_COLORS = {
  TALIA: '#00d4ff', GAL: '#8b5cf6', SHIR: '#f59e0b', PELEG: '#10b981',
  ROMI:  '#ec4899', AGAM: '#06b6d4', OLIVE: '#84cc16', ANDY: '#f97316',
}

function AgentCard({ agent }) {
  const color = AGENT_COLORS[agent.name] || '#00d4ff'

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
          <div className={`status-${agent.status}`} style={{ width: 6, height: 6, borderRadius: '50%' }} />
          <span style={{ fontSize: 9, color: agent.status === 'active' ? '#10b981' : '#f59e0b' }}>
            {agent.status === 'active' ? 'פעיל' : 'ממתין'}
          </span>
        </div>
      </div>

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
    </div>
  )
}

export default function AgentsPanel() {
  const { agents } = useJarvisStore()

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div className="section-title">⚡ סוכני AI</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}
