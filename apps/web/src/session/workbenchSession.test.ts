import {
  AUTOEQ_PRODUCT_LIMITS,
  DEFAULT_AUTOEQ_SETTINGS,
  DEFAULT_AUTOEQ_SETTINGS_V1,
  MVP_NUMERIC_POLICY,
  type Curve,
  type Filter,
  type RunManifest,
} from '@autoeq-workbench/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAutoEqResult,
  createAutoEqResultV2,
  createAutoEqRunRecord,
} from '../test/autoEqFixture'
import {
  type AutoEqClient,
} from '../workers/autoeqClient'
import { createAutoEqController } from '../state/autoeqController'
import { createAutoEqRunStore } from '../state/autoeqRunStore'
import { createEqCompareStore } from '../state/eqCompareStore'
import {
  createWorkspaceStore,
  defaultNormalization,
} from '../state/workspaceStore'
import {
  deserializeWorkbenchSession,
  importWorkbenchSession,
  serializeWorkbenchSession,
  validateWorkbenchSession,
  WORKBENCH_SESSION_SCHEMA_VERSION,
  type WorkbenchSessionV1,
  type WorkbenchSessionV2,
} from './workbenchSession'

function createSampleCurveFr(): Curve {
  return {
    id: 'fr-custom-1',
    name: 'Sample FR',
    kind: 'fr',
    rawPoints: [
      { frequencyHz: 20, db: -2 },
      { frequencyHz: 500, db: 0 },
      { frequencyHz: 1_000, db: 1.5 },
      { frequencyHz: 20_000, db: -3 },
    ],
    metadata: { source: 'synthetic-test', sampleRate: 48000, verified: true },
  }
}

function createSampleCurveTarget(): Curve {
  return {
    id: 'target-custom-1',
    name: 'Sample Target',
    kind: 'target',
    rawPoints: [
      { frequencyHz: 20, db: 4 },
      { frequencyHz: 500, db: 0 },
      { frequencyHz: 1_000, db: -1 },
      { frequencyHz: 20_000, db: 2 },
    ],
    metadata: { targetType: 'in-ear' },
  }
}

function createSampleFilterManual(): Filter {
  return {
    id: 'custom-filter-1',
    enabled: true,
    type: 'PK',
    frequencyHz: 1_250,
    gainDb: -3.5,
    q: 1.4,
  }
}

function createValidManualSession(): WorkbenchSessionV1 {
  const fr = createSampleCurveFr()
  const target = createSampleCurveTarget()
  return {
    schemaVersion: 1,
    curves: [fr, target],
    activeFrId: fr.id,
    activeTargetId: target.id,
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    filters: [createSampleFilterManual()],
    filterProvenance: 'manual',
    solutionState: 'clean',
    autoEqRun: null,
  }
}

function createValidAutoEqSession(): WorkbenchSessionV1 {
  const fr = { ...createSampleCurveFr(), name: 'Source' }
  const target = { ...createSampleCurveTarget(), name: 'Target' }
  const result = createAutoEqResult(2.5, {
    sourceName: 'Source',
    targetName: 'Target',
  })
  return {
    schemaVersion: 1,
    curves: [fr, target],
    activeFrId: fr.id,
    activeTargetId: target.id,
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    filters: result.filters.map((filter) => ({ ...filter })),
    filterProvenance: 'autoeq',
    solutionState: 'clean',
    autoEqRun: { manifest: result.manifest },
  }
}

function createValidAutoEqSessionV2(): WorkbenchSessionV2 {
  const fr = { ...createSampleCurveFr(), name: 'Source' }
  const target = { ...createSampleCurveTarget(), name: 'Target' }
  const result = createAutoEqResultV2(2.5, {
    sourceName: 'Source',
    targetName: 'Target',
  })
  return {
    schemaVersion: 2,
    curves: [fr, target],
    activeFrId: fr.id,
    activeTargetId: target.id,
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    filters: result.filters.map((filter) => ({ ...filter })),
    filterProvenance: 'autoeq',
    solutionState: 'clean',
    autoEqRun: { manifest: result.manifest },
  }
}

describe('Workbench Session V1 Serialization and Round-Trip', () => {
  it('migrates schema 1 to schema 2 with 60 seconds only when timeout is absent', () => {
    const legacyWithoutTimeout = {
      ...createValidAutoEqSession(),
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS_V1 },
    }
    const migrated = validateWorkbenchSession(legacyWithoutTimeout)

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.autoeqSettings.timeLimitSeconds).toBe(60)
    expect(migrated.autoEqRun?.manifest.schemaVersion).toBe(2)
    expect(migrated.autoEqRun?.manifest.algorithmVersion).toBe('standard-v1')
    expect('timeLimitSeconds' in migrated.autoEqRun!.manifest.autoeqSettings).toBe(false)

    const legacyWithTimeout = {
      ...createValidManualSession(),
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds: 30 as const },
    }
    expect(validateWorkbenchSession(legacyWithTimeout).autoeqSettings.timeLimitSeconds).toBe(30)
  })

  it('exports new sessions as schema 2 with the current timeout', () => {
    const workspace = createWorkspaceStore()
    const encoded = serializeWorkbenchSession({
      ...createValidManualSession(),
      schemaVersion: 2,
    } as unknown as WorkbenchSessionV1)
    const parsed = JSON.parse(encoded) as Record<string, unknown>

    expect(parsed.schemaVersion).toBe(2)
    expect((parsed.autoeqSettings as Record<string, unknown>).timeLimitSeconds).toBe(60)
    expect(workspace.getState().autoeqSettings.timeLimitSeconds).toBe(60)
  })

  it('accepts valid schema-2 Standard-v2 runs and rejects invalid timeout contracts', () => {
    const current = createValidAutoEqSessionV2()
    expect(validateWorkbenchSession(current)).toEqual(current)

    const missingTimeout = structuredClone(current) as unknown as Record<string, unknown>
    delete (missingTimeout.autoeqSettings as Record<string, unknown>).timeLimitSeconds
    expect(() => validateWorkbenchSession(missingTimeout)).toThrow()

    const invalidTimeout = structuredClone(current) as unknown as Record<string, unknown>
    ;(invalidTimeout.autoeqSettings as Record<string, unknown>).timeLimitSeconds = 10
    expect(() => validateWorkbenchSession(invalidTimeout)).toThrow()
  })

  it('rejects fabricated schema-3 standard-v1 manifests', () => {
    const current = createValidAutoEqSessionV2()
    current.autoEqRun = {
      manifest: {
        ...createAutoEqResult().manifest,
        schemaVersion: 3,
      } as unknown as RunManifest,
    }
    expect(() => validateWorkbenchSession(current)).toThrow()
  })

  it('exposes WORKBENCH_SESSION_SCHEMA_VERSION as 2', () => {
    expect(WORKBENCH_SESSION_SCHEMA_VERSION).toBe(2)
  })

  it('serializes deterministically with exact key order, 2 spaces, and trailing newline', () => {
    const fixture = createValidManualSession()
    const encoded1 = serializeWorkbenchSession(fixture)
    const encoded2 = serializeWorkbenchSession(fixture)

    expect(encoded1).toBe(encoded2)
    expect(encoded1.endsWith('\n')).toBe(true)

    const expectedKeyOrder = [
      '"schemaVersion"',
      '"curves"',
      '"activeFrId"',
      '"activeTargetId"',
      '"normalization"',
      '"autoeqSettings"',
      '"filters"',
      '"filterProvenance"',
      '"solutionState"',
      '"autoEqRun"',
    ]

    let lastIndex = -1
    for (const key of expectedKeyOrder) {
      const index = encoded1.indexOf(key)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }

    const deserialized = deserializeWorkbenchSession(encoded1)
    expect(deserialized).toEqual({ ...fixture, schemaVersion: 2 })
    expect(serializeWorkbenchSession(deserialized)).toBe(encoded1)
  })

  it('round-trips an empty/initial session faithfully', () => {
    const emptySession: WorkbenchSessionV1 = {
      schemaVersion: 1,
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      normalization: { ...defaultNormalization },
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
      filters: [],
      filterProvenance: null,
      solutionState: 'clean',
      autoEqRun: null,
    }

    const encoded = serializeWorkbenchSession(emptySession)
    expect(encoded.endsWith('\n')).toBe(true)
    expect(deserializeWorkbenchSession(encoded)).toEqual({ ...emptySession, schemaVersion: 2 })
  })

  it('round-trips clean, modified, and stale AutoEQ sessions while preserving IDs and points', () => {
    const autoEqSession = createValidAutoEqSession()
    const encodedClean = serializeWorkbenchSession(autoEqSession)
    expect(deserializeWorkbenchSession(encodedClean)).toEqual({
      ...autoEqSession,
      schemaVersion: 2,
    })

    // Modified AutoEQ session
    const modifiedSession: WorkbenchSessionV1 = {
      ...autoEqSession,
      filters: [{ ...autoEqSession.filters[0]!, gainDb: 5.0 }],
      solutionState: 'modified',
    }
    const encodedModified = serializeWorkbenchSession(modifiedSession)
    expect(deserializeWorkbenchSession(encodedModified)).toEqual({
      ...modifiedSession,
      schemaVersion: 2,
    })

    // Stale AutoEQ session
    const staleSession: WorkbenchSessionV1 = {
      ...autoEqSession,
      solutionState: 'stale',
    }
    const encodedStale = serializeWorkbenchSession(staleSession)
    expect(deserializeWorkbenchSession(encodedStale)).toEqual({
      ...staleSession,
      schemaVersion: 2,
    })
  })

  it('deep clones deserialized values and does not leak parser-owned or input references', () => {
    const fixture = createValidAutoEqSession()
    const encoded = serializeWorkbenchSession(fixture)
    const deserialized1 = deserializeWorkbenchSession(encoded)
    const deserialized2 = deserializeWorkbenchSession(encoded)

    expect(deserialized1).toEqual(deserialized2)
    expect(deserialized1.curves).not.toBe(deserialized2.curves)
    expect(deserialized1.curves[0]).not.toBe(deserialized2.curves[0])
    expect(deserialized1.curves[0]!.rawPoints).not.toBe(deserialized2.curves[0]!.rawPoints)
    expect(deserialized1.normalization).not.toBe(deserialized2.normalization)
    expect(deserialized1.autoeqSettings).not.toBe(deserialized2.autoeqSettings)
    expect(deserialized1.filters).not.toBe(deserialized2.filters)
    expect(deserialized1.autoEqRun).not.toBe(deserialized2.autoEqRun)

    expect(deserialized1.curves[0]!.name).toBe(fixture.curves[0]!.name)
    expect(deserialized1.filters[0]!.gainDb).toBe(fixture.filters[0]!.gainDb)
  })

  it('deep freezes validated session and prevents runtime and typed mutation of nested structures', () => {
    const fixture = createValidAutoEqSession()
    const validated = validateWorkbenchSession(fixture)

    // Deep freeze verification across all structures
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(validated.curves)).toBe(true)
    expect(Object.isFrozen(validated.curves[0])).toBe(true)
    expect(Object.isFrozen(validated.curves[0]!.rawPoints)).toBe(true)
    expect(Object.isFrozen(validated.curves[0]!.rawPoints[0])).toBe(true)
    expect(Object.isFrozen(validated.curves[0]!.metadata)).toBe(true)
    expect(Object.isFrozen(validated.normalization)).toBe(true)
    expect(Object.isFrozen(validated.autoeqSettings)).toBe(true)
    expect(Object.isFrozen(validated.filters)).toBe(true)
    expect(Object.isFrozen(validated.filters[0])).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.autoeqSettings)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.normalization)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.algorithmParameters)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.finalFilters)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.finalFilters[0])).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.metrics)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.cancellationAudit)).toBe(true)
    expect(Object.isFrozen(validated.autoEqRun!.manifest.cancellationAudit.pairs)).toBe(true)
    if (validated.autoEqRun!.manifest.cancellationAudit.pairs.length > 0) {
      expect(Object.isFrozen(validated.autoEqRun!.manifest.cancellationAudit.pairs[0])).toBe(true)
    }

    // Runtime mutation attempts throw TypeError in strict mode
    expect(() => {
      // @ts-expect-error - statically disallowed
      validated.curves[0]!.name = 'Mutated'
    }).toThrow(TypeError)

    expect(() => {
      // @ts-expect-error - statically disallowed
      validated.curves[0]!.rawPoints[0]!.db = 999
    }).toThrow(TypeError)

    expect(() => {
      // @ts-expect-error - statically disallowed
      validated.curves[0]!.metadata.source = 'modified'
    }).toThrow(TypeError)

    expect(() => {
      // @ts-expect-error - statically disallowed
      validated.filters[0]!.gainDb = -10
    }).toThrow(TypeError)

    expect(() => {
      // @ts-expect-error - statically disallowed
      validated.autoeqSettings.maxGainDb = 50
    }).toThrow(TypeError)

    expect(() => {
      // @ts-expect-error - statically disallowed
      validated.autoEqRun!.manifest.finalFilters[0]!.gainDb = 99
    }).toThrow(TypeError)
  })

  it('applying deep-frozen validated session produces a mutable copy in workspaceStore', () => {
    const workspace = createWorkspaceStore()
    const fixture = createValidAutoEqSession()
    const validated = validateWorkbenchSession(fixture)

    workspace.getState().applySession(validated)

    // Store state can be modified independently without throwing
    expect(() => {
      workspace.getState().renameCurve(validated.curves[0]!.id, 'New Name')
    }).not.toThrow()
    expect(workspace.getState().curves[0]!.name).toBe('New Name')
    expect(validated.curves[0]!.name).toBe(fixture.curves[0]!.name)

    expect(() => {
      workspace.getState().updateFilter(validated.filters[0]!.id, { gainDb: 3.0 })
    }).not.toThrow()
    expect(workspace.getState().filters[0]!.gainDb).toBe(3.0)
    expect(validated.filters[0]!.gainDb).toBe(fixture.filters[0]!.gainDb)
  })
})

describe('Workbench Session Deserialization Validation Matrix', () => {
  it.each([
    ['not JSON syntax', '{ not json }'],
    ['empty string', ''],
    ['whitespace only', '   \n  '],
    ['JSON string', '"just a string"'],
    ['JSON number', '123'],
    ['JSON array', '[]'],
    ['JSON boolean', 'true'],
    ['JSON null', 'null'],
  ])('rejects malformed or non-object JSON: %s', (_label, input) => {
    expect(() => deserializeWorkbenchSession(input)).toThrow()
    try {
      deserializeWorkbenchSession(input)
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error)
      // Must not leak file paths
      expect((cause as Error).message).not.toMatch(/[/\\](?:home|usr|apps|packages|node_modules)/)
    }
  })

  it.each([
    ['missing schemaVersion', (s: Record<string, unknown>) => { delete s.schemaVersion }],
    ['schemaVersion 3', (s: Record<string, unknown>) => { s.schemaVersion = 3 }],
    ['schemaVersion 0', (s: Record<string, unknown>) => { s.schemaVersion = 0 }],
    ['schemaVersion string "1"', (s: Record<string, unknown>) => { s.schemaVersion = '1' }],
    ['schemaVersion null', (s: Record<string, unknown>) => { s.schemaVersion = null }],
  ])('rejects invalid schema version: %s', (_label, mutate) => {
    const session = createValidManualSession() as unknown as Record<string, unknown>
    mutate(session)
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  it('rejects duplicate curve IDs', () => {
    const session = createValidManualSession()
    const fr = createSampleCurveFr()
    const target = createSampleCurveTarget()
    session.curves = [
      fr,
      { ...target, id: fr.id },
    ]
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  it('rejects duplicate filter IDs', () => {
    const session = createValidManualSession()
    const f1 = createSampleFilterManual()
    session.filters = [
      f1,
      { ...f1, frequencyHz: 2_000 },
    ]
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  describe('Curve Usability and Ordering', () => {
    it.each([
      ['missing curves array', (s: WorkbenchSessionV1) => { (s as unknown as Record<string, unknown>).curves = null }],
      ['curve not object', (s: WorkbenchSessionV1) => { (s.curves as unknown[])[0] = 'not-an-object' }],
      ['empty curve name', (s: WorkbenchSessionV1) => { s.curves[0]!.name = '' }],
      ['whitespace curve name', (s: WorkbenchSessionV1) => { s.curves[0]!.name = '   ' }],
      ['invalid curve kind', (s: WorkbenchSessionV1) => { (s.curves[0] as unknown as Record<string, unknown>).kind = 'custom' }],
      ['missing rawPoints', (s: WorkbenchSessionV1) => { (s.curves[0] as unknown as Record<string, unknown>).rawPoints = null }],
      ['empty rawPoints (0 points)', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints = [] }],
      ['single point (1 point)', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints = [{ frequencyHz: 1_000, db: 0 }] }],
      ['non-finite point frequency', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints[0]!.frequencyHz = Number.NaN }],
      ['infinite point frequency', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints[0]!.frequencyHz = Number.POSITIVE_INFINITY }],
      ['non-positive point frequency', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints[0]!.frequencyHz = 0 }],
      ['negative point frequency', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints[0]!.frequencyHz = -10 }],
      ['non-finite point db', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints[0]!.db = Number.NaN }],
      ['infinite point db', (s: WorkbenchSessionV1) => { s.curves[0]!.rawPoints[0]!.db = Number.NEGATIVE_INFINITY }],
      ['descending frequency order', (s: WorkbenchSessionV1) => {
        s.curves[0]!.rawPoints = [
          { frequencyHz: 1_000, db: 0 },
          { frequencyHz: 500, db: 1 },
        ]
      }],
      ['duplicate frequency points', (s: WorkbenchSessionV1) => {
        s.curves[0]!.rawPoints = [
          { frequencyHz: 1_000, db: 0 },
          { frequencyHz: 1_000, db: 1 },
        ]
      }],
    ])('rejects invalid curve data: %s', (_label, mutate) => {
      const session = createValidManualSession()
      mutate(session)
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })
  })

  describe('Curve Metadata Validation and Serializability', () => {
    it.each([
      ['missing metadata property', (s: WorkbenchSessionV1) => { delete (s.curves[0] as unknown as Record<string, unknown>).metadata }],
      ['metadata is null', (s: WorkbenchSessionV1) => { (s.curves[0] as unknown as Record<string, unknown>).metadata = null }],
      ['metadata is array', (s: WorkbenchSessionV1) => { (s.curves[0] as unknown as Record<string, unknown>).metadata = ['tag1', 'tag2'] }],
      ['metadata is primitive string', (s: WorkbenchSessionV1) => { (s.curves[0] as unknown as Record<string, unknown>).metadata = 'meta' }],
      ['nested object in metadata', (s: WorkbenchSessionV1) => { s.curves[0]!.metadata = { nested: { val: 1 } } as unknown as Record<string, string> }],
      ['array value in metadata', (s: WorkbenchSessionV1) => { s.curves[0]!.metadata = { tags: ['a', 'b'] } as unknown as Record<string, string> }],
      ['null value in metadata', (s: WorkbenchSessionV1) => { s.curves[0]!.metadata = { author: null } as unknown as Record<string, string> }],
      ['NaN number in metadata', (s: WorkbenchSessionV1) => { s.curves[0]!.metadata = { sampleRate: Number.NaN } }],
      ['Infinity number in metadata', (s: WorkbenchSessionV1) => { s.curves[0]!.metadata = { sampleRate: Number.POSITIVE_INFINITY } }],
    ])('rejects non-serializable curve metadata: %s', (_label, mutate) => {
      const session = createValidManualSession()
      mutate(session)
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    const invalidMetadataCases: [string, () => unknown][] = [
      ['Date object in metadata', () => new Date()],
      ['URL object in metadata', () => new URL('https://example.com/spec')],
      ['Class instance in metadata', () => new (class CustomMeta {})()],
      ...(typeof File !== 'undefined'
        ? [['File object in metadata', () => new File(['test'], 'meta.csv')] as [string, () => unknown]]
        : []),
    ]

    it.each(invalidMetadataCases)(
      'rejects non-plain object metadata container and prevents silent canonicalization to empty object: %s',
      (_label, createBadObj) => {
        const session = createValidManualSession()
        session.curves[0]!.metadata = createBadObj() as unknown as Record<string, string>
        expect(() => validateWorkbenchSession(session)).toThrow(
          'Invalid Workbench session: malformed curve definition.',
        )
      },
    )

    it('canonically reconstructs curve metadata preserving string, finite number, and boolean', () => {
      const session = createValidManualSession()
      session.curves[0]!.metadata = {
        source: 'local-file.csv',
        sampleRate: 44100,
        calibrated: false,
      }
      const validated = validateWorkbenchSession(session)
      expect(validated.curves[0]!.metadata).toEqual({
        source: 'local-file.csv',
        sampleRate: 44100,
        calibrated: false,
      })
    })
  })

  it('rejects activeFrId when not referencing an existing FR curve', () => {
    const session = createValidManualSession()
    session.activeFrId = 'non-existent-curve-id'
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()

    // Referencing a target curve as FR
    session.activeFrId = session.curves.find((c) => c.kind === 'target')!.id
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  it('rejects activeTargetId when not referencing an existing Target curve', () => {
    const session = createValidManualSession()
    session.activeTargetId = 'non-existent-target-id'
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()

    // Referencing an FR curve as Target
    session.activeTargetId = session.curves.find((c) => c.kind === 'fr')!.id
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  it.each([
    ['missing normalization', (s: WorkbenchSessionV1) => { (s as unknown as Record<string, unknown>).normalization = null }],
    ['invalid mode', (s: WorkbenchSessionV1) => { (s.normalization as unknown as Record<string, unknown>).mode = 'linear' }],
    ['frequency below min', (s: WorkbenchSessionV1) => { s.normalization.frequencyHz = MVP_NUMERIC_POLICY.minFrequencyHz - 1 }],
    ['frequency above max', (s: WorkbenchSessionV1) => { s.normalization.frequencyHz = MVP_NUMERIC_POLICY.maxFrequencyHz + 1 }],
    ['level below 0', (s: WorkbenchSessionV1) => { s.normalization.levelDb = -1 }],
    ['level above 100', (s: WorkbenchSessionV1) => { s.normalization.levelDb = 101 }],
    ['non-finite frequency', (s: WorkbenchSessionV1) => { s.normalization.frequencyHz = Number.NaN }],
    ['non-finite level', (s: WorkbenchSessionV1) => { s.normalization.levelDb = Number.POSITIVE_INFINITY }],
  ])('rejects invalid normalization: %s', (_label, mutate) => {
    const session = createValidManualSession()
    mutate(session)
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  it.each([
    ['minFrequencyHz >= maxFrequencyHz', (s: WorkbenchSessionV1) => { s.autoeqSettings.minFrequencyHz = s.autoeqSettings.maxFrequencyHz }],
    ['minGainDb >= maxGainDb', (s: WorkbenchSessionV1) => { s.autoeqSettings.minGainDb = s.autoeqSettings.maxGainDb }],
    ['minQ >= maxQ', (s: WorkbenchSessionV1) => { s.autoeqSettings.minQ = s.autoeqSettings.maxQ }],
    ['maxFilters < 0', (s: WorkbenchSessionV1) => { s.autoeqSettings.maxFilters = -1 }],
    ['maxFilters > hardMax', (s: WorkbenchSessionV1) => { s.autoeqSettings.maxFilters = AUTOEQ_PRODUCT_LIMITS.hardMaxFilters + 1 }],
    ['non-integer maxFilters', (s: WorkbenchSessionV1) => { s.autoeqSettings.maxFilters = 5.5 }],
  ])('rejects invalid AutoEQ settings: %s', (_label, mutate) => {
    const session = createValidManualSession()
    mutate(session)
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  it.each([
    ['filters not array', (s: WorkbenchSessionV1) => { (s as unknown as Record<string, unknown>).filters = null }],
    ['exceeds hardMaxFilters', (s: WorkbenchSessionV1) => {
      const baseFilter = createSampleFilterManual()
      s.filters = Array.from({ length: AUTOEQ_PRODUCT_LIMITS.hardMaxFilters + 1 }, (_, i) => ({
        ...baseFilter,
        id: `f-${i}`,
      }))
    }],
    ['filter not object', (s: WorkbenchSessionV1) => { (s.filters as unknown[])[0] = 'not-an-object' }],
    ['empty filter id', (s: WorkbenchSessionV1) => { s.filters[0]!.id = '' }],
    ['non-boolean enabled', (s: WorkbenchSessionV1) => { (s.filters[0] as unknown as Record<string, unknown>).enabled = 'true' }],
    ['invalid filter type', (s: WorkbenchSessionV1) => { (s.filters[0] as unknown as Record<string, unknown>).type = 'BELL' }],
    ['frequency below min', (s: WorkbenchSessionV1) => { s.filters[0]!.frequencyHz = 10 }],
    ['frequency above max', (s: WorkbenchSessionV1) => { s.filters[0]!.frequencyHz = 25_000 }],
    ['gain below limit', (s: WorkbenchSessionV1) => { s.filters[0]!.gainDb = -20 }],
    ['gain above limit', (s: WorkbenchSessionV1) => { s.filters[0]!.gainDb = 20 }],
    ['q below limit', (s: WorkbenchSessionV1) => { s.filters[0]!.q = 0.05 }],
    ['q above limit', (s: WorkbenchSessionV1) => { s.filters[0]!.q = 15 }],
  ])('rejects invalid filter: %s', (_label, mutate) => {
    const session = createValidManualSession()
    mutate(session)
    expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
  })

  describe('Provenance and State Coherence', () => {
    it('rejects filterProvenance: null with non-empty filters', () => {
      const session = createValidManualSession()
      session.filterProvenance = null
      session.filters = [createSampleFilterManual()]
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects filterProvenance: null with non-null autoEqRun', () => {
      const session = createValidManualSession()
      session.filterProvenance = null
      session.filters = []
      session.autoEqRun = createAutoEqRunRecord()
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects filterProvenance: null with solutionState !== "clean"', () => {
      const session = createValidManualSession()
      session.filterProvenance = null
      session.filters = []
      session.solutionState = 'modified'
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects filterProvenance: "manual" with non-null autoEqRun', () => {
      const session = createValidManualSession()
      session.filterProvenance = 'manual'
      session.autoEqRun = createAutoEqRunRecord()
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects filterProvenance: "manual" with solutionState !== "clean"', () => {
      const session = createValidManualSession()
      session.filterProvenance = 'manual'
      session.solutionState = 'modified'
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects filterProvenance: "autoeq" with null autoEqRun', () => {
      const session = createValidAutoEqSession()
      session.autoEqRun = null
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects autoEqRun present when filterProvenance is not "autoeq"', () => {
      const session = createValidAutoEqSession()
      session.filterProvenance = 'manual'
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    describe('Clean AutoEQ Context Coherence', () => {
      it('rejects clean AutoEQ session when activeFrId is null', () => {
        const session = createValidAutoEqSession()
        session.activeFrId = null
        expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
      })

      it('rejects clean AutoEQ session when activeTargetId is null', () => {
        const session = createValidAutoEqSession()
        session.activeTargetId = null
        expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
      })

      it('round-trips a clean AutoEQ session after the active FR is renamed', () => {
        const session = createValidAutoEqSession()
        session.curves.find((c) => c.id === session.activeFrId)!.name = 'Different Source'

        const restored = deserializeWorkbenchSession(serializeWorkbenchSession(session))

        expect(restored.curves.find((c) => c.id === restored.activeFrId)?.name).toBe('Different Source')
        expect(restored.autoEqRun?.manifest.sourceName).toBe('Source')
        expect(restored.autoEqRun).toEqual(session.autoEqRun)
        expect(restored.solutionState).toBe('clean')
      })

      it('round-trips a clean AutoEQ session after the active Target is renamed', () => {
        const session = createValidAutoEqSession()
        session.curves.find((c) => c.id === session.activeTargetId)!.name = 'Different Target'

        const restored = deserializeWorkbenchSession(serializeWorkbenchSession(session))

        expect(restored.curves.find((c) => c.id === restored.activeTargetId)?.name).toBe('Different Target')
        expect(restored.autoEqRun?.manifest.targetName).toBe('Target')
        expect(restored.autoEqRun).toEqual(session.autoEqRun)
        expect(restored.solutionState).toBe('clean')
      })

      it('rejects clean AutoEQ session when normalization does not match manifest normalization', () => {
        const session = createValidAutoEqSession()
        session.normalization.frequencyHz = 1_000
        expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
      })

      it('rejects clean AutoEQ session when autoeqSettings does not match manifest settings', () => {
        const session = createValidAutoEqSession()
        session.autoeqSettings.maxGainDb = 8.0
        expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
      })

      it('rejects clean AutoEQ session when filters do not match manifest finalFilters', () => {
        const session = createValidAutoEqSession()
        session.filters = [
          {
            ...session.filters[0]!,
            gainDb: session.filters[0]!.gainDb + 1.0,
          },
        ]
        expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
      })

      it('accepts modified AutoEQ session even if filters numerically equal manifest (sticky modified)', () => {
        const session = createValidAutoEqSession()
        session.solutionState = 'modified'
        expect(validateWorkbenchSession(session).solutionState).toBe('modified')
      })

      it('accepts stale AutoEQ session even if context matches manifest (sticky stale)', () => {
        const session = createValidAutoEqSession()
        session.solutionState = 'stale'
        expect(validateWorkbenchSession(session).solutionState).toBe('stale')
      })
    })

    it('rejects malformed AutoEQ run manifest schema 2', () => {
      const session = createValidAutoEqSession()
      const badManifest = {
        ...session.autoEqRun!.manifest,
        schemaVersion: 1 as unknown as 2,
      }
      session.autoEqRun = { manifest: badManifest as unknown as RunManifest }
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('rejects manifest with duplicate finalFilter IDs or invalid parameters', () => {
      const session = createValidAutoEqSession()
      const manifest = {
        ...session.autoEqRun!.manifest,
        finalFilters: [
          session.filters[0]!,
          { ...session.filters[0]!, frequencyHz: 2_000 },
        ],
      }
      session.autoEqRun = { manifest }
      expect(() => deserializeWorkbenchSession(JSON.stringify(session))).toThrow()
    })

    it('canonically reconstructs manifest stripping unknown extra fields', () => {
      const session = createValidAutoEqSession()
      const rawManifestWithExtra = {
        ...session.autoEqRun!.manifest,
        unknownField: 'secret_leak',
      }
      session.autoEqRun = { manifest: rawManifestWithExtra as unknown as RunManifest }
      const validated = validateWorkbenchSession(session)
      expect((validated.autoEqRun!.manifest as unknown as Record<string, unknown>).unknownField).toBeUndefined()
    })
  })

  it('ensures public error messages contain no local paths or stack leakages', () => {
    const badJson = '{ "broken": '
    try {
      deserializeWorkbenchSession(badJson)
      expect.unreachable('Should have thrown')
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error)
      const message = (cause as Error).message
      expect(message).not.toContain('/home')
      expect(message).not.toContain('\\')
      expect(message).not.toContain('.ts')
    }
  })
})

describe('Atomic Workspace Session Replacement & Import Coordinator', () => {
  let workspace: ReturnType<typeof createWorkspaceStore>
  let compare: ReturnType<typeof createEqCompareStore>
  let runStore: ReturnType<typeof createAutoEqRunStore>

  beforeEach(() => {
    workspace = createWorkspaceStore()
    compare = createEqCompareStore()
    runStore = createAutoEqRunStore()
  })

  it('workspaceStore.applySession replaces state atomically with validated session and clears undo/redo history', () => {
    // Populate workspace and build undo history
    const fr = createSampleCurveFr()
    const target = createSampleCurveTarget()
    workspace.getState().addCurve(fr)
    workspace.getState().addCurve(target)
    workspace.getState().addFilter('PK')
    workspace.getState().addFilter('LS')
    expect(workspace.getState().canUndo).toBe(true)
    expect(workspace.getState().filters).toHaveLength(2)

    const sessionToImport = createValidAutoEqSession()
    const validated = validateWorkbenchSession(sessionToImport)
    workspace.getState().applySession(validated)

    const state = workspace.getState()
    expect(state.curves).toEqual(sessionToImport.curves)
    expect(state.activeFrId).toBe(sessionToImport.activeFrId)
    expect(state.activeTargetId).toBe(sessionToImport.activeTargetId)
    expect(state.normalization).toEqual(sessionToImport.normalization)
    expect(state.autoeqSettings).toEqual(sessionToImport.autoeqSettings)
    expect(state.filters).toEqual(sessionToImport.filters)
    expect(state.filterProvenance).toBe('autoeq')
    expect(state.solutionState).toBe('clean')
    expect(state.autoEqRun).toEqual(sessionToImport.autoEqRun)

    // History and selection cleared
    expect(state.selectedFilterId).toBeNull()
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)

    // Calling undo/redo does nothing
    workspace.getState().undo()
    expect(workspace.getState().filters).toEqual(sessionToImport.filters)
    workspace.getState().redo()
    expect(workspace.getState().filters).toEqual(sessionToImport.filters)
  })

  it('importWorkbenchSession invalid import produces zero mutation across workspace, history, compare, and runStore', () => {
    // Setup initial state
    const fr = createSampleCurveFr()
    workspace.getState().addCurve(fr)
    workspace.getState().addFilter('PK')
    compare.getState().record({
      filters: workspace.getState().filters,
      filterProvenance: workspace.getState().filterProvenance,
      solutionState: workspace.getState().solutionState,
      autoEqRun: workspace.getState().autoEqRun,
      runInputSignature: 'test-sig',
      preampDb: 0,
    })
    compare.getState().flush()
    expect(compare.getState().snapshots).toHaveLength(1)

    const priorWorkspaceCurves = [...workspace.getState().curves]
    const priorWorkspaceFilters = [...workspace.getState().filters]
    const priorCanUndo = workspace.getState().canUndo
    const priorCompareSnapshots = [...compare.getState().snapshots]

    const cancelSpy = vi.fn()

    expect(() =>
      importWorkbenchSession('{"schemaVersion": 999}', {
        workspaceStore: workspace,
        compareStore: compare,
        runStore,
        cancelAutoEq: cancelSpy,
      }),
    ).toThrow()

    // Assert zero mutation
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(workspace.getState().curves).toEqual(priorWorkspaceCurves)
    expect(workspace.getState().filters).toEqual(priorWorkspaceFilters)
    expect(workspace.getState().canUndo).toBe(priorCanUndo)
    expect(compare.getState().snapshots).toEqual(priorCompareSnapshots)
    expect(runStore.getState().status).toBe('idle')
  })

  it('importWorkbenchSession does NOT invoke cancel when runStore is idle', () => {
    expect(runStore.getState().activeRunId).toBeNull()
    const cancelSpy = vi.fn()
    const validSession = createValidAutoEqSession()

    importWorkbenchSession(validSession, {
      workspaceStore: workspace,
      compareStore: compare,
      runStore,
      cancelAutoEq: cancelSpy,
    })

    expect(cancelSpy).not.toHaveBeenCalled()
  })

  it('importWorkbenchSession invokes cancel when runStore has an active run', () => {
    runStore.getState().start('active-run-123')
    expect(runStore.getState().activeRunId).toBe('active-run-123')

    const cancelSpy = vi.fn()
    const validSession = createValidAutoEqSession()

    importWorkbenchSession(validSession, {
      workspaceStore: workspace,
      compareStore: compare,
      runStore,
      cancelAutoEq: cancelSpy,
    })

    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('importWorkbenchSession valid import updates workspace, clears history, clears Compare, and resets runStore', () => {
    // Setup initial state
    const fr = createSampleCurveFr()
    workspace.getState().addCurve(fr)
    workspace.getState().addFilter('PK')
    compare.getState().record({
      filters: workspace.getState().filters,
      filterProvenance: workspace.getState().filterProvenance,
      solutionState: workspace.getState().solutionState,
      autoEqRun: workspace.getState().autoEqRun,
      runInputSignature: 'test-sig',
      preampDb: 0,
    })
    compare.getState().flush()
    compare.getState().setA(compare.getState().snapshots[0]!.id)
    expect(compare.getState().snapshots).toHaveLength(1)
    expect(compare.getState().aSnapshotId).not.toBeNull()

    const cancelSpy = vi.fn()
    const validSession = createValidAutoEqSession()
    const serialized = serializeWorkbenchSession(validSession)

    const result = importWorkbenchSession(serialized, {
      workspaceStore: workspace,
      compareStore: compare,
      runStore,
      cancelAutoEq: cancelSpy,
    })

    expect(result).toEqual({ ...validSession, schemaVersion: 2 })

    // Workspace assertions
    expect(workspace.getState().curves).toEqual(validSession.curves)
    expect(workspace.getState().filters).toEqual(validSession.filters)
    expect(workspace.getState().selectedFilterId).toBeNull()
    expect(workspace.getState().canUndo).toBe(false)
    expect(workspace.getState().canRedo).toBe(false)

    // Compare store assertions
    expect(compare.getState().snapshots).toEqual([])
    expect(compare.getState().aSnapshotId).toBeNull()
    expect(compare.getState().bSnapshotId).toBeNull()

    // Run store assertions
    expect(runStore.getState().status).toBe('idle')
    expect(runStore.getState().activeRunId).toBeNull()
    expect(runStore.getState().error).toBeNull()
  })

  it('prevents a simulated late Worker result from overwriting an imported session', async () => {
    let lateResolve: ((result: ReturnType<typeof createAutoEqResultV2>) => void) | null = null
    const client: AutoEqClient = {
      run: () =>
        new Promise((resolve) => {
          lateResolve = resolve
        }),
      cancel: vi.fn(),
    }

    let nextRun = 0
    const controller = createAutoEqController({
      workspace,
      runStore,
      client,
      createRunId: () => `run-${++nextRun}`,
    })

    // Setup workspace ready for AutoEQ
    const fr = createSampleCurveFr()
    const target = createSampleCurveTarget()
    workspace.getState().addCurve(fr)
    workspace.getState().addCurve(target)
    workspace.getState().setActiveFr(fr.id)
    workspace.getState().setActiveTarget(target.id)

    // Start AutoEQ run in background
    const pendingRun = controller.runAutoEq()
    expect(runStore.getState().status).toBe('running')
    expect(runStore.getState().activeRunId).toBe('run-1')

    // While run is pending, import a new session
    const importedSession = createValidManualSession()
    importedSession.filters = [
      {
        id: 'imported-filter-99',
        enabled: true,
        type: 'HS',
        frequencyHz: 8_000,
        gainDb: -4,
        q: 0.7,
      },
    ]
    importedSession.curves = [
      {
        ...fr,
        id: 'imported-fr-99',
        name: 'Imported FR 99',
      },
      {
        ...target,
        id: 'imported-target-99',
        name: 'Imported Target 99',
      },
    ]
    importedSession.activeFrId = 'imported-fr-99'
    importedSession.activeTargetId = 'imported-target-99'

    importWorkbenchSession(serializeWorkbenchSession(importedSession), {
      workspaceStore: workspace,
      compareStore: compare,
      runStore,
      cancelAutoEq: () => controller.cancelAutoEq(),
    })

    expect(workspace.getState().filters[0]!.id).toBe('imported-filter-99')
    expect(runStore.getState().status).toBe('idle')

    // Simulate late worker result resolving
    const lateResult = createAutoEqResultV2(6)
    lateResolve!(lateResult)
    await pendingRun

    // Imported session must NOT be overwritten
    expect(workspace.getState().filters[0]!.id).toBe('imported-filter-99')
    expect(workspace.getState().curves[0]!.id).toBe('imported-fr-99')
    expect(workspace.getState().filterProvenance).toBe('manual')
    expect(workspace.getState().autoEqRun).toBeNull()
  })
})
