import assert from 'node:assert/strict'
import test from 'node:test'

import {
  C4A_SPLIT_SEED,
  buildHfCapableInventory,
  C4A_SELECTION_SEED,
  FROZEN_BOUNDARY,
  UPSTREAM_COMMIT,
  UPSTREAM_TREE,
  canonicalCurveName,
  canonicalDeviceFamily,
  canonicalizeTerminalEndpoint,
  classifyRig,
  configurationSignature,
  countIndependentCollections,
  deriveConcreteCurveIdentity,
  deriveGroupId,
  groupEligibleMeasurements,
  hashEvidenceFiles,
  parseCurveCsv,
  parseNameIndex,
  pathRigForProcessedPath,
  resolveMetadataStrict,
  selectSixGroups,
  splitDevelopmentHoldout,
  stableHash,
  validateCorpusProvenance,
  v2EvaluationGrid,
} from './c4a.mjs'

test('pins immutable upstream identity and separate C4 boundary', () => {
  assert.equal(UPSTREAM_COMMIT, '7ae0f56d53074872b028649617a22bbb4232feb7')
  assert.equal(UPSTREAM_TREE, '671f0a72499ace671e4b0a293bc1948bb8330c96')
  assert.equal(FROZEN_BOUNDARY, '2718375e64e6e4682cb6cacf46ae8300a431e1ba')
  assert.equal(C4A_SELECTION_SEED, 'autoeq-workbench:c4-consensus-corpus-v1')
  assert.equal(C4A_SPLIT_SEED, 'autoeq-workbench:c4-consensus-split-v1')
})

test('strict metadata resolution preserves exact names, rigs, and variants', () => {
  const rows = parseNameIndex(
    [
      'url\tsource_name\tname\tform\trig',
      'https://example.test/a\tModel L\tModel (red filter)\tin-ear\t711',
      'https://example.test/b\tModel R\tModel (red filter)\tin-ear\t711',
      'https://example.test/c\tModel\tModel (blue filter)\tin-ear\t711',
      'https://example.test/d\tModel\tModel (red filter)\tin-ear\tGRAS RA0045',
    ].join('\n'),
    'Example',
  )
  const red = resolveMetadataStrict('Model (red filter)', '711', rows)
  assert.equal(red.status, 'resolved')
  assert.equal(red.metadata.rig, '711')
  assert.equal(red.metadata.rows.length, 2)
  assert.equal(resolveMetadataStrict('Model (blue filter)', '711', rows).metadata.rig, '711')
  assert.equal(resolveMetadataStrict('Model', null, rows).status, 'unresolved')
  assert.equal(resolveMetadataStrict('Model (red filter)', 'GRAS RA0045', rows).metadata.rig, 'GRAS RA0045')
  assert.equal(resolveMetadataStrict('Model (red filter)', 'GRAS 43AC', rows).status, 'unresolved')
  assert.notEqual(canonicalCurveName('Model (red filter)'), canonicalCurveName('Model (blue filter)'))
})

test('path-level rig directories are resolved strictly without treating flat names as rigs', () => {
  assert.equal(pathRigForProcessedPath('data/in-ear/Model.csv'), null)
  assert.equal(pathRigForProcessedPath('data/in-ear/GRAS RA0045/Model.csv'), 'GRAS RA0045')
  assert.equal(pathRigForProcessedPath('data/in-ear/KB006x + 711/Model.csv'), 'KB006x + 711')
})

test('configuration identity never collapses known tuning variants', () => {
  const red = configurationSignature('Sennheiser IE 300 (AZLA Sedna Light eartips)')
  const final = configurationSignature('Sennheiser IE 300 (Final Audio Type E eartips)')
  const plain = configurationSignature('Sennheiser IE 300')
  assert.notEqual(red, final)
  assert.notEqual(red, plain)
  assert.notEqual(
    deriveConcreteCurveIdentity({
      collection: 'A',
      form: 'in-ear',
      rig: '711',
      processedName: 'Model (red filter)',
    }),
    deriveConcreteCurveIdentity({
      collection: 'A',
      form: 'in-ear',
      rig: '711',
      processedName: 'Model (blue filter)',
    }),
  )
  assert.notEqual(
    deriveConcreteCurveIdentity({
      collection: 'A',
      form: 'in-ear',
      rig: '711',
      processedName: 'Model',
    }),
    deriveConcreteCurveIdentity({
      collection: 'A',
      form: 'in-ear',
      rig: '711',
      processedName: 'model',
    }),
  )
  assert.equal(canonicalDeviceFamily('Model (red filter)'), canonicalDeviceFamily('Model (blue filter)'))
})

test('rig classes remain distinct and only exact 711 is C4 primary eligible', () => {
  assert.equal(classifyRig('711').rigClass, '711-class')
  assert.equal(classifyRig('KB501x + 711').rigClass, 'kb501x-711')
  assert.equal(classifyRig('GRAS RA0045').rigClass, 'gras-ra0045')
  assert.equal(classifyRig('GRAS 43AC').rigClass, 'gras-43ac')
  assert.notEqual(classifyRig('GRAS 43AC').rigClass, classifyRig('GRAS 43AC ').rigClass)
  assert.equal(classifyRig('B&K 5128').rigClass, 'b-and-k-5128')
  assert.equal(classifyRig('Type 4.3').rigClass, 'type-4.3')
  assert.notEqual(classifyRig('GRAS RA0045').rigClass, classifyRig('711').rigClass)
  assert.equal(classifyRig('GRAS RA0045').hfCapable, false)
  assert.equal(classifyRig('Type 4.3').hfCapable, true)
  assert.equal(classifyRig('GRAS 43AC').hfCapable, false)
})

test('C5 side inventory counts only explicitly labelled Type 4.3 capability', () => {
  const make = (collection, rig) => ({
    collection,
    form: 'in-ear',
    rig,
    rigClass: classifyRig(rig).rigClass,
    model: 'C5 inventory model',
    processedName: 'C5 inventory model',
    deviceFamily: canonicalDeviceFamily('C5 inventory model'),
    configurationSignature: configurationSignature('C5 inventory model'),
    concreteCurveIdentity: `${collection}|${rig}`,
  })
  const inventory = buildHfCapableInventory([
    make('RA', 'GRAS RA0045'),
    make('Type43-A', 'Type 4.3'),
    make('Type43-B', 'Type 4.3'),
  ])
  assert.equal(inventory.curveCount, 2)
  assert.equal(inventory.groupCount, 1)
  assert.deepEqual(inventory.exactRigStrings, ['Type 4.3'])
  assert.equal(inventory.repeatedSameRigGroupCount, 1)
})

test('L/R metadata rows and repeated files count as one independent collection', () => {
  const measurements = [
    {
      collection: 'A',
      concreteCurveIdentity: 'A|in-ear|711|model',
      path: 'a.csv',
      sourceRows: [
        { side: 'left', url: 'https://example.test/a-left.txt' },
        { side: 'right', url: 'https://example.test/a-right.txt' },
      ],
    },
    { collection: 'A', concreteCurveIdentity: 'A|in-ear|711|model-duplicate', path: 'a2.csv' },
    { collection: 'B', concreteCurveIdentity: 'B|in-ear|711|model', path: 'b.csv' },
    { collection: 'C', concreteCurveIdentity: 'C|in-ear|711|model', path: 'c.csv' },
  ]
  assert.equal(countIndependentCollections(measurements), 3)
  assert.deepEqual(countIndependentCollections(measurements, { details: true }), {
    count: 3,
    collections: ['A', 'B', 'C'],
    duplicateCollections: ['A'],
  })
})

test('grouping, selection, and split are deterministic and shape-blind', () => {
  const make = (collection, model, path = `${collection}-${model}.csv`) => ({
    collection,
    form: 'in-ear',
    rig: '711',
    rigClass: '711-class',
    model,
    processedName: model,
    deviceFamily: canonicalDeviceFamily(model),
    configurationSignature: configurationSignature(model),
    concreteCurveIdentity: `${collection}|in-ear|711|${canonicalCurveName(model)}`,
    path,
    sourceRows: [{ url: `https://example.test/${path}`, sourceName: `${model} L` }],
  })
  const records = [
    ...['A', 'B', 'C'].map((collection) => make(collection, 'Model 0')),
    ...['D', 'E', 'F', 'G'].map((collection, index) => make(collection, `Model ${index + 1}`)),
  ]
  const groups = groupEligibleMeasurements(records)
  const eligible = groups.filter((group) => group.eligible)
  assert.equal(eligible.length, 1)
  assert.equal(eligible[0].independentMeasurementCount, 3)
  assert.equal(eligible[0].selectionHash, stableHash(eligible[0].groupId, C4A_SELECTION_SEED))
  const six = selectSixGroups(
    [
      ...Array.from({ length: 8 }, (_, index) => {
        const model = `Selected ${index}`
        return {
          ...groupEligibleMeasurements(['A', 'B', 'C'].map((c) => make(c, model)))[0],
          groupId: deriveGroupId(canonicalDeviceFamily(model), configurationSignature(model)),
        }
      }),
    ],
  )
  assert.equal(six.length, 6)
  assert.deepEqual(
    six.map((group) => group.groupId),
    selectSixGroups([...six].reverse()).map((group) => group.groupId),
  )
  const splitA = splitDevelopmentHoldout(six)
  const splitB = splitDevelopmentHoldout([...six].reverse())
  assert.deepEqual(splitA, splitB)
  assert.equal(splitA.filter((x) => x.split === 'development').length, 3)
  assert.equal(splitA.filter((x) => x.split === 'holdout').length, 3)
})

test('C4 grouping excludes curves outside the frozen in-ear domain', () => {
  const make = (collection, form) => ({
    collection,
    form,
    rig: '711',
    rigClass: '711-class',
    model: 'Domain model',
    processedName: 'Domain model',
    deviceFamily: canonicalDeviceFamily('Domain model'),
    configurationSignature: configurationSignature('Domain model'),
    concreteCurveIdentity: `${collection}|${form}|${collection}`,
    path: `${collection}-${form}.csv`,
    sourceRows: [],
    integrityStatus: 'valid',
  })
  const group = groupEligibleMeasurements([
    make('A', 'in-ear'),
    make('B', 'in-ear'),
    make('C', 'in-ear'),
    make('D', 'over-ear'),
  ])[0]
  assert.equal(group.eligible, true)
  assert.equal(group.members.length, 3)
  assert.deepEqual(group.members.map((member) => member.form), ['in-ear', 'in-ear', 'in-ear'])
})

test('duplicate collection selection prefers objectively valid curve without adding independence', () => {
  const make = (path, integrityStatus) => ({
    collection: path[0].toUpperCase(),
    form: 'in-ear',
    rig: '711',
    rigClass: '711-class',
    model: 'Validity model',
    processedName: 'Validity model',
    deviceFamily: canonicalDeviceFamily('Validity model'),
    configurationSignature: configurationSignature('Validity model'),
    concreteCurveIdentity: path,
    path,
    sourceRows: [],
    integrityStatus,
  })
  const records = [
    { ...make('a-invalid.csv', 'invalid'), collection: 'A' },
    { ...make('z-valid.csv', 'valid'), collection: 'A' },
    { ...make('b-valid.csv', 'valid'), collection: 'B' },
    { ...make('c-valid.csv', 'valid'), collection: 'C' },
  ]
  const group = groupEligibleMeasurements(records)[0]
  assert.equal(group.eligible, true)
  assert.deepEqual(group.members.map((member) => member.path), ['b-valid.csv', 'c-valid.csv', 'z-valid.csv'])
  assert.equal(group.independentMeasurementCount, 3)
})

test('C4 primary group rig fields contain only contributing 711-class members', () => {
  const make = (collection, rig = '711') => ({
    collection,
    form: 'in-ear',
    rig,
    rigClass: classifyRig(rig).rigClass,
    model: 'Rig-isolated model',
    processedName: 'Rig-isolated model',
    deviceFamily: canonicalDeviceFamily('Rig-isolated model'),
    configurationSignature: configurationSignature('Rig-isolated model'),
    concreteCurveIdentity: `${collection}|in-ear|${rig}|rig-isolated-model`,
    path: `${collection}-${rig}.csv`,
    sourceRows: [],
    integrityStatus: 'valid',
  })
  const group = groupEligibleMeasurements([
    make('A'),
    make('B'),
    make('C'),
    make('D', 'GRAS RA0045'),
  ])[0]
  assert.equal(group.eligible, true)
  assert.deepEqual(group.members.map((member) => member.rig), ['711', '711', '711'])
  assert.deepEqual(group.rigClasses, ['711-class'])
  assert.deepEqual(group.exactRigStrings, ['711'])
  assert.deepEqual(group.allRigClasses.sort(), ['711-class', 'gras-ra0045'])
})

test('V2 endpoint closure appends only the terminal flat hold', () => {
  const penultimate = v2EvaluationGrid().at(-2)
  const input = [[20, 1], [penultimate, 2]]
  const closed = canonicalizeTerminalEndpoint(input)
  assert.deepEqual(closed.points.at(-1), [20_000, 2])
  assert.equal(closed.transformation, 'terminal-flat-hold-to-v2-max')
  assert.equal(canonicalizeTerminalEndpoint(closed.points).transformation, null)
  assert.throws(() => canonicalizeTerminalEndpoint([[20, 1], [penultimate - 1, 2]]), /penultimate/)
  assert.deepEqual(canonicalizeTerminalEndpoint([[20, 1], [20_000, 2]]).points, [[20, 1], [20_000, 2]])
})

test('CSV parser accepts finite ordered points and rejects malformed coverage', () => {
  assert.deepEqual(parseCurveCsv('frequency,raw\n20,1\n20000,2'), [[20, 1], [20_000, 2]])
  assert.throws(() => parseCurveCsv('frequency,raw\n20,1\n20,2'), /ordered|duplicate/)
  assert.throws(() => parseCurveCsv('frequency,raw\n21,1\n20000,2'), /minimum/)
  assert.throws(() => parseCurveCsv('frequency,raw\n20,NaN\n20000,2'), /finite/)
})

test('provenance validation detects hashes, upstream drift, and forbidden solver evidence', () => {
  const files = {
    'manifest.json': '{"a":1}\n',
    'groups.json': '[]\n',
    'provenance.json': '{"members":[]}\n',
    'rig-inventory.json': '{}\n',
    'selection-protocol.md': '# protocol\n',
  }
  const manifest = {
    schemaVersion: 1,
    corpusVersion: 'c4-peak-aligned-consensus-corpus-v1',
    upstream: { repository: 'jaakkopasanen/AutoEq', commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    frozenBoundary: FROZEN_BOUNDARY,
    solverExecuted: false,
    consensusAlgorithmExecuted: false,
    artifactFileHashes: Object.fromEntries(Object.entries(files).map(([name, body]) => [name, hashEvidenceFiles(files, [name])])),
  }
  const valid = {
    manifest,
    groups: [],
    provenance: { upstream: manifest.upstream, frozenBoundary: FROZEN_BOUNDARY, members: [] },
    artifactFiles: files,
  }
  assert.doesNotThrow(() => validateCorpusProvenance(valid))
  assert.throws(() => validateCorpusProvenance({
    ...valid,
    artifactFiles: { ...files, 'groups.json': 'tampered\n' },
  }), /groups/)
  assert.throws(() => validateCorpusProvenance({
    ...valid,
    manifest: {
      ...manifest,
      classification: 'C4_CORPUS_READY',
      selection: { selectedGroupIds: [] },
    },
  }), /six|selected-group/i)
  assert.throws(() => validateCorpusProvenance({ ...valid, provenance: { upstream: { ...manifest.upstream, commit: 'other' }, frozenBoundary: FROZEN_BOUNDARY, members: [] } }), /upstream/)
  assert.throws(() => validateCorpusProvenance({ ...valid, manifest: { ...manifest, solverExecuted: true } }), /solver|forbidden/i)
})

test('Batch C is not part of C4a protocol or artifact selection', () => {
  assert.doesNotMatch(C4A_SELECTION_SEED, /Batch C/i)
  assert.doesNotMatch(C4A_SPLIT_SEED, /Batch C/i)
})
