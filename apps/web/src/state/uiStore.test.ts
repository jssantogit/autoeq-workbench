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

  it('defaults to light theme, Curves dock, visible distinct measurement colors, and measurement Target', () => {
    const store = createUiStore(() => 0)

    expect(store.getState()).toMatchObject({
      theme: 'light',
      activeDockTab: 'curves',
      sourceVisible: true,
      targetVisible: true,
      targetPresentation: 'measurement',
    })
    expect(store.getState().sourceColor).not.toBe(store.getState().targetColor)
    expect(MEASUREMENT_CURVE_PALETTE).toContain(store.getState().sourceColor)
    expect(MEASUREMENT_CURVE_PALETTE).toContain(store.getState().targetColor)
  })

  it('restores only valid persisted theme values', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    expect(createUiStore().getState().theme).toBe('dark')

    localStorage.setItem(THEME_KEY, 'light')
    expect(createUiStore().getState().theme).toBe('light')

    localStorage.setItem(THEME_KEY, 'sepia')
    expect(createUiStore().getState().theme).toBe('light')
  })

  it('defaults safely when reading localStorage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked')
    })

    expect(createUiStore().getState().theme).toBe('light')
  })

  it('initializes the document theme once from the store', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    const store = createUiStore()

    initializeTheme(store)

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('sets theme state, document dataset, and only the theme storage key', () => {
    localStorage.setItem('unrelated', 'preserved')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const store = createUiStore()

    store.getState().setTheme('dark')

    expect(store.getState().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setItem).toHaveBeenCalledOnce()
    expect(setItem).toHaveBeenCalledWith(THEME_KEY, 'dark')
    expect(localStorage.getItem('unrelated')).toBe('preserved')
    expect(localStorage.length).toBe(2)
  })

  it('still updates theme state and the document when localStorage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked')
    })
    const store = createUiStore()

    expect(() => store.getState().setTheme('dark')).not.toThrow()
    expect(store.getState().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('keeps stores isolated and does not persist presentation state', () => {
    const first = createUiStore(() => 0)
    first.getState().setActiveDockTab('details')
    first.getState().setCurveColor('source', '#123456')
    first.getState().setCurveVisible('target', false)
    first.getState().setTargetPresentation('reference')

    const second = createUiStore(() => 0)

    expect(second.getState()).toMatchObject({
      activeDockTab: 'curves',
      sourceVisible: true,
      targetVisible: true,
      targetPresentation: 'measurement',
    })
    expect(second.getState().sourceColor).not.toBe('#123456')
    expect(localStorage.length).toBe(0)
  })
})

describe('measurement colors', () => {
  it('provides at least eight unique graph colors without the amber accent', () => {
    expect(MEASUREMENT_CURVE_PALETTE.length).toBeGreaterThanOrEqual(8)
    expect(new Set(MEASUREMENT_CURVE_PALETTE).size).toBe(MEASUREMENT_CURVE_PALETTE.length)
    expect(MEASUREMENT_CURVE_PALETTE).not.toContain('#ffa03a')
  })

  it('excludes active colors case-insensitively without mutating the exclusions', () => {
    const excluded = [MEASUREMENT_CURVE_PALETTE[0]!.toUpperCase(), MEASUREMENT_CURVE_PALETTE[1]!]
    const snapshot = [...excluded]

    const picked = pickMeasurementColor(excluded, () => 0)

    expect(picked).toBe(MEASUREMENT_CURVE_PALETTE[2])
    expect(excluded).toEqual(snapshot)
  })

  it.each([
    ['zero', 0, 0],
    ['one', 1, MEASUREMENT_CURVE_PALETTE.length - 1],
    ['negative', -1, 0],
    ['above one', 2, MEASUREMENT_CURVE_PALETTE.length - 1],
    ['NaN', Number.NaN, 0],
  ] as const)('handles a deterministic %s random boundary safely', (_, random, expectedIndex) => {
    expect(pickMeasurementColor([], () => random)).toBe(MEASUREMENT_CURVE_PALETTE[expectedIndex])
  })

  it('falls back safely when every palette color is excluded', () => {
    expect(() => pickMeasurementColor([...MEASUREMENT_CURVE_PALETTE], () => 1)).not.toThrow()
    expect(MEASUREMENT_CURVE_PALETTE).toContain(
      pickMeasurementColor([...MEASUREMENT_CURVE_PALETTE], () => 1),
    )
  })

  it('assigns a fresh color without immediately colliding with the other curve', () => {
    const store = createUiStore(() => 0)
    const initialSource = store.getState().sourceColor
    const target = store.getState().targetColor

    store.getState().assignFreshCurveColor('source')

    expect(store.getState().sourceColor).not.toBe(initialSource)
    expect(store.getState().sourceColor).not.toBe(target)
  })

  it('accepts six-digit CSS hex colors and rejects arbitrary or unusable values', () => {
    const store = createUiStore()

    store.getState().setCurveColor('source', '#123456')
    expect(store.getState().sourceColor).toBe('#123456')

    for (const invalid of ['red', 'var(--color)', '#12345g', '#fff', '#00000000', 'url(x)']) {
      store.getState().setCurveColor('source', invalid)
      expect(store.getState().sourceColor).toBe('#123456')
    }
  })
})

describe('graph presentation actions', () => {
  it('updates the active dock tab, visibility, and Target presentation independently', () => {
    const store = createUiStore()

    store.getState().setActiveDockTab('equalizer')
    store.getState().setCurveVisible('source', false)
    store.getState().setCurveVisible('target', false)
    store.getState().setTargetPresentation('reference')

    expect(store.getState()).toMatchObject({
      activeDockTab: 'equalizer',
      sourceVisible: false,
      targetVisible: false,
      targetPresentation: 'reference',
    })
  })
})
