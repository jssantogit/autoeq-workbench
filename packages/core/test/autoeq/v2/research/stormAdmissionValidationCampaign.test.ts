import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ARMS,
  CAMPAIGN_MATRIX,
  CONFIGURATION,
} from '../../../../benchmarks/research/stormAdmissionValidationCampaign.js'

describe('Storm Admission Validation Campaign', () => {
  it('uses one frozen structural configuration for all arms', () => {
    expect(CONFIGURATION.maxFilters).toBe(10)
    expect(CONFIGURATION.beamWidth).toBe(2)
    expect(CONFIGURATION.proposalsPerParent).toBe(4)
    expect(CONFIGURATION.localPolishEvaluations).toBe(24)
  })

  it('predeclares campaign matrix with 16 cells (holdouts and controls)', () => {
    expect(CAMPAIGN_MATRIX).toHaveLength(16)
    expect(CAMPAIGN_MATRIX.filter(c => c.tag === 'diagnostic-control')).toHaveLength(6)
    expect(CAMPAIGN_MATRIX.filter(c => c.tag === 'true-holdout')).toHaveLength(10)
  })

  it('predeclares admission arms', () => {
    expect(ARMS.map(a => a.id)).toEqual(['A', 'B', 'E'])
    expect(ARMS.map(a => a.name)).toEqual([
      'lexical',
      'pure-pre-polish-rmse-max-abs',
      'filter-count-adaptive',
    ])
  })

  it('adaptive threshold uses lexical for <=2 and Arm B for >=3', () => {
    const code = readFileSync(resolve(__dirname, '../../../../benchmarks/research/stormAdmissionValidationCampaign.ts'), 'utf8')
    expect(code).toMatch(/<= 2/)
    expect(code).toContain("activeArm = 'A'")
    expect(code).toContain("activeArm = 'B'")
  })

  it('candidate rankings are data-derived without hardcoded oracle identities', () => {
    const code = readFileSync(resolve(__dirname, '../../../../benchmarks/research/stormAdmissionValidationCampaign.ts'), 'utf8')
    expect(code).not.toContain("'intermediate 16'")
    expect(code).not.toContain("'proposal-4-remove'")
  })

  it('uses a configurable frozen-input root instead of a hardcoded legacy /tmp path', () => {
    const code = readFileSync(resolve(__dirname, '../../../../benchmarks/research/stormAdmissionValidationCampaign.ts'), 'utf8')
    expect(code).toContain('resolveCapacityRecoveryPath')
    expect(code).not.toContain('/tmp/autoeq-capacity-recovery-20260908/')
  })

  it('time budgets and descendants are explicitly instrumented', () => {
    const code = readFileSync(resolve(__dirname, '../../../../benchmarks/research/stormAdmissionValidationCampaign.ts'), 'utf8')
    expect(code).toContain('5000')
    expect(code).toContain('15000')
    expect(code).toContain('30000')
    expect(code).toContain('60000')
    expect(code).toContain('isExpired')
  })

  it('committed work accounting charges admission overhead', () => {
    const reportPath = resolve(__dirname, '../../../../.research-artifacts/storm-admission-validation-20260911/campaign-report.json')
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    const armB = report.perCellResults.find((c: any) => c.armId === 'B')
    expect(armB).toBeDefined()
    expect(armB.workBreakdown.overhead.canonicalEvaluations).toBeGreaterThan(0)
  })

  it('lexical arm remains the no-override baseline', async () => {
    const { createArmOverride } = await import('../../../../benchmarks/research/stormAdmissionValidationCampaign.js')
    expect(createArmOverride('A', {} as any, 10, {})).toBeUndefined()
  })

  it('committed report is complete and readable', () => {
    const reportPath = resolve(__dirname, '../../../../.research-artifacts/storm-admission-validation-20260911/campaign-report.json')
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    expect(report.campaignMatrix).toHaveLength(16)
    expect(report.perCellResults).toHaveLength(48)
    expect(Object.keys(report.cells)).toHaveLength(16)
  })

  it('predecessor artifacts remain byte-identical', () => {
    const p1 = resolve(__dirname, '../../../../.research-artifacts/storm-bridge-detectability-audit-20260911/sparse-0010/audit-report.json')
    const p2 = resolve(__dirname, '../../../../.research-artifacts/storm-single-blocker-bridge-causal-20260911/sparse-0010/experiment-report.json')
    const p3 = resolve(__dirname, '../../../../.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json')
    const p4 = resolve(__dirname, '../../../../.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json')

    const sha = (path: string) => createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex')
    expect(sha(p1)).toBe('ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b')
    expect(sha(p2)).toBe('646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7')
    expect(sha(p3)).toBe('733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d')
    expect(sha(p4)).toBe('fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920')
  })

  it('production solver source is untouched', () => {
    const out = execFileSync('git', ['status', '--porcelain', resolve(__dirname, '../../../../src')]).toString()
    expect(out.trim()).toBe('')
  })
})
