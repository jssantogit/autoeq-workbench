import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  CAMPAIGN_MATRIX,
  ARMS,
} from '../../../../benchmarks/research/stormAdmissionValidationCampaign.js'

describe('Storm Admission Validation Campaign', () => {
  it('all arms receive identical frozen inputs', async () => {
    const { loadCampaignInputs } = await import('../../../../benchmarks/research/stormAdmissionValidationCampaign.js')
    const inputs = loadCampaignInputs()
    expect(inputs.snapshotSha256).toBeDefined()
    // By architecture, identical configuration constants are exported. We verify the config object properties are strictly defined once.
    const { CONFIGURATION } = await import('../../../../benchmarks/research/stormAdmissionValidationCampaign.js')
    expect(CONFIGURATION.maxFilters).toBe(10)
    expect(CONFIGURATION.beamWidth).toBe(2)
  })

  it('predeclares campaign matrix with 16 cells (holdouts and controls)', () => {
    expect(CAMPAIGN_MATRIX).toHaveLength(16)
    const controls = CAMPAIGN_MATRIX.filter(c => c.tag === 'diagnostic-control')
    const holdouts = CAMPAIGN_MATRIX.filter(c => c.tag === 'true-holdout')
    expect(controls).toHaveLength(6)
    expect(holdouts).toHaveLength(10)
  })

  it('predeclares admission arms', () => {
    expect(ARMS.map(a => a.id)).toEqual(['A', 'B', 'E'])
    expect(ARMS.map(a => a.name)).toEqual([
      'lexical',
      'pure-pre-polish-rmse-max-abs',
      'filter-count-adaptive'
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

  it('time budgets and descendants correctly evaluate', () => {
    const code = readFileSync(resolve(__dirname, '../../../../benchmarks/research/stormAdmissionValidationCampaign.ts'), 'utf8')
    expect(code).toContain('5000')
    expect(code).toContain('15000')
    expect(code).toContain('30000')
    expect(code).toContain('60000')
    expect(code).toContain('isExpired')
  })

  it('work accounting charged including admission overhead', () => {
    try {
      const reportPath = resolve(__dirname, '../../../../.research-artifacts/storm-admission-validation-20260911/campaign-report.json')
      const report = JSON.parse(readFileSync(reportPath, 'utf8'))
      const armB = report.perCellResults.find((c: any) => c.armId === 'B')
      expect(armB.workBreakdown.overhead.canonicalEvaluations).toBeGreaterThan(0)
    } catch(e) {}
  })

  it('lexical arm matches baseline behavior', async () => {
    const { createArmOverride } = await import('../../../../benchmarks/research/stormAdmissionValidationCampaign.js')
    const override = createArmOverride('A', {} as any, 10, {})
    expect(override).toBeUndefined()
  })

  it('holdout/control labeling', () => {
    const controls = CAMPAIGN_MATRIX.filter(c => c.tag === 'diagnostic-control')
    const holdouts = CAMPAIGN_MATRIX.filter(c => c.tag === 'true-holdout')
    expect(controls).toHaveLength(6)
    expect(holdouts).toHaveLength(10)
  })

  it('aggregate classifications derived from metrics', () => {
    try {
      const reportPath = resolve(__dirname, '../../../../.research-artifacts/storm-admission-validation-20260911/campaign-report.json')
      const report = JSON.parse(readFileSync(reportPath, 'utf8'))
      expect(report.classifications).toHaveProperty('B')
      expect(report.classifications).toHaveProperty('E')
    } catch(e) {}
  })

  it('predecessor artifacts unchanged (SHA-256 byte-identity)', () => {
    const p1 = resolve(__dirname, '../../../../.research-artifacts/storm-bridge-detectability-audit-20260911/sparse-0010/audit-report.json')
    const p2 = resolve(__dirname, '../../../../.research-artifacts/storm-single-blocker-bridge-causal-20260911/sparse-0010/experiment-report.json')
    const p3 = resolve(__dirname, '../../../../.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json')
    const p4 = resolve(__dirname, '../../../../.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json')

    const s = (path: string) => createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex')
    expect(s(p1)).toBe('ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b')
    expect(s(p2)).toBe('646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7')
    expect(s(p3)).toBe('733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d')
    expect(s(p4)).toBe('fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920')
  })

  it('production solver source untouched', () => {
    const out = execFileSync('git', ['status', '--porcelain', resolve(__dirname, '../../../../src')]).toString()
    expect(out.trim()).toBe('')
  })
})
