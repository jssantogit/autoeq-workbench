import { AUTOEQ_PRODUCT_LIMITS, DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, defaultNormalization } from './workspaceStore'

describe('workspace numeric policy', () => {
  it('starts with exact default normalization', () => {
    const store = createWorkspaceStore()
    expect(store.getState().normalization).toEqual({
      mode: 'hz',
      frequencyHz: 500,
      levelDb: 60,
    })
  })

  it('rejects normalization values outside mode hz/db, frequency 20-20000 Hz, and level 0-100 dB', () => {
    const store = createWorkspaceStore()

    store.getState().setNormalization({ mode: 'invalid' as never, frequencyHz: 500, levelDb: 60 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ mode: 'hz', frequencyHz: 19, levelDb: 60 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ mode: 'hz', frequencyHz: 20_001, levelDb: 60 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ mode: 'hz', frequencyHz: 500, levelDb: -0.1 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ mode: 'hz', frequencyHz: 500, levelDb: 100.1 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ mode: 'db', frequencyHz: 20, levelDb: 0 })
    expect(store.getState().normalization).toEqual({ mode: 'db', frequencyHz: 20, levelDb: 0 })

    store.getState().setNormalization({ mode: 'hz', frequencyHz: 20_000, levelDb: 100 })
    expect(store.getState().normalization).toEqual({ mode: 'hz', frequencyHz: 20_000, levelDb: 100 })
  })

  it('stores only AutoEQ effective settings that stay inside hard product limits', () => {
    const store = createWorkspaceStore()

    store.getState().setAutoEqSettings({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 12,
      minGainDb: -12,
      maxGainDb: 12,
      minQ: 0.5,
      maxQ: 8,
    })
    expect(store.getState().autoeqSettings).toMatchObject({
      maxFilters: 12,
      minGainDb: -12,
      maxGainDb: 12,
      minQ: 0.5,
      maxQ: 8,
    })

    const accepted = store.getState().autoeqSettings
    store.getState().setAutoEqSettings({ ...accepted, maxFilters: AUTOEQ_PRODUCT_LIMITS.hardMaxFilters + 1 })
    store.getState().setAutoEqSettings({ ...accepted, maxGainDb: AUTOEQ_PRODUCT_LIMITS.maxGainDb + 1 })
    store.getState().setAutoEqSettings({ ...accepted, minQ: AUTOEQ_PRODUCT_LIMITS.minQ / 2 })
    expect(store.getState().autoeqSettings).toEqual(accepted)
  })
})
