/**
 * IntelFeed — impeccable: no side-stripe borders, no identical cards.
 * Alerts use background tints + icon-led rows, not border-right accents.
 * Emil: slide-in-right stagger, pop-in tooltips.
 */
import { useState, useEffect } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

const TYPE = {
  critical: { color: 'var(--red)',    bg: 'oklch(60% 0.22 25 / 0.08)',  icon: '!', dot: 'dot-red' },
  warning:  { color: 'var(--amber)',  bg: 'oklch(72% 0.16 65 / 0.07)',  icon: '◈', dot: 'dot-amber' },
  info:     { color: 'var(--cyan)',   bg: 'oklch(78% 0.15 210 / 0.06)', icon: '○', dot: 'dot-cyan' },
  success:  { color: 'var(--green)',  bg: 'oklch(80% 0.18 160 / 0.07)', icon: '✓', dot: 'dot-green' },
}

function Waveform({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: 16 }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className="wave-bar" style={{
          animationDelay: `${i * 40}ms`,
          animationPlayState: active ? 'running' : 'paused',
          height: active ? undefined : 2,
          opacity: active ? 1 : 0.2,
        }} />
      ))}
    </div>
  )
}

function TypewriterText({ text, speed = 55 }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => i < text.length ? i + 1 : 0), speed)
    return () => clearInterval(id)
  }, [text, speed])
  return <>{text.slice(0, idx)}<span style={{ animation: 'blink 1s step-end infinite', color: 'var(--cyan)' }}>_</span></>
}

export default function IntelFeed() {
  const { insights } = useJarvisStore()
  const [speaking, setSpeaking] = useState(false)
  const [dismissed, setDismissed] = useState(new Set())

  useEffect(() => {
    const id = setInterval(() => setSpeaking(s => !s), 3800)
    return () => clearInterval(id)
  }, [])

  function dismiss(i) {
    setDismissed(prev => new Set([...prev, i]))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* AI Core status — impeccable: no glass card, just a contained panel */}
      <div style={{
        background: 'oklch(10% 0.015 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4,
        padding: '12px 14px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)' }}>JARVIS AI CORE</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className={`dot ${speaking ? 'dot-green' : 'dot-amber'}`} style={{ width: 5, height: 5 }} />
            <span style={{ fontSize: 8, letterSpacing: 2, color: speaking ? 'var(--green)' : 'var(--amber)' }}>
              {speaking ? 'PROCESSING' : 'STANDBY'}
            </span>
          </div>
        </div>
        <Waveform active={speaking} />
        <div style={{ marginTop: 8, fontFamily: 'var(--font-heb)', fontSize: 11, color: 'oklch(55% 0.1 210)', lineHeight: 1.5, minHeight: 18 }}>
          <TypewriterText text="מנתח נתונים · מזהה טרנדים · מייעל קמפיינים · מוניטורינג שוק" />
        </div>
      </div>

      {/* Alerts — impeccable: background tint + icon prefix, NO side-stripe border */}
      <div style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 8 }}>
        ACTIVE ALERTS
      </div>

      {insights.map((ins, i) => {
        if (dismissed.has(i)) return null
        const cfg = TYPE[ins.type] || TYPE.info
        return (
          <div
            key={i}
            className="alert-row"
            onClick={() => dismiss(i)}
            title="לחץ לסגירה"
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.color}18`,
              borderRadius: 3,
              padding: '9px 11px',
              marginBottom: 6,
              transition: 'background 140ms var(--ease-out)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = cfg.bg.replace('0.08', '0.14').replace('0.07', '0.12').replace('0.06', '0.1')}
            onMouseLeave={e => e.currentTarget.style.background = cfg.bg}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 12, color: cfg.color, flexShrink: 0, lineHeight: 1,
                textShadow: `0 0 6px ${cfg.color}`,
              }}>{cfg.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 8, letterSpacing: 2, color: cfg.color, fontFamily: 'var(--font-mono)' }}>
                    {ins.agent}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-heb)' }}>
                      {ins.time}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.4 }}>✕</span>
                  </div>
                </div>
                {/* Hebrew message — Heebo, prominent */}
                <div style={{
                  fontFamily: 'var(--font-heb)',
                  fontSize: 12, fontWeight: 500,
                  color: 'var(--text)', lineHeight: 1.5,
                }}>
                  {ins.msg}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Strategic recommendation */}
      <div style={{
        marginTop: 8,
        background: 'oklch(10% 0.015 250)',
        border: '1px solid oklch(20% 0.02 250)',
        borderRadius: 4, padding: '11px 13px',
      }}>
        <div style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 7 }}>
          ▸ המלצה אסטרטגית
        </div>
        <div style={{
          fontFamily: 'var(--font-heb)',
          fontSize: 13, fontWeight: 500,
          color: 'oklch(80% 0.04 250)', lineHeight: 1.7,
        }}>
          קטגוריית אגרוף — CTR מעל 5%, נפח גבוה.
          מומלץ להכפיל תקציב ולהשיק 3 מוצרים חדשים בשבוע הקרוב.
        </div>
      </div>
    </div>
  )
}
