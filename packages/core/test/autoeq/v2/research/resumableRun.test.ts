import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadLayeredResearchCases } from '../../../../benchmarks/research/corpus.js'
import { canonicalSnapshotPayload } from '../../../../benchmarks/research/referenceSnapshot.js'
import { main as runResumable } from '../../../../benchmarks/research/resumableRun.js'
import { createSolverLabProblem } from '../../../../benchmarks/research/labProtocol.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('resumable research runner', () => {
  it('advances a fixed-cap state and writes a valid artifact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'autoeq-resumable-run-'))
    temporaryDirectories.push(directory)
    const researchCase = loadLayeredResearchCases('adversarial')
      .find((candidate) => candidate.id === 'titan-to-storm')!
    const problem = createSolverLabProblem(researchCase, 10)
    const snapshotWithoutHash = {
      version: 1 as const,
      createdFromRepositorySha: 'b'.repeat(40),
      corpusVersion: 'autoeq-research-corpus-v1',
      canonicalEvaluatorVersion: 'standard-v2-canonical-v1',
      cells: [{
        problemId: problem.problemId,
        inputSha256: problem.inputSha256,
        maxFilters: 10,
        referenceState: 'stable-under-current-search' as const,
        controlCandidateId: 'fixture-reference',
        candidates: [{
          candidateId: 'fixture-reference',
          problemId: problem.problemId,
          inputSha256: problem.inputSha256,
          maxFilters: 10,
          actualDeliveredFilterCount: 0,
          filters: [],
          canonicalRmseDb: 0,
          canonicalMaxAbsDb: 0,
          algorithmId: 'fixture',
          seed: null,
          provenance: 'synthetic-fixture',
        }],
        deliverableFrontierCandidateIds: ['fixture-reference'],
        continuousDiagnosticFrontier: [],
      }],
    }
    const snapshot = {
      ...snapshotWithoutHash,
      contentSha256: createHash('sha256')
        .update(canonicalSnapshotPayload(snapshotWithoutHash))
        .digest('hex'),
    }
    const snapshotPath = join(directory, 'snapshot.json')
    const outputPath = join(directory, 'run.json')
    writeFileSync(snapshotPath, JSON.stringify(snapshot))

    runResumable([
      '--snapshot', snapshotPath,
      '--case', 'titan-to-storm',
      '--policy', 'resumable-beam-v1',
      '--max-filters', '10',
      '--evaluation-budget', '1',
      '--seed', '0',
      '--out', outputPath,
    ])

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8')) as {
      schemaVersion: number
      problemId: string
      evaluationBudget: number
      trajectory: unknown[]
    }
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      problemId: 'titan-to-storm',
      evaluationBudget: 1,
    })
    expect(artifact.trajectory.length).toBeGreaterThan(0)
  }, 30_000)
})
