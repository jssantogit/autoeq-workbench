import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const UPSTREAM_REPOSITORY = 'jaakkopasanen/AutoEq'
export const UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96'
export const UPSTREAM_API_ROOT = `https://api.github.com/repos/${UPSTREAM_REPOSITORY}`
export const UPSTREAM_RAW_ROOT = `https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${UPSTREAM_COMMIT}`

export const FROZEN_BOUNDARY = 'be4280512d36ad406fbebb63e49d5df51ce57a46'
export const C4C_FINAL_EVIDENCE_SHA256 = '4ded0c7944e22c38843d21a06402fdfbd5656e87b33595a08595a1bf91ad03a4'
export const C4_FINAL_INTERPRETATION = 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED'

export const C1A_CORPUS_VERSION = 'c1-cross-rig-confidence-corpus-v1'
export const C1A_SELECTION_SEED = 'autoeq-workbench:c1-cross-rig-corpus-v1'
export const C1A_SPLIT_SEED = 'autoeq-workbench:c1-cross-rig-split-v1'
export const C1A_FORM = 'in-ear'
export const C1A_PRIMARY_RIG = '711'
export const C1A_REQUIRED_GROUPS = 12
export const C1A_MIN_INDEPENDENT_MEASUREMENTS = 3
export const C1A_NORMALIZATION = Object.freeze({ mode: 'hz', frequencyHz: 500, levelDb: 60 })
export const C1A_V2_MIN_HZ = 20
export const C1A_V2_MAX_HZ = 20_000
export const C1A_V2_POINTS_PER_OCTAVE = 96
export const C1A_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1-cross-rig-confidence-corpus'
export const C1A_CACHE_RELATIVE_DIR = '.research-cache/c1-cross-rig-confidence-corpus'
export const C1A_PROTOCOL_SCHEMA_VERSION = 1

const API_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'autoeq-workbench-c1a',
})

/** Hash bytes/text with the algorithm used by C1a integrity records. */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function gitBlobSha1(value) {
  const bytes = Buffer.from(value)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export function rawUrl(path) {
  return `${UPSTREAM_RAW_ROOT}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function apiUrl(path) {
  return `${UPSTREAM_API_ROOT}${path}`
}

export function stableHash(value, seed = C1A_SELECTION_SEED) {
  return sha256(`${seed}:${value}`)
}

/** Unicode normalization used for lookup only; qualifiers are retained. */
export function canonicalCurveName(value) {
  return String(value).normalize('NFKD').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/** Device-family identity is separate from full configuration identity. */
export function canonicalDeviceFamily(value) {
  return canonicalCurveName(value)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Full processed name, including every explicit configuration qualifier. */
export function configurationSignature(value) {
  return canonicalCurveName(value)
}

export function deriveConcreteCurveIdentity({ collection, form, rig, processedName }) {
  return [collection, form, rig, String(processedName)].map((value) => JSON.stringify(String(value))).join('|')
}

export function deriveGroupId(deviceFamilyOrInput, signature) {
  const deviceFamily = typeof deviceFamilyOrInput === 'object'
    ? deviceFamilyOrInput.deviceFamily
    : deviceFamilyOrInput
  const configuration = typeof deviceFamilyOrInput === 'object'
    ? deviceFamilyOrInput.configurationSignature
    : signature
  if (!deviceFamily || !configuration) throw new Error('A group requires deviceFamily and configurationSignature')
  return `c1g-${sha256(`${deviceFamily}|${configuration}`).slice(0, 20)}`
}

export function v2EvaluationGrid() {
  const count = Math.ceil(Math.log2(C1A_V2_MAX_HZ / C1A_V2_MIN_HZ) * C1A_V2_POINTS_PER_OCTAVE)
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return C1A_V2_MIN_HZ
    if (index === count) return C1A_V2_MAX_HZ
    return C1A_V2_MIN_HZ * 2 ** (index / C1A_V2_POINTS_PER_OCTAVE)
  })
}

function numericPair(row) {
  if (row.length < 2) return null
  const frequencyHz = Number(row[0])
  const db = Number(row[1])
  return Number.isFinite(frequencyHz) && Number.isFinite(db) ? [frequencyHz, db] : null
}

/** Parse a processed AutoEq CSV without sorting or extrapolating. */
export function parseCurveCsv(text) {
  const lines = String(text)
    .replace(/^\ufeff/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'))
  if (lines.length < 3) throw new Error('malformed: too few rows')
  const rows = lines.map((line) => line.split(',').map((value) => value.trim()))
  const firstPair = numericPair(rows[0] ?? [])
  const dataRows = firstPair === null ? rows.slice(1) : rows
  if (dataRows.length < 2) throw new Error('malformed: too few numeric rows')
  const points = dataRows.map((row) => numericPair(row))
  if (points.some((point) => point === null)) throw new Error('malformed: non-finite point')
  for (let index = 0; index < points.length; index += 1) {
    const [frequencyHz] = points[index]
    if (frequencyHz <= 0) throw new Error('malformed: non-positive frequency')
    if (index > 0 && points[index - 1][0] >= frequencyHz) throw new Error('malformed: unordered or duplicate frequency')
  }
  if (points[0][0] > C1A_V2_MIN_HZ) throw new Error('coverage: missing V2 minimum')
  return points
}

export function canonicalizeTerminalEndpoint(points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('coverage: at least two points required')
  const penultimateV2FrequencyHz = v2EvaluationGrid().at(-2)
  const last = points.at(-1)
  if (last[0] >= C1A_V2_MAX_HZ) {
    return { points: points.map((point) => [...point]), transformation: null, penultimateV2FrequencyHz }
  }
  if (last[0] < penultimateV2FrequencyHz) {
    throw new Error(`coverage: terminal ${last[0]} below V2 penultimate ${penultimateV2FrequencyHz}`)
  }
  return {
    points: [...points.map((point) => [...point]), [C1A_V2_MAX_HZ, last[1]]],
    transformation: 'terminal-flat-hold-to-v2-max',
    penultimateV2FrequencyHz,
  }
}

function interpolateLogFrequency(points, frequencyHz) {
  const first = points[0]
  const last = points.at(-1)
  if (frequencyHz < first[0] || frequencyHz > last[0]) throw new Error(`normalization: ${frequencyHz} Hz outside curve coverage`)
  if (frequencyHz === first[0]) return first[1]
  if (frequencyHz === last[0]) return last[1]
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle][0] <= frequencyHz) low = middle
    else high = middle
  }
  const left = points[low]
  const right = points[high]
  const ratio = Math.log(frequencyHz / left[0]) / Math.log(right[0] / left[0])
  const value = left[1] + ratio * (right[1] - left[1])
  if (!Number.isFinite(value)) throw new Error('normalization: non-finite interpolation')
  return value
}

/** Normalization is used only to produce an objective integrity hash. */
export function normalizeCurveForIntegrity(points, normalization = C1A_NORMALIZATION) {
  if (normalization.mode !== 'hz' || normalization.frequencyHz !== 500) throw new Error('C1a normalization is frozen at 500 Hz')
  const anchorDb = interpolateLogFrequency(points, normalization.frequencyHz)
  const normalizedPoints = points.map(([frequencyHz, db]) => [frequencyHz, db - anchorDb])
  if (normalizedPoints.some(([, db]) => !Number.isFinite(db))) throw new Error('normalization: non-finite normalized point')
  return { normalizedPoints, anchorDb }
}

function inferSide(sourceName, url) {
  const value = `${sourceName ?? ''} ${url ?? ''}`.trim()
  if (/(?:^|[ _-])L(?:\.[a-z0-9]+)?(?:\?|$)/i.test(value)) return 'left'
  if (/(?:^|[ _-])R(?:\.[a-z0-9]+)?(?:\?|$)/i.test(value)) return 'right'
  return 'unknown'
}

/** Parse name_index.tsv while preserving exact model and rig strings. */
export function parseNameIndex(text, collection = '') {
  const lines = String(text).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n')
  const header = (lines.shift() ?? '').split('\t')
  const headerText = header.slice(0, 5).join('\t')
  // Both spellings occur in audited upstream snapshots; neither changes the
  // exact column values (the fifth column remains the exact rig string).
  if (headerText !== 'url\tsource_name\tname\tform\trig' && headerText !== 'url\tsource_name\tname\tform\ttrig') {
    throw new Error(`metadata: unexpected name_index header for ${collection}`)
  }
  const rows = []
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue
    const columns = line.split('\t')
    if (columns.length < 5) throw new Error(`metadata: malformed row ${index + 2} for ${collection}`)
    const [url, sourceName, model, form, rig] = columns
    if (!model?.trim() || !rig?.trim()) continue
    rows.push({ collection, rowNumber: index + 2, url, sourceName, model, form, rig, side: inferSide(sourceName, url) })
  }
  return rows
}

/** Resolve using exact rig agreement; family-only lookup is intentionally unavailable. */
export function resolveMetadataStrict(processedName, pathRig, rows) {
  const nameMatches = rows.filter((row) => row.form === C1A_FORM && canonicalCurveName(row.model) === canonicalCurveName(processedName))
  const matches = pathRig === null || pathRig === undefined ? nameMatches : nameMatches.filter((row) => row.rig === pathRig)
  const keys = new Set(matches.map((row) => `${row.model}\u0000${row.rig}`))
  if (matches.length === 0) return { status: 'unresolved', reason: pathRig ? 'NO_EXACT_RIG_MATCH' : 'NO_EXACT_METADATA_MATCH' }
  if (keys.size !== 1) return { status: 'ambiguous', reason: 'CONFIGURATION_AMBIGUOUS', rows: matches }
  const metadata = matches[0]
  return {
    status: 'resolved',
    metadata: {
      collection: metadata.collection,
      model: metadata.model,
      rig: metadata.rig,
      rows: matches.toSorted((left, right) => left.rowNumber - right.rowNumber),
    },
  }
}

function normalizedRigClass(rig) {
  // Deliberately do not trim: unsupported aliases with whitespace are distinct.
  return String(rig).normalize('NFKD').toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
}

/** Only the exact upstream string 711 is eligible for the primary class. */
export function classifyRig(rig) {
  const exact = String(rig)
  if (exact === C1A_PRIMARY_RIG) {
    return { exactRig: exact, rigClass: '711-class', primary711Eligible: true, mappingEvidence: 'exact upstream metadata string: 711' }
  }
  if (exact === 'GRAS RA0045') {
    return { exactRig: exact, rigClass: 'gras-ra0045', primary711Eligible: false, mappingEvidence: 'exact upstream metadata string: GRAS RA0045; capability not established; kept separate from 711' }
  }
  if (exact === 'Type 4.3') {
    return { exactRig: exact, rigClass: 'type-4.3', primary711Eligible: false, mappingEvidence: 'exact upstream metadata string: Type 4.3; explicit capability label only' }
  }
  // Keep the exact upstream spellings seen in the audited inventory readable;
  // the fallback below adds an identity suffix so unsupported aliases can
  // never collapse merely because their punctuation normalizes alike.
  const auditedClasses = Object.freeze({
    'Bruel & Kjaer 4620': 'bruel-and-kjaer-4620',
    'Bruel & Kjaer 5128': 'bruel-and-kjaer-5128',
    'GRAS 43AC': 'gras-43ac',
    'GRAS 43AC ': 'gras-43ac-',
    'GRAS 43ACB': 'gras-43acb',
    'GRAS 45BC ': 'gras-45bc-',
    'GRAS 45BC-10': 'gras-45bc-10',
    'HMS II.3': 'hms-ii-3',
    'KB006x + 711': 'kb006x-711',
    'KB501x + 711': 'kb501x-711',
    'B&K 5128': 'b-and-k-5128',
  })
  if (Object.hasOwn(auditedClasses, exact)) {
    return { exactRig: exact, rigClass: auditedClasses[exact], primary711Eligible: false, mappingEvidence: 'exact upstream metadata string; audited rig spelling retained' }
  }
  const slug = normalizedRigClass(exact) || 'unclassified'
  return {
    exactRig: exact,
    rigClass: `${slug}~${sha256(exact).slice(0, 8)}`,
    primary711Eligible: false,
    mappingEvidence: 'distinct exact upstream metadata string; no equivalence inferred',
  }
}

function sourceRowsForIdentity(record) {
  return [...(record.sourceRows ?? [])].map((row) => ({
    collection: row.collection,
    rowNumber: row.rowNumber,
    url: row.url,
    sourceName: row.sourceName,
    model: row.model,
    form: row.form,
    rig: row.rig,
    side: row.side,
  })).toSorted((left, right) => (left.rowNumber ?? 0) - (right.rowNumber ?? 0))
}

function recordFamily(record) {
  return record.deviceFamily ?? canonicalDeviceFamily(record.model ?? record.processedName)
}

function recordConfiguration(record) {
  return record.configurationSignature ?? configurationSignature(record.processedName ?? record.model)
}

function recordIdentity(record) {
  return record.concreteCurveIdentity ?? record.identity ?? deriveConcreteCurveIdentity(record)
}

function recordRigClass(record) {
  return record.rigClass ?? classifyRig(record.rig).rigClass
}

function is711(record) {
  return record.rig === C1A_PRIMARY_RIG && classifyRig(record.rig).primary711Eligible
}

function compareRecords(left, right) {
  return `${recordIdentity(left)}|${left.path ?? ''}`.localeCompare(`${recordIdentity(right)}|${right.path ?? ''}`)
}

function validRecord(record) {
  return record.integrityStatus !== 'invalid' && record.integrity?.status !== 'invalid'
}

function chooseOnePerCollectionAndClass(measurements) {
  const byClass = new Map()
  const ordered = [...measurements].sort((left, right) => (
    (validRecord(left) ? 0 : 1) - (validRecord(right) ? 0 : 1) || compareRecords(left, right)
  ))
  for (const measurement of ordered) {
    const rigClass = recordRigClass(measurement)
    const byCollection = byClass.get(rigClass) ?? new Map()
    if (!byCollection.has(measurement.collection)) byCollection.set(measurement.collection, measurement)
    byClass.set(rigClass, byCollection)
  }
  return new Map([...byClass].map(([rigClass, byCollection]) => [rigClass, [...byCollection.values()].sort(compareRecords)]))
}

/** Count distinct collections once inside each exact rig class. */
export function countIndependentCollectionsByRigClass(measurements) {
  const byClass = new Map()
  for (const measurement of measurements) {
    const rigClass = recordRigClass(measurement)
    const collections = byClass.get(rigClass) ?? []
    collections.push(measurement.collection)
    byClass.set(rigClass, collections)
  }
  return Object.fromEntries([...byClass].sort(([left], [right]) => left.localeCompare(right)).map(([rigClass, collections]) => {
    const unique = [...new Set(collections)].sort()
    const counts = new Map()
    for (const collection of collections) counts.set(collection, (counts.get(collection) ?? 0) + 1)
    return [rigClass, {
      count: unique.length,
      collections: unique,
      duplicateCollections: [...counts].filter(([, count]) => count > 1).map(([collection]) => collection).sort(),
    }]
  }))
}

function groupRawMeasurements(measurements) {
  const groups = new Map()
  for (const measurement of measurements) {
    if (measurement.form !== undefined && measurement.form !== C1A_FORM) continue
    const deviceFamily = recordFamily(measurement)
    const configuration = recordConfiguration(measurement)
    const key = `${deviceFamily}\u0000${configuration}`
    const current = groups.get(key) ?? { groupKey: key, deviceFamily, configurationSignature: configuration, allMembers: [] }
    current.allMembers.push({
      ...measurement,
      deviceFamily,
      configurationSignature: configuration,
      concreteCurveIdentity: recordIdentity(measurement),
      rigClass: recordRigClass(measurement),
    })
    groups.set(key, current)
  }
  return groups
}

/** Group strictly by device family and full configuration signature. */
export function groupC1Measurements(measurements) {
  const groups = []
  for (const raw of groupRawMeasurements(measurements).values()) {
    const exact711Candidates = raw.allMembers.filter(is711)
    const exact711ByClass = chooseOnePerCollectionAndClass(exact711Candidates)
    const exact711Members = exact711ByClass.get('711-class') ?? []
    const non711Candidates = raw.allMembers.filter((member) => !is711(member))
    const non711ByClass = chooseOnePerCollectionAndClass(non711Candidates)
    const valid711Members = exact711Members.filter(validRecord)
    const validNon711ByClass = new Map([...non711ByClass].map(([rigClass, members]) => [rigClass, members.filter(validRecord)]).filter(([, members]) => members.length > 0))
    const exact711IndependentCount = valid711Members.length
    const non711IndependentCount = [...validNon711ByClass.values()].reduce((total, members) => total + members.length, 0)
    const non711RigClasses = [...validNon711ByClass.keys()].sort()
    const non711CollectionsByRigClass = Object.fromEntries(non711RigClasses.map((rigClass) => [rigClass, validNon711ByClass.get(rigClass).map((member) => member.collection).sort()]))
    const allByClass = countIndependentCollectionsByRigClass(raw.allMembers)
    const ambiguous = raw.allMembers.some((member) => member.configurationStatus === 'CONFIGURATION_AMBIGUOUS')
    const groupId = deriveGroupId(raw.deviceFamily, raw.configurationSignature)
    const selectionHash = stableHash(groupId, C1A_SELECTION_SEED)
    const reasons = []
    if (ambiguous) reasons.push('CONFIGURATION_AMBIGUOUS')
    if (exact711IndependentCount < C1A_MIN_INDEPENDENT_MEASUREMENTS) reasons.push('EXACT_711_MEASUREMENT_SHORTAGE')
    if (non711IndependentCount < 1) reasons.push('NON_711_MEASUREMENT_SHORTAGE')
    const invalidNon711Selection = [...non711ByClass].some(([rigClass, members]) => (validNon711ByClass.get(rigClass)?.length ?? 0) !== members.length)
    if (valid711Members.length !== exact711Members.length || invalidNon711Selection) {
      reasons.push('OBJECTIVE_CURVE_VALIDATION_FAILURE')
    }
    const strengthTier = exact711IndependentCount >= C1A_MIN_INDEPENDENT_MEASUREMENTS && non711IndependentCount >= 1
      ? (non711RigClasses.some((rigClass) => validNon711ByClass.get(rigClass).length >= 2) ? 'A' : 'B')
      : null
    const exact711Collections = valid711Members.map((member) => member.collection).sort()
    const non711Members = non711RigClasses.flatMap((rigClass) => validNon711ByClass.get(rigClass)).sort(compareRecords)
    const members = [...valid711Members, ...non711Members].sort(compareRecords)
    const allRigClasses = [...new Set(raw.allMembers.map(recordRigClass))].sort()
    const allExactRigStrings = [...new Set(raw.allMembers.map((member) => member.rig))].sort()
    const totalIndependentCollectionCount = exact711IndependentCount + non711IndependentCount
    groups.push({
      groupId,
      groupKey: `${raw.deviceFamily}|${raw.configurationSignature}`,
      deviceFamily: raw.deviceFamily,
      configurationSignature: raw.configurationSignature,
      selectionHash,
      eligible: reasons.length === 0,
      exclusionReasons: reasons,
      strengthTier,
      exact711IndependentCount,
      exact711Collections,
      non711IndependentCount,
      non711RigClasses,
      distinctNon711RigClassCount: non711RigClasses.length,
      non711CollectionsByRigClass,
      totalIndependentCollectionCount,
      distinctCollectionCount: new Set(raw.allMembers.map((member) => member.collection)).size,
      distinctRigClassCount: allRigClasses.length,
      allRigClasses,
      allExactRigStrings,
      duplicateCollectionsByRigClass: allByClass,
      exact711Members: valid711Members.sort(compareRecords),
      eligibleNon711Members: non711Members,
      members,
      allMembers: [...raw.allMembers].sort(compareRecords),
    })
  }
  return groups.toSorted((left, right) => left.groupId.localeCompare(right.groupId))
}

// Naming aliases keep the C1a resolver/grouping surface parallel to the
// audited metadata tooling while retaining C1-specific semantics.
export const groupEligibleMeasurements = groupC1Measurements

/** Fixed strength tuple: tier, 711 count, non-711 classes, total, hash, id. */
export function selectC1Groups(groups) {
  const tierRank = (tier) => tier === 'A' ? 0 : 1
  return [...groups]
    .filter((group) => group.eligible)
    .toSorted((left, right) => (
      tierRank(left.strengthTier) - tierRank(right.strengthTier)
      || right.exact711IndependentCount - left.exact711IndependentCount
      || right.distinctNon711RigClassCount - left.distinctNon711RigClassCount
      || right.totalIndependentCollectionCount - left.totalIndependentCollectionCount
      || left.selectionHash.localeCompare(right.selectionHash)
      || left.groupId.localeCompare(right.groupId)
    ))
    .slice(0, C1A_REQUIRED_GROUPS)
}

export const selectTwelveGroups = selectC1Groups

export function splitDevelopmentHoldout(groups) {
  if (groups.length !== C1A_REQUIRED_GROUPS) throw new Error('C1a split requires exactly twelve selected groups')
  return [...groups]
    .toSorted((left, right) => {
      const leftHash = stableHash(left.groupId, C1A_SPLIT_SEED)
      const rightHash = stableHash(right.groupId, C1A_SPLIT_SEED)
      return leftHash.localeCompare(rightHash) || left.groupId.localeCompare(right.groupId)
    })
    .map((group, index) => ({ ...group, split: index < 6 ? 'development' : 'holdout', splitHash: stableHash(group.groupId, C1A_SPLIT_SEED) }))
}

function integrityRecord(record, integrity) {
  return {
    ...record,
    sourceRows: sourceRowsForIdentity(record),
    deviceFamily: recordFamily(record),
    configurationSignature: recordConfiguration(record),
    concreteCurveIdentity: recordIdentity(record),
    rigClass: recordRigClass(record),
    integrity,
  }
}

/** Metadata-only member representation; no upstream measurement bytes. */
export function committedMember(record) {
  return {
    collection: record.collection,
    form: record.form,
    model: record.model,
    processedName: record.processedName,
    deviceFamily: recordFamily(record),
    configurationSignature: recordConfiguration(record),
    rig: record.rig,
    rigClass: recordRigClass(record),
    path: record.path,
    upstreamRawUrl: rawUrl(record.path),
    blobSha: record.blobSha,
    upstreamSha256: record.integrity?.upstreamSha256,
    concreteCurveIdentity: recordIdentity(record),
    sourceRows: sourceRowsForIdentity(record),
    sourceUrls: sourceRowsForIdentity(record).map((row) => row.url).filter(Boolean),
    integrity: record.integrity,
  }
}

function groupForArtifact(group) {
  const exact711Members = group.exact711Members.map(committedMember)
  const eligibleNon711Members = group.eligibleNon711Members.map(committedMember)
  const eligibleNon711MembersByRigClass = Object.fromEntries(group.non711RigClasses.map((rigClass) => [
    rigClass,
    eligibleNon711Members.filter((member) => member.rigClass === rigClass),
  ]))
  return {
    groupId: group.groupId,
    groupKey: group.groupKey,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    selectionHash: group.selectionHash,
    strengthTier: group.strengthTier,
    split: group.split ?? null,
    splitHash: group.splitHash ?? null,
    eligible: group.eligible,
    exact711IndependentCount: group.exact711IndependentCount,
    exact711Collections: [...group.exact711Collections].sort(),
    exact711IndependentCollections: [...group.exact711Collections].sort(),
    non711IndependentCount: group.non711IndependentCount,
    distinctNon711RigClassCount: group.distinctNon711RigClassCount,
    non711RigClasses: [...group.non711RigClasses].sort(),
    non711CollectionsByRigClass: group.non711CollectionsByRigClass,
    non711IndependentCollections: group.non711CollectionsByRigClass,
    totalIndependentCollectionCount: group.totalIndependentCollectionCount,
    distinctCollectionCount: group.distinctCollectionCount,
    distinctRigClassCount: group.distinctRigClassCount,
    allRigClasses: [...group.allRigClasses].sort(),
    allExactRigStrings: [...group.allExactRigStrings].sort(),
    rigClasses: [...group.allRigClasses].sort(),
    exactRigStrings: [...group.allExactRigStrings].sort(),
    exact711Members,
    eligibleNon711Members,
    eligibleNon711MembersByRigClass,
    // `members` is the frozen union and is retained for simple provenance joins.
    members: [...exact711Members, ...eligibleNon711Members],
  }
}

function collectionCoverage(groups) {
  const coverage = new Map()
  for (const group of groups) {
    const groupCollections = new Set(group.members.map((member) => member.collection))
    for (const collection of groupCollections) {
      const current = coverage.get(collection) ?? { collection, groupCount: 0, rigClasses: new Set(), exactRigStrings: new Set() }
      current.groupCount += 1
      coverage.set(collection, current)
    }
    for (const member of group.members) {
      const current = coverage.get(member.collection) ?? { collection: member.collection, groupCount: 0, rigClasses: new Set(), exactRigStrings: new Set() }
      current.rigClasses.add(member.rigClass)
      current.exactRigStrings.add(member.rig)
      coverage.set(member.collection, current)
    }
  }
  return [...coverage.values()].map((entry) => ({
    collection: entry.collection,
    groupCount: entry.groupCount,
    rigClasses: [...entry.rigClasses].sort(),
    exactRigStrings: [...entry.exactRigStrings].sort(),
  })).toSorted((left, right) => left.collection.localeCompare(right.collection))
}

/** Outcome-free cross-rig inventory over valid primary-eligible groups. */
export function buildC1SideInventory(groups) {
  const eligible = groups.filter((group) => group.eligible)
  const byRigClass = new Map()
  const byExactRig = new Map()
  for (const group of eligible) {
    for (const member of group.eligibleNon711Members) {
      const rigClass = recordRigClass(member)
      const classEntry = byRigClass.get(rigClass) ?? { rigClass, groupIds: new Set(), independentObservationCount: 0, collections: new Set() }
      classEntry.groupIds.add(group.groupId)
      classEntry.independentObservationCount += 1
      classEntry.collections.add(member.collection)
      byRigClass.set(rigClass, classEntry)
      const exactEntry = byExactRig.get(member.rig) ?? { exactRig: member.rig, rigClass, groupIds: new Set(), independentObservationCount: 0, collections: new Set() }
      exactEntry.groupIds.add(group.groupId)
      exactEntry.independentObservationCount += 1
      exactEntry.collections.add(member.collection)
      byExactRig.set(member.rig, exactEntry)
    }
  }
  const non711RigClassDistribution = [...byRigClass.values()].map((entry) => ({
    rigClass: entry.rigClass,
    groupCount: entry.groupIds.size,
    independentObservationCount: entry.independentObservationCount,
    collections: [...entry.collections].sort(),
  })).toSorted((left, right) => left.rigClass.localeCompare(right.rigClass))
  const exactRigDistribution = [...byExactRig.values()].map((entry) => ({
    exactRig: entry.exactRig,
    rigClass: entry.rigClass,
    groupCount: entry.groupIds.size,
    independentObservationCount: entry.independentObservationCount,
    collections: [...entry.collections].sort(),
  })).toSorted((left, right) => left.exactRig.localeCompare(right.exactRig))
  return {
    totalGroupsWithAtLeast3Exact711AndAtLeast1Non711: eligible.length,
    tierACount: eligible.filter((group) => group.strengthTier === 'A').length,
    tierBCount: eligible.filter((group) => group.strengthTier === 'B').length,
    groupsWithAtLeast2DistinctNon711RigClasses: eligible.filter((group) => group.distinctNon711RigClassCount >= 2).length,
    groupsWithAtLeast3DistinctRigClassesTotal: eligible.filter((group) => group.distinctRigClassCount >= 3).length,
    non711RigClassDistribution,
    exactRigDistribution,
    non711RigClassCounts: non711RigClassDistribution,
    exactRigStringCounts: exactRigDistribution,
    collectionCoverage: collectionCoverage(eligible),
    eligibleGroupIds: eligible.map((group) => group.groupId).sort(),
  }
}

export function buildRigInventory(metadataRows, records) {
  const byRig = new Map()
  for (const row of metadataRows.filter((candidate) => candidate.form === C1A_FORM)) {
    const current = byRig.get(row.rig) ?? { exactRig: row.rig, metadataRowCount: 0, processedCurveCount: 0, collections: new Set(), examples: [] }
    current.metadataRowCount += 1
    current.collections.add(row.collection)
    if (current.examples.length < 3) current.examples.push({ collection: row.collection, model: row.model, sourceName: row.sourceName })
    byRig.set(row.rig, current)
  }
  for (const record of records) {
    const current = byRig.get(record.rig) ?? { exactRig: record.rig, metadataRowCount: 0, processedCurveCount: 0, collections: new Set(), examples: [] }
    current.processedCurveCount += 1
    current.collections.add(record.collection)
    byRig.set(record.rig, current)
  }
  const rigs = [...byRig.values()].map((entry) => ({
    ...entry,
    ...classifyRig(entry.exactRig),
    collections: [...entry.collections].sort(),
  })).toSorted((left, right) => left.exactRig.localeCompare(right.exactRig))
  return {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    exactUpstreamRigStrings: rigs.map((rig) => rig.exactRig),
    rigMappings: rigs,
  }
}

function artifactHashInput(source, relativePath) {
  if (typeof source === 'string') return readFileSync(resolve(source, relativePath))
  if (source instanceof Map) return source.get(relativePath)
  return source[relativePath]
}

/** Hash named evidence files with path framing. */
export function hashEvidenceFiles(source, relativePaths) {
  const hash = createHash('sha256')
  for (const relativePath of [...relativePaths].sort()) {
    const bytes = artifactHashInput(source, relativePath)
    if (bytes === undefined) throw new Error(`evidence: missing ${relativePath}`)
    hash.update(`${relativePath}\n`)
    hash.update(bytes)
    hash.update('\n')
  }
  return hash.digest('hex')
}

function assertHash(value, expected, name) {
  if (value !== expected) throw new Error(`provenance: ${name} hash mismatch`)
}

export function assertC1NoOutcomeEvidence(manifest) {
  if (manifest.confidenceWeightingApplied || manifest.confidenceCurveComputed || manifest.autoEqSolverExecuted || manifest.solverExecuted || manifest.responseOutcomeObserved) {
    throw new Error('C1a outcome evidence is forbidden')
  }
  if (manifest.peakAlignedDispersionUsed !== false) throw new Error('C1a preprocessing flag is forbidden')
  return true
}

/** Validate committed metadata/provenance without reading raw bytes. */
export function validateC1Provenance({ manifest, groups, provenance, artifactFiles }) {
  if (!manifest || !groups || !provenance) throw new Error('provenance: incomplete artifact bundle')
  if (manifest.upstream?.repository !== UPSTREAM_REPOSITORY || manifest.upstream?.commit !== UPSTREAM_COMMIT || manifest.upstream?.tree !== UPSTREAM_TREE) throw new Error('provenance: upstream identity mismatch')
  if (manifest.frozenBoundary !== FROZEN_BOUNDARY || provenance.frozenBoundary !== FROZEN_BOUNDARY) throw new Error('provenance: frozen boundary mismatch')
  if (provenance.upstream?.repository !== UPSTREAM_REPOSITORY || provenance.upstream?.commit !== UPSTREAM_COMMIT || provenance.upstream?.tree !== UPSTREAM_TREE) throw new Error('provenance: provenance upstream identity mismatch')
  if (manifest.c4PeakAlignmentStatus !== C4_FINAL_INTERPRETATION || manifest.c4?.finalEvidenceSha256 !== C4C_FINAL_EVIDENCE_SHA256 || manifest.c4?.finalInterpretation !== C4_FINAL_INTERPRETATION || manifest.peakAlignedDispersionUsed !== false) throw new Error('provenance: historical C4 status or preprocessing flag mismatch')
  assertC1NoOutcomeEvidence(manifest)
  if (provenance.confidenceWeightingApplied || provenance.confidenceCurveComputed || provenance.autoEqSolverExecuted || provenance.solverExecuted) throw new Error('provenance: forbidden execution flag')
  const groupIds = groups.map((group) => group.groupId)
  if (new Set(groupIds).size !== groupIds.length) throw new Error('provenance: duplicate group identity')
  if (groups.length > C1A_REQUIRED_GROUPS) throw new Error('provenance: more than twelve selected groups')
  if (manifest.classification === 'C1_CORPUS_READY' && groups.length !== C1A_REQUIRED_GROUPS) throw new Error('provenance: ready classification requires twelve selected groups')
  const selectedGroupIds = manifest.selection?.selectedGroupIds
  if (Array.isArray(selectedGroupIds) && JSON.stringify(selectedGroupIds) !== JSON.stringify(groupIds)) throw new Error('provenance: manifest selected-group identity mismatch')
  if (Array.isArray(provenance.selectedGroupIds) && JSON.stringify(provenance.selectedGroupIds) !== JSON.stringify(groupIds)) throw new Error('provenance: provenance selected-group identity mismatch')
  if (groups.length === C1A_REQUIRED_GROUPS && manifest.classification === 'C1_CORPUS_READY') {
    const development = groups.filter((group) => group.split === 'development')
    const holdout = groups.filter((group) => group.split === 'holdout')
    if (development.length !== 6 || holdout.length !== 6) throw new Error('provenance: development/holdout split is not 6/6')
    if (new Set([...development, ...holdout].map((group) => group.groupId)).size !== groups.length) throw new Error('provenance: development/holdout overlap')
    const developmentIds = development.map((group) => group.groupId)
    const holdoutIds = holdout.map((group) => group.groupId)
    if (Array.isArray(manifest.selection?.developmentGroupIds) && JSON.stringify(manifest.selection.developmentGroupIds) !== JSON.stringify(developmentIds)) throw new Error('provenance: development-group identity mismatch')
    if (Array.isArray(manifest.selection?.holdoutGroupIds) && JSON.stringify(manifest.selection.holdoutGroupIds) !== JSON.stringify(holdoutIds)) throw new Error('provenance: holdout-group identity mismatch')
  }
  const provenanceMembers = Array.isArray(provenance.members) ? provenance.members : Object.values(provenance.members ?? {})
  const memberIds = groups.flatMap((group) => {
    if (group.eligible === false) throw new Error(`provenance: ineligible selected group ${group.groupId}`)
    if (group.exact711IndependentCount < C1A_MIN_INDEPENDENT_MEASUREMENTS || group.non711IndependentCount < 1) throw new Error(`provenance: gate failure in group ${group.groupId}`)
    const members = group.members ?? []
    const exact711 = group.exact711Members ?? members.filter((member) => member.rig === C1A_PRIMARY_RIG)
    const non711 = group.eligibleNon711Members ?? members.filter((member) => member.rig !== C1A_PRIMARY_RIG)
    if (exact711.length !== group.exact711IndependentCount) throw new Error(`provenance: 711 count mismatch in group ${group.groupId}`)
    if (non711.length !== group.non711IndependentCount) throw new Error(`provenance: non-711 count mismatch in group ${group.groupId}`)
    for (const [label, values] of [['711', exact711], ['non-711', non711]]) {
      const keys = new Set(values.map((member) => `${member.rigClass}\u0000${member.collection}`))
      if (keys.size !== values.length) throw new Error(`provenance: duplicate collection in ${label} class for group ${group.groupId}`)
      if (values.some((member) => member.integrity?.status !== 'valid')) throw new Error(`provenance: invalid selected member in group ${group.groupId}`)
    }
    if (exact711.some((member) => member.rig !== C1A_PRIMARY_RIG || member.rigClass !== '711-class')) throw new Error(`provenance: non-exact 711 member in group ${group.groupId}`)
    if (non711.some((member) => member.rig === C1A_PRIMARY_RIG)) throw new Error(`provenance: exact 711 member in non-711 set for group ${group.groupId}`)
    if (members.length !== exact711.length + non711.length) throw new Error(`provenance: member union mismatch in group ${group.groupId}`)
    return members.map((member) => member.concreteCurveIdentity)
  })
  if (new Set(memberIds).size !== memberIds.length) throw new Error('provenance: duplicate member identity')
  const provenanceIds = provenanceMembers.map((member) => member.concreteCurveIdentity ?? member.identity)
  for (const identity of memberIds) if (!provenanceIds.includes(identity)) throw new Error(`provenance: missing member ${identity}`)
  if (artifactFiles && manifest.artifactFileHashes) {
    for (const [relativePath, expected] of Object.entries(manifest.artifactFileHashes)) assertHash(hashEvidenceFiles(artifactFiles, [relativePath]), expected, relativePath)
  }
  return true
}

async function fetchJson(fetchImpl, url, cacheRoot) {
  const cachePath = cacheRoot ? resolve(cacheRoot, `api-${sha256(url)}`) : null
  if (cachePath) {
    try {
      const cached = await readFile(cachePath, 'utf8')
      return JSON.parse(cached)
    } catch {}
  }
  const response = await fetchImpl(url, { redirect: 'error', headers: API_HEADERS })
  if (!response.ok) throw new Error(`upstream API ${response.status}: ${url}`)
  const value = await response.json()
  if (cachePath) {
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(cachePath, `${JSON.stringify(value)}\n`, 'utf8')
  }
  return value
}

async function fetchPinnedBytes(fetchImpl, path, cacheRoot, expectedBlobSha) {
  const cachePath = resolve(cacheRoot, sha256(path))
  try {
    const bytes = await readFile(cachePath)
    if (bytes.length > 0 && (!expectedBlobSha || gitBlobSha1(bytes) === expectedBlobSha)) return { bytes, sha256: sha256(bytes), byteLength: bytes.length, cachePath }
  } catch {}
  const response = await fetchImpl(rawUrl(path), { redirect: 'error', headers: { 'User-Agent': 'autoeq-workbench-c1a' } })
  if (!response.ok) throw new Error(`upstream raw ${response.status}: ${rawUrl(path)}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error(`upstream raw empty: ${path}`)
  if (expectedBlobSha && gitBlobSha1(bytes) !== expectedBlobSha) throw new Error(`upstream raw blob SHA-1 mismatch: ${path}`)
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(cachePath, bytes)
  return { bytes, sha256: sha256(bytes), byteLength: bytes.length, cachePath }
}

async function verifyPinnedUpstream(fetchImpl, cacheRoot) {
  const commit = await fetchJson(fetchImpl, apiUrl(`/git/commits/${UPSTREAM_COMMIT}`), cacheRoot)
  if (commit.sha !== UPSTREAM_COMMIT || commit.tree?.sha !== UPSTREAM_TREE) throw new Error('pinned upstream commit/tree mismatch')
  const tree = await fetchJson(fetchImpl, apiUrl(`/git/trees/${UPSTREAM_TREE}`), cacheRoot)
  if (tree.sha !== UPSTREAM_TREE || !Array.isArray(tree.tree)) throw new Error('pinned upstream root tree mismatch')
  return { commit, tree }
}

export function pathRigForProcessedPath(relativePath) {
  const marker = 'data/in-ear/'
  const tail = relativePath.split(marker)[1]?.split('/') ?? []
  if (tail.length < 2) return null
  return tail.slice(0, -1).join('/')
}

export async function inventoryUpstream({ fetchImpl, cacheRoot }) {
  const verified = await verifyPinnedUpstream(fetchImpl, cacheRoot)
  const measurementsEntry = verified.tree.tree.find((entry) => entry.path === 'measurements' && entry.type === 'tree')
  if (!measurementsEntry) throw new Error('pinned tree has no measurements directory')
  const measurementsTree = await fetchJson(fetchImpl, apiUrl(`/git/trees/${measurementsEntry.sha}`), cacheRoot)
  const collectionEntries = measurementsTree.tree.filter((entry) => entry.type === 'tree')
  const allMetadataRows = []
  const records = []
  const audit = {
    eligibleBeforeStrictResolution: 0,
    eligibleAfterStrictResolution: 0,
    unresolvedByCollection: {},
    ambiguousByCollection: {},
    missingMetadataCollections: [],
    collections: {},
  }
  for (const collectionEntry of collectionEntries.toSorted((left, right) => left.path.localeCompare(right.path))) {
    const collection = collectionEntry.path.startsWith('measurements/') ? collectionEntry.path.slice('measurements/'.length) : collectionEntry.path
    const collectionTree = await fetchJson(fetchImpl, apiUrl(`/git/trees/${collectionEntry.sha}?recursive=1`), cacheRoot)
    if (collectionTree.sha !== collectionEntry.sha || !Array.isArray(collectionTree.tree) || collectionTree.truncated === true) throw new Error(`pinned collection tree mismatch or truncation: ${collection}`)
    const metadataEntry = collectionTree.tree.find((entry) => entry.path === 'name_index.tsv' && entry.type === 'blob')
    let metadataRows = []
    if (metadataEntry) {
      const fetched = await fetchPinnedBytes(fetchImpl, `measurements/${collection}/name_index.tsv`, cacheRoot, metadataEntry.sha)
      metadataRows = parseNameIndex(fetched.bytes.toString('utf8'), collection)
      allMetadataRows.push(...metadataRows)
    } else {
      audit.missingMetadataCollections.push(collection)
    }
    const files = collectionTree.tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith('data/in-ear/') && entry.path.endsWith('.csv'))
    const collectionAudit = { metadataRows: metadataRows.length, processedInEarCurves: files.length, resolved: 0, unresolved: 0, ambiguous: 0 }
    for (const entry of files.toSorted((left, right) => left.path.localeCompare(right.path))) {
      audit.eligibleBeforeStrictResolution += 1
      const processedName = entry.path.split('/').at(-1).replace(/\.csv$/i, '')
      const pathRig = pathRigForProcessedPath(entry.path)
      const resolved = resolveMetadataStrict(processedName, pathRig, metadataRows)
      if (resolved.status !== 'resolved') {
        collectionAudit[resolved.status === 'ambiguous' ? 'ambiguous' : 'unresolved'] += 1
        const bucket = resolved.status === 'ambiguous' ? audit.ambiguousByCollection : audit.unresolvedByCollection
        bucket[collection] = (bucket[collection] ?? 0) + 1
        continue
      }
      collectionAudit.resolved += 1
      audit.eligibleAfterStrictResolution += 1
      const metadata = resolved.metadata
      const rigInfo = classifyRig(metadata.rig)
      records.push({
        collection,
        form: C1A_FORM,
        model: metadata.model,
        processedName,
        deviceFamily: canonicalDeviceFamily(metadata.model),
        configurationSignature: configurationSignature(processedName),
        rig: metadata.rig,
        rigClass: rigInfo.rigClass,
        path: `measurements/${collection}/${entry.path}`,
        upstreamPath: `measurements/${collection}/${entry.path}`,
        blobSha: entry.sha,
        sourceRows: metadata.rows,
        sourceUrls: metadata.rows.map((row) => row.url).filter(Boolean),
        concreteCurveIdentity: deriveConcreteCurveIdentity({ collection, form: C1A_FORM, rig: metadata.rig, processedName }),
        integrityStatus: 'unchecked',
      })
    }
    audit.collections[collection] = collectionAudit
  }
  audit.missingMetadataCollections.sort()
  return { records, allMetadataRows, audit }
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= values.length) return
      results[index] = await callback(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return results
}

function isValidationError(error) {
  return /^(malformed|coverage|normalization):/.test(String(error?.message ?? error))
}

export async function validateCandidateCurves(records, fetchImpl, cacheRoot) {
  const candidates = [...new Set(records.map((record) => record.upstreamPath))]
  const byPath = new Map()
  await mapWithConcurrency(candidates, 12, async (path) => {
    try {
      const record = records.find((candidate) => candidate.upstreamPath === path)
      const fetched = await fetchPinnedBytes(fetchImpl, path, cacheRoot, record?.blobSha)
      const originalPoints = parseCurveCsv(fetched.bytes.toString('utf8'))
      const closed = canonicalizeTerminalEndpoint(originalPoints)
      const normalized = normalizeCurveForIntegrity(closed.points)
      byPath.set(path, {
        status: 'valid',
        upstreamSha256: fetched.sha256,
        byteLength: fetched.byteLength,
        originalPointCount: originalPoints.length,
        canonicalPointCount: closed.points.length,
        originalFirstFrequencyHz: originalPoints[0][0],
        originalTerminalFrequencyHz: originalPoints.at(-1)[0],
        originalTerminalDb: originalPoints.at(-1)[1],
        canonicalTerminalFrequencyHz: closed.points.at(-1)[0],
        canonicalTerminalDb: closed.points.at(-1)[1],
        transformation: closed.transformation,
        originalParsedPointsSha256: sha256(JSON.stringify(originalPoints)),
        canonicalParsedPointsSha256: sha256(JSON.stringify(closed.points)),
        normalizedParsedPointsSha256: sha256(JSON.stringify(normalized.normalizedPoints)),
        normalization: C1A_NORMALIZATION,
        parserCanonicalizerVersion: 1,
      })
    } catch (error) {
      if (!isValidationError(error)) throw error
      byPath.set(path, { status: 'invalid', reason: String(error) })
    }
  })
  return records.map((record) => {
    const integrity = byPath.get(record.upstreamPath)
    return integrityRecord({ ...record, integrityStatus: integrity?.status === 'valid' ? 'valid' : 'invalid' }, integrity ?? { status: 'invalid', reason: 'missing integrity result' })
  })
}

function histogram(groups) {
  const result = {}
  for (const group of groups) result[String(group.exact711IndependentCount)] = (result[String(group.exact711IndependentCount)] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => Number(left) - Number(right)))
}

function metadataOnlyRecords(records) {
  return records.map((record) => ({
    collection: record.collection,
    form: record.form,
    model: record.model,
    processedName: record.processedName,
    deviceFamily: recordFamily(record),
    configurationSignature: recordConfiguration(record),
    rig: record.rig,
    rigClass: recordRigClass(record),
    path: record.path,
    blobSha: record.blobSha,
    concreteCurveIdentity: recordIdentity(record),
    sourceRows: record.sourceRows,
    integrity: record.integrity,
  }))
}

function protocolText() {
  return `# C1a cross-rig confidence corpus selection protocol

This is a metadata, objective parsing/coverage/integrity, normalization-hash, and provenance milestone only. It computes no uncertainty, weighting, loss, filter, solver, or response-comparison outcome.

## Immutable source

- Repository: \`${UPSTREAM_REPOSITORY}\`
- Commit: \`${UPSTREAM_COMMIT}\`
- Commit tree: \`${UPSTREAM_TREE}\`
- API/tree and raw URLs include the immutable commit identifier. No branch reference or full clone is used.
- Raw upstream bytes are cached only below \`${C1A_CACHE_RELATIVE_DIR}/\`; no upstream measurement bytes are committed.

## Identity and preparation

- Form is exactly \`${C1A_FORM}\`.
- Device family and full configuration signature are separate. Parenthetical qualifiers are removed only for family identity; filters, eartips, ANC states, switch states, and other explicit qualifiers remain in the configuration signature.
- Metadata joins use exact rig agreement when a path-level rig is present. No parenthesis-stripping resolver and no frequency-response similarity is used.
- V2 preparation is the audited 20–20,000 Hz domain, 500 Hz normalization, and terminal flat closure at the V2 maximum. Parsed/canonical/normalization hashes are integrity evidence only.

## Primary gate

1. Enumerate strict-resolved in-ear processed curves.
2. Group by \`deviceFamily + configurationSignature\`.
3. Use the literal exact upstream rig string \`711\` for the repeatability class; all other exact rig strings remain separate, including unsupported whitespace aliases.
4. Count a collection once per rig class. L/R metadata rows never create independent members.
5. Admit a group only with at least three valid independent exact-711 collections and at least one valid independent non-711 observation of the same configuration.
6. Tier A has at least two independent non-711 observations on one non-711 class. Tier B has at least one non-711 observation.

## Selection and split

Eligible groups are ranked without any response-derived value: Tier A before Tier B; exact-711 independent count descending; distinct non-711 rig-class count descending; total independent collection count descending; SHA-256 of \`${C1A_SELECTION_SEED}\` plus group ID; group ID. The first twelve are frozen. A separate SHA-256 split seed \`${C1A_SPLIT_SEED}\` assigns six development and six holdout groups.

## Historical boundaries

- \`c4PeakAlignmentStatus = ${C4_FINAL_INTERPRETATION}\`.
- \`peakAlignedDispersionUsed = false\`; historical C4 evidence is not imported as preprocessing.
- Explicit Type 4.3 capability is not inferred for any other rig label. The later high-frequency corpus remains unavailable from this source.
- No external fresh-corpus batch is referenced or executed by this milestone.
- Upstream audited boundary: \`${FROZEN_BOUNDARY}\`.
- Historical C4 evidence SHA-256: \`${C4C_FINAL_EVIDENCE_SHA256}\`.
`
}

function cleanForJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function jsonText(value) {
  return `${JSON.stringify(cleanForJson(value), null, 2)}\n`
}

async function writeJson(path, value) {
  await writeFile(path, jsonText(value), 'utf8')
}

function repositoryRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

/** Acquire, validate, and freeze C1a metadata; no solver import or call path exists. */
export async function runC1a(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('C1a requires fetch')
  const cacheRoot = options.cacheRoot ?? resolve(root, C1A_CACHE_RELATIVE_DIR)
  const outputDir = options.outputDir ?? resolve(root, C1A_ARTIFACT_RELATIVE_DIR)
  const inventory = await inventoryUpstream({ fetchImpl, cacheRoot })
  const validatedRecords = await validateCandidateCurves(inventory.records, fetchImpl, cacheRoot)
  const groups = groupC1Measurements(validatedRecords)
  const eligibleGroups = groups.filter((group) => group.eligible)
  const selectedUnsplit = selectC1Groups(eligibleGroups)
  const selectedGroups = selectedUnsplit.length === C1A_REQUIRED_GROUPS ? splitDevelopmentHoldout(selectedUnsplit) : selectedUnsplit
  const classification = selectedGroups.length === C1A_REQUIRED_GROUPS ? 'C1_CORPUS_READY' : 'C1_CORPUS_INSUFFICIENT'
  const shortage = Math.max(0, C1A_REQUIRED_GROUPS - eligibleGroups.length)
  const sideInventory = buildC1SideInventory(groups)
  const rigInventory = buildRigInventory(inventory.allMetadataRows, validatedRecords)
  const selectedArtifactGroups = selectedGroups.map(groupForArtifact)
  const selectedMembers = selectedArtifactGroups.flatMap((group) => group.members)
  const provenance = {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1A_CORPUS_VERSION,
    frozenBoundary: FROZEN_BOUNDARY,
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    c4PeakAlignmentStatus: C4_FINAL_INTERPRETATION,
    peakAlignedDispersionUsed: false,
    rawDataPolicy: 'external immutable raw source plus ignored local cache only; no upstream measurement bytes committed',
    members: selectedMembers,
    selectedGroupIds: selectedArtifactGroups.map((group) => group.groupId),
    metadataAudit: inventory.audit,
    objectiveValidationPerformed: true,
    confidenceWeightingApplied: false,
    confidenceCurveComputed: false,
    responseOutcomeObserved: false,
    autoEqSolverExecuted: false,
    solverExecuted: false,
  }
  const groupsArtifact = {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1A_CORPUS_VERSION,
    form: C1A_FORM,
    primaryExactRig: C1A_PRIMARY_RIG,
    selectionSeed: C1A_SELECTION_SEED,
    splitSeed: C1A_SPLIT_SEED,
    requiredGroupCount: C1A_REQUIRED_GROUPS,
    minimumIndependentMeasurements: C1A_MIN_INDEPENDENT_MEASUREMENTS,
    groups: selectedArtifactGroups,
  }
  const protocol = protocolText()
  const artifactPayloads = new Map([
    ['groups.json', jsonText(groupsArtifact)],
    ['provenance.json', jsonText(provenance)],
    ['rig-inventory.json', jsonText(rigInventory)],
    ['selection-protocol.md', protocol],
  ])
  const artifactFileHashes = Object.fromEntries([...artifactPayloads.keys()].map((relativePath) => [relativePath, hashEvidenceFiles(artifactPayloads, [relativePath])]))
  const developmentGroupIds = selectedArtifactGroups.filter((group) => group.split === 'development').map((group) => group.groupId)
  const holdoutGroupIds = selectedArtifactGroups.filter((group) => group.split === 'holdout').map((group) => group.groupId)
  const manifest = {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1A_CORPUS_VERSION,
    milestone: 'C1a-corpus-inventory-only',
    classification,
    shortage,
    frozenBoundary: FROZEN_BOUNDARY,
    c4PeakAlignmentStatus: C4_FINAL_INTERPRETATION,
    c4: { finalEvidenceSha256: C4C_FINAL_EVIDENCE_SHA256, finalInterpretation: C4_FINAL_INTERPRETATION },
    c5: { available: false, reason: 'No explicit Type 4.3/high-frequency-capable corpus established; no inference made.' },
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    domain: {
      form: C1A_FORM,
      v2MinHz: C1A_V2_MIN_HZ,
      v2MaxHz: C1A_V2_MAX_HZ,
      normalization: C1A_NORMALIZATION,
      terminalClosure: 'terminal-flat-hold-to-v2-max',
    },
    selection: {
      seed: C1A_SELECTION_SEED,
      splitSeed: C1A_SPLIT_SEED,
      primaryExactRig: C1A_PRIMARY_RIG,
      requiredGroupCount: C1A_REQUIRED_GROUPS,
      minimumIndependentMeasurements: C1A_MIN_INDEPENDENT_MEASUREMENTS,
      eligiblePrimaryGroupCount: eligibleGroups.length,
      eligibleGroupCountByExact711Measurements: histogram(eligibleGroups),
      tierACount: sideInventory.tierACount,
      tierBCount: sideInventory.tierBCount,
      selectedGroupIds: selectedArtifactGroups.map((group) => group.groupId),
      developmentGroupIds,
      holdoutGroupIds,
    },
    inventory: {
      processedInEarCurveCount: inventory.audit.eligibleBeforeStrictResolution,
      strictResolvedCurveCount: inventory.audit.eligibleAfterStrictResolution,
      primary711CurveCount: validatedRecords.filter(is711).length,
      selectedMemberCount: selectedMembers.length,
    },
    metadataAudit: inventory.audit,
    sideInventory,
    flags: {
      confidenceWeightingApplied: false,
      confidenceCurveComputed: false,
      responseOutcomeObserved: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      peakAlignedDispersionUsed: false,
      rawMeasurementsCommitted: false,
    },
    confidenceWeightingApplied: false,
    confidenceCurveComputed: false,
    responseOutcomeObserved: false,
    solverExecuted: false,
    autoEqSolverExecuted: false,
    rawMeasurementsCommitted: false,
    peakAlignedDispersionUsed: false,
    hashes: {
      groupsSha256: sha256(JSON.stringify(groupsArtifact)),
      provenanceSha256: sha256(JSON.stringify(provenance)),
      rigInventorySha256: sha256(JSON.stringify(rigInventory)),
      selectionProtocolSha256: sha256(protocol),
    },
    artifactFileHashes,
  }
  await mkdir(outputDir, { recursive: true })
  for (const [relativePath, payload] of artifactPayloads) await writeFile(resolve(outputDir, relativePath), payload, 'utf8')
  await writeJson(resolve(outputDir, 'manifest.json'), manifest)
  const evidenceSha256 = hashEvidenceFiles(outputDir, ['groups.json', 'manifest.json', 'provenance.json', 'rig-inventory.json', 'selection-protocol.md'])
  await writeFile(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`, 'utf8')
  validateC1Provenance({ manifest, groups: selectedArtifactGroups, provenance, artifactFiles: outputDir })
  return {
    classification,
    shortage,
    evidenceSha256,
    manifest,
    groups: groupsArtifact,
    provenance,
    rigInventory,
    sideInventory,
    eligibleGroups,
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC1a()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({
        classification: result.classification,
        shortage: result.shortage,
        evidenceSha256: result.evidenceSha256,
        eligiblePrimaryGroups: result.eligibleGroups.length,
        tierACount: result.manifest.selection.tierACount,
        tierBCount: result.manifest.selection.tierBCount,
        selectedGroupIds: result.groups.groups.map((group) => group.groupId),
      }, null, 2)}\n`)
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
