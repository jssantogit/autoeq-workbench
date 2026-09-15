import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  C1A_FORM,
  C1A_NORMALIZATION,
  C1A_PRIMARY_RIG,
  C4C_FINAL_EVIDENCE_SHA256,
  C4_FINAL_INTERPRETATION,
  FROZEN_BOUNDARY,
  UPSTREAM_COMMIT,
  UPSTREAM_REPOSITORY,
  UPSTREAM_TREE,
  C1A_V2_MAX_HZ,
  C1A_V2_MIN_HZ,
  C1A_V2_POINTS_PER_OCTAVE,
  canonicalizeTerminalEndpoint,
  classifyRig,
  normalizeCurveForIntegrity,
  parseCurveCsv,
  sha256,
  v2EvaluationGrid as frozenV2EvaluationGrid,
} from '../c1-cross-rig-confidence-corpus/c1a.mjs'

export const C1B_ALGORITHM_VERSION = 'c1-confidence-targeting-v1'
export const C1B_PROTOCOL_SCHEMA_VERSION = 1
export const C1B_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1-confidence-targeting-dev'
export const C1B_CACHE_RELATIVE_DIR = '.research-cache/c1-confidence-targeting-dev'
export const C1B_FORM = C1A_FORM
export const C1B_V2_MIN_HZ = C1A_V2_MIN_HZ
export const C1B_V2_MAX_HZ = C1A_V2_MAX_HZ
export const C1B_V2_POINTS_PER_OCTAVE = C1A_V2_POINTS_PER_OCTAVE
export const C1B_NORMALIZATION = Object.freeze({ ...C1A_NORMALIZATION })
export const C1B_PRIMARY_BAND_HZ = Object.freeze([4_000, 14_000])
export const C1B_TARGET_SCALE_DB = 0.75
export const C1B_TARGETING_THRESHOLD = 0.05
export const C1B_MIN_CLASS_GROUPS = 2
export const C1B_REQUIRED_DEVELOPMENT_GROUPS = 6

// These IDs are the repaired C1a V1.1 selection at the protocol boundary. A
// runner must assert them before acquiring a response; synthetic tests may use
// arbitrary IDs with the pure calculation functions.
export const DEVELOPMENT_GROUP_IDS = Object.freeze([
  'c1g-c4cd2c0381c89a1e9911',
  'c1g-106abf02ed8b580831bd',
  'c1g-5fe954a9babbe4c5cda0',
  'c1g-0a8d256822943d659136',
  'c1g-20fa430247872858b84b',
  'c1g-3579b4e7c8f794efd07a',
])
export const HOLDOUT_GROUP_IDS = Object.freeze([
  'c1g-ebdb284a8c7563a12c5f',
  'c1g-3f4de360d87a28aea240',
  'c1g-f2a43144c5936389d89d',
  'c1g-8bd11cb5d7772ff2165b',
  'c1g-6c369c990dd73512951b',
  'c1g-dc1ade324d0c4b3192d6',
])

export const PHASE0_CORPUS_COMMIT = '28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a'
export const PHASE0_EVIDENCE_SHA256 = 'a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43'
export const BATCH_C_REJECTION_TOKEN = 'fresh-real-corpus-v1.2:Batch C'
export const FRESH_REAL_BATCH_C_REJECTED = true

/** Verify both immutable upstream identity hashes before curve parsing. */
export function gitBlobSha1(value) {
  const bytes = Buffer.from(value)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export function verifyRawProvenance(bytes, { expectedSha256, expectedBlobSha } = {}) {
  const rawBytes = Buffer.from(bytes)
  if (rawBytes.length === 0) throw new Error('raw provenance bytes are empty')
  const actualSha256 = sha256(rawBytes)
  const actualBlobSha = gitBlobSha1(rawBytes)
  if (expectedSha256 && actualSha256 !== expectedSha256) throw new Error(`raw provenance SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`)
  if (expectedBlobSha && actualBlobSha !== expectedBlobSha) throw new Error(`raw provenance Git blob SHA-1 mismatch: expected ${expectedBlobSha}, got ${actualBlobSha}`)
  return { sha256: actualSha256, blobSha: actualBlobSha, byteLength: rawBytes.length }
}

export const verifyPinnedRawBytes = verifyRawProvenance
export const parseCurve = parseCurveCsv

export const CONFIDENCE_TARGETING_WIN = 'CONFIDENCE_TARGETING_WIN'
export const CONFIDENCE_TARGETING_LOSS = 'CONFIDENCE_TARGETING_LOSS'
export const CONFIDENCE_TARGETING_SIGNAL = 'CONFIDENCE_TARGETING_SIGNAL'
export const NO_CONFIDENCE_TARGETING_SIGNAL = 'NO_CONFIDENCE_TARGETING_SIGNAL'
export const CONFIDENCE_TARGETING_DEV_SUPPORTED = 'CONFIDENCE_TARGETING_DEV_SUPPORTED'
export const CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED = 'CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED'
export const INCONCLUSIVE = 'INCONCLUSIVE'

export const DIAGNOSTIC_BANDS_HZ = Object.freeze([
  Object.freeze({ id: '20-500Hz', minHz: 20, maxHz: 500 }),
  Object.freeze({ id: '500-1kHz', minHz: 500, maxHz: 1_000 }),
  Object.freeze({ id: '1-2kHz', minHz: 1_000, maxHz: 2_000 }),
  Object.freeze({ id: '2-4kHz', minHz: 2_000, maxHz: 4_000 }),
  Object.freeze({ id: '4-6kHz', minHz: 4_000, maxHz: 6_000 }),
  Object.freeze({ id: '6-8kHz', minHz: 6_000, maxHz: 8_000 }),
  Object.freeze({ id: '8-10kHz', minHz: 8_000, maxHz: 10_000 }),
  Object.freeze({ id: '10-14kHz', minHz: 10_000, maxHz: 14_000 }),
  Object.freeze({ id: '14-20kHz', minHz: 14_000, maxHz: 20_000 }),
])

const EPSILON = 1e-12

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function assertPositive(value, label) {
  assertFinite(value, label)
  if (value <= 0) throw new Error(`${label} must be positive`)
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('median requires at least one value')
  const ordered = values.map(Number).sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2
}

export const medianValue = median

function unpackCurve(curve) {
  if (typeof curve === 'string') return parseCurveCsv(curve)
  if (Array.isArray(curve)) {
    return curve.map((point) => {
      if (!Array.isArray(point) || point.length < 2) throw new Error('curve point must contain frequency and dB')
      return [Number(point[0]), Number(point[1])]
    })
  }
  if (!curve || typeof curve !== 'object') throw new Error('curve must be an array, CSV string, or curve object')
  if (Array.isArray(curve.points)) return unpackCurve(curve.points)
  const frequencies = curve.frequenciesHz ?? curve.frequencies
  const values = curve.valuesDb ?? curve.values
  if (!Array.isArray(frequencies) || !Array.isArray(values) || frequencies.length !== values.length) {
    throw new Error('curve requires equal frequency and dB arrays')
  }
  return frequencies.map((frequency, index) => [Number(frequency), Number(values[index])])
}

function pointsFromCurve(curve, label = 'curve') {
  const points = unpackCurve(curve)
  if (!Array.isArray(points) || points.length < 2) throw new Error(`${label} requires at least two points`)
  for (let index = 0; index < points.length; index += 1) {
    const [frequency, value] = points[index]
    assertPositive(frequency, `${label} frequency`)
    assertFinite(value, `${label} dB`)
    if (index > 0 && points[index - 1][0] >= frequency) throw new Error(`${label} frequencies must be strictly increasing`)
  }
  return points
}

function curveFromPoints(points, metadata = {}) {
  const valuesDb = points.map(([, value]) => value)
  return {
    ...metadata,
    points: points.map((point) => [...point]),
    frequenciesHz: points.map(([frequency]) => frequency),
    valuesDb,
    values: [...valuesDb],
  }
}

function assertCommonGrid(curves, label = 'curves') {
  if (!Array.isArray(curves) || curves.length === 0) throw new Error(`${label} requires at least one curve`)
  const first = pointsFromCurve(curves[0], `${label}[0]`)
  const allPoints = curves.map((curve, index) => pointsFromCurve(curve, `${label}[${index}]`))
  for (const points of allPoints) {
    if (points.length !== first.length || points.some(([frequency], index) => frequency !== first[index][0])) {
      throw new Error(`${label} require a common frequency grid`)
    }
  }
  return { first, allPoints }
}

function interpolateLogValue(points, frequencyHz) {
  assertPositive(frequencyHz, 'interpolation frequency')
  const first = points[0]
  const last = points.at(-1)
  if (frequencyHz < first[0] - EPSILON || frequencyHz > last[0] + EPSILON) {
    throw new Error(`curve source coverage does not include ${frequencyHz} Hz`)
  }
  if (Math.abs(frequencyHz - first[0]) <= EPSILON) return first[1]
  if (Math.abs(frequencyHz - last[0]) <= EPSILON) return last[1]
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle][0] <= frequencyHz) low = middle
    else high = middle
  }
  const left = points[low]
  const right = points[high]
  const ratio = Math.log2(frequencyHz / left[0]) / Math.log2(right[0] / left[0])
  const value = left[1] + ratio * (right[1] - left[1])
  assertFinite(value, 'interpolated dB')
  return value
}

/** Return a fresh copy of the frozen 20–20,000 Hz normal V2 grid. */
export function v2EvaluationGrid() {
  return [...frozenV2EvaluationGrid()]
}

export const evaluationGrid = v2EvaluationGrid
export const v2EvaluationGridC1b = v2EvaluationGrid

/**
 * Reacquire/parse, terminal-close, sample on the normal V2 grid, and subtract
 * the 500-Hz anchor. This is deliberately the only preparation transform:
 * no smoothing and no peak alignment are performed.
 */
export function prepareCurve(input, metadata = {}) {
  const source = pointsFromCurve(input, 'source curve')
  if (source[0][0] > C1B_V2_MIN_HZ) throw new Error('curve coverage is missing V2 minimum')
  const closed = canonicalizeTerminalEndpoint(source)
  if (closed.points.at(-1)[0] < C1B_V2_MAX_HZ) throw new Error('curve coverage is missing V2 maximum')
  // Reuse the frozen normalization implementation for the anchor validation;
  // sampling below keeps the output on the exact normal V2 grid.
  const normalizedSource = normalizeCurveForIntegrity(closed.points)
  const anchorDb = normalizedSource.anchorDb
  const grid = v2EvaluationGrid()
  const sampled = grid.map((frequencyHz) => [frequencyHz, interpolateLogValue(closed.points, frequencyHz) - anchorDb])
  return curveFromPoints(sampled, {
    ...metadata,
    normalization: { ...C1B_NORMALIZATION },
    sourceCoverage: {
      originalFirstFrequencyHz: source[0][0],
      originalTerminalFrequencyHz: source.at(-1)[0],
      originalTerminalDb: source.at(-1)[1],
      canonicalTerminalFrequencyHz: closed.points.at(-1)[0],
      canonicalTerminalDb: closed.points.at(-1)[1],
      transformation: closed.transformation,
    },
    originalPointsSha256: sha256(JSON.stringify(source)),
    canonicalPointsSha256: sha256(JSON.stringify(closed.points)),
    normalizedPointsSha256: sha256(JSON.stringify(normalizedSource.normalizedPoints)),
    normalizationAnchorDb: anchorDb,
    method: 'V2_PREPARED_NO_SMOOTHING_NO_ALIGNMENT',
    smoothing: false,
    peakAlignment: false,
  })
}

export const prepareV2Curve = prepareCurve
export const prepareMeasurement = prepareCurve

/** Pointwise median on a common grid; no smoothing, alignment, or weighting. */
export function pointwiseMedian(curves) {
  const { first, allPoints } = assertCommonGrid(curves, 'pointwise median')
  return curveFromPoints(first.map(([frequency], index) => [frequency, median(allPoints.map((points) => points[index][1]))]), {
    method: 'POINTWISE_MEDIAN_711',
    smoothing: false,
    peakAlignment: false,
    weighting: false,
  })
}

export const pointwiseMedianConsensus = pointwiseMedian
export const consensus711 = pointwiseMedian

/** sigma_g(f) = 1.4826 * median_i(abs(x_i(f) - C_g(f))). */
export function calculateRepeatabilitySigma(curves) {
  const { first, allPoints } = assertCommonGrid(curves, 'repeatability sigma')
  const consensus = first.map(([,], index) => median(allPoints.map((points) => points[index][1])))
  const values = first.map(([frequency], index) => [
    frequency,
    1.4826 * median(allPoints.map((points) => Math.abs(points[index][1] - consensus[index]))),
  ])
  return curveFromPoints(values, {
    method: 'REPEATABILITY_SIGMA_711',
    scale: 1.4826,
    consensusMethod: 'POINTWISE_MEDIAN_711',
  })
}

export const repeatabilitySigma = calculateRepeatabilitySigma
export const robustSigmaProfile = calculateRepeatabilitySigma

/** D = R_non711 - C_711 and A = abs(D), with no response-derived filtering. */
export function calculateCrossRigDisagreement(rigCurve, consensusCurve, metadata = {}) {
  const { first: consensus, allPoints: [, rig] } = assertCommonGrid([consensusCurve, rigCurve], 'cross-rig disagreement')
  const deltaDb = consensus.map(([,], index) => rig[index][1] - consensus[index][1])
  return {
    ...metadata,
    frequenciesHz: consensus.map(([frequency]) => frequency),
    deltaDb,
    absoluteDeltaDb: deltaDb.map(Math.abs),
    D: [...deltaDb],
    A: deltaDb.map(Math.abs),
    method: 'SAME_IEM_CROSS_RIG_DISAGREEMENT',
  }
}

export const crossRigDisagreement = calculateCrossRigDisagreement
export const calculateDisagreement = calculateCrossRigDisagreement

function memberCurve(member) {
  return member?.preparedCurve ?? member?.curve ?? member?.response ?? member
}

function memberIdentity(member, fallback = '') {
  return member?.concreteCurveIdentity ?? member?.id ?? fallback
}

function memberRigClass(member) {
  if (member?.rigClass) return String(member.rigClass)
  if (member?.rig !== undefined) return classifyRig(member.rig).rigClass
  throw new Error('member is missing rig class')
}

function isExact711Member(member) {
  // Exact literal identity is intentional: aliases are never merged into 711.
  return member?.rig === C1A_PRIMARY_RIG && memberRigClass(member) === '711-class'
}

function groupMembers(group) {
  if (!group || typeof group !== 'object') throw new Error('group is required')
  if (!group.groupId) throw new Error('group is missing groupId')
  const all = Array.isArray(group.members) ? group.members : null
  const exact = Array.isArray(group.exact711Members)
    ? [...group.exact711Members]
    : (all ? all.filter(isExact711Member) : [])
  const non711 = Array.isArray(group.eligibleNon711Members)
    ? [...group.eligibleNon711Members]
    : (Array.isArray(group.non711Members) ? [...group.non711Members] : (all ? all.filter((member) => !isExact711Member(member)) : []))
  if (exact.length < 1) throw new Error(`group ${group.groupId} has no exact-711 members`)
  if (non711.length < 1) throw new Error(`group ${group.groupId} has no non-711 members`)
  for (const member of exact) {
    if (!isExact711Member(member)) throw new Error(`group ${group.groupId} contains a non-exact member in exact-711 set`)
  }
  for (const member of non711) {
    if (isExact711Member(member)) throw new Error(`group ${group.groupId} contains exact 711 member in non-711 set`)
  }
  return { exact, non711 }
}

function profileCurve(values, frequenciesHz, metadata = {}) {
  assertCommonGrid([{ frequenciesHz, valuesDb: values }], 'profile')
  if (values.some((value) => !Number.isFinite(value))) throw new Error('profile contains non-finite uncertainty')
  return curveFromPoints(frequenciesHz.map((frequency, index) => [frequency, values[index]]), metadata)
}

function hashProfile(profile) {
  return hashJson({ frequenciesHz: profile.frequenciesHz, valuesDb: profile.valuesDb })
}

function buildGroupReference(group) {
  const { exact, non711 } = groupMembers(group)
  const consensus = pointwiseMedian(exact.map(memberCurve))
  const sigma = calculateRepeatabilitySigma(exact.map(memberCurve))
  const observations = non711.map((member, index) => {
    const identity = memberIdentity(member, `${group.groupId}:non711:${index}`)
    const disagreement = calculateCrossRigDisagreement(memberCurve(member), consensus, {
      groupId: group.groupId,
      observationId: identity,
      deviceFamily: group.deviceFamily ?? null,
      rigClass: memberRigClass(member),
      memberIdentity: identity,
    })
    return {
      groupId: group.groupId,
      observationId: identity,
      deviceFamily: group.deviceFamily ?? null,
      rigClass: memberRigClass(member),
      memberIdentity: identity,
      deltaDb: disagreement.deltaDb,
      absoluteDeltaDb: disagreement.absoluteDeltaDb,
      D: disagreement.D,
      A: disagreement.A,
      frequenciesHz: disagreement.frequenciesHz,
    }
  })
  return {
    groupId: group.groupId,
    deviceFamily: group.deviceFamily ?? null,
    consensus,
    sigma,
    exact711MemberIdentities: exact.map((member, index) => memberIdentity(member, `${group.groupId}:711:${index}`)),
    observations,
  }
}

function distinctSorted(values) {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)))
}

/**
 * Build R_T, G_global,T, and per-class G_k,T from only the supplied training
 * groups. A class profile is legal only when it spans two distinct groups.
 */
export function buildConfidenceProfiles(trainingGroups) {
  if (!Array.isArray(trainingGroups) || trainingGroups.length === 0) throw new Error('training groups are required')
  const seenGroups = new Set()
  const references = trainingGroups.map((group) => {
    if (seenGroups.has(group.groupId)) throw new Error(`duplicate training group ${group.groupId}`)
    seenGroups.add(group.groupId)
    return buildGroupReference(group)
  })
  const frequenciesHz = [...references[0].consensus.frequenciesHz]
  for (const reference of references) {
    if (JSON.stringify(reference.consensus.frequenciesHz) !== JSON.stringify(frequenciesHz)) throw new Error('training groups require a common frequency grid')
  }
  const repeatabilityValues = frequenciesHz.map((_, index) => median(references.map((reference) => reference.sigma.valuesDb[index])))
  const observations = references.flatMap((reference) => reference.observations)
  if (observations.length === 0) throw new Error('training groups have no non-711 observations')
  const globalValues = frequenciesHz.map((_, index) => median(observations.map((observation) => observation.absoluteDeltaDb[index])))
  const repeatability = profileCurve(repeatabilityValues, frequenciesHz, {
    method: 'TRAINING_MEDIAN_REPEATABILITY_SIGMA',
    trainingGroupCount: references.length,
    uncertaintyComponent: 'repeatability',
  })
  const globalRig = profileCurve(globalValues, frequenciesHz, {
    method: 'TRAINING_GLOBAL_MEDIAN_ABSOLUTE_CROSS_RIG_DISAGREEMENT',
    trainingGroupCount: references.length,
    uncertaintyComponent: 'cross-rig',
  })
  const observationsByClass = new Map()
  for (const observation of observations) {
    const values = observationsByClass.get(observation.rigClass) ?? []
    values.push(observation)
    observationsByClass.set(observation.rigClass, values)
  }
  const rigProfiles = {}
  for (const rigClass of distinctSorted(observationsByClass.keys())) {
    const classObservations = observationsByClass.get(rigClass)
    const trainingClassGroupIds = distinctSorted(classObservations.map((observation) => observation.groupId))
    const classSpecific = trainingClassGroupIds.length >= C1B_MIN_CLASS_GROUPS
    const values = classSpecific
      ? frequenciesHz.map((_, index) => median(classObservations.map((observation) => observation.absoluteDeltaDb[index])))
      : [...globalValues]
    const profile = profileCurve(values, frequenciesHz, {
      method: classSpecific ? 'TRAINING_CLASS_MEDIAN_ABSOLUTE_CROSS_RIG_DISAGREEMENT' : 'TRAINING_GLOBAL_MEDIAN_ABSOLUTE_CROSS_RIG_DISAGREEMENT',
      rigClass,
      uncertaintyComponent: 'cross-rig',
    })
    rigProfiles[rigClass] = {
      rigClass,
      distinctTrainingGroupCount: trainingClassGroupIds.length,
      trainingGroupIds: trainingClassGroupIds,
      observationCount: classObservations.length,
      source: classSpecific ? 'CLASS_SPECIFIC' : 'GLOBAL_FALLBACK',
      fallback: !classSpecific,
      profile,
      frequenciesHz: [...frequenciesHz],
      valuesDb: [...profile.valuesDb],
      profileSha256: hashProfile(profile),
    }
  }
  return {
    algorithmVersion: C1B_ALGORITHM_VERSION,
    frequenciesHz,
    grid: [...frequenciesHz],
    trainingGroupIds: references.map((reference) => reference.groupId),
    groupReferences: references,
    observations,
    repeatability,
    repeatabilityProfile: repeatability,
    globalRig,
    globalCrossRig: globalRig,
    globalRigProfile: globalRig,
    rigProfiles,
    classProfiles: rigProfiles,
    profileHashes: {
      repeatability: hashProfile(repeatability),
      globalRig: hashProfile(globalRig),
      rigProfiles: Object.fromEntries(Object.entries(rigProfiles).map(([key, value]) => [key, value.profileSha256])),
    },
  }
}

export const buildTrainingProfiles = buildConfidenceProfiles
export const learnConfidenceProfiles = buildConfidenceProfiles

function uncertaintyToConfidence(uncertainty, label) {
  assertFinite(uncertainty, `${label} uncertainty`)
  if (uncertainty < 0) throw new Error(`${label} uncertainty must be nonnegative`)
  const value = C1B_TARGET_SCALE_DB / (C1B_TARGET_SCALE_DB + uncertainty)
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${label} confidence is outside (0,1]`)
  return value
}

function profileValues(profile, label) {
  const points = pointsFromCurve(profile, label)
  return {
    frequenciesHz: points.map(([frequency]) => frequency),
    valuesDb: points.map(([, value]) => value),
  }
}

/** Construct repeatability-only, rig-only, and product confidence weights. */
export function buildConfidenceWeights(profiles, rigClass) {
  if (!profiles || typeof profiles !== 'object') throw new Error('confidence profiles are required')
  const repeatability = profileValues(profiles.repeatability ?? profiles.repeatabilityProfile, 'repeatability profile')
  const global = profiles.globalRig ?? profiles.globalCrossRig ?? profiles.globalRigProfile
  if (!global) throw new Error('global rig profile is required')
  const classEntry = rigClass !== undefined && profiles.rigProfiles?.[rigClass]
  const sourceEntry = classEntry ?? {
    rigClass: rigClass ?? null,
    source: 'GLOBAL_FALLBACK',
    fallback: true,
    distinctTrainingGroupCount: 0,
    trainingGroupIds: [],
    observationCount: 0,
    profile: global,
    frequenciesHz: global.frequenciesHz,
    valuesDb: global.valuesDb,
    profileSha256: hashProfile(global),
  }
  const rig = profileValues(sourceEntry.profile ?? sourceEntry, 'rig profile')
  if (JSON.stringify(repeatability.frequenciesHz) !== JSON.stringify(rig.frequenciesHz)) throw new Error('confidence profiles require a common frequency grid')
  const wRepeatability = repeatability.valuesDb.map((value) => uncertaintyToConfidence(value, 'repeatability'))
  const wRig = rig.valuesDb.map((value) => uncertaintyToConfidence(value, 'rig'))
  const wConfidence = wRepeatability.map((value, index) => {
    const product = value * wRig[index]
    if (!Number.isFinite(product) || product <= 0 || product > 1) throw new Error('confidence product is outside (0,1]')
    return product
  })
  const summary = (values) => ({
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  })
  const repeatabilityCandidate = curveFromPoints(repeatability.frequenciesHz.map((frequency, index) => [frequency, wRepeatability[index]]), {
    method: 'W_REPEATABILITY',
    valuesAreWeights: true,
    profileSha256: hashProfile(profiles.repeatability ?? profiles.repeatabilityProfile),
  })
  const rigCandidate = curveFromPoints(rig.frequenciesHz.map((frequency, index) => [frequency, wRig[index]]), {
    method: 'W_RIG',
    valuesAreWeights: true,
    source: sourceEntry.source,
    rigClass: rigClass ?? null,
    profileSha256: sourceEntry.profileSha256 ?? hashProfile(sourceEntry.profile ?? sourceEntry),
  })
  const confidenceCandidate = curveFromPoints(rig.frequenciesHz.map((frequency, index) => [frequency, wConfidence[index]]), {
    method: 'W_CONFIDENCE_PRODUCT',
    valuesAreWeights: true,
    rigClass: rigClass ?? null,
    source: sourceEntry.source,
  })
  return {
    algorithmVersion: C1B_ALGORITHM_VERSION,
    scaleDb: C1B_TARGET_SCALE_DB,
    frequenciesHz: [...repeatability.frequenciesHz],
    valuesDb: [...wConfidence],
    values: [...wConfidence],
    wRepeatability: [...wRepeatability],
    wRig: [...wRig],
    wConfidence: [...wConfidence],
    repeatability: repeatabilityCandidate,
    rig: rigCandidate,
    confidence: confidenceCandidate,
    w_repeatability: repeatabilityCandidate,
    w_rig: rigCandidate,
    w_conf: confidenceCandidate,
    source: sourceEntry.source,
    rigClass: rigClass ?? null,
    distinctTrainingGroupCount: sourceEntry.distinctTrainingGroupCount,
    trainingGroupIds: [...(sourceEntry.trainingGroupIds ?? [])],
    candidates: {
      repeatability: repeatabilityCandidate,
      rig: rigCandidate,
      confidence: confidenceCandidate,
    },
    summary: {
      repeatability: summary(wRepeatability),
      rig: summary(wRig),
      confidence: summary(wConfidence),
    },
    mean: summary(wConfidence).mean,
    min: summary(wConfidence).min,
    max: summary(wConfidence).max,
  }
}

export const buildWeights = buildConfidenceWeights
export const confidenceWeights = buildConfidenceWeights

/**
 * Build device-group-level LOO training folds. No withheld group is included
 * in a fold's references, observations, or learned profiles.
 */
export function buildLeaveOneGroupOut(groups) {
  if (!Array.isArray(groups) || groups.length < 2) throw new Error('LOO requires at least two device groups')
  const ids = groups.map((group) => group?.groupId)
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('LOO requires unique device-group IDs')
  return groups.map((withheldGroup, withheldIndex) => {
    const trainingGroups = groups.filter((_, index) => index !== withheldIndex)
    const profiles = buildConfidenceProfiles(trainingGroups)
    if (profiles.trainingGroupIds.includes(withheldGroup.groupId) || profiles.groupReferences.some((reference) => reference.groupId === withheldGroup.groupId) || profiles.observations.some((observation) => observation.groupId === withheldGroup.groupId)) {
      throw new Error(`LOO leakage: withheld group ${withheldGroup.groupId} entered training profiles`)
    }
    return {
      withheldGroupId: withheldGroup.groupId,
      withheldGroup,
      trainingGroupIds: trainingGroups.map((group) => group.groupId),
      profiles,
    }
  })
}

export const leaveOneGroupOut = buildLeaveOneGroupOut
export const buildLOOFolds = buildLeaveOneGroupOut

function valuesFromWeights(weights) {
  if (Array.isArray(weights)) return { frequenciesHz: null, valuesDb: weights.map(Number) }
  if (!weights || typeof weights !== 'object') throw new Error('weights are required')
  const frequenciesHz = weights.frequenciesHz ?? weights.frequencies
  const valuesDb = weights.valuesDb ?? weights.values ?? weights.wConfidence ?? weights.w_conf?.valuesDb
  if (!Array.isArray(valuesDb)) throw new Error('weights require values')
  return { frequenciesHz: frequenciesHz ? frequenciesHz.map(Number) : null, valuesDb: valuesDb.map(Number) }
}

function valuesFromObservation(observation) {
  if (!observation || typeof observation !== 'object') throw new Error('observation is required')
  const frequenciesHz = observation.frequenciesHz ?? observation.frequencies
  const deltaDb = observation.deltaDb ?? observation.D ?? observation.valuesDb ?? observation.values
  if (!Array.isArray(frequenciesHz) || !Array.isArray(deltaDb) || frequenciesHz.length !== deltaDb.length) throw new Error('observation requires equal frequencies and signed D values')
  return { frequenciesHz: frequenciesHz.map(Number), deltaDb: deltaDb.map(Number) }
}

function validateAlignedValues(frequenciesHz, values, label) {
  if (values.length !== frequenciesHz.length) throw new Error(`${label} length does not match evaluation grid`)
  for (let index = 0; index < frequenciesHz.length; index += 1) {
    assertPositive(frequenciesHz[index], `${label} frequency`)
    assertFinite(values[index], `${label} value`)
    if (index > 0 && frequenciesHz[index - 1] >= frequenciesHz[index]) throw new Error(`${label} frequencies must be strictly increasing`)
  }
}

function selectedIndices(frequenciesHz, minHz, maxHz) {
  return frequenciesHz.reduce((indices, frequency, index) => {
    if (frequency >= minHz && frequency <= maxHz) indices.push(index)
    return indices
  }, [])
}

function metricForWeights(frequenciesHz, deltaDb, weightValues, indices) {
  const primaryIndices = indices ?? frequenciesHz.map((_, index) => index)
  if (primaryIndices.length === 0) throw new Error('evaluation band has no grid points')
  const weights = primaryIndices.map((index) => weightValues[index])
  const deltas = primaryIndices.map((index) => deltaDb[index])
  const meanWeight = weights.reduce((sum, value) => sum + value, 0) / weights.length
  const eConf = deltas.reduce((sum, value, index) => sum + Math.abs(weights[index] * value), 0) / deltas.length
  const eConst = deltas.reduce((sum, value) => sum + Math.abs(meanWeight * value), 0) / deltas.length
  const informative = eConst > 0
  const gain = informative ? (eConst - eConf) / eConst : null
  return {
    meanWeight,
    E_conf: eConf,
    E_const: eConst,
    eConf,
    eConst,
    gain,
    targetingGain: gain,
    informative,
    classification: !informative ? INCONCLUSIVE : (gain >= C1B_TARGETING_THRESHOLD ? CONFIDENCE_TARGETING_WIN : CONFIDENCE_TARGETING_LOSS),
    frequenciesHz: primaryIndices.map((index) => frequenciesHz[index]),
    deltaDb: deltas,
    weightValues: weights,
  }
}

function rankWithAverageTies(values) {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value || left.index - right.index)
  const ranks = new Array(values.length)
  let cursor = 0
  while (cursor < order.length) {
    let end = cursor + 1
    while (end < order.length && order[end].value === order[cursor].value) end += 1
    const rank = (cursor + 1 + end) / 2
    for (let index = cursor; index < end; index += 1) ranks[order[index].index] = rank
    cursor = end
  }
  return ranks
}

/** Spearman rho with average ranks for ties; null for a constant rank vector. */
export function spearmanCorrelation(leftValues, rightValues) {
  if (!Array.isArray(leftValues) || !Array.isArray(rightValues) || leftValues.length !== rightValues.length || leftValues.length < 2) throw new Error('Spearman inputs require equal arrays of at least two values')
  leftValues.forEach((value) => assertFinite(value, 'Spearman value'))
  rightValues.forEach((value) => assertFinite(value, 'Spearman value'))
  const left = rankWithAverageTies(leftValues)
  const right = rankWithAverageTies(rightValues)
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
  let numerator = 0
  let leftVariance = 0
  let rightVariance = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    numerator += leftDelta * rightDelta
    leftVariance += leftDelta ** 2
    rightVariance += rightDelta ** 2
  }
  if (leftVariance === 0 || rightVariance === 0) return null
  return numerator / Math.sqrt(leftVariance * rightVariance)
}

export const spearman = spearmanCorrelation

function quartile(weightValues, absoluteDeltaDb, frequenciesHz, highest) {
  if (weightValues.length === 0) return { count: 0, medianAbsDeltaDb: null, medianAbsoluteDeltaDb: null, frequenciesHz: [] }
  const count = Math.max(1, Math.ceil(weightValues.length / 4))
  const ordered = weightValues
    .map((value, index) => ({ value, absoluteDeltaDb: absoluteDeltaDb[index], index }))
    .sort((left, right) => (highest ? right.value - left.value : left.value - right.value) || left.index - right.index)
    .slice(0, count)
  const result = {
    count: ordered.length,
    medianAbsDeltaDb: median(ordered.map((entry) => entry.absoluteDeltaDb)),
    medianAbsoluteDeltaDb: median(ordered.map((entry) => entry.absoluteDeltaDb)),
    frequenciesHz: ordered.map((entry) => frequenciesHz[entry.index]),
  }
  return result
}

function simpleRawMetrics(deltaDb, indices) {
  const selected = indices.map((index) => deltaDb[index])
  return {
    mae: selected.reduce((sum, value) => sum + Math.abs(value), 0) / selected.length,
    rmse: Math.sqrt(selected.reduce((sum, value) => sum + value ** 2, 0) / selected.length),
  }
}

function bandDiagnostics(frequenciesHz, deltaDb, candidates) {
  const result = {}
  for (const band of DIAGNOSTIC_BANDS_HZ) {
    const indices = selectedIndices(frequenciesHz, band.minHz, band.maxHz)
    if (indices.length === 0) {
      result[band.id] = { ...band, count: 0, rawMae: null, rawRmse: null, candidates: {} }
      continue
    }
    const raw = simpleRawMetrics(deltaDb, indices)
    const candidateResults = {}
    for (const [name, values] of Object.entries(candidates)) {
      const metric = metricForWeights(frequenciesHz, deltaDb, values, indices)
      candidateResults[name] = {
        meanWeight: metric.meanWeight,
        E_conf: metric.E_conf,
        E_const: metric.E_const,
        gain: metric.gain,
        informative: metric.informative,
      }
    }
    result[band.id] = { ...band, count: indices.length, rawMae: raw.mae, rawRmse: raw.rmse, candidates: candidateResults }
  }
  return result
}

/** Evaluate one same-IEM cross-rig observation against equal-authority control. */
export function evaluateTargetingObservation(observation, weights) {
  const values = valuesFromObservation(observation)
  const weightSet = valuesFromWeights(weights)
  const frequenciesHz = values.frequenciesHz
  if (weightSet.frequenciesHz && JSON.stringify(weightSet.frequenciesHz) !== JSON.stringify(frequenciesHz)) throw new Error('observation and weights require a common frequency grid')
  validateAlignedValues(frequenciesHz, values.deltaDb, 'observation')
  validateAlignedValues(frequenciesHz, weightSet.valuesDb, 'weights')
  const primaryIndices = selectedIndices(frequenciesHz, ...C1B_PRIMARY_BAND_HZ)
  if (primaryIndices.length === 0) throw new Error('primary 4–14 kHz band has no grid points')
  const wConfidence = [...weightSet.valuesDb]
  const wRepeatability = weights?.wRepeatability ? [...weights.wRepeatability] : weights?.w_repeatability?.valuesDb ? [...weights.w_repeatability.valuesDb] : weights?.repeatability?.valuesDb ? [...weights.repeatability.valuesDb] : [...wConfidence]
  const wRig = weights?.wRig ? [...weights.wRig] : weights?.w_rig?.valuesDb ? [...weights.w_rig.valuesDb] : weights?.rig?.valuesDb ? [...weights.rig.valuesDb] : [...wConfidence]
  validateAlignedValues(frequenciesHz, wRepeatability, 'repeatability weights')
  validateAlignedValues(frequenciesHz, wRig, 'rig weights')
  for (const value of wConfidence) if (!(value > 0 && value <= 1)) throw new Error('confidence weights must satisfy 0 < w <= 1')
  const candidateArrays = { repeatability: wRepeatability, rig: wRig, confidence: wConfidence }
  const candidateMetrics = Object.fromEntries(Object.entries(candidateArrays).map(([name, candidate]) => [name, {
    ...metricForWeights(frequenciesHz, values.deltaDb, candidate, primaryIndices),
    valuesDb: [...candidate],
    gridFrequenciesHz: [...frequenciesHz],
  }]))
  const primary = candidateMetrics.confidence
  const primaryDeltas = primaryIndices.map((index) => values.deltaDb[index])
  const primaryWeights = primaryIndices.map((index) => wConfidence[index])
  const primaryAbs = primaryDeltas.map(Math.abs)
  const rawPrimary = simpleRawMetrics(values.deltaDb, primaryIndices)
  const rawFull = simpleRawMetrics(values.deltaDb, frequenciesHz.map((_, index) => index))
  const uncertainty = primaryWeights.map((value) => 1 - value)
  const spearmanUncertaintyArtifact = spearmanCorrelation(uncertainty, primaryAbs)
  const highest = quartile(primaryWeights, primaryAbs, primary.frequenciesHz, true)
  const lowest = quartile(primaryWeights, primaryAbs, primary.frequenciesHz, false)
  const diagnostics = {
    rawCrossRigMae: rawPrimary.mae,
    rawCrossRigRmse: rawPrimary.rmse,
    rawFullGridMae: rawFull.mae,
    rawFullGridRmse: rawFull.rmse,
    E_conf: primary.E_conf,
    E_const: primary.E_const,
    eConf: primary.E_conf,
    eConst: primary.E_const,
    gain: primary.gain,
    targetingGain: primary.gain,
    informative: primary.informative,
    classification: primary.classification,
    primaryFrequenciesHz: [...primary.frequenciesHz],
    meanWeight: primary.meanWeight,
    meanConfidence: primary.meanWeight,
    minimumConfidence: Math.min(...primaryWeights),
    maximumConfidence: Math.max(...primaryWeights),
    minConfidence: Math.min(...primaryWeights),
    maxConfidence: Math.max(...primaryWeights),
    candidates: candidateMetrics,
    w_repeatability: candidateMetrics.repeatability,
    w_rig: candidateMetrics.rig,
    w_conf: candidateMetrics.confidence,
    spearmanUncertaintyArtifact,
    spearmanCorrelation: spearmanUncertaintyArtifact,
    highestConfidenceQuartile: highest,
    lowestConfidenceQuartile: lowest,
    bandDiagnostics: bandDiagnostics(frequenciesHz, values.deltaDb, candidateArrays),
  }
  return diagnostics
}

export const evaluateObservation = evaluateTargetingObservation
export const evaluateCrossRigObservation = evaluateTargetingObservation

function informativeObservation(observation) {
  if (observation?.informative !== undefined) return observation.informative === true && Number.isFinite(observation.gain)
  if (Number.isFinite(observation?.E_const)) return observation.E_const > 0 && Number.isFinite(observation.gain)
  return Number.isFinite(observation?.gain)
}

/** Apply the per-group strict-majority and median-gain gate. */
export function classifyGroupTargeting(observations) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return { classification: INCONCLUSIVE, reason: 'NO_OBSERVATIONS', evidenceValid: false, informativeObservationCount: 0, winCount: 0, lossCount: 0, medianGain: null }
  }
  const informative = observations.filter(informativeObservation)
  if (informative.length === 0) {
    return { classification: INCONCLUSIVE, reason: 'NO_INFORMATIVE_OBSERVATIONS', evidenceValid: true, informativeObservationCount: 0, winCount: 0, lossCount: 0, medianGain: null }
  }
  // The numeric gain is authoritative. A caller-provided classification is
  // diagnostic only and can never bypass the frozen 5% threshold.
  const winCount = informative.filter((observation) => observation.gain >= C1B_TARGETING_THRESHOLD).length
  const medianGain = median(informative.map((observation) => observation.gain))
  const strictMajority = winCount > informative.length / 2
  const medianGainPass = medianGain >= C1B_TARGETING_THRESHOLD
  return {
    classification: strictMajority && medianGainPass ? CONFIDENCE_TARGETING_SIGNAL : NO_CONFIDENCE_TARGETING_SIGNAL,
    reason: strictMajority && medianGainPass ? 'STRICT_MAJORITY_AND_MEDIAN_GAIN' : 'GROUP_GATE_FAILED',
    evidenceValid: true,
    informativeObservationCount: informative.length,
    nonInformativeObservationCount: observations.length - informative.length,
    winCount,
    lossCount: informative.length - winCount,
    strictMajority,
    medianGain,
    medianRelativeTargetingGain: medianGain,
    threshold: C1B_TARGETING_THRESHOLD,
  }
}

export const classifyGroupEvidence = classifyGroupTargeting
export const decideGroup = classifyGroupTargeting

/** Classify six development groups with the frozen 4/6 gate. */
export function classifyDevelopmentGate(groupResults) {
  if (!Array.isArray(groupResults) || groupResults.length !== C1B_REQUIRED_DEVELOPMENT_GROUPS) return INCONCLUSIVE
  const normalized = groupResults.map((result) => typeof result === 'string' ? { classification: result, evidenceValid: true } : result)
  if (normalized.some((result) => !result || result.evidenceValid === false || ![CONFIDENCE_TARGETING_SIGNAL, NO_CONFIDENCE_TARGETING_SIGNAL, INCONCLUSIVE].includes(result.classification))) return INCONCLUSIVE
  const signalCount = normalized.filter((result) => result.classification === CONFIDENCE_TARGETING_SIGNAL).length
  return signalCount >= 4 ? CONFIDENCE_TARGETING_DEV_SUPPORTED : CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED
}

export function buildDevelopmentGate(groupResults) {
  const classification = classifyDevelopmentGate(groupResults)
  const normalized = Array.isArray(groupResults) ? groupResults.map((result) => typeof result === 'string' ? result : result?.classification) : []
  return {
    classification,
    groupCount: normalized.length,
    signalGroupCount: normalized.filter((result) => result === CONFIDENCE_TARGETING_SIGNAL).length,
    noSignalGroupCount: normalized.filter((result) => result === NO_CONFIDENCE_TARGETING_SIGNAL).length,
    inconclusiveGroupCount: normalized.filter((result) => result === INCONCLUSIVE).length,
    requiredGroups: C1B_REQUIRED_DEVELOPMENT_GROUPS,
    minimumSignals: 4,
  }
}

export const decideDevelopmentGate = classifyDevelopmentGate

function isBatchCIdentifier(value) {
  return /batch\s*c|batch-c|fresh[-_ ]real[-_ ]corpus/i.test(String(value))
}

/** Guard protocol runners against accidentally using holdout or sealed Batch C. */
export function assertDevelopmentGroupId(groupId) {
  if (HOLDOUT_GROUP_IDS.includes(groupId)) throw new Error(`holdout group ${groupId} is explicitly rejected from C1b development`)
  if (isBatchCIdentifier(groupId)) throw new Error('Fresh Real Corpus Batch C is sealed and rejected from C1b development')
  if (!DEVELOPMENT_GROUP_IDS.includes(groupId)) throw new Error(`group ${groupId} is not an approved C1b development group`)
  return true
}

export const assertC1bDevelopmentGroup = assertDevelopmentGroupId

export function assertNoHoldoutOrBatchC(groupIds) {
  if (!Array.isArray(groupIds)) throw new Error('development group IDs are required')
  for (const groupId of groupIds) assertDevelopmentGroupId(groupId)
  return true
}

export function assertC1bGroupSplit({ developmentGroupIds, holdoutGroupIds }) {
  if (JSON.stringify(developmentGroupIds) !== JSON.stringify(DEVELOPMENT_GROUP_IDS)) throw new Error('C1b development group IDs do not match repaired C1 V1.1 selection')
  if (JSON.stringify(holdoutGroupIds) !== JSON.stringify(HOLDOUT_GROUP_IDS)) throw new Error('C1b holdout group IDs do not match repaired C1 V1.1 selection')
  assertNoHoldoutOrBatchC(developmentGroupIds)
  return true
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') assertFinite(value, 'JSON number')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

/** Deterministic JSON used for all protocol/profile hashes. */
export function stableJson(value) {
  return JSON.stringify(canonicalize(value))
}

export function hashJson(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export const sha256Json = hashJson

/** Schema for the eventual evidence shape; this pre-outcome declaration has no empirical values. */
export function createOutcomeArtifactSchema() {
  return {
    schemaVersion: C1B_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1b-confidence-targeting-development-outcome-schema',
    algorithmVersion: C1B_ALGORITHM_VERSION,
    outcomeValuesAllowed: false,
    responseDerivedValuesAllowed: false,
    requiredTopLevel: ['schemaVersion', 'algorithmVersion', 'groupEvidence', 'developmentGate', 'flags', 'evidenceSha256'],
    groupEvidence: {
      required: ['groupId', 'trainingGroupIds', 'consensus', 'repeatabilitySigma', 'observations', 'classification'],
      observationRequired: ['observationId', 'rigClass', 'frequenciesHz', 'deltaDb', 'absoluteDeltaDb', 'metrics'],
      metricsRequired: [
        'rawCrossRigMae', 'rawCrossRigRmse', 'E_conf', 'E_const', 'gain',
        'meanConfidence', 'minimumConfidence', 'maximumConfidence',
        'w_repeatability', 'w_rig', 'w_conf', 'spearmanUncertaintyArtifact',
        'highestConfidenceQuartile', 'lowestConfidenceQuartile', 'bandDiagnostics',
      ],
      memberProvenanceRequired: ['concreteCurveIdentity', 'collection', 'form', 'rig', 'rigClass', 'path', 'blobSha', 'upstreamSha256', 'originalParsedPointsSha256', 'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256'],
    },
    evaluation: {
      primaryBandHz: [...C1B_PRIMARY_BAND_HZ],
      equalAuthorityControl: 'w_const(f) = mean_primary(w_conf(f))',
      errorProxy: 'mean_primary(abs(weight(f) * D(f)))',
      informativeRule: 'E_const == 0',
      winRule: 'informative AND gain >= 0.05',
    },
    diagnostics: {
      bandsHz: DIAGNOSTIC_BANDS_HZ.map(({ id, minHz, maxHz }) => ({ id, minHz, maxHz })),
      spearman: 'average ranks for exact ties; null when either rank vector is constant',
      quartiles: 'ceil(n/4) points; confidence desc/asc and original grid index tie order',
    },
    groupGate: {
      signal: 'strict majority of informative observations AND median gain >= 0.05',
      informativeExclusion: 'E_const == 0 observations do not enter win/loss or median gain',
      allowed: [CONFIDENCE_TARGETING_SIGNAL, NO_CONFIDENCE_TARGETING_SIGNAL, INCONCLUSIVE],
    },
    developmentGate: {
      requiredGroups: C1B_REQUIRED_DEVELOPMENT_GROUPS,
      minimumSignals: 4,
      supported: CONFIDENCE_TARGETING_DEV_SUPPORTED,
      notSupported: CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED,
      invalid: INCONCLUSIVE,
    },
    flags: {
      developmentExecuted: false,
      holdoutExecuted: false,
      outcomesGenerated: false,
      responseOutcomeObserved: false,
      confidenceCurveComputed: false,
      confidenceWeightingApplied: false,
      batchCExecuted: false,
      consensusAlgorithmExecuted: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      freshRealBatchCExecuted: false,
      rawMeasurementsCommitted: false,
      c4PeakAlignmentUsed: false,
    },
  }
}

/** Build the immutable pre-outcome C1b protocol manifest. */
export function createProtocolManifest({
  phase0Commit = PHASE0_CORPUS_COMMIT,
  phase0EvidenceSha256 = PHASE0_EVIDENCE_SHA256,
  protocolFreezeCommit = null,
} = {}) {
  assertC1bGroupSplit({ developmentGroupIds: DEVELOPMENT_GROUP_IDS, holdoutGroupIds: HOLDOUT_GROUP_IDS })
  return {
    schemaVersion: C1B_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1b-confidence-targeting-protocol',
    algorithmVersion: C1B_ALGORITHM_VERSION,
    phase: 'protocol-freeze',
    milestone: 'C1b-confidence-targeting-development',
    c1aV11: {
      corpusVersion: 'c1-cross-rig-confidence-corpus-v1.1',
      commit: phase0Commit,
      evidenceSha256: phase0EvidenceSha256,
      classification: 'C1_CORPUS_V1_1_READY',
    },
    // Retain the inherited frozen boundary and upstream identity in the
    // protocol manifest so the freeze is independently auditable.
    frozenBoundary: FROZEN_BOUNDARY,
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    c4: { finalEvidenceSha256: C4C_FINAL_EVIDENCE_SHA256, finalInterpretation: C4_FINAL_INTERPRETATION },
    developmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    rejectedHoldoutGroupIds: [...HOLDOUT_GROUP_IDS],
    rejectedBatchCToken: BATCH_C_REJECTION_TOKEN,
    freshRealBatchCRejected: true,
    upstreamResponseOutcomesObserved: false,
    primaryBandHz: [...C1B_PRIMARY_BAND_HZ],
    dataPreparation: {
      form: C1B_FORM,
      v2MinHz: C1B_V2_MIN_HZ,
      v2MaxHz: C1B_V2_MAX_HZ,
      pointsPerOctave: C1B_V2_POINTS_PER_OCTAVE,
      grid: 'frozen normal V2 log grid, terminal endpoint included at 20,000 Hz',
      normalization: { ...C1B_NORMALIZATION },
      terminalClosure: 'terminal-flat-hold-to-v2-max',
      smoothing: false,
      peakAlignment: false,
      c4Preprocessing: false,
      rawBytes: 'reacquire immutable pinned upstream bytes; verify Git blob SHA-1 and SHA-256',
    },
    consensus: {
      primaryRigLiteral: C1A_PRIMARY_RIG,
      method: 'pointwise median of exact-711 normalized curves',
      repeatability: '1.4826 * median_i(abs(x_i(f) - C_g(f)))',
    },
    profiles: {
      baseWeight: 1,
      repeatability: 'R_T(f) = median_g(sigma_g(f))',
      globalRig: 'G_global,T(f) = median(abs(D_g,r(f))) over all training non-711 observations',
      classRig: 'G_k,T(f) = median(abs(D_g,r(f))) when class spans >=2 distinct training groups',
      fallback: 'global rig profile when class spans fewer than 2 distinct training groups',
      classMinimumDistinctTrainingGroups: C1B_MIN_CLASS_GROUPS,
      transform: 'c(u) = 0.75 / (0.75 + u)',
      product: 'w_conf,k,T(f) = w_repeatability,T(f) * w_rig,k,T(f)',
      weightRange: 'finite 0 < w <= 1; no clipping, smoothing, exponent, lambda, threshold, or psychoacoustic weighting',
    },
    evaluation: {
      protocol: 'leave-one-device-group-out across six development groups',
      primaryBandHz: [...C1B_PRIMARY_BAND_HZ],
      gridInclusion: 'use only normal V2 grid points with 4,000 <= f <= 14,000; no synthetic boundary interpolation',
      equalAuthorityControl: 'w_const(f) = mean_primary(w_conf(f))',
      E_conf: 'mean_primary(abs(w_conf(f) * D(f)))',
      E_const: 'mean_primary(abs(w_const(f) * D(f)))',
      gain: '(E_const - E_conf) / E_const when E_const > 0',
      noninformative: 'E_const == 0; omit from win/loss count and median gain',
      win: 'gain >= 0.05 (exact)',
    },
    diagnostics: {
      rawMetrics: 'raw cross-rig MAE and RMSE on the primary band; full-grid values are retained as secondary diagnostics',
      bandsHz: DIAGNOSTIC_BANDS_HZ.map(({ id, minHz, maxHz }) => ({ id, minHz, maxHz })),
      spearman: 'Spearman rho between 1 - w_conf and abs(D), with average ranks for exact ties; null for constant ranks',
      quartiles: 'ceil(n/4) primary points, ordered by confidence then original grid index for deterministic ties',
    },
    groupGate: {
      signal: 'strict majority of informative observations AND median gain >= 0.05',
      informativeObservationRule: 'E_const > 0',
    },
    developmentGate: {
      requiredGroups: C1B_REQUIRED_DEVELOPMENT_GROUPS,
      minimumSignals: 4,
      supported: CONFIDENCE_TARGETING_DEV_SUPPORTED,
      notSupported: CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED,
      invalid: INCONCLUSIVE,
    },
    protocolFreezeCommit,
    developmentExecuted: false,
    holdoutExecuted: false,
    outcomesGenerated: false,
    responseOutcomeObserved: false,
    confidenceCurveComputed: false,
    confidenceWeightingApplied: false,
    batchCExecuted: false,
    consensusAlgorithmExecuted: false,
    autoEqSolverExecuted: false,
    solverExecuted: false,
    freshRealBatchCExecuted: false,
    c4PeakAlignmentUsed: false,
    rawMeasurementsCommitted: false,
    artifactSchema: 'schema.json',
    protocolPath: 'research/c1-confidence-targeting-dev/protocol.md',
  }
}

export const createProtocolArtifact = createProtocolManifest

export function validateProtocolManifest(manifest) {
  if (!manifest || manifest.artifactKind !== 'c1b-confidence-targeting-protocol') throw new Error('invalid C1b protocol manifest')
  if (manifest.phase !== 'protocol-freeze' || manifest.developmentExecuted !== false || manifest.holdoutExecuted !== false || manifest.outcomesGenerated !== false || manifest.responseOutcomeObserved !== false || manifest.batchCExecuted !== false || manifest.consensusAlgorithmExecuted !== false || manifest.solverExecuted !== false) throw new Error('C1b protocol manifest contains outcome state')
  if (manifest.freshRealBatchCRejected !== true || manifest.freshRealBatchCExecuted !== false) throw new Error('Fresh Real Batch C must remain sealed')
  if (JSON.stringify(manifest.developmentGroupIds) !== JSON.stringify(DEVELOPMENT_GROUP_IDS) || JSON.stringify(manifest.rejectedHoldoutGroupIds) !== JSON.stringify(HOLDOUT_GROUP_IDS)) throw new Error('C1b group split does not match repaired C1 V1.1 corpus')
  if (manifest.evaluation?.primaryBandHz?.[0] !== C1B_PRIMARY_BAND_HZ[0] || manifest.evaluation?.primaryBandHz?.[1] !== C1B_PRIMARY_BAND_HZ[1]) throw new Error('C1b primary band mismatch')
  return true
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Write only the pre-outcome protocol bundle. This helper intentionally has no
 * raw-data or outcome path and leaves `protocolFreezeCommit` null unless the
 * caller supplies the already-created freeze commit.
 */
export async function writeProtocolArtifacts({ outputDir = C1B_ARTIFACT_RELATIVE_DIR, protocolFreezeCommit = null } = {}) {
  await mkdir(outputDir, { recursive: true })
  const manifest = createProtocolManifest({ protocolFreezeCommit })
  validateProtocolManifest(manifest)
  const schema = createOutcomeArtifactSchema()
  const manifestText = jsonText(manifest)
  const schemaText = jsonText(schema)
  await writeFile(resolve(outputDir, 'manifest.json'), manifestText, 'utf8')
  await writeFile(resolve(outputDir, 'schema.json'), schemaText, 'utf8')
  await writeFile(resolve(outputDir, 'protocol-sha256.txt'), `${sha256(manifestText + schemaText)}\n`, 'utf8')
  return { outputDir, manifest, schema, protocolSha256: sha256(manifestText + schemaText) }
}
