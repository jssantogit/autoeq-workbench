import { DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import { createAutoEqResultV2 } from '../test/autoEqFixture'
import { validateWorkbenchSession, type WorkbenchSessionV2 } from './workbenchSession'

function fabricatedAutoEqSessionOverManifestMaxFilters(): WorkbenchSessionV2 {
  const fr = {
    id: 'fr-source',
    name: 'Source',
    kind: 'fr' as const,
    rawPoints: [
      { frequencyHz: 20, db: 0 },
      { frequencyHz: 20_000, db: 0 },
    ],
    metadata: { synthetic: true },
  }
  const target = {
    id: 'target',
    name: 'Target',
    kind: 'target' as const,
    rawPoints: [
      { frequencyHz: 20, db: 0 },
      { frequencyHz: 20_000, db: 0 },
    ],
    metadata: { synthetic: true },
  }
  const result = createAutoEqResultV2(2.5, {
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 0 },
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
    solutionState: 'modified',
    autoEqRun: { manifest: result.manifest },
  }
}

describe('Workbench Session Standard-v2 manifest filter-count boundary', () => {
  it('rejects a manifest whose final filters exceed its declared maxFilters', () => {
    const fabricated = fabricatedAutoEqSessionOverManifestMaxFilters()

    expect(fabricated.autoEqRun!.manifest.finalFilters).toHaveLength(1)
    expect(fabricated.autoEqRun!.manifest.autoeqSettings.maxFilters).toBe(0)
    expect(() => validateWorkbenchSession(fabricated)).toThrow(
      'Invalid Workbench session: invalid AutoEQ run record or manifest.',
    )
  })
})
