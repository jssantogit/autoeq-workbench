import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  type CoreErrorCategory,
  type StandardAutoEqInputV2,
} from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import { runAutoEqWorkerInput, sanitizeAutoEqError } from './autoeq.worker'

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
