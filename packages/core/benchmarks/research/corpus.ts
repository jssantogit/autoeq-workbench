import { readFileSync } from 'node:fs'

import { createEvaluationGrid } from '../../src/config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../../src/curves/derive.js'
import { parseCurveText } from '../../src/io/parseCurve.js'
import type { Curve, Normalization } from '../../src/types/curve.js'

import type { ResearchCase, ResearchCaseId } from './types.js'

export const RESEARCH_NORMALIZATION = {
  mode: 'hz',
  frequencyHz: 500,
  levelDb: 60,
} as const satisfies Normalization

export const RESEARCH_CORPUS_SHA256: Readonly<Record<string, string>> = Object.freeze({
  'dunu-titan-s2.txt': 'baa46f7ff6516597d6483a50739a32d0484fea1a509797e717e32b7f39305e7f',
  'subtonic-storm.txt': '13b3c259cb3b5c106eacac80aa5180c0ffb42d15196ff5e2bcce7d31aae6ed1a',
  '64-audio-u12t.txt': '593b25ea63fd02e886dd9f1892df9d9d4e17c41ce95fdfbc52492979c61c769e',
  '64-audio-trio.txt': 'd172c28fd5884ecb40338eb43b75a486c09842abfac185b16be7e56122c90f20',
})

type RawCurveDefinition = {
  fileName: keyof typeof RESEARCH_CORPUS_SHA256
  name: string
  kind: Curve['kind']
}

const sourceDefinition: RawCurveDefinition = {
  fileName: 'dunu-titan-s2.txt',
  name: 'Dunu Titan S2',
  kind: 'fr',
}

const targetDefinitions: Readonly<Record<ResearchCaseId, RawCurveDefinition>> = {
  'titan-to-storm': {
    fileName: 'subtonic-storm.txt',
    name: 'Subtonic Storm',
    kind: 'target',
  },
  'titan-to-u12t': {
    fileName: '64-audio-u12t.txt',
    name: '64 Audio U12t',
    kind: 'target',
  },
  'titan-to-trio': {
    fileName: '64-audio-trio.txt',
    name: '64 Audio Trio',
    kind: 'target',
  },
}

let cachedResearchCases: ResearchCase[] | undefined

function readRawCurve(definition: RawCurveDefinition): Curve {
  const text = readFileSync(new URL(`./raw/${definition.fileName}`, import.meta.url), 'utf8')
  return parseCurveText(text, {
    name: definition.name,
    kind: definition.kind,
  })
}

export function loadResearchCases(): ResearchCase[] {
  if (cachedResearchCases === undefined) {
    const source = readRawCurve(sourceDefinition)
    cachedResearchCases = (Object.keys(targetDefinitions) as ResearchCaseId[]).map((id) => ({
      id,
      source,
      target: readRawCurve(targetDefinitions[id]),
    }))
  }

  return cachedResearchCases.map(({ id, source, target }) => ({
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

export function prepareResearchDesired(caseId: ResearchCaseId): {
  frequenciesHz: number[]
  desiredDb: number[]
} {
  const researchCase = loadResearchCases().find((candidate) => candidate.id === caseId)
  if (researchCase === undefined) {
    throw new Error(`Unknown research case: ${caseId}`)
  }

  const frequenciesHz = createEvaluationGrid()
  const source = prepareCurve(
    researchCase.source,
    RESEARCH_NORMALIZATION,
    frequenciesHz,
  )
  const target = prepareCurve(
    researchCase.target,
    RESEARCH_NORMALIZATION,
    frequenciesHz,
  )

  return {
    frequenciesHz,
    desiredDb: desiredCorrection(source.db, target.db),
  }
}
