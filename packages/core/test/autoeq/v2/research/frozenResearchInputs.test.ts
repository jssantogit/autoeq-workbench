import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CAPACITY_RECOVERY_ROOT,
  LEGACY_PINNED_SHA256,
  REQUIRED_STORM_FROZEN_INPUTS,
  resolveCapacityRecoveryPath,
  resolveCapacityRecoveryRoot,
  verifyStormFrozenInputs,
} from '../../../../benchmarks/research/frozenResearchInputs.js'

describe('Storm frozen research inputs', () => {
  it('uses the accepted legacy root by default', () => {
    expect(resolveCapacityRecoveryRoot({})).toBe(resolve(DEFAULT_CAPACITY_RECOVERY_ROOT))
  })

  it('allows CI to override the capacity recovery root', () => {
    const root = resolve('/tmp/ci-frozen-inputs/capacity-recovery')
    expect(resolveCapacityRecoveryRoot({ AUTOEQ_CAPACITY_RECOVERY_ROOT: root })).toBe(root)
    expect(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json', {
      AUTOEQ_CAPACITY_RECOVERY_ROOT: root,
    })).toBe(resolve(root, 'OracleReferenceSnapshotV1.json'))
  })

  it('rejects path traversal', () => {
    expect(() => resolveCapacityRecoveryPath('../secret.json', {})).toThrow(/invalid frozen-input/)
  })

  it('declares the complete legacy input set', () => {
    expect(REQUIRED_STORM_FROZEN_INPUTS).toEqual([
      'OracleReferenceSnapshotV1.json',
      'mp-seeds/titan-to-storm-teacher-student.json',
      'mp-seeds/titan-to-u12t-teacher-student.json',
      'mp-seeds/titan-to-trio-teacher-student.json',
      'same-runtime-tournament/tournament-report.json',
    ])
  })

  it('pins the two independently recorded legacy artifact hashes', () => {
    expect(LEGACY_PINNED_SHA256['OracleReferenceSnapshotV1.json']).toBe(
      'a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd',
    )
    expect(LEGACY_PINNED_SHA256['same-runtime-tournament/tournament-report.json']).toBe(
      'cb0b1fe6c0fe78cc2b809831f2e6b0a98f1a4cb5af4fa84cc4390bd113ccb3d9',
    )
  })

  it('fails closed when a downloaded bundle has no manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'autoeq-storm-frozen-inputs-'))
    try {
      expect(() => verifyStormFrozenInputs(root)).toThrow(/manifest is missing/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
