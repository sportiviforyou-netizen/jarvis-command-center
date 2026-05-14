/**
 * Minimal Zustand store for voice panel state.
 * Kept separate so HUDHeader and VoicePanelFloat can both read/write
 * without triggering full-app re-renders.
 */
import { create } from 'zustand'

export const useVoiceStore = create(set => ({
  voiceOpen:  false,
  voiceState: 'idle',   // 'idle' | 'listening' | 'thinking' | 'speaking'
  setVoiceOpen:  open  => set({ voiceOpen: open }),
  setVoiceState: state => set({ voiceState: state }),
}))
