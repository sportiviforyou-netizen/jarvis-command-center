/**
 * VoicePanelFloat — Hebrew ChatGPT voice assistant embedded in the dashboard.
 *
 * Sits as a fixed overlay on top of every tab.  One microphone icon in the
 * header opens/closes it.  No separate page.
 *
 * States:  idle → listening → thinking → speaking
 * Uses:    /voice-transcribe (Whisper STT)  +  /command-stream (GPT)  +  /voice-tts (TTS)
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useVoiceStore } from '../store/useVoiceStore'

const GARVIS = 'https://jarvis-command-center-1-0.onrender.com'

/* ─────────────────────────────────────────────────────── visual helpers ──── */
const STATE_CFG = {
  idle:      { color: 'var(--cyan)',   icon: '🎙', label: 'לחץ לדיבור',         glow: 'var(--cyan)' },
  listening: { color: '#ff3b5c',       icon: '⏹',  label: 'מקליט… שחרר',       glow: '#ff3b5c' },
  thinking:  { color: 'var(--purple)', icon: '⚙',  label: 'ג׳רביס חושב…',       glow: 'var(--purple)' },
  speaking:  { color: 'var(--green)',  icon: '🔊',  label: 'מדבר…',             glow: 'var(--green)' },
}

function MicButton({ state: s, onStart, onStop }) {
  const cfg = STATE_CFG[s] || STATE_CFG.idle
  return (
    <button
      onMouseDown={onStart}  onTouchStart={e => { e.preventDefault(); onStart() }}
      onMouseUp={onStop}     onTouchEnd={e => { e.preventDefault(); onStop() }}
      onMouseLeave={() => s === 'listening' && onStop()}
      style={{
        width: 72, height: 72, borderRadius: '50%',
        border: `2px solid ${cfg.color}`,
        background: `radial-gradient(circle at 35% 35%, ${cfg.color}22, oklch(5% 0.01 250))`,
        color: 'white', fontSize: 28, cursor: 'pointer', flexShrink: 0,
        boxShadow: `0 0 ${s === 'idle' ? 16 : 30}px ${cfg.glow}${s === 'idle' ? '50' : '90'}`,
        transition: 'all 0.2s ease',
        animation: s === 'listening' ? 'mic-pulse 0.7s ease-in-out infinite alternate'
                 : s === 'thinking'  ? 'spin 1s linear infinite'
                 : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
    >{cfg.icon}</button>
  )
}

/* ── waveform canvas ─────────────────────────────────────────────────────── */
function Waveform({ analyser, active }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    if (!active || !analyser) { cancelAnimationFrame(rafRef.current); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const draw = () => {
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const { width: W, height: H } = canvas
      ctx.clearRect(0, 0, W, H)
      const bw = W / data.length
      data.forEach((v, i) => {
        const h  = (v / 255) * H
        const al = 0.35 + (v / 255) * 0.65
        ctx.fillStyle = `rgba(0,212,255,${al})`
        ctx.fillRect(i * bw, H - h, bw - 1, h)
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, analyser])

  return (
    <canvas ref={canvasRef} width={260} height={32}
      style={{ width: '100%', height: 32, borderRadius: 4,
               background: 'oklch(7% 0.01 250)', display: active ? 'block' : 'none' }} />
  )
}

/* ── conversation history item ───────────────────────────────────────────── */
function HistoryItem({ item, onReplay }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid oklch(16% 0.015 250)' }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: 1 }}>
        {item.time}
      </div>
      <div style={{ fontSize: 11, color: 'oklch(68% 0.04 250)', fontFamily: 'var(--font-heb)',
                    marginBottom: 6, lineHeight: 1.5 }}>
        ❓ {item.q}
      </div>
      <div style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--font-heb)',
                    lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        💬 {item.a}
      </div>
      <button onClick={() => onReplay(item.q)} style={{
        marginTop: 6, background: 'none', border: '1px solid oklch(20% 0.02 250)',
        color: 'var(--text-dim)', fontSize: 8, padding: '3px 8px',
        borderRadius: 2, cursor: 'pointer', letterSpacing: 1,
      }}>↩ שאל שוב</button>
    </div>
  )
}

/* ── main floating panel ─────────────────────────────────────────────────── */
export default function VoicePanelFloat({ open, onClose }) {
  const { setVoiceState: setGlobalVS } = useVoiceStore()
  const [voiceState, setVSLocal]  = useState('idle')    // idle|listening|thinking|speaking
  const setVoiceState = s => { setVSLocal(s); setGlobalVS(s) }  // sync header icon
  const [transcript, setTranscript] = useState('')
  const [response,   setResponse]   = useState('')
  const [history,    setHistory]    = useState(() =>
    JSON.parse(localStorage.getItem('garvis_voice_hist') || '[]')
  )

  const mediaRecRef = useRef(null)
  const chunksRef   = useRef([])
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const lastRespRef = useRef('')
  const audioRef    = useRef(null)

  /* preferred MIME */
  const mime = (() => {
    const types = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm'
  })()
  const ext  = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm'

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
  }

  const startRecording = useCallback(async () => {
    if (voiceState !== 'idle') return
    stopAudio()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      audioCtxRef.current  = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current  = audioCtxRef.current.createAnalyser()
      analyserRef.current.fftSize = 64
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyserRef.current)

      const mr = new MediaRecorder(stream, { mimeType: mime })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(100)
      mediaRecRef.current = mr
      setVoiceState('listening')
    } catch (e) {
      setResponse(`שגיאת מיקרופון: ${e.message}`)
    }
  }, [voiceState, mime])

  const stopRecording = useCallback(() => {
    if (voiceState !== 'listening' || !mediaRecRef.current) return
    mediaRecRef.current.stop()
    mediaRecRef.current.stream.getTracks().forEach(t => t.stop())
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }

    mediaRecRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime })
      if (blob.size < 800) { setVoiceState('idle'); return }
      await processAudio(blob)
    }
  }, [voiceState, mime])   // eslint-disable-line

  async function processAudio(blob) {
    setVoiceState('thinking')
    /* 1. STT */
    try {
      const fd = new FormData()
      fd.append('audio', blob, `rec.${ext}`)
      const r  = await fetch(`${GARVIS}/voice-transcribe`, { method: 'POST', body: fd })
      const d  = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'STT failed')
      const text = (d.text || '').trim()
      if (!text) { setVoiceState('idle'); return }
      setTranscript(text)
      await askGarvis(text)
    } catch (e) {
      setResponse(`שגיאה: ${e.message}`)
      setVoiceState('idle')
    }
  }

  async function askGarvis(command) {
    setResponse('')
    lastRespRef.current = ''
    setVoiceState('thinking')
    try {
      const res = await fetch(`${GARVIS}/command-stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ command }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let msg; try { msg = JSON.parse(line.slice(6)) } catch { continue }
          if (msg.text) {
            lastRespRef.current += msg.text
            setResponse(lastRespRef.current)
          }
          if (msg.error) { setResponse(`שגיאה: ${msg.error}`); break outer }
          if (msg.done)  break outer
        }
      }
      if (lastRespRef.current) {
        await speakResponse(lastRespRef.current)
        const entry = {
          q:    command,
          a:    lastRespRef.current.slice(0, 300),
          time: new Date().toLocaleTimeString('he-IL'),
        }
        setHistory(prev => {
          const next = [entry, ...prev].slice(0, 10)
          localStorage.setItem('garvis_voice_hist', JSON.stringify(next))
          return next
        })
      } else {
        setVoiceState('idle')
      }
    } catch (e) {
      setResponse(`שגיאת חיבור: ${e.message}`)
      setVoiceState('idle')
    }
  }

  async function speakResponse(text) {
    setVoiceState('speaking')
    try {
      const r = await fetch(`${GARVIS}/voice-tts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: text.slice(0, 3000) }),
      })
      if (!r.ok) throw new Error(`TTS ${r.status}`)
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
      audio.onended = () => { URL.revokeObjectURL(url); setVoiceState('idle') }
      audio.onerror = () => { setVoiceState('idle') }
    } catch {
      setVoiceState('idle')
    }
  }

  /* keyboard shortcut: Space = start/stop */
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        if (voiceState === 'idle')      startRecording()
        else if (voiceState === 'listening') stopRecording()
      }
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, voiceState, startRecording, stopRecording, onClose])

  if (!open) return null

  const cfg = STATE_CFG[voiceState] || STATE_CFG.idle

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'oklch(0% 0 0 / 0.55)',
      }} />

      {/* panel */}
      <div style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 201,
        width: 380, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        background: 'oklch(8% 0.015 250 / 0.97)',
        border: `1px solid ${cfg.color}50`,
        borderRadius: 8,
        boxShadow: `0 0 40px ${cfg.color}30, 0 8px 32px oklch(0% 0 0 / 0.6)`,
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        animation: 'slide-up 200ms ease both',
      }}>

        {/* title bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: '1px solid oklch(16% 0.015 250)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🎙</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: cfg.color,
                            textShadow: `0 0 8px ${cfg.color}` }}>GARVIS VOICE</div>
              <div style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)' }}>
                {cfg.label.toUpperCase()}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1,
          }}>×</button>
        </div>

        {/* mic + waveform area */}
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 12 }}>
          <MicButton state={voiceState} onStart={startRecording} onStop={stopRecording} />
          <Waveform analyser={analyserRef.current} active={voiceState === 'listening'} />
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>
            לחץ SPACE או החזק כפתור • ESC לסגירה
          </div>
        </div>

        {/* transcript */}
        {transcript && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid oklch(16% 0.015 250)' }}>
            <div style={{ fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 4 }}>
              מה שאמרת
            </div>
            <div style={{ fontSize: 12, color: 'oklch(75% 0.05 250)', fontFamily: 'var(--font-heb)',
                          lineHeight: 1.5 }}>
              {transcript}
            </div>
          </div>
        )}

        {/* response */}
        {response && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid oklch(16% 0.015 250)',
                        maxHeight: 140, overflowY: 'auto' }}>
            <div style={{ fontSize: 7, letterSpacing: 2, color: cfg.color, marginBottom: 4 }}>
              תשובת GARVIS
            </div>
            <div style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-heb)',
                          lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {response}
            </div>
          </div>
        )}

        {/* replay + stop */}
        {response && voiceState !== 'speaking' && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid oklch(16% 0.015 250)',
                        display: 'flex', gap: 8 }}>
            <button onClick={() => speakResponse(lastRespRef.current || response)} style={{
              flex: 1, background: 'oklch(78% 0.15 210 / 0.06)',
              border: '1px solid oklch(78% 0.15 210 / 0.25)',
              color: 'var(--cyan)', padding: '6px 0', borderRadius: 3,
              fontSize: 8, letterSpacing: 2, cursor: 'pointer', fontFamily: 'inherit',
            }}>🔊 הקרא שוב</button>
            <button onClick={() => { setTranscript(''); setResponse(''); setVoiceState('idle') }}
              style={{
                background: 'none', border: '1px solid oklch(20% 0.02 250)',
                color: 'var(--text-dim)', padding: '6px 12px', borderRadius: 3,
                fontSize: 8, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit',
              }}>נקה</button>
          </div>
        )}

        {/* stop speaking */}
        {voiceState === 'speaking' && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid oklch(16% 0.015 250)' }}>
            <button onClick={() => { stopAudio(); setVoiceState('idle') }} style={{
              width: '100%', background: 'oklch(62% 0.22 25 / 0.1)',
              border: '1px solid oklch(62% 0.22 25 / 0.35)',
              color: 'oklch(72% 0.22 25)', padding: '7px 0', borderRadius: 3,
              fontSize: 8, letterSpacing: 2, cursor: 'pointer', fontFamily: 'inherit',
            }}>⏹ עצור דיבור</button>
          </div>
        )}

        {/* history */}
        {history.length > 0 && (
          <div style={{ borderTop: '1px solid oklch(16% 0.015 250)',
                        maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ padding: '8px 14px 4px', fontSize: 7, letterSpacing: 2,
                          color: 'var(--text-dim)' }}>
              היסטוריה
            </div>
            {history.slice(0, 4).map((item, i) => (
              <HistoryItem key={i} item={item} onReplay={askGarvis} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes mic-pulse { from { transform: scale(1) } to { transform: scale(1.08) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </>
  )
}
