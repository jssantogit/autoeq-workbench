import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMIT, TREE, canonicalName, canonicalizeTerminalEndpoint, parseCsv, rawUrl, selectPairs, assignBatches, v2EvaluationGrid } from './freshRealCorpusV1.mjs'

test('constructs immutable upstream URLs', () => {
  assert.match(rawUrl('measurements/Super Review/name_index.tsv'), new RegExp(`/${COMMIT}/`))
  assert.equal(TREE, '671f0a72499ace671e4b0a293bc1948bb8330c96')
})
test('rejects malformed and missing-lower-coverage curves', () => {
  assert.throws(() => parseCsv('frequency,raw\n20,0\n20000,nope'), /non-finite/)
  assert.throws(() => parseCsv('frequency,raw\n21,0\n20000,0'), /minimum/)
})
test('applies only the frozen terminal flat hold', () => {
  const penultimate=v2EvaluationGrid().at(-2); const input=[[20,1],[penultimate,2]]
  const closed=canonicalizeTerminalEndpoint(input); assert.equal(closed.points.length,3); assert.deepEqual(closed.points.at(-1),[20000,2])
  assert.equal(canonicalizeTerminalEndpoint(closed.points).transformation,null)
  assert.throws(() => canonicalizeTerminalEndpoint([[20,1],[penultimate-1,2]]), /below V2 penultimate/)
  assert.equal(canonicalizeTerminalEndpoint([[20,1],[20000,2]]).points.length,2)
})
test('canonical prior-name aliases normalize deterministically', () => {
  assert.equal(canonicalName('Letshuoer S12-Ultra (2024)'), 'letshuoer s12 ultra')
})
test('selection prevents duplicate devices and batch assignment is stable', () => {
  const items=['a','b','c','d'].map(model=>({collection:'X',rig:'711',model,path:model,identity:`X|711|${model}`}))
  const pairs=selectPairs(items,'X','X',2,new Set()); assert.equal(new Set(pairs.flatMap(p=>[p.source.model,p.target.model])).size,4)
  const cases=Array.from({length:18},(_,i)=>({id:`c${i}`})); const a=assignBatches(cases), b=assignBatches(cases)
  assert.deepEqual(a,b); assert.deepEqual(a.map(x=>x.batch).sort(),['A','A','A','A','A','A','B','B','B','B','B','B','C','C','C','C','C','C'])
})
