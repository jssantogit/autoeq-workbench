import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMIT, TREE, canonicalName, parseCsv, rawUrl, selectPairs, assignBatches } from './freshRealCorpusV1.mjs'

test('constructs immutable upstream URLs', () => {
  assert.match(rawUrl('measurements/Super Review/name_index.tsv'), new RegExp(`/${COMMIT}/`))
  assert.equal(TREE, '671f0a72499ace671e4b0a293bc1948bb8330c96')
})
test('rejects malformed and incomplete curves', () => {
  assert.throws(() => parseCsv('frequency,raw\n20,0\n20000,nope'), /non-finite/)
  assert.throws(() => parseCsv('frequency,raw\n20,0\n19955,0'), /coverage/)
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
