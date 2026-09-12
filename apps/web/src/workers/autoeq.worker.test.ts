import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  type CoreErrorCategory,
  type StandardAutoEqInputV2,
} from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import {
  runAutoEqWorkerInput,
  runExperimentalStructuralAutoEqWorkerInput,
  sanitizeAutoEqError,
} from './autoeq.worker'
import { EXPERIMENTAL_STRUCTURAL_AUTOEQ_MODE } from './autoeqClient'

const input: StandardAutoEqInputV2 = {
  source: {
    id: 'fr-1',
    name: 'Source',
    kind: 'fr',
    rawPoints: [
      { frequencyHz: 20, db: 0 },
      { frequencyHz: 20_000, db: 0 },
    ],
    metadata: { synthetic: true },
  },
  target: {
    id: 'target-1',
    name: 'Target',
    kind: 'target',
    rawPoints: [
      { frequencyHz: 20, db: 0 },
      { frequencyHz: 20_000, db: 0 },
    ],
    metadata: { synthetic: true },
  },
  normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
  settings: { ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds: 5 },
}

describe('AutoEQ Worker execution', () => {
  it('runs Standard v2 with the captured time limit', () => {
    const result = runAutoEqWorkerInput(input)

    expect(result.manifest).toMatchObject({
      schemaVersion: 3,
      algorithmVersion: 'standard-v2',
      autoeqSettings: { timeLimitSeconds: 5 },
    })
  })
})

describe('AutoEQ Worker experimental structural execution', () => {
  it('runs the validated Q31-B4-P8 zero-start mode only when explicitly requested', () => {
    const result = runAutoEqWorkerInput(input, EXPERIMENTAL_STRUCTURAL_AUTOEQ_MODE)
    const marker = (
      result.manifest as typeof result.manifest & {
        experimentalStructuralSearch?: { preset?: string; seedMode?: string }
      }
    ).experimentalStructuralSearch

    expect(marker).toEqual({
      preset: 'max10-q31-b4-p8-experimental',
      seedMode: 'zero-start',
    })
    expect(result.filters.length).toBeLessThanOrEqual(10)
    expect(result.manifest.autoeqSettings.timeLimitSeconds).toBe(5)
  }, 15_000)

  it('rejects unvalidated non-default bounds instead of silently changing candidate semantics', () => {
    expect(() => runExperimentalStructuralAutoEqWorkerInput({
      ...input,
      settings: { ...input.settings, maxFilters: 8 },
    })).toThrowError(/requires default frequency\/gain\/Q bounds and maxFilters=10/)
  })
})

describe('AutoEQ Worker error sanitization', () => {
  it.each(['validation', 'optimization', 'numeric'] as const)(
    'preserves an approved %s CoreError category and message',
    (category) => {
      expect(sanitizeAutoEqError(new CoreError(category, `Public ${category} message.`))).toEqual({
        category,
        message: `Public ${category} message.`,
      })
    },
  )

  it.each(['parse', 'export'] satisfies CoreErrorCategory[])(
    'replaces a disallowed %s CoreError without leaking its details',
    (category) => {
      expect(sanitizeAutoEqError(new CoreError(category, `Private ${category} details.`))).toEqual({
        category: 'optimization',
        message: 'AutoEQ optimization failed.',
      })
    },
  )

  it('replaces an unknown exception without leaking its details', () => {
    expect(sanitizeAutoEqError(new Error('Private stack and exception details.'))).toEqual({
      category: 'optimization',
      message: 'AutoEQ optimization failed.',
    })
  })
})
