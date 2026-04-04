import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AccessibilityState {
  highContrast: boolean
  largeText: boolean
  reducedMotion: boolean
  screenReaderMode: boolean
  
  toggle: (key: keyof Omit<AccessibilityState, 'toggle' | 'set'>) => void
  set: (settings: Partial<Omit<AccessibilityState, 'toggle' | 'set'>>) => void
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      highContrast: false,
      largeText: false,
      reducedMotion: false,
      screenReaderMode: false,

      toggle: (key) => set((state) => ({ [key]: !state[key] })),
      set: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'accessibility-storage',
    }
  )
)
