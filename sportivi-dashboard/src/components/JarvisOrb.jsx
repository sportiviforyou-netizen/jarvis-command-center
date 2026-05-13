import { useEffect, useRef, useState } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

const AGENT_COLORS = {
  TALIA: '#00d4ff', GAL: '#8b5cf6', SHIR: '#f59e0b', PELEG: '#10b981',
  ROMI:  '#ec4899', AGAM: '#06b6d4', OLIVE: '#84cc16', ANDY: '#f97316',
}

function AgentDot({ agent, index }) {
  const angle = (index / 8) * 360
  const radius = 90
  const rad = (angle * Math.PI) / 180
  const x = Math.cos(rad) * radius
  const y = Math.sin(rad) * radius
  const color = AGENT_COLORS[agent.name] || '#00d4ff'

  return (
    <div className={`agent-dot-${index + 1}`} style={{
      position: 'absolute',
      left: '50%', top: '50%',
      marginLeft: -8, marginTop: -8,
      transformOrigin: `8px 8px`,
    }}>
      <div title={`${agent.name}: ${agent.role}`} style={{
        width: 16, height: 16,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 10px ${color}, 0 0 20px ${color}50`,
        border: '2px solid rgba(255,255,255,0.3)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8,
      }} />
    </div>
  )
}

export default function JarvisOrb() {
  const { agents, kpi } = useJarvisStore()
  const [tick, setTick] = useState(0)
  const canvasRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Canvas particle ring
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = 220
    canvas.height = 220
    let frame = 0
    let raf

    function draw() {
      ctx.clearRect(0, 0, 220, 220)
      const cx = 110, cy = 110
      frame += 0.02

      // Outer ring glow
      for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2 + frame
        const r = 96 + Math.sin(frame * 3 + i) * 4
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        const alpha = 0.3 + Math.sin(frame * 2 + i * 0.3) * 0.2
        ctx.beginPath()
        ctx.arc(x, y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,212,255,${alpha})`
        ctx.fill()
      }

      // Inner ring
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2 - frame * 1.5
        const r = 64 + Math.sin(frame * 2 + i) * 3
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        const alpha = 0.2 + Math.sin(frame * 3 + i * 0.5) * 0.15
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139,92,246,${alpha})`
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  const activeCount = agents.filter(a => a.status === 'active').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Orb container */}
      <div style={{ position: 'relative', width: 220, height: 220 }} className="animate-float">
        {/* Canvas particles */}
        <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />

        {/* Agent dots orbiting */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}>
          {agents.map((agent, i) => (
            <AgentDot key={agent.id} agent={agent} index={i} />
          ))}
        </div>

        {/* Core orb */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 88, height: 88,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, rgba(0,212,255,0.9), rgba(0,60,180,0.8), rgba(5,5,16,0.9))',
          border: '2px solid rgba(0,212,255,0.6)',
        }} className="animate-orb-pulse">
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', textShadow: '0 0 16px #00d4ff' }}>J</div>
            <div style={{ fontSize: 8, color: 'rgba(0,212,255,0.8)', letterSpacing: 1 }}>ONLINE</div>
          </div>
        </div>
      </div>

      {/* Stats below orb */}
      <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }} className="text-glow-green">{activeCount}/8</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>סוכנים פעילים</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#00d4ff' }}>{kpi.revenueToday.toLocaleString()}₪</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>הכנסה היום</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#8b5cf6' }}>{kpi.roas}x</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>ROAS</div>
        </div>
      </div>
    </div>
  )
}
