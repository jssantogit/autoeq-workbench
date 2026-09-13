import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  aggregateResearchCampaignRecords,
  createResearchCampaignManifest,
  deterministicResearchRunId,
  executeResumableResearchCampaign,
  filterResearchCampaignCells,
  type ResearchCampaignCell,
} from '../../../../benchmarks/research/campaignRunner.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function manifest() {
  return createResearchCampaignManifest({
    gitCommit: '0100384552171afc7b35abbb144f128597531361',
    sourceIdentity: 'titan:sha256:source',
    targetIdentity: 'storm:sha256:target',
    corpusSchema: 'research-v2-real-fr-1',
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    sampleRateHz: 48_000,
    structuralBounds: { minFilters: 1, maxFilters: 64 },
    maxStructuralCapacity: 64,
    effort: { maxLevel: 6 },
    beamWidth: 4,
    proposalsPerParent: 8,
    polishEvaluations: 24,
    stageQuantumMs: 250,
    requestedHorizon: { quanta: [1, 2, 4, 8, 16] },
    optimizerVersion: 'standard-v2-research',
    schedulerPolicy: 'legacy',
    harnessVersion: 'campaign-runner-test',
  })
}

const cells: ResearchCampaignCell[] = [
  { cellId: 'rsv-capacity-10', caseId: 'titan-to-rsv', experimentFamily: 'capacity-ladder', resourceEnvelope: 10 },
  { cellId: 'storm-capacity-17', caseId: 'titan-to-storm', experimentFamily: 'capacity-ladder', resourceEnvelope: 17 },
]

describe('resumable research campaign runner', () => {
  it('derives deterministic IDs from manifest identity and cell identity', () => {
    const first = deterministicResearchRunId(manifest(), cells[0]!)
    const second = deterministicResearchRunId(manifest(), { ...cells[0]! })
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{16}$/)
  })

  it('appends completed cells and resumes without executing them again', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'autoeq-campaign-'))
    temporaryDirectories.push(directory)
    let executions = 0
    const first = await executeResumableResearchCampaign({
      outputDir: directory,
      manifest: manifest(),
      cells,
      execute: (cell) => {
        executions += 1
        return { cellId: cell.cellId, rmseDb: cell.cellId.startsWith('rsv') ? 0.1 : 0.2 }
      },
    })
    expect(executions).toBe(2)
    expect(first.records.every((record) => record.status === 'completed')).toBe(true)

    const second = await executeResumableResearchCampaign({
      outputDir: directory,
      manifest: manifest(),
      cells,
      execute: () => {
        executions += 1
        return { impossible: true }
      },
    })
    expect(executions).toBe(2)
    expect(second.records.every((record) => record.reused)).toBe(true)
    const lines = readFileSync(join(directory, 'runs.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('records failures and supports explicit filtering without marking filtered cells complete', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'autoeq-campaign-'))
    temporaryDirectories.push(directory)
    const selected = filterResearchCampaignCells(cells, { caseId: 'titan-to-storm', experimentFamily: 'capacity-ladder' })
    expect(selected.map((cell) => cell.cellId)).toEqual(['storm-capacity-17'])

    const result = await executeResumableResearchCampaign({
      outputDir: directory,
      manifest: manifest(),
      cells,
      filter: { caseId: 'titan-to-storm' },
      execute: () => { throw new Error('synthetic failure') },
    })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ status: 'failed', error: 'synthetic failure' })
    expect(aggregateResearchCampaignRecords(result.records)).toMatchObject({ total: 1, failed: 1, completed: 0, skipped: 0 })
  })
})
