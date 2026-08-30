import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createEvaluationGrid,
} from '../../../../src/index.js'
import {
  loadResearchCases,
  prepareResearchDesired,
  RESEARCH_CORPUS_SHA256,
} from '../../../../benchmarks/research/corpus.js'

const rawFiles = {
  'dunu-titan-s2.txt': new URL(
    '../../../../benchmarks/research/raw/dunu-titan-s2.txt',
    import.meta.url,
  ),
  'subtonic-storm.txt': new URL(
    '../../../../benchmarks/research/raw/subtonic-storm.txt',
    import.meta.url,
  ),
  '64-audio-u12t.txt': new URL(
    '../../../../benchmarks/research/raw/64-audio-u12t.txt',
    import.meta.url,
  ),
  '64-audio-trio.txt': new URL(
    '../../../../benchmarks/research/raw/64-audio-trio.txt',
    import.meta.url,
  ),
} as const

function sha256(url: URL): string {
  return createHash('sha256').update(readFileSync(url)).digest('hex')
}

describe('research corpus', () => {
  it('loads the fixed Titan source cases through canonical preparation', () => {
    const cases = loadResearchCases()

    expect(cases.map(({ id }) => id)).toEqual([
      'titan-to-storm',
      'titan-to-u12t',
      'titan-to-trio',
    ])

    for (const researchCase of cases) {
      expect(researchCase.source.kind).toBe('fr')
      expect(researchCase.target.kind).toBe('target')

      const prepared = prepareResearchDesired(researchCase.id)
      expect(prepared.frequenciesHz).toEqual(createEvaluationGrid())
      expect(prepared.desiredDb).toHaveLength(prepared.frequenciesHz.length)
      expect(prepared.desiredDb.every(Number.isFinite)).toBe(true)
      expect(researchCase.source.metadata).toEqual({})
      expect(researchCase.target.metadata).toEqual({})
    }
  })

  it('matches the approved byte-level raw corpus hashes', () => {
    for (const [name, url] of Object.entries(rawFiles)) {
      expect(sha256(url)).toBe(RESEARCH_CORPUS_SHA256[name])
    }
  })
})
