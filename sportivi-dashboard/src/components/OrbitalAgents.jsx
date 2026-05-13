import { useEffect, useRef, useState } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

const AGENTS_CONFIG = [
  { name: 'TALIA', icon: '🔍', color: 'oklch(78% 0.15 210)',  role: 'PRODUCT SCOUT' },
  { name: 'GAL',   icon: '⚖️', color: 'oklch(55% 0.22 290)',  role: 'SCORER' },
  { name: 'SHIR',  icon: '✍️', color: 'oklch(72% 0.16 65)',   role: 'CONTENT' },
  { name: 'PELEG', icon: '📢', color: 'oklch(80% 0.18 160)',  role: 'PUBLISHER' },
  { name: 'ROMI',  icon: '📊', color: 'oklch(65% 0.22 340)',  role: 'ANALYTICS' },
  { name: 'AGAM',  icon: '👁', color: 'oklch(72% 0.14 200)',  role: 'MONITOR' },
  { name: 'OLIVE', icon: '📈', color: 'oklch(78% 0.17 140)',  role: 'TRENDS' },
  { name: 'ANDY',  icon: '🔗', color: 'oklch(68% 0.18 45)',   role: 'DATA' },
]

// SVG connection lines from agent to center
function ConnectionLine({ x1, y1, cx, cy, color, active, pulse }) {
  const [dash, setDash] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setDash(d => (d + 2) % 20), 40)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null

  return (
    <line
      x1={x1} y1={y1} x2={cx} y2={cy}
      stroke={color}
      strokeWidth={pulse ? 1.5 : 0.8}
      strokeOpacity={pulse ? 0.7 : 0.25}
      strokeDasharray="4 6"
      strokeDashoffset={-dash}
      style={{ transition: 'stroke-opacity 0.5s' }}
    />
  )
}

export default function OrbitalAgents({ size = 560 }) {
  const { agents } = useJarvisStore()
  const [hoveredAgent, setHoveredAgent] = useState(null)
  const SIZE = size
  const CX = SIZE / 2
  const CY = SIZE / 2
  const ORBIT_R = SIZE * 0.393
  const NODE_R = Math.max(18, SIZE * 0.046)

  const nodes = AGENTS_CONFIG.map((cfg, i) => {
    const angle = (i / AGENTS_CONFIG.length) * Math.PI * 2 - Math.PI / 2
    const agent = agents[i] || {}
    return {
      ...cfg,
      ...agent,
      angle,
      x: CX + Math.cos(angle) * ORBIT_R,
      y: CY + Math.sin(angle) * ORBIT_R,
    }
  })

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0, overflow: 'visible' }}>
      {/* SVG connections */}
      <svg
        width={SIZE} height={SIZE}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
      >
        {/* Orbit circle */}
        <circle
          cx={CX} cy={CY} r={ORBIT_R}
          fill="none"
          stroke="oklch(78% 0.15 210 / 0.08)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        {/* Connection lines */}
        {nodes.map(n => (
          <ConnectionLine
            key={n.name}
            x1={n.x} y1={n.y}
            cx={CX} cy={CY}
            color={n.color}
            active={n.status === 'active'}
            pulse={hoveredAgent === n.name}
          />
        ))}
        {/* Energy dots travelling along lines */}
        {nodes.filter(n => n.status === 'active').map(n => (
          <TravelDot key={`dot-${n.name}`} x1={n.x} y1={n.y} x2={CX} y2={CY} color={n.color} />
        ))}
      </svg>

      {/* Agent nodes */}
      {nodes.map(n => (
        <AgentNode
          key={n.name}
          node={n}
          nodeR={NODE_R}
          hovered={hoveredAgent === n.name}
          onHover={setHoveredAgent}
        />
      ))}
    </div>
  )
}

function TravelDot({ x1, y1, x2, y2, color }) {
  const [t, setT] = useState(Math.random())

  useEffect(() => {
    const id = setInterval(() => {
      setT(prev => {
        const next = prev + 0.008
        return next > 1 ? 0 : next
      })
    }, 30)
    return () => clearInterval(id)
  }, [])

  const x = x1 + (x2 - x1) * t
  const y = y1 + (y2 - y1) * t

  return (
    <circle cx={x} cy={y} r={2.5} fill={color} opacity={0.9}
      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
    />
  )
}

function AgentNode({ node, nodeR, hovered, onHover }) {
  const isActive = node.status === 'active'

  return (
    <div
      className="agent-node"
      style={{
        left: node.x, top: node.y,
        zIndex: 3,
      }}
      onMouseEnter={() => onHover(node.name)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Signal rings */}
      {isActive && [1.6, 2.2].map(scale => (
        <div key={scale} style={{
          position: 'absolute',
          width: nodeR * 2 * scale, height: nodeR * 2 * scale,
          borderRadius: '50%',
          border: `1px solid ${node.color}`,
          top: '50%', left: '50%',
          transform: `translate(-50%,-50%)`,
          opacity: 0.2,
          animation: `pulse-ring ${2 + scale}s ease-in-out infinite`,
        }} />
      ))}

      {/* Core circle — Emil: specify exact transitions, custom easing */}
      <div style={{
        width: nodeR * 2, height: nodeR * 2,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, color-mix(in oklch, ${node.color} 18%, oklch(8% 0.012 250)), oklch(8% 0.012 250))`,
        border: `1.5px solid ${node.color}`,
        boxShadow: `0 0 ${hovered ? 30 : 16}px ${node.color}60, 0 0 ${hovered ? 60 : 30}px ${node.color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
        transition: 'box-shadow 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1)',
        transform: `scale(${hovered ? 1.2 : 1})`,
        position: 'relative', zIndex: 4,
      }}>
        {node.icon}
        {/* Active glow dot */}
        {isActive && (
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 6, height: 6, borderRadius: '50%',
            background: node.color,
            boxShadow: `0 0 6px ${node.color}`,
          }} />
        )}
      </div>

      {/* Tooltip — Emil: popIn from scale(0.95), not scale(0) */}
      {hovered && (
        <div className="anim-pop-in" style={{
          position: 'absolute',
          top: '100%', left: '50%',
          transform: 'translateX(-50%)',
          transformOrigin: 'top center',
          marginTop: 8,
          background: 'oklch(9% 0.012 250)',
          border: `1px solid ${node.color}50`,
          borderRadius: 4,
          padding: '6px 10px',
          whiteSpace: 'nowrap',
          zIndex: 10,
          boxShadow: `0 0 20px ${node.color}30`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: node.color, letterSpacing: 1 }}>
            {node.name}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginTop: 1 }}>
            {node.role}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
            {node.tasks} tasks · {node.success}% success
          </div>
          <div style={{ fontSize: 9, color: isActive ? 'var(--green)' : 'var(--amber)', marginTop: 1 }}>
            ● {isActive ? 'ACTIVE' : 'IDLE'}
          </div>
        </div>
      )}

      {/* Name label */}
      {!hovered && (
        <div style={{
          position: 'absolute',
          top: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 4,
          fontSize: 8, letterSpacing: 2,
          color: node.color,
          textShadow: `0 0 8px ${node.color}`,
          whiteSpace: 'nowrap',
          fontFamily: 'Courier New, monospace',
          opacity: 0.8,
        }}>{node.name}</div>
      )}
    </div>
  )
}
