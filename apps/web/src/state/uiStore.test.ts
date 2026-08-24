import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEASUREMENT_CURVE_PALETTE,
  createUiStore,
  initializeTheme,
  pickMeasurementColor,
} from './uiStore'

const THEME_KEY = 'autoeq-workbench.theme'

afterEach(() => vi.restoreAllMocks())

describe('UI preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to light theme, Curves dock, inspector enabled, and no registered curve appearance', () => {
    expect(createUiStore().getState()).toMatchObject({
      theme: 'light',
      activeDockTab: 'curves',
      inspectorEnabled: true,
      labelsEnabled: true,
      graphZoomPreset: 'full',
      smoothingLevel: 5,
      baselineCurveId: null,
      curveAppearance: {},
    })
  })

  it('toggles the graph inspector without persisting it', () => {
    const store = createUiStore()
    store.getState().toggleInspector()
    expect(store.getState().inspectorEnabled).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('restores and persists only valid theme state', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    const store = createUiStore()
    initializeTheme(store)
    expect(document.documentElement.dataset.theme).toBe('dark')

    store.getState().setTheme('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('fails safely when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked')
    })
    expect(createUiStore().getState().theme).toBe('light')
  })

  it('does not persist curve appearance or active tab', () => {
    const first = createUiStore(() => 0)
    first.getState().registerCurve('curve-1')
    first.getState().setCurveColor('curve-1', '#123456')
    first.getState().setCurveVisible('curve-1', false)
    first.getState().setActiveDockTab('details')

    expect(createUiStore().getState()).toMatchObject({
      activeDockTab: 'curves',
      curveAppearance: {},
    })
    expect(localStorage.length).toBe(0)
  })
})

describe('scalable curve appearance', () => {
  it('keeps graph view state and display-only curve controls bounded', () => {
    const store = createUiStore(() => 0)
    store.getState().registerCurve('fr-1')
    expect(store.getState().curveAppearance['fr-1']).toEqual({
      color: '#1565c0',
      visible: true,
      offsetDb: 0,
    })

    store.getState().setCurveOffset('fr-1', 3.5)
    store.getState().setBaselineCurve('fr-1')
    store.getState().setGraphZoomPreset('bass')
    store.getState().setSmoothingLevel(0)
    store.getState().toggleLabels()
    expect(store.getState()).toMatchObject({
      graphZoomPreset: 'bass',
      smoothingLevel: 0,
      labelsEnabled: false,
      baselineCurveId: 'fr-1',
    })
    expect(store.getState().curveAppearance['fr-1']?.offsetDb).toBe(3.5)

    store.getState().setSmoothingLevel(-1)
    store.getState().setSmoothingLevel(Number.NaN)
    store.getState().setCurveOffset('fr-1', Number.POSITIVE_INFINITY)
    store.getState().setBaselineCurve('missing')
    expect(store.getState().smoothingLevel).toBe(0)
    expect(store.getState().curveAppearance['fr-1']?.offsetDb).toBe(3.5)
    expect(store.getState().baselineCurveId).toBe('fr-1')

    store.getState().unregisterCurve('fr-1')
    expect(store.getState().baselineCurveId).toBeNull()
  })

  it('registers stable visible colors while excluding active colors where possible', () => {
    const store = createUiStore(() => 0)
    store.getState().registerCurve('a')
    store.getState().registerCurve('b')
    store.getState().registerCurve('c')

    expect(store.getState().curveAppearance).toEqual({
      a: { color: MEASUREMENT_CURVE_PALETTE[0], visible: true, offsetDb: 0 },
      b: { color: MEASUREMENT_CURVE_PALETTE[1], visible: true, offsetDb: 0 },
      c: { color: MEASUREMENT_CURVE_PALETTE[2], visible: true, offsetDb: 0 },
    })
    const stable = store.getState().curveAppearance.a
    store.getState().setActiveDockTab('equalizer')
    store.getState().registerCurve('a')
    expect(store.getState().curveAppearance.a).toBe(stable)
  })

  it('updates registered colors/visibility and unregisters cleanly', () => {
    const store = createUiStore()
    store.getState().registerCurve('curve')
    store.getState().setCurveColor('curve', '#123456')
    store.getState().setCurveVisible('curve', false)
    expect(store.getState().curveAppearance.curve).toEqual({
      color: '#123456', visible: false, offsetDb: 0,
    })

    store.getState().setCurveColor('curve', 'red')
    expect(store.getState().curveAppearance.curve?.color).toBe('#123456')
    store.getState().unregisterCurve('curve')
    expect(store.getState().curveAppearance.curve).toBeUndefined()
  })

  it('provides at least eight unique non-amber colors and handles exhausted exclusions', () => {
    expect(new Set(MEASUREMENT_CURVE_PALETTE).size).toBeGreaterThanOrEqual(8)
    expect(MEASUREMENT_CURVE_PALETTE).not.toContain('#ffa03a')
    expect(MEASUREMENT_CURVE_PALETTE).toContain(
      pickMeasurementColor([...MEASUREMENT_CURVE_PALETTE], () => 1),
    )
  })
})
