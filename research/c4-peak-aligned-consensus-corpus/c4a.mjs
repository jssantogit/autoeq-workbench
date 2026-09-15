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

export const FROZEN_BOUNDARY = '2718375e64e6e4682cb6cacf46ae8300a431e1ba'
export const C2_FINAL_EVIDENCE_SHA256 = '1de4d0ac26eb1d24724e01b4dbeae38a6a10343cb8a671c06ccc3e79229d751a'
export const C2_FINAL_INTERPRETATION = 'C2_CLOSED_HOLDOUT_NOT_CONFIRMED'

export const C4A_CORPUS_VERSION = 'c4-peak-aligned-consensus-corpus-v1'
export const C4A_SELECTION_SEED = 'autoeq-workbench:c4-consensus-corpus-v1'
export const C4A_SPLIT_SEED = 'autoeq-workbench:c4-consensus-split-v1'
export const C4A_FORM = 'in-ear'
export const C4A_REQUIRED_GROUPS = 6
export const C4A_MIN_INDEPENDENT_MEASUREMENTS = 3
export const C4A_NORMALIZATION = Object.freeze({ mode: 'hz', frequencyHz: 500, levelDb: 60 })
export const C4A_V2_MIN_HZ = 20
export const C4A_V2_MAX_HZ = 20_000
export const C4A_V2_POINTS_PER_OCTAVE = 96
export const C4A_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c4-peak-aligned-consensus-corpus'
export const C4A_CACHE_RELATIVE_DIR = '.research-cache/c4-peak-aligned-consensus-corpus'
export const C4A_PROTOCOL_SCHEMA_VERSION = 1

const API_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'autoeq-workbench-c4a',
})

/**
 * Hash bytes/text with the algorithm used by all C4a integrity records.
 * @param {string|Uint8Array} value
 */
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

export function stableHash(value, seed = C4A_SELECTION_SEED) {
  return sha256(`${seed}:${value}`)
}

/** Unicode normalization used for lookup only. It never removes qualifiers. */
export function canonicalCurveName(value) {
  return String(value).normalize('NFKD').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/**
 * Device-family identity is separate from concrete curve identity. Only the
 * family helper removes parenthetical qualifiers; metadata lookup never uses
 * this helper.
 */
export function canonicalDeviceFamily(value) {
  return canonicalCurveName(value)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Full processed name, including every variant qualifier. */
export function configurationSignature(value) {
  return canonicalCurveName(value)
}

export function deriveConcreteCurveIdentity({ collection, form, rig, processedName }) {
  // JSON framing keeps delimiters in metadata unambiguous while preserving
  // the exact processed filename/qualifiers for concrete identity.
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
  return `c4g-${sha256(`${deviceFamily}|${configuration}`).slice(0, 20)}`
}

export function v2EvaluationGrid() {
  const count = Math.ceil(
    Math.log2(C4A_V2_MAX_HZ / C4A_V2_MIN_HZ) * C4A_V2_POINTS_PER_OCTAVE,
  )
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return C4A_V2_MIN_HZ
    if (index === count) return C4A_V2_MAX_HZ
    return C4A_V2_MIN_HZ * 2 ** (index / C4A_V2_POINTS_PER_OCTAVE)
  })
}

function numericPair(row) {
  if (row.length < 2) return null
  const frequencyHz = Number(row[0])
  const db = Number(row[1])
  return Number.isFinite(frequencyHz) && Number.isFinite(db)
    ? [frequencyHz, db]
    : null
}

/** Parse the processed AutoEq CSV without sorting or extrapolating. */
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
  const finitePoints = points
  for (let index = 0; index < finitePoints.length; index += 1) {
    const [frequencyHz] = finitePoints[index]
    if (frequencyHz <= 0) throw new Error('malformed: non-positive frequency')
    if (index > 0 && finitePoints[index - 1][0] >= frequencyHz) {
      throw new Error('malformed: unordered or duplicate frequency')
    }
  }
  if (finitePoints[0][0] > C4A_V2_MIN_HZ) throw new Error('coverage: missing V2 minimum')
  return finitePoints
}

export function canonicalizeTerminalEndpoint(points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('coverage: at least two points required')
  const penultimateV2FrequencyHz = v2EvaluationGrid().at(-2)
  const last = points.at(-1)
  if (last[0] >= C4A_V2_MAX_HZ) {
    return { points: points.map((point) => [...point]), transformation: null, penultimateV2FrequencyHz }
  }
  if (last[0] < penultimateV2FrequencyHz) {
    throw new Error(`coverage: terminal ${last[0]} below V2 penultimate ${penultimateV2FrequencyHz}`)
  }
  return {
    points: [...points.map((point) => [...point]), [C4A_V2_MAX_HZ, last[1]]],
    transformation: 'terminal-flat-hold-to-v2-max',
    penultimateV2FrequencyHz,
  }
}

function interpolateLogFrequency(points, frequencyHz) {
  const first = points[0]
  const last = points.at(-1)
  if (frequencyHz < first[0] || frequencyHz > last[0]) {
    throw new Error(`normalization: ${frequencyHz} Hz outside curve coverage`)
  }
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

/**
 * Prepare normalization only for integrity hashing. No response metric is
 * calculated and normalized values are not used by selection.
 */
export function normalizeCurveForIntegrity(points, normalization = C4A_NORMALIZATION) {
  if (normalization.mode !== 'hz' || normalization.frequencyHz !== 500) {
    throw new Error('C4a normalization is frozen at 500 Hz')
  }
  const anchorDb = interpolateLogFrequency(points, normalization.frequencyHz)
  const normalizedPoints = points.map(([frequencyHz, db]) => [frequencyHz, db - anchorDb])
  if (normalizedPoints.some(([, db]) => !Number.isFinite(db))) {
    throw new Error('normalization: non-finite normalized point')
  }
  return { normalizedPoints, anchorDb }
}

function inferSide(sourceName, url) {
  const value = `${sourceName ?? ''} ${url ?? ''}`.trim()
  if (/(?:^|[ _-])L(?:\.[a-z0-9]+)?(?:\?|$)/i.test(value)) return 'left'
  if (/(?:^|[ _-])R(?:\.[a-z0-9]+)?(?:\?|$)/i.test(value)) return 'right'
  return 'unknown'
}

/** Parse upstream name_index.tsv while preserving exact model/rig strings. */
export function parseNameIndex(text, collection = '') {
  const lines = String(text).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n')
  const header = (lines.shift() ?? '').split('\t')
  if (header.slice(0, 5).join('\t') !== 'url\tsource_name\tname\tform\trig') {
    throw new Error(`metadata: unexpected name_index header for ${collection}`)
  }
  const rows = []
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue
    const columns = line.split('\t')
    if (columns.length < 5) throw new Error(`metadata: malformed row ${index + 2} for ${collection}`)
    const [url, sourceName, model, form, rig] = columns
    if (!model?.trim() || !rig?.trim()) continue
    rows.push({
      collection,
      rowNumber: index + 2,
      url,
      sourceName,
      model,
      form,
      rig,
      side: inferSide(sourceName, url),
    })
  }
  return rows
}

/**
 * Resolve a processed path against metadata using exact rig agreement when a
 * path-level rig exists. Parenthesis-stripped family lookup is intentionally
 * unavailable here.
 */
export function resolveMetadataStrict(processedName, pathRig, rows) {
  const nameMatches = rows.filter(
    (row) => row.form === C4A_FORM && canonicalCurveName(row.model) === canonicalCurveName(processedName),
  )
  const matches = pathRig === null || pathRig === undefined
    ? nameMatches
    : nameMatches.filter((row) => row.rig === pathRig)
  const keys = new Set(matches.map((row) => `${row.model}\u0000${row.rig}`))
  if (matches.length === 0) {
    return { status: 'unresolved', reason: pathRig ? 'NO_EXACT_RIG_MATCH' : 'NO_EXACT_METADATA_MATCH' }
  }
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
  // Preserve exact whitespace/punctuation distinctions for unsupported
  // aliases. A trim here would silently merge source strings such as
  // `GRAS 43AC` and `GRAS 43AC ` without source documentation.
  return String(rig).normalize('NFKD').toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Explicit rig policy. Exact metadata strings remain in the inventory. Only
 * the literal 711 is eligible for the C4 primary gate; aliases and other
 * fixtures stay distinct. Only an explicit Type 4.3 label is counted for
 * the later HF-capable side inventory, never for C4. RA0045 remains distinct
 * but is not treated as HF-capable without source documentation.
 */
export function classifyRig(rig) {
  const exact = String(rig)
  if (exact === '711') {
    return { exactRig: exact, rigClass: '711-class', primary711Eligible: true, hfCapable: false, mappingEvidence: 'exact upstream metadata string: 711' }
  }
  if (exact === 'GRAS RA0045') {
    return { exactRig: exact, rigClass: 'gras-ra0045', primary711Eligible: false, hfCapable: false, mappingEvidence: 'exact upstream metadata string: GRAS RA0045; capability not established by source metadata/documentation; kept separate from 711' }
  }
  if (exact === 'Type 4.3') {
    return { exactRig: exact, rigClass: 'type-4.3', primary711Eligible: false, hfCapable: true, mappingEvidence: 'exact upstream metadata string: Type 4.3' }
  }
  return {
    exactRig: exact,
    rigClass: normalizedRigClass(exact) || 'unclassified',
    primary711Eligible: false,
    hfCapable: false,
    mappingEvidence: 'distinct exact upstream metadata string; no equivalence inferred',
  }
}

function sourceRowsForIdentity(record) {
  return [...(record.sourceRows ?? [])].map((row) => ({
    rowNumber: row.rowNumber,
    url: row.url,
    sourceName: row.sourceName,
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

function compareRecords(left, right) {
  return `${recordIdentity(left)}|${left.path ?? ''}`.localeCompare(`${recordIdentity(right)}|${right.path ?? ''}`)
}

/** Count each collection once; L/R source rows never add independent members. */
export function countIndependentCollections(measurements, options = {}) {
  const collections = [...new Set(measurements.map((measurement) => measurement.collection))].sort()
  if (!options.details) return collections.length
  const counts = new Map()
  for (const measurement of measurements) counts.set(measurement.collection, (counts.get(measurement.collection) ?? 0) + 1)
  return {
    count: collections.length,
    collections,
    duplicateCollections: [...counts].filter(([, count]) => count > 1).map(([collection]) => collection).sort(),
  }
}

function groupRawMeasurements(measurements) {
  const groups = new Map()
  for (const measurement of measurements) {
    if (measurement.form !== undefined && measurement.form !== C4A_FORM) continue
    const deviceFamily = recordFamily(measurement)
    const configuration = recordConfiguration(measurement)
    const key = `${deviceFamily}\u0000${configuration}`
    const current = groups.get(key) ?? {
      groupKey: key,
      deviceFamily,
      configurationSignature: configuration,
      allMembers: [],
    }
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

function chooseOnePerCollection(measurements) {
  const byCollection = new Map()
  const ordered = [...measurements].sort((left, right) => (
    (left.integrityStatus === 'invalid' ? 1 : 0) - (right.integrityStatus === 'invalid' ? 1 : 0)
    || compareRecords(left, right)
  ))
  for (const measurement of ordered) {
    const current = byCollection.get(measurement.collection)
    if (current === undefined) byCollection.set(measurement.collection, measurement)
  }
  return [...byCollection.values()].sort(compareRecords)
}

/**
 * Group only by family + full configuration signature. Cross-rig members are
 * retained in allMembers for side inventory but cannot enter the C4 gate.
 */
export function groupEligibleMeasurements(measurements) {
  const groups = []
  for (const raw of groupRawMeasurements(measurements).values()) {
    const primaryCandidates = raw.allMembers.filter((member) => recordRigClass(member) === '711-class')
    const members = chooseOnePerCollection(primaryCandidates)
    const allByCollection = new Map()
    for (const member of raw.allMembers) {
      const current = allByCollection.get(member.collection) ?? []
      current.push(member)
      allByCollection.set(member.collection, current)
    }
    const duplicateCollections = [...allByCollection]
      .filter(([, values]) => values.length > 1)
      .map(([collection]) => collection)
      .sort()
    const independentCollections = members.map((member) => member.collection).sort()
    const ambiguous = raw.allMembers.some((member) => member.configurationStatus === 'CONFIGURATION_AMBIGUOUS')
    const validMembers = members.filter((member) => member.integrityStatus !== 'invalid')
    const independentMeasurementCount = countIndependentCollections(validMembers)
    const groupId = deriveGroupId(raw.deviceFamily, raw.configurationSignature)
    const selectionHash = stableHash(groupId, C4A_SELECTION_SEED)
    const reasons = []
    if (ambiguous) reasons.push('CONFIGURATION_AMBIGUOUS')
    if (members.length < C4A_MIN_INDEPENDENT_MEASUREMENTS) reasons.push('INDEPENDENT_MEASUREMENT_SHORTAGE')
    if (validMembers.length !== members.length) reasons.push('OBJECTIVE_CURVE_VALIDATION_FAILURE')
    groups.push({
      groupId,
      groupKey: `${raw.deviceFamily}|${raw.configurationSignature}`,
      deviceFamily: raw.deviceFamily,
      configurationSignature: raw.configurationSignature,
      allMembers: [...raw.allMembers].sort(compareRecords),
      members,
      validMembers,
      independentCollections,
      independentMeasurementCount,
      duplicateCollections,
      // The C4 gate is represented by `members`; cross-rig observations are
      // retained only for the independent side inventory below. Keeping the
      // two sets separate prevents a valid 711 group from appearing to mix
      // rigs in the frozen primary corpus.
      rigClasses: [...new Set(members.map((member) => recordRigClass(member)))].sort(),
      exactRigStrings: [...new Set(members.map((member) => member.rig))].sort(),
      allRigClasses: [...new Set(raw.allMembers.map((member) => recordRigClass(member)))].sort(),
      allExactRigStrings: [...new Set(raw.allMembers.map((member) => member.rig))].sort(),
      selectionHash,
      eligible: reasons.length === 0,
      exclusionReasons: reasons,
    })
  }
  return groups.toSorted((left, right) => left.groupId.localeCompare(right.groupId))
}

/** Prefer stronger repeated groups, then use only frozen hash order. */
export function selectSixGroups(groups) {
  return [...groups]
    .filter((group) => group.eligible)
    .toSorted((left, right) => (
      right.independentMeasurementCount - left.independentMeasurementCount
      || left.selectionHash.localeCompare(right.selectionHash)
      || left.groupId.localeCompare(right.groupId)
    ))
    .slice(0, C4A_REQUIRED_GROUPS)
}

export function splitDevelopmentHoldout(groups) {
  return [...groups]
    .toSorted((left, right) => {
      const leftHash = stableHash(left.groupId, C4A_SPLIT_SEED)
      const rightHash = stableHash(right.groupId, C4A_SPLIT_SEED)
      return leftHash.localeCompare(rightHash) || left.groupId.localeCompare(right.groupId)
    })
    .map((group, index) => ({ ...group, split: index < 3 ? 'development' : 'holdout', splitHash: stableHash(group.groupId, C4A_SPLIT_SEED) }))
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

/** Create the metadata-only member representation committed in groups.json. */
export function committedMember(record) {
  const result = {
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
    concreteCurveIdentity: recordIdentity(record),
    sourceRows: sourceRowsForIdentity(record),
    sourceUrls: sourceRowsForIdentity(record).map((row) => row.url).filter(Boolean),
    integrity: record.integrity,
  }
  return result
}

function groupForArtifact(group) {
  return {
    groupId: group.groupId,
    groupKey: group.groupKey,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    selectionHash: group.selectionHash,
    split: group.split,
    splitHash: group.splitHash,
    eligible: group.eligible,
    independentMeasurementCount: group.independentMeasurementCount,
    independentCollections: [...group.independentCollections].sort(),
    duplicateCollections: [...group.duplicateCollections].sort(),
    rigClasses: [...group.rigClasses].sort(),
    exactRigStrings: [...group.exactRigStrings].sort(),
    members: group.members.map(committedMember),
  }
}

function mapGroupKey(record) {
  return `${recordFamily(record)}\u0000${recordConfiguration(record)}`
}

export function buildCrossRigInventory(measurements) {
  const groups = new Map()
  for (const measurement of measurements) {
    const key = mapGroupKey(measurement)
    const current = groups.get(key) ?? {
      groupId: deriveGroupId(recordFamily(measurement), recordConfiguration(measurement)),
      deviceFamily: recordFamily(measurement),
      configurationSignature: recordConfiguration(measurement),
      members: [],
    }
    current.members.push(measurement)
    groups.set(key, current)
  }
  const crossRigGroups = [...groups.values()]
    .map((group) => {
      const rigClasses = [...new Set(group.members.map((member) => recordRigClass(member)))].sort()
      const exactRigs = [...new Set(group.members.map((member) => member.rig))].sort()
      const collections = [...new Set(group.members.map((member) => member.collection))].sort()
      return {
        groupId: group.groupId,
        deviceFamily: group.deviceFamily,
        configurationSignature: group.configurationSignature,
        collections,
        rigClasses,
        exactRigStrings: exactRigs,
        independentMeasurementCount: collections.length,
      }
    })
    .filter((group) => group.rigClasses.length >= 2)
    .toSorted((left, right) => left.groupId.localeCompare(right.groupId))
  return {
    groupCount: crossRigGroups.length,
    groupsWithAtLeast3IndependentMeasurements: crossRigGroups.filter((group) => group.independentMeasurementCount >= 3).length,
    collections: [...new Set(crossRigGroups.flatMap((group) => group.collections))].sort(),
    rigClasses: [...new Set(crossRigGroups.flatMap((group) => group.rigClasses))].sort(),
    exactRigStrings: [...new Set(crossRigGroups.flatMap((group) => group.exactRigStrings))].sort(),
    groups: crossRigGroups,
  }
}

export function buildHfCapableInventory(measurements) {
  const hfMeasurements = measurements.filter((measurement) => classifyRig(measurement.rig).hfCapable)
  const groups = new Map()
  for (const measurement of hfMeasurements) {
    const key = mapGroupKey(measurement)
    const current = groups.get(key) ?? {
      groupId: deriveGroupId(recordFamily(measurement), recordConfiguration(measurement)),
      deviceFamily: recordFamily(measurement),
      configurationSignature: recordConfiguration(measurement),
      members: [],
    }
    current.members.push(measurement)
    groups.set(key, current)
  }
  const repeatedSameRigGroups = [...groups.values()]
    .map((group) => {
      const exactRigStrings = [...new Set(group.members.map((member) => member.rig))].sort()
      const rigClasses = [...new Set(group.members.map((member) => recordRigClass(member)))].sort()
      const collections = [...new Set(group.members.map((member) => member.collection))].sort()
      return {
        groupId: group.groupId,
        deviceFamily: group.deviceFamily,
        configurationSignature: group.configurationSignature,
        exactRigStrings,
        rigClasses,
        collections,
        independentMeasurementCount: collections.length,
      }
    })
    .filter((group) => group.rigClasses.length === 1 && group.independentMeasurementCount >= 2)
    .toSorted((left, right) => left.groupId.localeCompare(right.groupId))
  return {
    curveCount: hfMeasurements.length,
    groupCount: groups.size,
    exactRigStrings: [...new Set(hfMeasurements.map((measurement) => measurement.rig))].sort(),
    rigClasses: [...new Set(hfMeasurements.map((measurement) => recordRigClass(measurement)))].sort(),
    repeatedSameRigGroupCount: repeatedSameRigGroups.length,
    repeatedSameRigGroups,
  }
}

export function buildRigInventory(metadataRows, records) {
  const byRig = new Map()
  for (const row of metadataRows.filter((candidate) => candidate.form === C4A_FORM)) {
    const current = byRig.get(row.rig) ?? { exactRig: row.rig, metadataRowCount: 0, collections: new Set(), examples: [] }
    current.metadataRowCount += 1
    current.collections.add(row.collection)
    if (current.examples.length < 3) current.examples.push({ collection: row.collection, model: row.model, sourceName: row.sourceName })
    byRig.set(row.rig, current)
  }
  for (const record of records) {
    const current = byRig.get(record.rig) ?? { exactRig: record.rig, metadataRowCount: 0, collections: new Set(), examples: [] }
    current.processedCurveCount = (current.processedCurveCount ?? 0) + 1
    current.collections.add(record.collection)
    byRig.set(record.rig, current)
  }
  const rigs = [...byRig.values()].map((entry) => {
    const classification = classifyRig(entry.exactRig)
    return {
      ...entry,
      ...classification,
      collections: [...entry.collections].sort(),
      examples: entry.examples,
    }
  }).toSorted((left, right) => left.exactRig.localeCompare(right.exactRig))
  return {
    schemaVersion: 1,
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

/** Hash named evidence files with path framing, matching prior research artifacts. */
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

/** Validate committed metadata/provenance without reading or needing raw bytes. */
export function validateCorpusProvenance({ manifest, groups, provenance, artifactFiles }) {
  if (!manifest || !groups || !provenance) throw new Error('provenance: incomplete artifact bundle')
  if (manifest.upstream?.repository !== UPSTREAM_REPOSITORY || manifest.upstream?.commit !== UPSTREAM_COMMIT || manifest.upstream?.tree !== UPSTREAM_TREE) {
    throw new Error('provenance: upstream identity mismatch')
  }
  if (manifest.frozenBoundary !== FROZEN_BOUNDARY || provenance.frozenBoundary !== FROZEN_BOUNDARY) {
    throw new Error('provenance: frozen boundary mismatch')
  }
  if (provenance.upstream?.repository !== UPSTREAM_REPOSITORY || provenance.upstream?.commit !== UPSTREAM_COMMIT || provenance.upstream?.tree !== UPSTREAM_TREE) {
    throw new Error('provenance: provenance upstream identity mismatch')
  }
  if (manifest.solverExecuted === true || manifest.autoEqSolverExecuted === true || manifest.consensusAlgorithmExecuted === true || manifest.rawMeasurementsCommitted === true) {
    throw new Error('provenance: forbidden outcome or raw measurement evidence')
  }
  if (provenance.solverExecuted === true || provenance.autoEqSolverExecuted === true || provenance.consensusAlgorithmExecuted === true) {
    throw new Error('provenance: forbidden execution flag')
  }
  const groupIds = groups.map((group) => group.groupId)
  if (new Set(groupIds).size !== groupIds.length) throw new Error('provenance: duplicate group identity')
  if (groups.length > C4A_REQUIRED_GROUPS) throw new Error('provenance: more than six selected groups')
  if (manifest.classification === 'C4_CORPUS_READY' && groups.length !== C4A_REQUIRED_GROUPS) {
    throw new Error('provenance: ready classification requires six selected groups')
  }
  const selectedGroupIds = manifest.selection?.selectedGroupIds
  if (Array.isArray(selectedGroupIds) && JSON.stringify(selectedGroupIds) !== JSON.stringify(groupIds)) {
    throw new Error('provenance: manifest selected-group identity mismatch')
  }
  const provenanceSelectedGroupIds = provenance.selectedGroupIds
  if (Array.isArray(provenanceSelectedGroupIds) && JSON.stringify(provenanceSelectedGroupIds) !== JSON.stringify(groupIds)) {
    throw new Error('provenance: provenance selected-group identity mismatch')
  }
  if (groups.length === C4A_REQUIRED_GROUPS && manifest.classification === 'C4_CORPUS_READY') {
    const development = groups.filter((group) => group.split === 'development')
    const holdout = groups.filter((group) => group.split === 'holdout')
    if (development.length !== 3 || holdout.length !== 3) throw new Error('provenance: development/holdout split is not 3/3')
    if (new Set([...development, ...holdout].map((group) => group.groupId)).size !== groups.length) {
      throw new Error('provenance: development/holdout overlap')
    }
    const developmentIds = development.map((group) => group.groupId)
    const holdoutIds = holdout.map((group) => group.groupId)
    if (Array.isArray(manifest.selection?.developmentGroupIds) && JSON.stringify(manifest.selection.developmentGroupIds) !== JSON.stringify(developmentIds)) {
      throw new Error('provenance: manifest development-group identity mismatch')
    }
    if (Array.isArray(manifest.selection?.holdoutGroupIds) && JSON.stringify(manifest.selection.holdoutGroupIds) !== JSON.stringify(holdoutIds)) {
      throw new Error('provenance: manifest holdout-group identity mismatch')
    }
  }
  const provenanceMembers = Array.isArray(provenance.members)
    ? provenance.members
    : Object.values(provenance.members ?? {})
  const memberIds = groups.flatMap((group) => {
    const members = group.members ?? []
    if (group.eligible === false) throw new Error(`provenance: ineligible selected group ${group.groupId}`)
    if (group.independentMeasurementCount !== undefined && group.independentMeasurementCount < C4A_MIN_INDEPENDENT_MEASUREMENTS) {
      throw new Error(`provenance: group ${group.groupId} has fewer than three independent measurements`)
    }
    if (group.independentMeasurementCount !== undefined && group.independentMeasurementCount !== members.length) {
      throw new Error(`provenance: group ${group.groupId} member/count mismatch`)
    }
    const collections = new Set(members.map((member) => member.collection))
    if (collections.size !== members.length) throw new Error(`provenance: duplicate collection in group ${group.groupId}`)
    if (members.some((member) => member.rigClass !== undefined && member.rigClass !== '711-class')) {
      throw new Error(`provenance: non-711 member in primary group ${group.groupId}`)
    }
    if (members.some((member) => member.form !== undefined && member.form !== C4A_FORM)) {
      throw new Error(`provenance: non-in-ear member in group ${group.groupId}`)
    }
    return members.map((member) => member.concreteCurveIdentity)
  })
  if (new Set(memberIds).size !== memberIds.length) throw new Error('provenance: duplicate member identity')
  const provenanceIds = provenanceMembers.map((member) => member.concreteCurveIdentity ?? member.identity)
  for (const identity of memberIds) {
    if (!provenanceIds.includes(identity)) throw new Error(`provenance: missing member ${identity}`)
  }
  if (artifactFiles && manifest.artifactFileHashes) {
    for (const [relativePath, expected] of Object.entries(manifest.artifactFileHashes)) {
      assertHash(hashEvidenceFiles(artifactFiles, [relativePath]), expected, relativePath)
    }
  }
  return true
}

export function assertC4aNoOutcomeEvidence(manifest) {
  if (manifest.consensusAlgorithmExecuted || manifest.autoEqSolverExecuted || manifest.solverExecuted) {
    throw new Error('C4a outcome evidence is forbidden')
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
    if (bytes.length > 0 && (!expectedBlobSha || gitBlobSha1(bytes) === expectedBlobSha)) {
      return { bytes, sha256: sha256(bytes), byteLength: bytes.length, cachePath }
    }
  } catch {}
  const response = await fetchImpl(rawUrl(path), { redirect: 'error' })
  if (!response.ok) throw new Error(`upstream raw ${response.status}: ${rawUrl(path)}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error(`upstream raw empty: ${path}`)
  if (expectedBlobSha && gitBlobSha1(bytes) !== expectedBlobSha) {
    throw new Error(`upstream raw blob SHA-1 mismatch: ${path}`)
  }
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(cachePath, bytes)
  return { bytes, sha256: sha256(bytes), byteLength: bytes.length, cachePath }
}

async function verifyPinnedUpstream(fetchImpl, cacheRoot) {
  const commit = await fetchJson(fetchImpl, apiUrl(`/git/commits/${UPSTREAM_COMMIT}`), cacheRoot)
  if (commit.sha !== UPSTREAM_COMMIT || commit.tree?.sha !== UPSTREAM_TREE) {
    throw new Error('pinned upstream commit/tree mismatch')
  }
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

async function inventoryUpstream({ fetchImpl, cacheRoot }) {
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
    const collection = collectionEntry.path.startsWith('measurements/')
      ? collectionEntry.path.slice('measurements/'.length)
      : collectionEntry.path
    const collectionTree = await fetchJson(fetchImpl, apiUrl(`/git/trees/${collectionEntry.sha}?recursive=1`), cacheRoot)
    if (collectionTree.sha !== collectionEntry.sha || !Array.isArray(collectionTree.tree) || collectionTree.truncated === true) {
      throw new Error(`pinned collection tree mismatch or truncation: ${collection}`)
    }
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
    const collectionAudit = {
      metadataRows: metadataRows.length,
      processedInEarCurves: files.length,
      resolved: 0,
      unresolved: 0,
      ambiguous: 0,
    }
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
      const record = {
        collection,
        form: C4A_FORM,
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
        concreteCurveIdentity: deriveConcreteCurveIdentity({ collection, form: C4A_FORM, rig: metadata.rig, processedName }),
        integrityStatus: 'unchecked',
      }
      records.push(record)
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

async function validateCandidateCurves(records, fetchImpl, cacheRoot) {
  const candidates = [...new Set(records.filter((record) => record.rigClass === '711-class').map((record) => record.upstreamPath))]
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
        normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
        parserCanonicalizerVersion: 1,
      })
    } catch (error) {
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
  for (const group of groups) result[String(group.independentMeasurementCount)] = (result[String(group.independentMeasurementCount)] ?? 0) + 1
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
  }))
}

function protocolText() {
  return `# C4a corpus/inventory selection protocol

This is a metadata, parsing, coverage, normalization-integrity, and provenance milestone only. No consensus estimator, peak matcher, prediction error, filter synthesis, or AutoEQ solver is part of this protocol.

## Immutable source

- Repository: \`${UPSTREAM_REPOSITORY}\`
- Commit: \`${UPSTREAM_COMMIT}\`
- Commit tree: \`${UPSTREAM_TREE}\`
- All API/tree and raw URLs include the immutable commit/tree identifiers. No branch URL or full clone is used.
- Raw upstream bytes are cached only below \`${C4A_CACHE_RELATIVE_DIR}/\`; no bytes are committed.

## Domain and identity

- Form is exactly \`${C4A_FORM}\`.
- V2 coverage is \`[20, 20000]\` Hz and the terminal endpoint closure is unchanged: when the final observed point is below 20000 Hz but at or above the penultimate V2 grid point, append exactly \`[20000, lastObservedDb]\`. No other extrapolation is allowed.
- Every member retains collection, form, exact upstream rig string, exact processed name, variant qualifiers, path, blob SHA, and source metadata rows.
- Device-family identity is separate from \`configurationSignature\`. The latter is the canonical full processed name; parenthetical qualifiers are never removed for metadata lookup or grouping.
- An unresolved or conflicting configuration is excluded as \`CONFIGURATION_AMBIGUOUS\`; frequency-response similarity is never used to resolve it.

## Repeated-measurement gate

1. Enumerate every pinned in-ear processed CSV and strict-resolve it against its collection's \`name_index.tsv\`.
2. Derive \`deviceFamily + configurationSignature\`, exact collection, and explicit rig class.
3. Group by \`deviceFamily + configurationSignature\`; count each collection at most once. L/R source rows and multiple files in one collection do not add independent measurements.
4. The primary gate admits only the exact upstream rig string \`711\` (class \`711-class\`). Other rig strings remain distinct even when their names contain 711.
5. Objective finite/order/coverage parsing and 500 Hz normalization-integrity hashing are performed without inspecting response morphology.
6. Retain groups with at least ${C4A_MIN_INDEPENDENT_MEASUREMENTS} independent 711-class collections.
7. Rank eligible groups by independent count descending, then SHA-256 of \`${C4A_SELECTION_SEED}\` plus the stable group identity, then group ID. Select the first ${C4A_REQUIRED_GROUPS}; no device popularity or curve shape enters selection.
8. Hash each frozen group ID with split seed \`${C4A_SPLIT_SEED}\`, sort by that hash, and assign the first three development and last three holdout.

## Why C4 precedes C1

The project knowledge base records increasing treble dispersion across repeated 711 measurements and horizontally shifted high-frequency resonances. Pointwise aggregation can turn that horizontal shift into apparent amplitude disagreement. C4 therefore establishes whether peak-aligned consensus materially changes repeatability before any C1 confidence weighting is designed.

## Side inventories

Cross-rig repeats and exact Type 4.3/HF-capable strings are reported separately. They cannot contribute to the C4 primary gate and are not used for confidence weighting or any outcome analysis.

## Frozen boundary

- Upstream audited boundary: \`${FROZEN_BOUNDARY}\`
- C2 evidence SHA-256: \`${C2_FINAL_EVIDENCE_SHA256}\`
- C2 interpretation: \`${C2_FINAL_INTERPRETATION}\`
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

/**
 * Acquire, validate, and freeze C4a metadata. This function intentionally has
 * no import or call path into packages/core/src or any AutoEQ solver.
 */
export async function runC4a(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('C4a requires fetch')
  const cacheRoot = options.cacheRoot ?? resolve(root, C4A_CACHE_RELATIVE_DIR)
  const outputDir = options.outputDir ?? resolve(root, C4A_ARTIFACT_RELATIVE_DIR)
  const inventory = await inventoryUpstream({ fetchImpl, cacheRoot })
  const validatedRecords = await validateCandidateCurves(inventory.records, fetchImpl, cacheRoot)
  const groups = groupEligibleMeasurements(validatedRecords)
  const eligibleGroups = groups.filter((group) => group.eligible)
  const selectedGroups = splitDevelopmentHoldout(selectSixGroups(eligibleGroups))
  const classification = selectedGroups.length === C4A_REQUIRED_GROUPS ? 'C4_CORPUS_READY' : 'C4_CORPUS_INSUFFICIENT'
  const shortage = Math.max(0, C4A_REQUIRED_GROUPS - eligibleGroups.length)
  const crossRig = buildCrossRigInventory(metadataOnlyRecords(inventory.records))
  const hfCapable = buildHfCapableInventory(metadataOnlyRecords(inventory.records))
  const rigInventory = buildRigInventory(inventory.allMetadataRows, inventory.records)
  const selectedArtifactGroups = selectedGroups.map(groupForArtifact)
  const selectedMembers = selectedArtifactGroups.flatMap((group) => group.members)
  const provenance = {
    schemaVersion: C4A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C4A_CORPUS_VERSION,
    frozenBoundary: FROZEN_BOUNDARY,
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    rawDataPolicy: 'external immutable raw source plus ignored local cache only; no upstream measurement bytes committed',
    members: selectedMembers,
    selectedGroupIds: selectedArtifactGroups.map((group) => group.groupId),
    metadataAudit: inventory.audit,
    objectiveValidationPerformed: true,
    consensusAlgorithmExecuted: false,
    autoEqSolverExecuted: false,
  }
  const groupsArtifact = {
    schemaVersion: C4A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C4A_CORPUS_VERSION,
    form: C4A_FORM,
    selectionSeed: C4A_SELECTION_SEED,
    splitSeed: C4A_SPLIT_SEED,
    requiredGroupCount: C4A_REQUIRED_GROUPS,
    minimumIndependentMeasurements: C4A_MIN_INDEPENDENT_MEASUREMENTS,
    groups: selectedArtifactGroups,
  }
  const protocol = protocolText()
  // These payloads exclude manifest.json to avoid a self-referential hash.
  // Their framed hashes let a later read-only verifier detect artifact drift.
  const artifactPayloads = new Map([
    ['groups.json', jsonText(groupsArtifact)],
    ['provenance.json', jsonText(provenance)],
    ['rig-inventory.json', jsonText(rigInventory)],
    ['selection-protocol.md', protocol],
  ])
  const artifactFileHashes = Object.fromEntries(
    [...artifactPayloads.keys()].map((relativePath) => [
      relativePath,
      hashEvidenceFiles(artifactPayloads, [relativePath]),
    ]),
  )
  const manifest = {
    schemaVersion: C4A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C4A_CORPUS_VERSION,
    milestone: 'C4a-corpus-inventory-only',
    classification,
    shortage,
    frozenBoundary: FROZEN_BOUNDARY,
    c2: { finalEvidenceSha256: C2_FINAL_EVIDENCE_SHA256, finalInterpretation: C2_FINAL_INTERPRETATION },
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    domain: {
      form: C4A_FORM,
      v2MinHz: C4A_V2_MIN_HZ,
      v2MaxHz: C4A_V2_MAX_HZ,
      normalization: C4A_NORMALIZATION,
      terminalClosure: 'terminal-flat-hold-to-v2-max',
    },
    selection: {
      seed: C4A_SELECTION_SEED,
      splitSeed: C4A_SPLIT_SEED,
      requiredGroupCount: C4A_REQUIRED_GROUPS,
      minimumIndependentMeasurements: C4A_MIN_INDEPENDENT_MEASUREMENTS,
      eligibleRepeatedDeviceGroupCount: eligibleGroups.length,
      eligibleGroupCountByIndependentMeasurements: histogram(eligibleGroups),
      selectedGroupIds: selectedArtifactGroups.map((group) => group.groupId),
      developmentGroupIds: selectedArtifactGroups.filter((group) => group.split === 'development').map((group) => group.groupId),
      holdoutGroupIds: selectedArtifactGroups.filter((group) => group.split === 'holdout').map((group) => group.groupId),
    },
    inventory: {
      processedInEarCurveCount: inventory.audit.eligibleBeforeStrictResolution,
      strictResolvedCurveCount: inventory.audit.eligibleAfterStrictResolution,
      primary711CurveCount: inventory.records.filter((record) => record.rigClass === '711-class').length,
      selectedMemberCount: selectedMembers.length,
    },
    metadataAudit: inventory.audit,
    crossRigSideInventory: {
      groupCount: crossRig.groupCount,
      groupsWithAtLeast3IndependentMeasurements: crossRig.groupsWithAtLeast3IndependentMeasurements,
      collections: crossRig.collections,
      rigClasses: crossRig.rigClasses,
      exactRigStrings: crossRig.exactRigStrings,
    },
    hfCapableSideInventory: {
      curveCount: hfCapable.curveCount,
      groupCount: hfCapable.groupCount,
      exactRigStrings: hfCapable.exactRigStrings,
      rigClasses: hfCapable.rigClasses,
      repeatedSameRigGroupCount: hfCapable.repeatedSameRigGroupCount,
    },
    flags: {
      consensusAlgorithmExecuted: false,
      autoEqSolverExecuted: false,
      rawMeasurementsCommitted: false,
      objectiveResponseOutcomeObserved: false,
    },
    solverExecuted: false,
    autoEqSolverExecuted: false,
    consensusAlgorithmExecuted: false,
    rawMeasurementsCommitted: false,
    hashes: {
      groupsSha256: sha256(JSON.stringify(groupsArtifact)),
      provenanceSha256: sha256(JSON.stringify(provenance)),
      rigInventorySha256: sha256(JSON.stringify(rigInventory)),
      selectionProtocolSha256: sha256(protocol),
    },
    artifactFileHashes,
  }
  await mkdir(outputDir, { recursive: true })
  for (const [relativePath, payload] of artifactPayloads) {
    await writeFile(resolve(outputDir, relativePath), payload, 'utf8')
  }
  await writeJson(resolve(outputDir, 'manifest.json'), manifest)
  const evidenceSha256 = hashEvidenceFiles(outputDir, ['groups.json', 'manifest.json', 'provenance.json', 'rig-inventory.json', 'selection-protocol.md'])
  await writeFile(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`, 'utf8')
  const result = {
    classification,
    shortage,
    evidenceSha256,
    manifest,
    groups: groupsArtifact,
    provenance,
    rigInventory,
    crossRigSideInventory: crossRig,
    hfCapableSideInventory: hfCapable,
    eligibleGroups,
  }
  validateCorpusProvenance({ manifest, groups: selectedArtifactGroups, provenance, artifactFiles: outputDir })
  return result
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC4a()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({
        classification: result.classification,
        shortage: result.shortage,
        evidenceSha256: result.evidenceSha256,
        eligibleRepeatedDeviceGroups: result.eligibleGroups.length,
        selectedGroupIds: result.groups.groups.map((group) => group.groupId),
      }, null, 2)}\n`)
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
