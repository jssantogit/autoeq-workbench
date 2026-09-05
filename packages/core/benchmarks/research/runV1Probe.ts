import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

import {
  DEFAULT_AUTOEQ_SETTINGS_V1,
  runStandardAutoEq,
} from '../../src/index.js'
import {
  loadResearchCases,
  RESEARCH_NORMALIZATION,
} from './corpus.js'

const outputDir = resolve(process.argv[2] ?? './autoeq-research')
mkdirSync(outputDir, { recursive: true })

const rows = []
for (const researchCase of loadResearchCases()) {
  const timingsMs: number[] = []
  let quality: ReturnType<typeof runStandardAutoEq>['metrics'] | undefined
  let filterCount = 0
  for (let repeatIndex = 0; repeatIndex < 3; repeatIndex += 1) {
    const startedAt = performance.now()
    const result = runStandardAutoEq({
      source: researchCase.source,
      target: researchCase.target,
      normalization: { ...RESEARCH_NORMALIZATION },
      settings: { ...DEFAULT_AUTOEQ_SETTINGS_V1, maxFilters: 10 },
    })
    timingsMs.push(performance.now() - startedAt)
    quality = result.metrics
    filterCount = result.filters.length
  }
  timingsMs.sort((left, right) => left - right)
  rows.push({
    caseId: researchCase.id,
    maxFilters: 10,
    repeats: timingsMs.length,
    elapsedMs: {
      best: timingsMs[0],
      median: timingsMs[Math.floor(timingsMs.length / 2)],
      worst: timingsMs.at(-1),
    },
    metrics: quality,
    filterCount,
  })
}

const artifact = { schemaVersion: 1, rows }
writeFileSync(resolve(outputDir, 'v1-probe.json'), `${JSON.stringify(artifact, null, 2)}\n`)
for (const row of rows) console.log(JSON.stringify(row))
