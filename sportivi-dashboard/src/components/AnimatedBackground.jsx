import { useEffect, useRef } from 'react'

export default function AnimatedBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf, w, h

    // Particles
    const particles = []
    const NODE_COUNT = 60
    const CONNECTION_DIST = 140

    function resize() {
      w = canvas.width  = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < NODE_COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.2,
      })
    }

    let frame = 0

    function draw() {
      ctx.clearRect(0, 0, w, h)
      frame++

      // Grid
      ctx.strokeStyle = 'rgba(0,212,255,0.04)'
      ctx.lineWidth = 1
      const step = 80
      for (let x = 0; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }

      // Radar sweep (top-right corner)
      const rx = w - 120, ry = 120, rr = 90
      const angle = (frame * 0.015) % (Math.PI * 2)
      // Simple radar: arc glow
      ctx.save()
      ctx.translate(rx, ry)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, rr, angle - 0.8, angle, false)
      ctx.closePath()
      const sweep = ctx.createRadialGradient(0, 0, 0, 0, 0, rr)
      sweep.addColorStop(0, 'rgba(0,212,255,0.15)')
      sweep.addColorStop(1, 'rgba(0,212,255,0)')
      ctx.fillStyle = sweep
      ctx.fill()
      // Radar ring
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI*2)
      ctx.strokeStyle = 'rgba(0,212,255,0.12)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, rr*0.6, 0, Math.PI*2)
      ctx.strokeStyle = 'rgba(0,212,255,0.07)'; ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, rr*0.3, 0, Math.PI*2)
      ctx.strokeStyle = 'rgba(0,212,255,0.07)'; ctx.stroke()
      // Sweep line
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle) * rr, Math.sin(angle) * rr)
      ctx.strokeStyle = 'rgba(0,212,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.restore()

      // Neural network nodes + connections
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x, dy = p.y - q.y
          const dist = Math.sqrt(dx*dx + dy*dy)
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.12
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.strokeStyle = `rgba(0,212,255,${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
        ctx.fillStyle = `rgba(0,212,255,${p.alpha})`
        ctx.fill()
      }

      // Horizontal scan line
      const scanY = ((frame * 0.4) % (h + 100)) - 50
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30)
      scanGrad.addColorStop(0,   'rgba(0,212,255,0)')
      scanGrad.addColorStop(0.5, 'rgba(0,212,255,0.06)')
      scanGrad.addColorStop(1,   'rgba(0,212,255,0)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 30, w, 60)

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0, zIndex: 0,
        pointerEvents: 'none', opacity: 0.85,
      }} />
      <div className="scanline-overlay" />
    </>
  )
}
