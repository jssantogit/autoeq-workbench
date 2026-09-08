import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
	assertOracleReferenceSnapshotV1,
	canonicalSnapshotPayload,
	getReferenceCell,
	type OracleReferenceSnapshotV1,
} from '../../../../benchmarks/research/referenceSnapshot.js'

const fixturePath = new URL(
  '../../../../../../research/solver-lab/tests/fixtures/oracle-reference-snapshot-v1.json',
  import.meta.url,
)

function fixture(): OracleReferenceSnapshotV1 {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as OracleReferenceSnapshotV1
}

describe('OracleReferenceSnapshotV1', () => {
  it('accepts the Python fixture and performs exact cell lookup', () => {
    const snapshot = fixture()
    assertOracleReferenceSnapshotV1(snapshot)

    expect(getReferenceCell(
      snapshot,
      'synthetic-reference',
      'a'.repeat(64),
      10,
    )).toBe(snapshot.cells[0])
  })

	it('rejects wrong version or content hash', () => {
		const wrongVersion = { ...fixture(), version: 2 }
		expect(() => assertOracleReferenceSnapshotV1(wrongVersion)).toThrow(/version/)

    const wrongHash = { ...fixture(), contentSha256: '0'.repeat(64) }
		expect(() => assertOracleReferenceSnapshotV1(wrongHash)).toThrow(/contentSha256/)
	})

	it('allows candidate ID reuse across distinct capacity cells', () => {
		const snapshot = fixture()
		const secondCell = JSON.parse(JSON.stringify(snapshot.cells[0])) as typeof snapshot.cells[number]
		secondCell.maxFilters = 20
		secondCell.candidates = secondCell.candidates.map((candidate) => ({
			...candidate,
			maxFilters: 20,
		}))
		const withoutHash = {
			...snapshot,
			cells: [snapshot.cells[0]!, secondCell],
		}
		const { contentSha256: _contentSha256, ...payload } = withoutHash
		const multiCapacitySnapshot = {
			...withoutHash,
			contentSha256: createHash('sha256')
				.update(canonicalSnapshotPayload(payload))
				.digest('hex'),
		}

		assertOracleReferenceSnapshotV1(multiCapacitySnapshot)
		expect(multiCapacitySnapshot.cells.map((cell) => cell.maxFilters)).toEqual([10, 20])
	})

	it('keeps integer seed canonicalization interoperable with Python snapshots', () => {
		expect(canonicalSnapshotPayload({ seed: 41 })).toBe('{"seed":41}')
	})

	it('rejects duplicate cells and invalid candidate/frontier references', () => {
    const snapshot = fixture()
    const duplicateCells = { ...snapshot, cells: [...snapshot.cells, snapshot.cells[0]] }
    expect(() => assertOracleReferenceSnapshotV1(duplicateCells)).toThrow(/duplicate/)

    const invalidFrontier = {
      ...snapshot,
      cells: [{
        ...snapshot.cells[0]!,
        deliverableFrontierCandidateIds: ['missing'],
      }],
    }
    expect(() => assertOracleReferenceSnapshotV1(invalidFrontier)).toThrow(/absent/)

    const invalidCandidate = {
      ...snapshot,
      cells: [{
        ...snapshot.cells[0]!,
        controlCandidateId: 'missing',
      }],
    }
    expect(() => assertOracleReferenceSnapshotV1(invalidCandidate)).toThrow(/controlCandidateId/)
  })

  it('rejects lookup with a mismatched problem, input hash, or cap', () => {
    const snapshot = fixture()
    expect(() => getReferenceCell(snapshot, 'other', 'a'.repeat(64), 10)).toThrow(/cell/)
    expect(() => getReferenceCell(snapshot, 'synthetic-reference', 'b'.repeat(64), 10)).toThrow(/cell/)
    expect(() => getReferenceCell(snapshot, 'synthetic-reference', 'a'.repeat(64), 20)).toThrow(/cell/)
  })
})
