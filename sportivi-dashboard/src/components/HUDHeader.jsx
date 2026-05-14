import { useState, useEffect } from 'react'
import { useJarvisStore } from '../store/useJarvisStore'
import { useVoiceStore }  from '../store/useVoiceStore'

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const tz = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  return <span>{tz.format(time)}</span>
}

export default function HUDHeader() {
  const { lastUpdate, loading, refreshData, dataSource, setActiveTab, activeTab } = useJarvisStore()
  const { voiceOpen, setVoiceOpen, voiceState } = useVoiceStore()

  const tabs = [
    { id: 'overview',    label: 'COMMAND'    },
    { id: 'products',    label: 'INTEL'      },
    { id: 'agents',      label: 'AGENTS'     },
    { id: 'aliexpress',  label: '🛒 AE'      },
    { id: 'analytics',   label: 'METRICS'    },
    { id: 'insights',    label: 'AI CORE'    },
  ]

  const voiceColor = voiceState === 'idle'      ? 'var(--cyan)'
                   : voiceState === 'listening' ? '#ff3b5c'
                   : voiceState === 'thinking'  ? 'var(--purple)'
                   : 'var(--green)'

  return (
    <header style={{
      background: 'oklch(7% 0.01 250 / 0.97)',
      borderBottom: '1px solid oklch(20% 0.02 250)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 28px',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, oklch(78% 0.15 210 / 0.5), transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', height: 52, gap: 20 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, oklch(78% 0.15 210), oklch(35% 0.18 240))',
            border: '1.5px solid oklch(78% 0.15 210 / 0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 900, color: 'oklch(96% 0.02 210)',
            boxShadow: '0 0 18px oklch(78% 0.15 210 / 0.5)',
          }}>J</div>
          <div>
            <div style={{
              fontSize: 15, fontWeight: 900, letterSpacing: 5,
              color: 'var(--cyan)', textShadow: '0 0 14px var(--cyan)',
            }}>JARVIS</div>
            <div style={{ fontSize: 7, letterSpacing: 3, color: 'oklch(45% 0.08 210)' }}>
              SPORTIVI FOR YOU
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
          {tabs.map(t => {
            const active = activeTab === t.id
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                background: active ? 'oklch(78% 0.15 210 / 0.08)' : 'transparent',
                border: active
                  ? '1px solid oklch(78% 0.15 210 / 0.35)'
                  : '1px solid transparent',
                color: active ? 'var(--cyan)' : 'var(--text-dim)',
                padding: '5px 16px', borderRadius: 3, cursor: 'pointer',
                fontSize: 9, letterSpacing: 3, textTransform: 'uppercase',
                fontFamily: 'inherit',
                boxShadow: active ? '0 0 14px oklch(78% 0.15 210 / 0.12)' : 'none',
                textShadow: active ? '0 0 8px var(--cyan)' : 'none',
                transition: 'color 160ms var(--ease-out), border-color 160ms var(--ease-out), background 160ms var(--ease-out), box-shadow 160ms var(--ease-out), transform 160ms var(--ease-out)',
              }}>{t.label}</button>
            )
          })}
        </nav>

        {/* Right HUD info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginRight: 'auto', flexShrink: 0 }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: 'var(--cyan)',
              letterSpacing: 2, textShadow: '0 0 10px var(--cyan)',
            }}>
              <Clock />
            </div>
            <div style={{ fontSize: 7, letterSpacing: 2, color: 'oklch(40% 0.06 210)' }}>
              IST · JERUSALEM
            </div>
          </div>

          <div style={{ width: 1, height: 26, background: 'oklch(20% 0.02 250)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              className={`dot ${dataSource === 'live' || dataSource === 'vault' ? 'dot-green' : 'dot-amber'}`}
              style={{ width: 5, height: 5 }}
            />
            <div style={{
              fontSize: 8, letterSpacing: 2,
              color: dataSource === 'live' || dataSource === 'vault'
                ? 'var(--green)' : 'var(--text-dim)',
              textShadow: dataSource === 'live' || dataSource === 'vault'
                ? '0 0 6px var(--green)' : 'none',
            }}>
              {dataSource === 'live'  ? 'LIVE DATA'  :
               dataSource === 'vault' ? 'VAULT LIVE' : 'DEMO MODE'}
            </div>
          </div>

          <button onClick={refreshData} disabled={loading} style={{
            background: 'oklch(78% 0.15 210 / 0.06)',
            border: '1px solid oklch(78% 0.15 210 / 0.22)',
            color: 'var(--cyan)', padding: '4px 12px',
            borderRadius: 3, cursor: loading ? 'wait' : 'pointer',
            fontSize: 8, letterSpacing: 2, fontFamily: 'inherit',
            textShadow: '0 0 6px var(--cyan)',
          }}>{loading ? '◌' : '⟳'} SYNC</button>

          {/* ── Mic / Voice toggle ── */}
          <button
            onClick={() => setVoiceOpen(!voiceOpen)}
            title="GARVIS Voice (Space)"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `1.5px solid ${voiceColor}`,
              background: voiceOpen
                ? `radial-gradient(circle at 35% 35%, ${voiceColor}30, oklch(5% 0.01 250))`
                : 'oklch(78% 0.15 210 / 0.04)',
              color: 'white', fontSize: 15,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: voiceOpen ? `0 0 18px ${voiceColor}70` : 'none',
              transition: 'all 0.2s ease',
              animation: voiceState === 'listening' ? 'mic-pulse-hdr 0.7s ease-in-out infinite alternate'
                       : voiceState === 'speaking'  ? 'speak-pulse 1s ease-in-out infinite'
                       : 'none',
            }}
          >
            {voiceState === 'idle'      && '🎙'}
            {voiceState === 'listening' && '⏹'}
            {voiceState === 'thinking'  && '⚙'}
            {voiceState === 'speaking'  && '🔊'}
          </button>
        </div>
      </div>
    </header>
  )
}
