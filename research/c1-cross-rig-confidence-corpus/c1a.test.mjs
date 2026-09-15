import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import {
  C1A_SELECTION_SEED,
  C1A_SPLIT_SEED,
  FROZEN_BOUNDARY,
  UPSTREAM_COMMIT,
  UPSTREAM_TREE,
  canonicalCurveName,
  canonicalDeviceFamily,
  canonicalizeTerminalEndpoint,
  classifyRig,
  configurationSignature,
  countIndependentCollectionsByRigClass,
  deriveConcreteCurveIdentity,
  deriveGroupId,
  groupC1Measurements,
  hashEvidenceFiles,
  parseCurveCsv,
  parseNameIndex,
  pathRigForProcessedPath,
  resolveMetadataStrict,
  selectC1Groups,
  splitDevelopmentHoldout,
  stableHash,
  validateC1Provenance,
  v2EvaluationGrid,
} from './c1a.mjs'

test('pins the immutable upstream and C1 boundary', () => {
  assert.equal(UPSTREAM_COMMIT, '7ae0f56d53074872b028649617a22bbb4232feb7')
  assert.equal(UPSTREAM_TREE, '671f0a72499ace671e4b0a293bc1948bb8330c96')
  assert.equal(FROZEN_BOUNDARY, 'be4280512d36ad406fbebb63e49d5df51ce57a46')
  assert.equal(C1A_SELECTION_SEED, 'autoeq-workbench:c1-cross-rig-corpus-v1')
  assert.equal(C1A_SPLIT_SEED, 'autoeq-workbench:c1-cross-rig-split-v1')
})

test('strict metadata resolution preserves configuration variants and exact rigs', () => {
  const rows = parseNameIndex([
    'url\tsource_name\tname\tform\ttrig',
    'https://example.test/red-l\tModel L\tModel (red filter)\tin-ear\t711',
    'https://example.test/red-r\tModel R\tModel (red filter)\tin-ear\t711',
    'https://example.test/blue\tModel\tModel (blue filter)\tin-ear\t711',
    'https://example.test/red-gras\tModel\tModel (red filter)\tin-ear\tGRAS 43AC ',
  ].join('\n'), 'Example')
  const red711 = resolveMetadataStrict('Model (red filter)', '711', rows)
  assert.equal(red711.status, 'resolved')
  assert.equal(red711.metadata.rig, '711')
  assert.equal(red711.metadata.rows.length, 2)
  assert.equal(resolveMetadataStrict('Model (red filter)', 'GRAS 43AC', rows).status, 'unresolved')
  assert.equal(resolveMetadataStrict('Model (red filter)', 'GRAS 43AC ', rows).status, 'resolved')
  assert.equal(resolveMetadataStrict('Model', null, rows).status, 'unresolved')
  assert.notEqual(configurationSignature('Model (red filter)'), configurationSignature('Model (blue filter)'))
  assert.equal(canonicalDeviceFamily('Model (red filter)'), canonicalDeviceFamily('Model (blue filter)'))
  assert.notEqual(canonicalCurveName('Model (red filter)'), canonicalCurveName('Model (blue filter)'))
})

test('path rig extraction is exact and does not invent a flat-path rig', () => {
  assert.equal(pathRigForProcessedPath('data/in-ear/Model.csv'), null)
  assert.equal(pathRigForProcessedPath('data/in-ear/711/Model.csv'), '711')
  assert.equal(pathRigForProcessedPath('data/in-ear/GRAS 43AC /Model.csv'), 'GRAS 43AC ')
})

test('configuration grouping keeps explicit filters, tips, ANC, and switches distinct', () => {
  const base = (collection, processedName, rig = '711') => ({
    collection,
    form: 'in-ear',
    model: processedName,
    processedName,
    rig,
    rigClass: classifyRig(rig).rigClass,
    deviceFamily: canonicalDeviceFamily(processedName),
    configurationSignature: configurationSignature(processedName),
    concreteCurveIdentity: deriveConcreteCurveIdentity({ collection, form: 'in-ear', rig, processedName }),
    integrityStatus: 'valid',
    path: `${collection}/${processedName}.csv`,
  })
  const records = [
    ...['A', 'B', 'C'].map((c) => base(c, 'IEM (red filter)')),
    base('D', 'IEM (blue filter)'), base('E', 'IEM (blue filter)'), base('F', 'IEM (blue filter)'),
  ]
  const groups = groupC1Measurements(records)
  assert.equal(groups.length, 2)
  assert.notEqual(groups[0].groupId, groups[1].groupId)
})

test('only the literal 711 is in the primary repeatability class', () => {
  assert.equal(classifyRig('711').primary711Eligible, true)
  assert.equal(classifyRig('711 ').primary711Eligible, false)
  assert.equal(classifyRig('KB006x + 711').primary711Eligible, false)
  assert.notEqual(classifyRig('GRAS 43AC').rigClass, classifyRig('GRAS 43AC ').rigClass)
  assert.notEqual(classifyRig('GRAS 43AC').rigClass, classifyRig('GRAS-43AC').rigClass)
  assert.notEqual(classifyRig('GRAS RA0045').rigClass, classifyRig('711').rigClass)
})

test('L/R rows do not add measurements and collection is counted once per rig class', () => {
  const make = (collection, rig, suffix) => ({
    collection,
    form: 'in-ear',
    model: 'Same IEM',
    processedName: 'Same IEM',
    rig,
    rigClass: classifyRig(rig).rigClass,
    deviceFamily: 'same iem',
    configurationSignature: 'same iem',
    concreteCurveIdentity: `${collection}|${rig}|${suffix}`,
    sourceRows: [
      { side: 'left', url: `${collection}-L.txt` },
      { side: 'right', url: `${collection}-R.txt` },
    ],
    integrityStatus: 'valid',
  })
  const records = [
    make('A', '711', 'one'), make('A', '711', 'duplicate'),
    make('B', '711', 'one'), make('C', '711', 'one'),
    make('A', 'GRAS RA0045', 'one'), make('A', 'GRAS RA0045', 'duplicate'),
  ]
  assert.deepEqual(countIndependentCollectionsByRigClass(records), {
    '711-class': { count: 3, collections: ['A', 'B', 'C'], duplicateCollections: ['A'] },
    'gras-ra0045': { count: 1, collections: ['A'], duplicateCollections: ['A'] },
  })
  const group = groupC1Measurements(records)[0]
  assert.equal(group.eligible, true)
  assert.equal(group.exact711IndependentCount, 3)
  assert.equal(group.non711IndependentCount, 1)
  assert.equal(group.exact711Members.length, 3)
  assert.equal(group.eligibleNon711Members.length, 1)
})

test('Tier A requires two independent observations on one non-711 class', () => {
  const make = (collection, rig) => ({
    collection, form: 'in-ear', model: 'Tier IEM', processedName: 'Tier IEM', rig,
    rigClass: classifyRig(rig).rigClass, deviceFamily: 'tier iem', configurationSignature: 'tier iem',
    concreteCurveIdentity: `${collection}|${rig}`, integrityStatus: 'valid', path: `${collection}-${rig}.csv`,
  })
  const tierA = groupC1Measurements([
    ...['A', 'B', 'C'].map((c) => make(c, '711')),
    make('D', 'GRAS RA0045'), make('E', 'GRAS RA0045'),
  ])[0]
  assert.equal(tierA.strengthTier, 'A')
  assert.equal(tierA.distinctNon711RigClassCount, 1)
  const tierB = groupC1Measurements([
    ...['A', 'B', 'C'].map((c) => make(c, '711')),
    make('D', 'GRAS RA0045'), make('E', 'KB501x + 711'),
  ])[0]
  assert.equal(tierB.strengthTier, 'B')
  assert.equal(tierB.distinctNon711RigClassCount, 2)
})

test('selection follows Tier A, 711 count, non-711 class count, total, hash, id', () => {
  const makeGroup = (groupId, tier, exact711, non711Classes, total) => ({
    groupId, eligible: true, strengthTier: tier, exact711IndependentCount: exact711,
    distinctNon711RigClassCount: non711Classes, totalIndependentCollectionCount: total,
    selectionHash: stableHash(groupId, C1A_SELECTION_SEED),
  })
  const groups = [
    makeGroup('low', 'B', 2, 5, 99),
    makeGroup('tier-a', 'A', 3, 1, 4),
    makeGroup('more-711', 'B', 4, 1, 5),
    makeGroup('more-classes', 'B', 4, 2, 5),
  ]
  const ordered = selectC1Groups(groups)
  assert.deepEqual(ordered.map((g) => g.groupId), ['tier-a', 'more-classes', 'more-711', 'low'])
  assert.equal(ordered[0].selectionHash, stableHash('tier-a', C1A_SELECTION_SEED))
})

test('selection and six/six split are deterministic and shape-blind', () => {
  const groups = Array.from({ length: 14 }, (_, index) => ({
    groupId: deriveGroupId(`model-${index}`, 'same configuration'),
    eligible: true,
    strengthTier: index % 2 === 0 ? 'A' : 'B',
    exact711IndependentCount: 3,
    distinctNon711RigClassCount: 1,
    totalIndependentCollectionCount: 4,
    selectionHash: stableHash(deriveGroupId(`model-${index}`, 'same configuration'), C1A_SELECTION_SEED),
  }))
  const selectedA = selectC1Groups(groups)
  const selectedB = selectC1Groups([...groups].reverse())
  assert.deepEqual(selectedA, selectedB)
  assert.equal(selectedA.length, 12)
  const splitA = splitDevelopmentHoldout(selectedA)
  const splitB = splitDevelopmentHoldout([...selectedA].reverse())
  assert.deepEqual(splitA, splitB)
  assert.equal(splitA.filter((g) => g.split === 'development').length, 6)
  assert.equal(splitA.filter((g) => g.split === 'holdout').length, 6)
})

test('endpoint closure and objective parser preserve the audited V2 preparation', () => {
  const penultimate = v2EvaluationGrid().at(-2)
  const closed = canonicalizeTerminalEndpoint([[20, 1], [penultimate, 2]])
  assert.deepEqual(closed.points.at(-1), [20_000, 2])
  assert.equal(closed.transformation, 'terminal-flat-hold-to-v2-max')
  assert.equal(canonicalizeTerminalEndpoint(closed.points).transformation, null)
  assert.throws(() => canonicalizeTerminalEndpoint([[20, 1], [penultimate - 1, 2]]), /penultimate/)
  assert.deepEqual(parseCurveCsv('frequency,raw\n20,1\n20000,2'), [[20, 1], [20_000, 2]])
  assert.throws(() => parseCurveCsv('frequency,raw\n20,1\n20,2'), /ordered|duplicate/)
  assert.throws(() => parseCurveCsv('frequency,raw\n21,1\n20000,2'), /minimum/)
})

test('provenance validation rejects outcome flags and artifact drift', () => {
  const files = {
    'groups.json': '{}\n', 'provenance.json': '{}\n', 'rig-inventory.json': '{}\n',
    'selection-protocol.md': '# protocol\n',
  }
  const manifest = {
    schemaVersion: 1, corpusVersion: 'c1-cross-rig-confidence-corpus-v1',
    upstream: { repository: 'jaakkopasanen/AutoEq', commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    frozenBoundary: FROZEN_BOUNDARY, classification: 'C1_CORPUS_INSUFFICIENT',
    c4PeakAlignmentStatus: 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED',
    c4: { finalEvidenceSha256: '4ded0c7944e22c38843d21a06402fdfbd5656e87b33595a08595a1bf91ad03a4', finalInterpretation: 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED' },
    peakAlignedDispersionUsed: false,
    solverExecuted: false, autoEqSolverExecuted: false, confidenceCurveComputed: false,
    artifactFileHashes: Object.fromEntries(Object.entries(files).map(([name]) => [name, hashEvidenceFiles(files, [name])])),
  }
  const valid = { manifest, groups: [], provenance: { ...manifest.upstream, upstream: manifest.upstream, frozenBoundary: FROZEN_BOUNDARY, members: [] }, artifactFiles: files }
  assert.doesNotThrow(() => validateC1Provenance(valid))
  assert.throws(() => validateC1Provenance({ ...valid, artifactFiles: { ...files, 'groups.json': 'tampered\n' } }), /groups/)
  assert.throws(() => validateC1Provenance({ ...valid, manifest: { ...manifest, solverExecuted: true } }), /solver|outcome|forbidden/i)
})

test('C4 alignment and external fresh corpus are not imported by C1a', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./c1a.mjs', import.meta.url), 'utf8').catch(() => '')
  assert.doesNotMatch(source, /from ['"].*(?:c4|fresh-real)|import\(['"].*(?:c4|fresh-real)/i)
  assert.doesNotMatch(source, /alignPeaks|computeConfidence|AutoEqSolver|lossComparison/)
})

test('required artifact names are metadata-only and the raw cache is untracked', () => {
  const root = new URL('../../', import.meta.url)
  const artifactDir = new URL('../../.research-artifacts/c1-cross-rig-confidence-corpus/', import.meta.url)
  const names = ['manifest.json', 'groups.json', 'provenance.json', 'rig-inventory.json', 'selection-protocol.md', 'evidence-sha256.txt']
  if (existsSync(artifactDir)) {
    for (const name of names) assert.equal(existsSync(new URL(name, artifactDir)), true, name)
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', artifactDir), 'utf8'))
    assert.equal(manifest.flags?.rawMeasurementsCommitted, false)
    assert.equal(manifest.peakAlignedDispersionUsed, false)
  }
  const tracked = execFileSync('git', ['ls-files', '.research-cache/c1-cross-rig-confidence-corpus/'], { cwd: root, encoding: 'utf8' })
  assert.equal(tracked, '')
})
