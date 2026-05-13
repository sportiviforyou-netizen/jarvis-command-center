import { useEffect, useRef } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

export default function CoreOrb() {
  const canvasRef = useRef(null)
  const { agents, kpi } = useJarvisStore()
  const activeCount = agents.filter(a => a.status === 'active').length

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const S = 480
    canvas.width = S; canvas.height = S
    const cx = S / 2, cy = S / 2
    let frame = 0, raf

    function draw() {
      ctx.clearRect(0, 0, S, S)
      frame++
      const t = frame * 0.018

      // ── Ambient outer glow ──
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.48)
      ambient.addColorStop(0,   'oklch(78% 0.15 210 / 0.06)')
      ambient.addColorStop(0.6, 'oklch(55% 0.22 290 / 0.03)')
      ambient.addColorStop(1,   'transparent')
      ctx.beginPath(); ctx.arc(cx, cy, S * 0.48, 0, Math.PI * 2)
      ctx.fillStyle = ambient; ctx.fill()

      // ── Static orbit rings ──
      ;[0.44, 0.34, 0.26].forEach((r, i) => {
        ctx.beginPath()
        ctx.arc(cx, cy, cx * r * 2, 0, Math.PI * 2)
        ctx.strokeStyle = `oklch(78% 0.15 210 / ${0.06 + i * 0.02})`
        ctx.lineWidth = 1
        ctx.setLineDash([4, 12])
        ctx.lineDashOffset = -frame * (i % 2 === 0 ? 0.3 : -0.3)
        ctx.stroke()
        ctx.setLineDash([])
      })

      // ── Rotating tick ring (outer) ──
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.4)
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2
        const r0 = cx * 0.82, r1 = cx * 0.86
        const alpha = i % 4 === 0 ? 0.7 : 0.2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
        ctx.strokeStyle = `oklch(78% 0.15 210 / ${alpha})`
        ctx.lineWidth = i % 4 === 0 ? 1.5 : 0.8
        ctx.stroke()
      }
      ctx.restore()

      // ── CCW purple particle ring ──
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t * 0.6)
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2
        const r = cx * 0.62
        const sz = i % 5 === 0 ? 2.5 : 1.2
        const alpha = 0.3 + Math.sin(t * 1.5 + i * 0.8) * 0.25
        ctx.beginPath()
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, sz, 0, Math.PI * 2)
        ctx.fillStyle = `oklch(55% 0.22 290 / ${alpha})`
        ctx.fill()
      }
      ctx.restore()

      // ── Activity arc segments ──
      for (let i = 0; i < 8; i++) {
        const startA = (i / 8) * Math.PI * 2 - Math.PI / 2
        const arc    = (0.6 / 8) * Math.PI * 2
        const pulse  = 0.25 + Math.sin(t * 1.2 + i * 0.9) * 0.2
        const isAmber = i % 3 === 0
        ctx.beginPath()
        ctx.arc(cx, cy, cx * 0.73, startA, startA + arc)
        ctx.strokeStyle = isAmber
          ? `oklch(72% 0.16 65 / ${pulse})`
          : `oklch(78% 0.15 210 / ${pulse})`
        ctx.lineWidth = 3; ctx.stroke()
      }

      // ── Core sphere ──
      const core = ctx.createRadialGradient(
        cx - 12, cy - 12, 0,
        cx, cy, cx * 0.38
      )
      core.addColorStop(0,   'oklch(95% 0.06 210 / 0.95)')
      core.addColorStop(0.25,'oklch(78% 0.15 210 / 0.85)')
      core.addColorStop(0.6, 'oklch(35% 0.18 250 / 0.8)')
      core.addColorStop(1,   'oklch(8% 0.02 250 / 0)')
      ctx.beginPath(); ctx.arc(cx, cy, cx * 0.38, 0, Math.PI * 2)
      ctx.fillStyle = core; ctx.fill()

      // ── Orbiting spark trails ──
      for (let i = 0; i < 5; i++) {
        const a = t * 1.1 + (i / 5) * Math.PI * 2
        const r = cx * 0.38 + 2
        const px = cx + Math.cos(a) * r
        const py = cy + Math.sin(a) * r
        for (let j = 0; j < 5; j++) {
          const ta = a - j * 0.12
          const tr = r - j * 0.5
          ctx.beginPath()
          ctx.arc(cx + Math.cos(ta) * tr, cy + Math.sin(ta) * tr, 1.5 - j * 0.2, 0, Math.PI * 2)
          ctx.fillStyle = `oklch(78% 0.15 210 / ${0.9 - j * 0.17})`
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = 'oklch(95% 0.05 210)'; ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Ambient bloom behind orb */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-52%)',
        width: 560, height: 560, borderRadius: '50%',
        background: 'radial-gradient(circle, oklch(78% 0.15 210 / 0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
        animation: 'pulse-slow 4s ease-in-out infinite',
      }} />

      <canvas ref={canvasRef} style={{ position: 'relative', zIndex: 2, animation: 'float-y 5s ease-in-out infinite' }} />

      {/* Label overlay */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        textAlign: 'center', zIndex: 3, pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <div style={{
          fontSize: 28, fontWeight: 900, letterSpacing: 6,
          color: 'oklch(96% 0.02 210)',
          textShadow: '0 0 24px var(--cyan), 0 0 60px oklch(78% 0.15 210 / 0.4)',
        }}>JARVIS</div>
        <div style={{ fontSize: 8, letterSpacing: 5, color: 'var(--cyan)', opacity: 0.75, marginTop: 2 }}>
          ONLINE
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
          <div className="dot dot-green" style={{ width: 5, height: 5 }} />
          <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)' }}>
            {activeCount}/8 ACTIVE
          </span>
        </div>
      </div>

      {/* Bottom stat row */}
      <div style={{
        display: 'flex', gap: 24, marginTop: 4, zIndex: 2,
        borderTop: '1px solid oklch(20% 0.02 250)',
        paddingTop: 12,
      }}>
        {[
          { v: `₪${kpi.revenueToday.toLocaleString()}`, l: 'REVENUE' },
          { v: `${kpi.roas}x`,                          l: 'ROAS' },
          { v: `${kpi.ctr}%`,                           l: 'CTR' },
        ].map(s => (
          <div key={s.l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cyan)', textShadow: '0 0 10px var(--cyan)', letterSpacing: 1 }}>
              {s.v}
            </div>
            <div style={{ fontSize: 7, letterSpacing: 3, color: 'var(--text-dim)', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
