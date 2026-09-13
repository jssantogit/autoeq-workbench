import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

import { createEvaluationGrid } from '../../src/config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../../src/curves/derive.js'
import { parseCurveText } from '../../src/io/parseCurve.js'
import type { Curve } from '../../src/types/curve.js'

import { RESEARCH_NORMALIZATION } from './corpus.js'

export type ManualRegressionCaseId =
  | 'titan-to-mystic-8'
  | 'titan-to-rsv'
  | 'titan-to-s12-ultra'

export const MANUAL_REGRESSION_FIXTURE_SHA256 = Object.freeze({
  'letshuoer-mystic-8.txt': '471e6514e2f9d70b6b9456831cd475bf992b899643476b663c8b554698d77ce3',
  'softears-rsv.txt': '953499465e21ee0823f0c9534d4aa0057c1f827100743e8b6474bf632bb2842e',
  'letshuoer-s12-ultra.txt': '39adcb3b0a366ec7f3d62d93f730f45df487b721dc6a51da823a8ee500f59a52',
} as const)

type ManualTargetDefinition = {
  compressedFileName: string
  rawFileName: keyof typeof MANUAL_REGRESSION_FIXTURE_SHA256
  name: string
}

const targetDefinitions: Readonly<Record<ManualRegressionCaseId, ManualTargetDefinition>> = {
  'titan-to-mystic-8': {
    compressedFileName: 'letshuoer-mystic-8.txt.br',
    rawFileName: 'letshuoer-mystic-8.txt',
    name: 'Letshuoer Mystic 8',
  },
  'titan-to-rsv': {
    compressedFileName: 'softears-rsv.txt.br',
    rawFileName: 'softears-rsv.txt',
    name: 'Softears RSV',
  },
  'titan-to-s12-ultra': {
    compressedFileName: 'letshuoer-s12-ultra.txt.br',
    rawFileName: 'letshuoer-s12-ultra.txt',
    name: 'Letshuoer S12 Ultra',
  },
}

export interface ManualRegressionCase {
  id: ManualRegressionCaseId
  source: Curve
  target: Curve
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function readSourceCurve(): Curve {
  const text = readFileSync(new URL('./raw/dunu-titan-s2.txt', import.meta.url), 'utf8')
  return parseCurveText(text, {
    name: 'Dunu Titan S2',
    kind: 'fr',
  })
}

function readTargetCurve(definition: ManualTargetDefinition): Curve {
  const compressed = readFileSync(
    new URL(`./raw/manual/${definition.compressedFileName}`, import.meta.url),
  )
  const raw = brotliDecompressSync(compressed)
  const actualHash = sha256(raw)
  const expectedHash = MANUAL_REGRESSION_FIXTURE_SHA256[definition.rawFileName]

  if (actualHash !== expectedHash) {
    throw new Error(
      `Manual regression fixture hash mismatch for ${definition.rawFileName}: ` +
      `expected ${expectedHash}, got ${actualHash}`,
    )
  }

  return parseCurveText(raw.toString('utf8'), {
    name: definition.name,
    kind: 'target',
  })
}

let cachedCases: ManualRegressionCase[] | undefined

export function loadManualRegressionCases(): ManualRegressionCase[] {
  if (cachedCases === undefined) {
    const source = readSourceCurve()
    cachedCases = (Object.keys(targetDefinitions) as ManualRegressionCaseId[]).map((id) => ({
      id,
      source,
      target: readTargetCurve(targetDefinitions[id]),
    }))
  }

  return cachedCases.map(({ id, source, target }) => ({
    id,
    source: {
      ...source,
      rawPoints: source.rawPoints.map((point) => ({ ...point })),
      metadata: { ...source.metadata },
    },
    target: {
      ...target,
      rawPoints: target.rawPoints.map((point) => ({ ...point })),
      metadata: { ...target.metadata },
    },
  }))
}

export function prepareManualRegressionDesired(caseId: ManualRegressionCaseId): {
  frequenciesHz: number[]
  desiredDb: number[]
} {
  const regressionCase = loadManualRegressionCases().find((candidate) => candidate.id === caseId)
  if (regressionCase === undefined) {
    throw new Error(`Unknown manual regression case: ${caseId}`)
  }

  const frequenciesHz = createEvaluationGrid()
  const source = prepareCurve(
    regressionCase.source,
    RESEARCH_NORMALIZATION,
    frequenciesHz,
  )
  const target = prepareCurve(
    regressionCase.target,
    RESEARCH_NORMALIZATION,
    frequenciesHz,
  )

  return {
    frequenciesHz,
    desiredDb: desiredCorrection(source.db, target.db),
  }
}
