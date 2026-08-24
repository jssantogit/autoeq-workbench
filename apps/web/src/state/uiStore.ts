import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export type ThemeMode = 'light' | 'dark'
export type DockTab = 'curves' | 'equalizer' | 'tools'
export type GraphZoomPreset = 'full' | 'bass' | 'midrange' | 'treble'

export interface CurveAppearance {
  color: string
  visible: boolean
  offsetDb: number
}

export interface UiState {
  theme: ThemeMode
  activeDockTab: DockTab
  inspectorEnabled: boolean
  labelsEnabled: boolean
  graphZoomPreset: GraphZoomPreset
  smoothingLevel: number
  baselineCurveId: string | null
  curveAppearance: Record<string, CurveAppearance>
  setTheme: (theme: ThemeMode) => void
  setActiveDockTab: (tab: DockTab) => void
  toggleInspector: () => void
  toggleLabels: () => void
  setGraphZoomPreset: (preset: GraphZoomPreset) => void
  setSmoothingLevel: (level: number) => void
  setBaselineCurve: (id: string | null) => void
  registerCurve: (id: string) => void
  unregisterCurve: (id: string) => void
  setCurveColor: (id: string, color: string) => void
  setCurveVisible: (id: string, visible: boolean) => void
  setCurveOffset: (id: string, offsetDb: number) => void
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
  return createStore<UiState>()((set) => ({
    theme: readTheme(),
    activeDockTab: 'curves',
    inspectorEnabled: true,
    labelsEnabled: true,
    graphZoomPreset: 'full',
    smoothingLevel: 5,
    baselineCurveId: null,
    curveAppearance: {},
    setTheme: (theme) => {
      set({ theme })
      applyDocumentTheme(theme)
      persistTheme(theme)
    },
    setActiveDockTab: (activeDockTab) => set({ activeDockTab }),
    toggleInspector: () => set((state) => ({ inspectorEnabled: !state.inspectorEnabled })),
    toggleLabels: () => set((state) => ({ labelsEnabled: !state.labelsEnabled })),
    setGraphZoomPreset: (graphZoomPreset) => set({ graphZoomPreset }),
    setSmoothingLevel: (smoothingLevel) => {
      if (!Number.isFinite(smoothingLevel) || smoothingLevel < 0) return
      set({ smoothingLevel })
    },
    setBaselineCurve: (baselineCurveId) =>
      set((state) => (
        baselineCurveId === null || state.curveAppearance[baselineCurveId] !== undefined
          ? { baselineCurveId }
          : state
      )),
    registerCurve: (id) =>
      set((state) => {
        if (id.length === 0 || state.curveAppearance[id] !== undefined) return state
        const excluded = Object.values(state.curveAppearance)
          .filter(({ visible }) => visible)
          .map(({ color }) => color)
        return {
          curveAppearance: {
            ...state.curveAppearance,
            [id]: { color: pickMeasurementColor(excluded, random), visible: true, offsetDb: 0 },
          },
        }
      }),
    unregisterCurve: (id) =>
      set((state) => {
        if (state.curveAppearance[id] === undefined) return state
        const curveAppearance = { ...state.curveAppearance }
        delete curveAppearance[id]
        return {
          curveAppearance,
          baselineCurveId: state.baselineCurveId === id ? null : state.baselineCurveId,
        }
      }),
    setCurveColor: (id, color) => {
      if (!CSS_HEX_COLOR.test(color)) return
      set((state) => {
        const appearance = state.curveAppearance[id]
        return appearance === undefined
          ? state
          : { curveAppearance: { ...state.curveAppearance, [id]: { ...appearance, color } } }
      })
    },
    setCurveVisible: (id, visible) =>
      set((state) => {
        const appearance = state.curveAppearance[id]
        return appearance === undefined || appearance.visible === visible
          ? state
          : { curveAppearance: { ...state.curveAppearance, [id]: { ...appearance, visible } } }
      }),
    setCurveOffset: (id, offsetDb) => {
      if (!Number.isFinite(offsetDb)) return
      set((state) => {
        const appearance = state.curveAppearance[id]
        return appearance === undefined || appearance.offsetDb === offsetDb
          ? state
          : { curveAppearance: { ...state.curveAppearance, [id]: { ...appearance, offsetDb } } }
      })
    },
  }))
}

export const uiStore = createUiStore()

export function initializeTheme(store: StoreApi<UiState> = uiStore): void {
  applyDocumentTheme(store.getState().theme)
}

export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
