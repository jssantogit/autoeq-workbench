import { describe, expect, it } from 'vitest'

import {
  createScalableCapacityCells,
  main,
  parseScalableCapacityLadderArgs,
  runScalableCapacityCell,
  runScalableCapacityLadder,
} from '../../../benchmarks/structuralScalableCapacityLadder.js'
import type { ScalableSearchStage } from '../../../src/index.js'

describe('scalable capacity ladder benchmark harness', () => {
  it('selects a case, capacity, budget, and streaming output mode', () => {
    const options = parseScalableCapacityLadderArgs([
      '--case', 'titan-to-rsv',
      '--capacity', '15',
      '--budget-seconds', '0.25',
      '--jsonl',
    ])

    expect(options).toMatchObject({
      cases: ['titan-to-rsv'],
      finalCaps: [15],
      budgetSeconds: 0.25,
      outputMode: 'jsonl',
    })
    expect(createScalableCapacityCells(options)).toEqual([
      { caseId: 'titan-to-rsv', finalMaxFilters: 15, budgetSeconds: 0.25 },
    ])
  })

  it('reports a completed cell with stage timing and controller telemetry', () => {
    let now = 1_000
    const stage: ScalableSearchStage = {
      stageIndex: 0,
      capacity: 10,
      effortLevel: 0,
      seedStrategy: 'incumbent',
      candidateViolation: 0.8,
      incumbentViolation: 1,
      improved: true,
    }

    const cell = runScalableCapacityCell({
      caseId: 'titan-to-rsv',
      finalMaxFilters: 15,
      budgetSeconds: 0.1,
      nowMs: () => now,
      run: (input) => {
        expect(input.maxFilters).toBe(15)
        expect(input.baseConfig.maxFilters).toBe(10)
        expect(input.baseConfig.workProfile).toBe('full')
        now = 1_060
        input.onStage?.(stage)
        now = 1_150
        return {
          filters: [],
          rmseDb: 0.2,
          maxAbsDb: 0.6,
          stagesCompleted: 1,
        }
      },
    })

    expect(cell).toMatchObject({
      caseId: 'titan-to-rsv',
      finalMaxFilters: 15,
      budgetSeconds: 0.1,
      elapsedMs: 150,
      deadlineExpired: true,
      finalFilterCount: 0,
      finalRmseDb: 0.2,
      finalMaxAbsDb: 0.6,
      finalViolation: 0.8,
      stagesCompleted: 1,
    })
    expect(cell.stages).toEqual([{
      ...stage,
      stageElapsedMs: 60,
      totalElapsedMs: 60,
    }])
  })

  it('emits each completed cell before starting the next cell and returns an aggregate', () => {
    const emitted: string[] = []
    let started = 0
    const result = runScalableCapacityLadder({
      cases: ['titan-to-rsv', 'titan-to-mystic-8'],
      finalCaps: [10, 15],
      budgetSeconds: 0.01,
      outputMode: 'jsonl',
      nowMs: () => 0,
      run: () => {
        expect(emitted).toHaveLength(started)
        started += 1
        return {
          filters: [],
          rmseDb: 0.2,
          maxAbsDb: 0.6,
          stagesCompleted: 0,
        }
      },
      onCell: (cell) => emitted.push(`${cell.caseId}:${cell.finalMaxFilters}`),
    })

    expect(emitted).toEqual([
      'titan-to-rsv:10',
      'titan-to-rsv:15',
      'titan-to-mystic-8:10',
      'titan-to-mystic-8:15',
    ])
    expect(result.cells).toHaveLength(4)
    expect(result.rows).toHaveLength(2)
    expect(result.monotonicCases).toBe(2)
  })

  it('writes a JSONL cell record before the final aggregate summary', () => {
    const lines: string[] = []

    main([
      '--case', 'titan-to-rsv',
      '--capacity', '10',
      '--budget-seconds', '0.01',
      '--jsonl',
    ], {
      nowMs: () => 0,
      run: () => ({
        filters: [],
        rmseDb: 0.2,
        maxAbsDb: 0.6,
        stagesCompleted: 0,
      }),
      writeLine: (line) => lines.push(line),
    })

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: 'cell',
      caseId: 'titan-to-rsv',
      finalMaxFilters: 10,
      budgetSeconds: 0.01,
    })
    expect(JSON.parse(lines[1]!)).toMatchObject({
      type: 'summary',
      finalCaps: [10],
      monotonicCases: 1,
    })
  })
})
