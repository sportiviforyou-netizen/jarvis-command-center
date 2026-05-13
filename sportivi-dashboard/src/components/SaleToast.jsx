/**
 * SaleToast — real-time sale notifications, bottom-left corner.
 * Emil: slide-in from left + scale(0.95), specific transitions.
 * Simulates live sales every 10-25 seconds.
 */
import { useState, useEffect } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

export default function SaleToast() {
  const { products } = useJarvisStore()
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    if (!products?.length) return

    function schedule() {
      const delay = 10000 + Math.random() * 15000
      return setTimeout(() => {
        const p = products[Math.floor(Math.random() * Math.min(6, products.length))]
        const id = Date.now()
        setToasts(prev => [...prev.slice(-2), { id, product: p, exiting: false }])

        // Auto-remove after 5s
        setTimeout(() => {
          setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
          setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250)
        }, 5000)

        timer = schedule()
      }, delay)
    }

    let timer = schedule()
    return () => clearTimeout(timer)
  }, [products])

  return (
    <div style={{
      position: 'fixed',
      bottom: 48, left: 20,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      zIndex: 600, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={t.exiting ? 'toast-exit' : 'toast-enter'}
          style={{
            background: 'oklch(9% 0.015 250)',
            border: '1px solid oklch(80% 0.18 160 / 0.5)',
            borderRadius: 6,
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            minWidth: 220,
            boxShadow: '0 0 24px oklch(80% 0.18 160 / 0.12)',
          }}
        >
          {/* Green pulse dot */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div className="dot dot-green" style={{ width: 8, height: 8 }} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 8, letterSpacing: 3, color: 'var(--green)',
              marginBottom: 3, fontFamily: 'var(--font-mono)',
            }}>
              ✓ מכירה חדשה!
            </div>
            <div className="heb-bold" style={{ fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
              {t.product?.name}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{
                fontSize: 15, fontWeight: 800,
                color: 'var(--amber)',
                textShadow: '0 0 10px var(--amber)',
              }}>₪{t.product?.price}</span>
              <span style={{
                fontSize: 8, letterSpacing: 2,
                color: 'var(--text-dim)',
              }}>ALIEXPRESS</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
