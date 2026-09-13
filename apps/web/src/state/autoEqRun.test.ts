import { describe, expect, it } from 'vitest'
import { createAutoEqRunRecord, createAutoEqResult } from '../test/autoEqFixture'
import {
  cloneAutoEqRunRecord,
  type AutoEqRunRecord,
  type ReadonlyAutoEqRunRecord,
} from './autoEqRun'
import {
  validateWorkbenchSession,
  type ValidatedWorkbenchSessionV1,
} from '../session/workbenchSession'

describe('cloneAutoEqRunRecord', () => {
  it('returns null for null and undefined inputs', () => {
    expect(cloneAutoEqRunRecord(null)).toBeNull()
    expect(cloneAutoEqRunRecord(undefined)).toBeNull()
  })

  it('deep clones mutable AutoEqRunRecord with zero reference sharing', () => {
    const original = createAutoEqRunRecord(4.5)
    const cloned = cloneAutoEqRunRecord(original)

    expect(cloned).not.toBeNull()
    expect(cloned).not.toBe(original)
    expect(cloned!.manifest).not.toBe(original.manifest)
    expect(cloned!.manifest.finalFilters).not.toBe(original.manifest.finalFilters)
    expect(cloned!.manifest.finalFilters[0]).not.toBe(original.manifest.finalFilters[0])
    expect(cloned).toEqual(original)

    // Mutation on clone does not affect original
    cloned!.manifest.finalFilters[0]!.gainDb = -99
    expect(original.manifest.finalFilters[0]!.gainDb).not.toBe(-99)
  })

  it('accepts deeply frozen/readonly AutoEqRunRecord from validated session and returns mutable record', () => {
    const result = createAutoEqResult(3.0, {
      sourceName: 'Source',
      targetName: 'Target',
    })
    const session = validateWorkbenchSession({
      schemaVersion: 1,
      curves: [
        {
          id: 'fr-1',
          name: 'Source',
          kind: 'fr',
          rawPoints: [
            { frequencyHz: 20, db: 0 },
            { frequencyHz: 20000, db: 0 },
          ],
          metadata: {},
        },
        {
          id: 'target-1',
          name: 'Target',
          kind: 'target',
          rawPoints: [
            { frequencyHz: 20, db: 0 },
            { frequencyHz: 20000, db: 0 },
          ],
          metadata: {},
        },
      ],
      activeFrId: 'fr-1',
      activeTargetId: 'target-1',
      normalization: { ...result.manifest.normalization },
      autoeqSettings: { ...result.manifest.autoeqSettings },
      filters: result.manifest.finalFilters.map((f) => ({ ...f })),
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: { manifest: result.manifest },
    })

    const frozenRunRecord: ValidatedWorkbenchSessionV1['autoEqRun'] = session.autoEqRun
    expect(frozenRunRecord).not.toBeNull()
    expect(Object.isFrozen(frozenRunRecord)).toBe(true)

    const cloned = cloneAutoEqRunRecord(frozenRunRecord)
    expect(cloned).not.toBeNull()
    expect(Object.isFrozen(cloned)).toBe(false)
    expect(Object.isFrozen(cloned!.manifest)).toBe(false)
    expect(Object.isFrozen(cloned!.manifest.finalFilters)).toBe(false)

    // Mutation on clone succeeds without throwing
    expect(() => {
      cloned!.manifest.finalFilters[0]!.gainDb = 1.2
    }).not.toThrow()
    expect(cloned!.manifest.finalFilters[0]!.gainDb).toBe(1.2)
  })

  it('statically rejects malformed objects and unknown manifests', () => {
    // Type-level assertion tests
    const validRecord: AutoEqRunRecord = createAutoEqRunRecord(2.0)
    const validReadonly: ReadonlyAutoEqRunRecord = validRecord
    expect(cloneAutoEqRunRecord(validRecord)).not.toBeNull()
    expect(cloneAutoEqRunRecord(validReadonly)).not.toBeNull()

    const malformedUnknown: { readonly manifest: unknown } = { manifest: 'invalid' }
    // @ts-expect-error - malformed manifest must fail type check
    cloneAutoEqRunRecord(malformedUnknown)

    // @ts-expect-error - arbitrary object must fail type check
    cloneAutoEqRunRecord({ arbitraryKey: 123 })

    // @ts-expect-error - partial manifest must fail type check
    cloneAutoEqRunRecord({ manifest: { schemaVersion: 2 } })
  })
})
