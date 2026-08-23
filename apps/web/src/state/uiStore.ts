import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export type ThemeMode = 'light' | 'dark'
export type DockTab = 'curves' | 'equalizer' | 'details'
export type TargetPresentation = 'measurement' | 'reference'

type CurveRole = 'source' | 'target'

export interface UiState {
  theme: ThemeMode
  activeDockTab: DockTab
  sourceColor: string
  targetColor: string
  sourceVisible: boolean
  targetVisible: boolean
  targetPresentation: TargetPresentation
  setTheme: (theme: ThemeMode) => void
  setActiveDockTab: (tab: DockTab) => void
  setCurveColor: (role: CurveRole, color: string) => void
  assignFreshCurveColor: (role: CurveRole) => void
  setCurveVisible: (role: CurveRole, visible: boolean) => void
  setTargetPresentation: (value: TargetPresentation) => void
}

export const MEASUREMENT_CURVE_PALETTE = [
  '#1565c0',
  '#c62828',
  '#2e7d32',
  '#6a1b9a',
  '#00838f',
  '#ad1457',
  '#3949ab',
  '#00796b',
] as const

const THEME_KEY = 'autoeq-workbench.theme'
const CSS_HEX_COLOR = /^#[0-9a-f]{6}$/i

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readTheme(): ThemeMode {
  try {
    const value = browserStorage()?.getItem(THEME_KEY)
    return value === 'dark' || value === 'light' ? value : 'light'
  } catch {
    return 'light'
  }
}

function applyDocumentTheme(theme: ThemeMode): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

function persistTheme(theme: ThemeMode): void {
  try {
    browserStorage()?.setItem(THEME_KEY, theme)
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory preference still applies.
  }
}

export function pickMeasurementColor(
  excluded: readonly string[],
  random: () => number = Math.random,
): (typeof MEASUREMENT_CURVE_PALETTE)[number] {
  const excludedColors = new Set(excluded.map((color) => color.toLowerCase()))
  const available = MEASUREMENT_CURVE_PALETTE.filter(
    (color) => !excludedColors.has(color.toLowerCase()),
  )
  const candidates = available.length > 0 ? available : MEASUREMENT_CURVE_PALETTE
  const sampled = random()
  const bounded = Number.isFinite(sampled) ? Math.min(1, Math.max(0, sampled)) : 0
  const index = Math.min(candidates.length - 1, Math.floor(bounded * candidates.length))
  return candidates[index]!
}

export function createUiStore(random: () => number = Math.random) {
  const sourceColor = pickMeasurementColor([], random)
  const targetColor = pickMeasurementColor([sourceColor], random)

  return createStore<UiState>()((set) => ({
    theme: readTheme(),
    activeDockTab: 'curves',
    sourceColor,
    targetColor,
    sourceVisible: true,
    targetVisible: true,
    targetPresentation: 'measurement',
    setTheme: (theme) => {
      set({ theme })
      applyDocumentTheme(theme)
      persistTheme(theme)
    },
    setActiveDockTab: (activeDockTab) => set({ activeDockTab }),
    setCurveColor: (role, color) => {
      if (!CSS_HEX_COLOR.test(color)) return
      set({ [`${role}Color`]: color } as Pick<UiState, `${CurveRole}Color`>)
    },
    assignFreshCurveColor: (role) =>
      set((state) => {
        const otherRole = role === 'source' ? 'target' : 'source'
        const color = pickMeasurementColor(
          [state[`${role}Color`], state[`${otherRole}Color`]],
          random,
        )
        return { [`${role}Color`]: color } as Pick<UiState, `${CurveRole}Color`>
      }),
    setCurveVisible: (role, visible) =>
      set({ [`${role}Visible`]: visible } as Pick<UiState, `${CurveRole}Visible`>),
    setTargetPresentation: (targetPresentation) => set({ targetPresentation }),
  }))
}

export const uiStore = createUiStore()

export function initializeTheme(store: StoreApi<UiState> = uiStore): void {
  applyDocumentTheme(store.getState().theme)
}

export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
