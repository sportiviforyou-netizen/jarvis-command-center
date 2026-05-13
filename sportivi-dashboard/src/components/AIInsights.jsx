import { useState, useEffect } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'

const TYPE_CFG = {
  critical: { color: '#ff4444', icon: '⚠', label: 'CRITICAL' },
  warning:  { color: '#f59e0b', icon: '◈', label: 'WARNING' },
  info:     { color: '#00d4ff', icon: '◉', label: 'INTEL' },
  success:  { color: '#06ffa5', icon: '✓', label: 'SUCCESS' },
}

function Waveform({ active }) {
  const bars = 18
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className="waveform-bar" style={{
          animationDelay: `${i * 0.05}s`,
          animationPlayState: active ? 'running' : 'paused',
          height: active ? undefined : 3,
          opacity: active ? 1 : 0.2,
        }} />
      ))}
    </div>
  )
}

export default function AIInsights() {
  const { insights } = useJarvisStore()
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [typewriterIdx, setTypewriterIdx] = useState(0)
  const AI_MSG = 'מנתח נתונים · זיהוי טרנדים · אופטימיזציה פעילה · מוניטורינג שוק'

  useEffect(() => {
    const id = setInterval(() => {
      setAiSpeaking(s => !s)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTypewriterIdx(i => i < AI_MSG.length ? i + 1 : 0)
    }, 80)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* AI Speaking panel */}
      <div style={{
        background: 'rgba(0,10,30,0.9)',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 6, padding: '12px 16px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: '#00d4ff', opacity: 0.7 }}>
            ◈ JARVIS AI CORE ◈
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: aiSpeaking ? '#06ffa5' : '#f59e0b',
              boxShadow: `0 0 8px ${aiSpeaking ? '#06ffa5' : '#f59e0b'}`,
            }} />
            <span style={{ fontSize: 8, letterSpacing: 1, color: aiSpeaking ? '#06ffa5' : '#f59e0b' }}>
              {aiSpeaking ? 'PROCESSING' : 'STANDBY'}
            </span>
          </div>
        </div>

        <Waveform active={aiSpeaking} />

        <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(0,212,255,0.6)', letterSpacing: 1, minHeight: 16 }}>
          {AI_MSG.slice(0, typewriterIdx)}
          <span className="anim-blink" style={{ color: '#00d4ff' }}>_</span>
        </div>
      </div>

      {/* Insights list */}
      <div style={{ fontSize: 9, letterSpacing: 3, color: 'rgba(0,212,255,0.4)', marginBottom: 2 }}>
        ACTIVE ALERTS
      </div>

      {insights.map((ins, i) => {
        const cfg = TYPE_CFG[ins.type] || TYPE_CFG.info
        return (
          <div key={i} style={{
            background: `${cfg.color}08`,
            border: `1px solid ${cfg.color}20`,
            borderRight: `3px solid ${cfg.color}`,
            borderRadius: '0 4px 4px 0',
            padding: '10px 12px',
            position: 'relative',
            transition: 'background 0.2s',
            cursor: 'default',
          }}
          onMouseEnter={e => e.currentTarget.style.background = `${cfg.color}12`}
          onMouseLeave={e => e.currentTarget.style.background = `${cfg.color}08`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: cfg.color, fontSize: 12 }}>{cfg.icon}</span>
                <span style={{ fontSize: 8, letterSpacing: 2, color: cfg.color }}>{cfg.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                <span style={{ color: cfg.color }}>{ins.agent}</span>
                <span>{ins.time}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>
              {ins.msg}
            </div>
          </div>
        )
      })}

      {/* Strategic recommendation */}
      <div style={{
        background: 'rgba(0,212,255,0.04)',
        border: '1px solid rgba(0,212,255,0.15)',
        borderRadius: 6, padding: '12px 14px', marginTop: 4,
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: 'rgba(0,212,255,0.5)', marginBottom: 8 }}>
          ▸ STRATEGIC RECOMMENDATION
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
          על פי ניתוח 48 שעות — קטגוריית אגרוף מציגה נפח גבוה עם CTR מעל 5%.
          מומלץ להכפיל תקציב ב-3 הימים הבאים ולהשיק 3 מוצרים חדשים בקטגוריה.
        </div>
      </div>
    </div>
  )
}
