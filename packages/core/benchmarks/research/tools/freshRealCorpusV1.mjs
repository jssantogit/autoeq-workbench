import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const REPOSITORY = 'jaakkopasanen/AutoEq'
export const COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96'
export const SEED = 'autoeq-workbench:fresh-real-corpus-v1'
export const CACHE = '.research-cache/fresh-real-corpus-v1'
export const prior = new Set(['dunu titan s2','softears rsv','letshuoer mystic 8','letshuoer s12 ultra','subtonic storm','64 audio u12t','64 audio trio'])
export const canonicalName = value => value.normalize('NFKD').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
export const sha256 = value => createHash('sha256').update(value).digest('hex')
export const rawUrl = path => `https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${path.split('/').map(encodeURIComponent).join('/')}`
export const stable = value => sha256(`${SEED}:${value}`)
export function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/); if (rows.length < 3) throw new Error('malformed: too few rows')
  const points = rows.slice(1).map(row => row.split(',').slice(0, 2).map(Number))
  if (points.some(([f, db]) => !Number.isFinite(f) || !Number.isFinite(db))) throw new Error('malformed: non-finite point')
  points.sort((a,b) => a[0]-b[0]); if (points.some(([f], i) => i && f <= points[i-1][0])) throw new Error('malformed: duplicate frequency')
  if (points[0][0] > 20 || points.at(-1)[0] < 20000) throw new Error('coverage: requires 20–20000 Hz')
  return points
}
export async function fetchPinned(path, cacheRoot = CACHE) {
  const key = sha256(path); const local = resolve(cacheRoot, key)
  try { const bytes = await readFile(local); if (bytes.length && sha256(bytes)) return { bytes, sha256: sha256(bytes), byteLength: bytes.length, cachePath: local } } catch {}
  const response = await fetch(rawUrl(path), { redirect: 'error' })
  if (!response.ok) throw new Error(`download ${response.status}: ${rawUrl(path)}`)
  const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length) throw new Error(`empty: ${path}`)
  await mkdir(cacheRoot, { recursive: true }); await writeFile(local, bytes)
  return { bytes, sha256: sha256(bytes), byteLength: bytes.length, cachePath: local }
}
export async function verifyUpstream() {
  const r = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/commits/${COMMIT}`, { redirect: 'error', headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) throw new Error(`commit identity ${r.status}`)
  const c = await r.json(); if (c.sha !== COMMIT || c.tree?.sha !== TREE) throw new Error('pinned commit/tree mismatch'); return c
}
export function selectPairs(items, sourceCollection, targetCollection, count, used) {
  const left = items.filter(x => x.collection === sourceCollection && !used.has(x.identity)); const right = items.filter(x => x.collection === targetCollection && !used.has(x.identity))
  const pairs = left.flatMap(a => right.filter(b => canonicalName(a.model) !== canonicalName(b.model)).map(b => ({ source:a, target:b, rank:stable(`${a.identity}|${b.identity}`) }))).sort((a,b)=>a.rank.localeCompare(b.rank))
  const chosen=[]; for (const p of pairs) { if (chosen.length === count) break; if (used.has(p.source.identity)||used.has(p.target.identity)||[...used].some(id=>id.endsWith(`|${canonicalName(p.source.model)}`)||id.endsWith(`|${canonicalName(p.target.model)}`))) continue; chosen.push(p); used.add(p.source.identity); used.add(p.target.identity) }
  if (chosen.length !== count) throw new Error(`selection shortage ${sourceCollection}→${targetCollection}: ${chosen.length}/${count}`); return chosen
}
export function assignBatches(cases) { return [...cases].sort((a,b)=>stable(a.id).localeCompare(stable(b.id))).map((c,i)=>({...c,batch:['A','B','C'][Math.floor(i/6)],split:i%6<3?'development':'holdout'})) }
