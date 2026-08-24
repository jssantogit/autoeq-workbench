import { AUTOEQ_PRODUCT_LIMITS, DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, defaultNormalization } from './workspaceStore'

describe('workspace numeric policy', () => {
  it('rejects normalization anchors outside the 20 Hz-20 kHz workspace range', () => {
    const store = createWorkspaceStore()

    store.getState().setNormalization({ anchorHz: 19, targetDb: 0 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ anchorHz: 20_001, targetDb: 0 })
    expect(store.getState().normalization).toEqual(defaultNormalization)

    store.getState().setNormalization({ anchorHz: 20, targetDb: 1 })
    expect(store.getState().normalization).toEqual({ anchorHz: 20, targetDb: 1 })

    store.getState().setNormalization({ anchorHz: 20_000, targetDb: 2 })
    expect(store.getState().normalization).toEqual({ anchorHz: 20_000, targetDb: 2 })
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
