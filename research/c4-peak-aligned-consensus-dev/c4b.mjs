import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  canonicalizeTerminalEndpoint,
  hashEvidenceFiles as hashC4aEvidenceFiles,
  normalizeCurveForIntegrity,
  parseCurveCsv,
  validateCorpusProvenance,
  v2EvaluationGrid,
} from '../c4-peak-aligned-consensus-corpus/c4a.mjs'

export const UPSTREAM_REPOSITORY = 'jaakkopasanen/AutoEq'
export const UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96'
export const UPSTREAM_API_ROOT = `https://api.github.com/repos/${UPSTREAM_REPOSITORY}`
export const UPSTREAM_RAW_ROOT = `https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${UPSTREAM_COMMIT}`

export const C4B_FROZEN_BOUNDARY = '64f1fa7f8780cf14f87ce6427aaa71edbf686e2d'
export const C4A_EVIDENCE_SHA256 = '03794a913b873e01df8b5afdd3664e6dc7e40deff9341a449c768ae1f39b73ea'
export const C4A_CLASSIFICATION = 'C4_CORPUS_READY'
export const C4A_CORPUS_BOUNDARY = '2718375e64e6e4682cb6cacf46ae8300a431e1ba'
export const C4B_ALGORITHM_VERSION = 'c4-peak-aligned-consensus-dev-v1'
export const C4B_PROTOCOL_SCHEMA_VERSION = 1
export const C4B_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c4-peak-aligned-consensus-dev'
export const C4B_CACHE_RELATIVE_DIR = '.research-cache/c4-peak-aligned-consensus-dev'
export const C4B_FORM = 'in-ear'
export const C4B_V2_MIN_HZ = 20
export const C4B_V2_MAX_HZ = 20_000
export const C4B_V2_POINTS_PER_OCTAVE = 96
export const C4B_NORMALIZATION = Object.freeze({ mode: 'hz', frequencyHz: 500, levelDb: 60 })
export const PEAK_SEARCH_BAND_HZ = Object.freeze([6000, 10_000])
export const ALIGNMENT_BAND_HZ = Object.freeze([6000, 14_000])
export const DEVELOPMENT_GROUP_IDS = Object.freeze([
  'c4g-95ca9d64e706e94c51e7',
  'c4g-9c1d23845eb5a1d7beef',
  'c4g-35f72baf0cca66570d01',
])
export const HOLDOUT_GROUP_IDS = Object.freeze([
  'c4g-c5a0b86e1ea4436ca9ce',
  'c4g-043aeb45a50adf964f89',
  'c4g-9f35923d2fa109244435',
])
export const BATCH_C_REJECTION_TOKEN = 'fresh-real-corpus-v1.2:Batch C'

const API_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'autoeq-workbench-c4b',
})

const EPSILON = 1e-12

/** SHA-256 bytes/text using the C4 evidence convention. */
export function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** The Git blob SHA-1 used to verify a pinned raw object. */
export function gitBlobSha1(value) {
  const bytes = Buffer.from(value)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export const sha256 = hashBytes

export function rawUrl(path) {
  return `${UPSTREAM_RAW_ROOT}/${String(path).split('/').map(encodeURIComponent).join('/')}`
}

export function apiUrl(path) {
  return `${UPSTREAM_API_ROOT}${path}`
}

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

export function medianValue(values) {
  return median(values)
}

function unpackCurve(curve) {
  if (Array.isArray(curve)) {
    return curve.map((point) => {
      if (!Array.isArray(point) || point.length < 2) throw new Error('curve point must contain frequency and dB')
      return [Number(point[0]), Number(point[1])]
    })
  }
  if (!curve || typeof curve !== 'object') throw new Error('curve must be an array or object')
  if (Array.isArray(curve.points)) return unpackCurve(curve.points)
  const frequencies = curve.frequenciesHz ?? curve.frequencies
  const values = curve.valuesDb ?? curve.values
  if (!Array.isArray(frequencies) || !Array.isArray(values) || frequencies.length !== values.length) {
    throw new Error('curve requires equal frequency and dB arrays')
  }
  return frequencies.map((frequency, index) => [Number(frequency), Number(values[index])])
}

function assertOrderedPoints(points, label = 'curve') {
  if (!Array.isArray(points) || points.length < 2) throw new Error(`${label} requires at least two points`)
  for (let index = 0; index < points.length; index += 1) {
    const [frequency, value] = points[index]
    assertPositive(frequency, `${label} frequency`)
    assertFinite(value, `${label} dB`)
    if (index > 0 && points[index - 1][0] >= frequency) {
      throw new Error(`${label} frequencies must be strictly increasing`)
    }
  }
}

function curveFromPoints(points, metadata = {}) {
  assertOrderedPoints(points)
  return {
    ...metadata,
    frequenciesHz: points.map(([frequency]) => frequency),
    valuesDb: points.map(([, value]) => value),
  }
}

function pointsFromCurve(curve) {
  const points = unpackCurve(curve)
  assertOrderedPoints(points)
  return points
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

function canonicalGrid() {
  // Keep the audited C4a grid definition and terminal endpoint behavior in
  // one place. The values are copied into a fresh array for every caller.
  return [...v2EvaluationGrid()]
}

export function evaluationGrid() {
  return canonicalGrid()
}

export const v2EvaluationGridC4b = evaluationGrid

/**
 * Reacquired points are closed and sampled on the normal V2 grid. Normalizing
 * at 500 Hz subtracts the 500-Hz anchor; `levelDb: 60` is retained as the
 * frozen protocol reference and is not a second shape transformation.
 */
export function prepareCurve(points, metadata = {}) {
  const source = pointsFromCurve(points)
  if (source[0][0] > C4B_V2_MIN_HZ) throw new Error('curve coverage is missing V2 minimum')
  const closed = canonicalizeTerminalEndpoint(source)
  if (closed.points.at(-1)[0] < C4B_V2_MAX_HZ) throw new Error('curve coverage is missing V2 maximum')
  const anchorDb = interpolateLogValue(closed.points, C4B_NORMALIZATION.frequencyHz)
  const grid = canonicalGrid()
  const sampled = grid.map((frequencyHz) => [frequencyHz, interpolateLogValue(closed.points, frequencyHz) - anchorDb])
  return curveFromPoints(sampled, {
    ...metadata,
    normalization: { ...C4B_NORMALIZATION },
    sourceCoverage: {
      originalFirstFrequencyHz: source[0][0],
      originalTerminalFrequencyHz: source.at(-1)[0],
      originalTerminalDb: source.at(-1)[1],
      canonicalTerminalFrequencyHz: closed.points.at(-1)[0],
      canonicalTerminalDb: closed.points.at(-1)[1],
      transformation: closed.transformation,
    },
    originalPointsSha256: hashBytes(JSON.stringify(source)),
    canonicalPointsSha256: hashBytes(JSON.stringify(closed.points)),
  })
}

export function normalizeCurve(curve) {
  const points = pointsFromCurve(curve)
  const anchorDb = interpolateLogValue(points, C4B_NORMALIZATION.frequencyHz)
  return curveFromPoints(points.map(([frequency, value]) => [frequency, value - anchorDb]), {
    ...curve,
    normalization: { ...C4B_NORMALIZATION },
  })
}

/** Return the strongest normalized point in the frozen 6–10 kHz band. */
export function dominantPeakFrequency(curve) {
  const points = pointsFromCurve(curve)
  let best = null
  for (const [frequencyHz, valueDb] of points) {
    if (frequencyHz < PEAK_SEARCH_BAND_HZ[0] || frequencyHz > PEAK_SEARCH_BAND_HZ[1]) continue
    if (best === null || valueDb > best.valueDb || (valueDb === best.valueDb && frequencyHz < best.frequencyHz)) {
      best = { frequencyHz, valueDb }
    }
  }
  if (best === null) throw new Error('curve has no points in the dominant peak band')
  return best.frequencyHz
}

export const dominantPeak = dominantPeakFrequency

/** Median in log2 frequency, including an arithmetic central mean for even K. */
export function canonicalTrainingPeak(peaksOrCurves) {
  if (!Array.isArray(peaksOrCurves) || peaksOrCurves.length === 0) throw new Error('canonical peak requires at least one training curve')
  const peaks = peaksOrCurves.map((value) => typeof value === 'number' ? value : dominantPeakFrequency(value))
  peaks.forEach((peak) => assertPositive(peak, 'dominant peak'))
  const ordered = peaks.map((peak) => Math.log2(peak)).sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  const canonicalLog2 = ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2
  return 2 ** canonicalLog2
}

export const canonicalPeakFrequency = canonicalTrainingPeak
export const logMedianPeak = canonicalTrainingPeak

function validatePeakForWarp(value, label) {
  assertPositive(value, label)
  if (value < PEAK_SEARCH_BAND_HZ[0] || value > PEAK_SEARCH_BAND_HZ[1]) {
    throw new Error(`${label} must lie in the 6–10 kHz peak-search band`)
  }
}

function toLog2(value) {
  return Math.log2(value)
}

function fromLog2(value) {
  return 2 ** value
}

/**
 * Construct the one frozen three-anchor output->input warp. Its `map...`
 * method is intentionally not serialized into evidence; callers can use the
 * `anchors` array for independent protocol verification.
 */
export function createPeakWarp(canonicalPeakFrequencyHz, memberPeakFrequencyHz) {
  if (canonicalPeakFrequencyHz && typeof canonicalPeakFrequencyHz === 'object') {
    const input = canonicalPeakFrequencyHz
    canonicalPeakFrequencyHz = input.canonicalPeakFrequencyHz ?? input.canonicalPeak ?? input.outputPeakFrequencyHz
    memberPeakFrequencyHz = input.memberPeakFrequencyHz ?? input.memberPeak ?? input.inputPeakFrequencyHz
  }
  validatePeakForWarp(canonicalPeakFrequencyHz, 'canonical peak')
  validatePeakForWarp(memberPeakFrequencyHz, 'member peak')
  if (canonicalPeakFrequencyHz === PEAK_SEARCH_BAND_HZ[0] && memberPeakFrequencyHz !== PEAK_SEARCH_BAND_HZ[0]) {
    throw new Error('warp anchors are non-monotone or duplicate at 6 kHz')
  }
  const anchors = [
    [ALIGNMENT_BAND_HZ[0], ALIGNMENT_BAND_HZ[0]],
    [canonicalPeakFrequencyHz, memberPeakFrequencyHz],
    [ALIGNMENT_BAND_HZ[1], ALIGNMENT_BAND_HZ[1]],
  ]
  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1]
    const current = anchors[index]
    if (current[0] < previous[0] || current[1] < previous[1]) {
      throw new Error('warp anchors are non-monotone')
    }
    if (current[0] === previous[0] && current[1] !== previous[1]) {
      throw new Error('warp anchors are non-monotone at a duplicate output frequency')
    }
  }
  const mapFrequencyHz = (frequencyHz) => {
    assertPositive(frequencyHz, 'warp frequency')
    if (frequencyHz < ALIGNMENT_BAND_HZ[0] || frequencyHz > ALIGNMENT_BAND_HZ[1]) return frequencyHz
    if (frequencyHz === ALIGNMENT_BAND_HZ[0] || frequencyHz === ALIGNMENT_BAND_HZ[1]) return frequencyHz
    for (const [outputFrequencyHz, inputFrequencyHz] of anchors) {
      if (frequencyHz === outputFrequencyHz) return inputFrequencyHz
    }
    let left = anchors[0]
    let right = anchors[1]
    if (frequencyHz > anchors[1][0]) {
      left = anchors[1]
      right = anchors[2]
    }
    if (right[0] === left[0] || right[1] === left[1]) return left[1]
    const ratio = (toLog2(frequencyHz) - toLog2(left[0])) / (toLog2(right[0]) - toLog2(left[0]))
    const mapped = fromLog2(toLog2(left[1]) + ratio * (toLog2(right[1]) - toLog2(left[1])))
    assertFinite(mapped, 'warped frequency')
    return mapped
  }
  return Object.freeze({
    anchors: anchors.map((anchor) => [...anchor]),
    canonicalPeakFrequencyHz,
    memberPeakFrequencyHz,
    mapFrequencyHz,
  })
}

export const makePeakWarp = createPeakWarp

/** Apply an output->input warp with log-frequency interpolation and no extrapolation. */
export function warpCurve(curve, warp) {
  if (!warp || typeof warp.mapFrequencyHz !== 'function') throw new Error('warp mapping is required')
  const points = pointsFromCurve(curve)
  const warpedPoints = points.map(([outputFrequencyHz]) => {
    const inputFrequencyHz = warp.mapFrequencyHz(outputFrequencyHz)
    if (inputFrequencyHz < points[0][0] - EPSILON || inputFrequencyHz > points.at(-1)[0] + EPSILON) {
      throw new Error(`warp leaves available source coverage at ${outputFrequencyHz} Hz`)
    }
    return [outputFrequencyHz, interpolateLogValue(points, inputFrequencyHz)]
  })
  return curveFromPoints(warpedPoints, {
    ...curve,
    warpAnchors: warp.anchors.map((anchor) => [...anchor]),
  })
}

export const applyPeakWarp = warpCurve

/** Pointwise median on a common frequency grid; no smoothing or weighting. */
export function pointwiseMedian(curves) {
  if (!Array.isArray(curves) || curves.length === 0) throw new Error('pointwise median requires at least one curve')
  const first = pointsFromCurve(curves[0])
  const allPoints = curves.map((curve) => pointsFromCurve(curve))
  for (const points of allPoints) {
    if (points.length !== first.length || points.some(([frequency], index) => frequency !== first[index][0])) {
      throw new Error('pointwise median requires a common frequency grid')
    }
  }
  return curveFromPoints(first.map(([frequency], index) => [frequency, median(allPoints.map((points) => points[index][1]))]), {
    frequenciesHz: first.map(([frequency]) => frequency),
    valuesDb: undefined,
    method: 'POINTWISE_MEDIAN',
  })
}

export const pointwiseMedianConsensus = pointwiseMedian

/** Build the peak-aligned candidate and preserve all diagnostic training details. */
export function peakAlignedMedian(curves) {
  if (!Array.isArray(curves) || curves.length === 0) throw new Error('peak-aligned median requires training curves')
  const individualPeakFrequenciesHz = curves.map((curve) => dominantPeakFrequency(curve))
  const canonicalPeakFrequencyHz = canonicalTrainingPeak(individualPeakFrequenciesHz)
  const warps = individualPeakFrequenciesHz.map((memberPeakFrequencyHz) => createPeakWarp(canonicalPeakFrequencyHz, memberPeakFrequencyHz))
  const alignedCurves = curves.map((curve, index) => warpCurve(curve, warps[index]))
  const consensus = pointwiseMedian(alignedCurves)
  return {
    curve: { ...consensus, method: 'PEAK_ALIGNED_MEDIAN' },
    canonicalPeakFrequencyHz,
    individualPeakFrequenciesHz,
    warps,
    alignedCurves,
    warpAnchors: warps.map((warp) => warp.anchors.map((anchor) => [...anchor])),
  }
}

export const buildPeakAlignedConsensus = peakAlignedMedian

export function leaveOneOutMembers(members, withheldIndex) {
  if (!Array.isArray(members) || members.length < 2) throw new Error('LOO requires at least two members')
  if (!Number.isInteger(withheldIndex) || withheldIndex < 0 || withheldIndex >= members.length) throw new Error('LOO withheld index is invalid')
  const withheld = members[withheldIndex]
  return {
    withheld,
    training: members.filter((_, index) => index !== withheldIndex),
  }
}

export const makeLeaveOneOutFold = leaveOneOutMembers

function peakDbAt(curve, frequencyHz) {
  return interpolateLogValue(pointsFromCurve(curve), frequencyHz)
}

function metricValues(candidate, target, registeredCandidate = candidate) {
  const candidatePoints = pointsFromCurve(registeredCandidate)
  const targetPoints = pointsFromCurve(target)
  if (candidatePoints.length !== targetPoints.length || candidatePoints.some(([frequency], index) => frequency !== targetPoints[index][0])) {
    throw new Error('candidate and target must share the evaluation grid')
  }
  // Integrate the exact requested band, including interpolated values at its
  // two boundaries when the normal V2 grid does not land on them.
  const frequencies = [
    ALIGNMENT_BAND_HZ[0],
    ...candidatePoints
      .map(([frequency]) => frequency)
      .filter((frequency) => frequency > ALIGNMENT_BAND_HZ[0] && frequency < ALIGNMENT_BAND_HZ[1]),
    ALIGNMENT_BAND_HZ[1],
  ]
  const errors = frequencies.map((frequencyHz) => interpolateLogValue(candidatePoints, frequencyHz) - interpolateLogValue(targetPoints, frequencyHz))
  if (errors.length < 2) throw new Error('evaluation grid has no 6–14 kHz points')
  const absolute = errors.map(Math.abs)
  return {
    mae: absolute.reduce((sum, value) => sum + value, 0) / absolute.length,
    rmse: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length),
    maxAbs: Math.max(...absolute),
  }
}

export function calculateBandMetrics(candidate, target, options = {}) {
  const looksLikeCurve = Array.isArray(options) || (options && typeof options === 'object' && (Array.isArray(options.points) || Array.isArray(options.frequenciesHz) || Array.isArray(options.frequencies)))
  const registeredCandidate = looksLikeCurve ? options : options?.registeredCandidate ?? candidate
  return metricValues(candidate, target, registeredCandidate)
}

function candidateEvaluation(candidate, withheld) {
  const candidatePeakFrequencyHz = dominantPeakFrequency(candidate)
  const withheldPeakFrequencyHz = dominantPeakFrequency(withheld)
  const evaluationWarp = createPeakWarp(withheldPeakFrequencyHz, candidatePeakFrequencyHz)
  const registeredCandidate = warpCurve(candidate, evaluationWarp)
  const registeredMetrics = metricValues(candidate, withheld, registeredCandidate)
  const rawMetrics = metricValues(candidate, withheld, candidate)
  const candidatePeakDb = peakDbAt(candidate, candidatePeakFrequencyHz)
  const withheldPeakDb = peakDbAt(withheld, withheldPeakFrequencyHz)
  const registeredCandidatePeakDb = peakDbAt(registeredCandidate, withheldPeakFrequencyHz)
  return {
    registeredCandidate,
    evaluationWarp,
    registeredTrebleMAE: registeredMetrics.mae,
    registeredTrebleRMSE: registeredMetrics.rmse,
    registeredTrebleMaxAbs: registeredMetrics.maxAbs,
    registeredRMSE: registeredMetrics.rmse,
    registeredMaxAbs: registeredMetrics.maxAbs,
    rawTrebleMAE: rawMetrics.mae,
    rawTrebleRMSE: rawMetrics.rmse,
    rawMAE: rawMetrics.mae,
    rawRMSE: rawMetrics.rmse,
    rawUnregisteredMAE: rawMetrics.mae,
    rawUnregisteredRMSE: rawMetrics.rmse,
    candidateDominantPeakFrequencyHz: candidatePeakFrequencyHz,
    withheldDominantPeakFrequencyHz: withheldPeakFrequencyHz,
    candidatePeakFrequencyHz,
    withheldPeakFrequencyHz,
    rawPeakFrequencyErrorOctaves: Math.abs(Math.log2(candidatePeakFrequencyHz / withheldPeakFrequencyHz)),
    candidatePeakDb,
    withheldPeakDb,
    absolutePeakLevelErrorAfterRegistration: Math.abs(registeredCandidatePeakDb - withheldPeakDb),
  }
}

/** Evaluate one synthetic or explicitly authorized fold; the runner never calls this during protocol freeze. */
export function evaluateFold(trainingCurves, withheldCurve) {
  if (!Array.isArray(trainingCurves) || trainingCurves.length < 2) throw new Error('fold requires at least two training curves')
  const pointwiseCandidate = pointwiseMedian(trainingCurves)
  const alignedDetails = peakAlignedMedian(trainingCurves)
  const pointwise = candidateEvaluation(pointwiseCandidate, withheldCurve)
  const aligned = candidateEvaluation(alignedDetails.curve, withheldCurve)
  const dispersion = robustDispersion(trainingCurves, alignedDetails.alignedCurves)
  const diagnostics = peakShiftDiagnostics(alignedDetails.individualPeakFrequenciesHz, alignedDetails.canonicalPeakFrequencyHz)
  return {
    pointwise,
    aligned,
    peakAlignmentFoldWin: aligned.registeredTrebleMAE < pointwise.registeredTrebleMAE,
    canonicalPeakFrequencyHz: alignedDetails.canonicalPeakFrequencyHz,
    individualPeakFrequenciesHz: alignedDetails.individualPeakFrequenciesHz,
    warpAnchors: alignedDetails.warpAnchors,
    peakShiftDiagnostics: diagnostics,
    dispersion,
  }
}

export const evaluateLeaveOneOutFold = evaluateFold

export function robustSigma(values) {
  return 1.4826 * median(values.map((value) => Math.abs(value - median(values))))
}

function robustSigmaCurve(curves) {
  if (!Array.isArray(curves) || curves.length === 0) throw new Error('dispersion requires curves')
  const first = pointsFromCurve(curves[0])
  const allPoints = curves.map((curve) => pointsFromCurve(curve))
  for (const points of allPoints) {
    if (points.length !== first.length || points.some(([frequency], index) => frequency !== first[index][0])) {
      throw new Error('dispersion requires a common frequency grid')
    }
  }
  return first.map(([frequency], index) => [frequency, robustSigma(allPoints.map((points) => points[index][1]))])
}

export const calculateRobustSigma = robustSigmaCurve
export const robustSigmaProfile = robustSigmaCurve

function medianBand(profile, minHz, maxHz) {
  const values = profile.filter(([frequency]) => frequency >= minHz && frequency <= maxHz).map(([, value]) => value)
  return values.length > 0 ? median(values) : null
}

export function summarizeRobustSigma(profile) {
  const summary = {
    '6-8kHz': medianBand(profile, 6000, 8000),
    '8-10kHz': medianBand(profile, 8000, 10_000),
    '10-14kHz': medianBand(profile, 10_000, 14_000),
    '6-14kHz': medianBand(profile, 6000, 14_000),
  }
  return {
    ...summary,
    '6-8kHzHz': summary['6-8kHz'],
    '8-10kHzHz': summary['8-10kHz'],
    '10-14kHzHz': summary['10-14kHz'],
    '6-14kHzHz': summary['6-14kHz'],
  }
}

export function robustDispersion(beforeCurves, afterCurves) {
  const beforeProfile = robustSigmaCurve(beforeCurves)
  const afterProfile = robustSigmaCurve(afterCurves)
  return {
    beforeProfile,
    afterProfile,
    medianByBandBefore: summarizeRobustSigma(beforeProfile),
    medianByBandAfter: summarizeRobustSigma(afterProfile),
    medianFullBandBefore: medianBand(beforeProfile, ...ALIGNMENT_BAND_HZ),
    medianFullBandAfter: medianBand(afterProfile, ...ALIGNMENT_BAND_HZ),
  }
}

export const calculateDispersion = robustDispersion

/** Aggregate per-fold dispersion summaries without pooling withheld curves. */
export function aggregateRobustDispersion(dispersions) {
  if (!Array.isArray(dispersions) || dispersions.length === 0 || dispersions.some((value) => !value)) {
    throw new Error('group dispersion requires every fold')
  }
  const bands = ['6-8kHz', '8-10kHz', '10-14kHz', '6-14kHz']
  const medianByBand = (side) => Object.fromEntries(bands.map((band) => {
    const values = dispersions.map((dispersion) => dispersion[side]?.[band]).filter(Number.isFinite)
    return [band, values.length === dispersions.length ? median(values) : null]
  }))
  const medianByBandBefore = medianByBand('medianByBandBefore')
  const medianByBandAfter = medianByBand('medianByBandAfter')
  if (!Number.isFinite(medianByBandBefore['6-14kHz']) || !Number.isFinite(medianByBandAfter['6-14kHz'])) {
    throw new Error('group dispersion is missing a full-band fold summary')
  }
  return {
    foldCount: dispersions.length,
    medianByBandBefore,
    medianByBandAfter,
    medianFullBandBefore: medianByBandBefore['6-14kHz'],
    medianFullBandAfter: medianByBandAfter['6-14kHz'],
  }
}

export const aggregateFoldDispersion = aggregateRobustDispersion

export function peakShiftDiagnostics(individualPeakFrequenciesHz, canonicalPeakFrequencyHz) {
  const canonicalLog2 = Math.log2(canonicalPeakFrequencyHz)
  const shifts = individualPeakFrequenciesHz.map((frequencyHz) => {
    const signedLog2Shift = Math.log2(frequencyHz) - canonicalLog2
    return {
      frequencyHz,
      log2Shift: signedLog2Shift,
      absoluteOctaves: Math.abs(signedLog2Shift),
      cents: 1200 * Math.abs(signedLog2Shift),
    }
  })
  const absoluteOctaves = shifts.map((shift) => shift.absoluteOctaves)
  return {
    canonicalPeakFrequencyHz,
    individualPeakFrequenciesHz: [...individualPeakFrequenciesHz],
    log2Shifts: shifts.map((shift) => shift.log2Shift),
    shifts,
    minimumAbsoluteShiftOctaves: Math.min(...absoluteOctaves),
    medianAbsoluteShiftOctaves: median(absoluteOctaves),
    maximumAbsoluteShiftOctaves: Math.max(...absoluteOctaves),
    minimumAbsoluteOctaves: Math.min(...absoluteOctaves),
    medianAbsoluteOctaves: median(absoluteOctaves),
    maximumAbsoluteOctaves: Math.max(...absoluteOctaves),
  }
}

export const buildPeakShiftDiagnostics = peakShiftDiagnostics

export function registerCandidateForEvaluation(candidate, withheld) {
  const result = candidateEvaluation(candidate, withheld)
  return {
    candidate: result.registeredCandidate,
    registeredCandidate: result.registeredCandidate,
    candidatePeakFrequencyHz: result.candidateDominantPeakFrequencyHz,
    withheldPeakFrequencyHz: result.withheldDominantPeakFrequencyHz,
    warp: result.evaluationWarp,
    metrics: result,
  }
}

export function registerCandidatesForEvaluation(candidates, withheld) {
  if (!candidates || typeof candidates !== 'object') throw new Error('candidate map is required')
  const result = {}
  for (const [method, candidate] of Object.entries(candidates)) result[method] = registerCandidateForEvaluation(candidate, withheld)
  return {
    withheldPeakFrequencyHz: dominantPeakFrequency(withheld),
    candidates: result,
    ...result,
  }
}

export const evaluateCandidatesUnderSameRegistration = registerCandidatesForEvaluation

export function hasStrictMajority(wins, total) {
  if (!Number.isInteger(wins) || !Number.isInteger(total) || total <= 0 || wins < 0 || wins > total) throw new Error('invalid majority counts')
  return wins > total / 2
}

function foldWinValue(fold) {
  if (typeof fold.peakAlignmentFoldWin === 'boolean') return fold.peakAlignmentFoldWin
  const pointwise = fold.pointwise?.registeredTrebleMAE
  const aligned = fold.aligned?.registeredTrebleMAE
  if (!Number.isFinite(pointwise) || !Number.isFinite(aligned)) throw new Error('fold is missing registered MAE')
  return aligned < pointwise
}

export function classifyGroupEvidence(folds, dispersion) {
  if (!Array.isArray(folds) || folds.length === 0) throw new Error('group requires fold evidence')
  const wins = folds.filter(foldWinValue).length
  const pointwiseMae = folds.map((fold) => fold.pointwise?.registeredTrebleMAE)
  const alignedMae = folds.map((fold) => fold.aligned?.registeredTrebleMAE)
  if (pointwiseMae.some((value) => !Number.isFinite(value)) || alignedMae.some((value) => !Number.isFinite(value))) {
    return { classification: 'INCONCLUSIVE', reason: 'MISSING_REGISTERED_MAE', foldWinCount: wins, foldCount: folds.length }
  }
  const medianPointwiseRegisteredTrebleMAE = median(pointwiseMae)
  const medianAlignedRegisteredTrebleMAE = median(alignedMae)
  const foldDispersion = dispersion ?? (folds.every((fold) => fold.dispersion)
    ? aggregateRobustDispersion(folds.map((fold) => fold.dispersion))
    : null)
  const before = foldDispersion?.medianFullBandBefore ?? foldDispersion?.medianByBandBefore?.['6-14kHz']
  const after = foldDispersion?.medianFullBandAfter ?? foldDispersion?.medianByBandAfter?.['6-14kHz']
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return { classification: 'INCONCLUSIVE', reason: 'MISSING_ROBUST_SIGMA', foldWinCount: wins, foldCount: folds.length }
  }
  const strictMajority = hasStrictMajority(wins, folds.length)
  const medianMaeImprovement = medianAlignedRegisteredTrebleMAE < medianPointwiseRegisteredTrebleMAE
  const medianSigmaImprovement = after < before
  return {
    classification: strictMajority && medianMaeImprovement && medianSigmaImprovement
      ? 'PEAK_ALIGNMENT_SIGNAL'
      : 'NO_PEAK_ALIGNMENT_SIGNAL',
    foldWinCount: wins,
    foldLossCount: folds.length - wins,
    foldCount: folds.length,
    strictMajority,
    medianRegisteredMAE: {
      pointwise: medianPointwiseRegisteredTrebleMAE,
      aligned: medianAlignedRegisteredTrebleMAE,
    },
    medianRobustSigma: { before, after },
    criteria: {
      strictMajority,
      alignedMedianRegisteredMAELower: medianMaeImprovement,
      alignedMedianRobustSigmaLower: medianSigmaImprovement,
    },
  }
}

export function buildGroupDecision(folds, dispersion) {
  return classifyGroupEvidence(folds, dispersion).classification
}

export const decideGroup = classifyGroupEvidence

function memberCurve(member) {
  return member?.preparedCurve ?? member?.curve ?? member
}

/**
 * Deterministically evaluate all K LOO folds for a supplied development group.
 * This pure function accepts already prepared curves; the protocol runner is
 * responsible for provenance reacquisition and post-freeze authorization.
 */
export function evaluateDevelopmentGroup(members, { groupId } = {}) {
  if (groupId !== undefined) assertDevelopmentGroupId(groupId)
  if (!Array.isArray(members) || members.length < 3) throw new Error('development group requires at least three members')
  const folds = members.map((_, withheldIndex) => {
    const { training, withheld } = leaveOneOutMembers(members, withheldIndex)
    const evidence = evaluateFold(training.map(memberCurve), memberCurve(withheld))
    return {
      ...evidence,
      withheldMemberIdentity: withheld?.concreteCurveIdentity ?? withheld?.id ?? String(withheldIndex),
      trainingMemberIdentities: training.map((member, index) => member?.concreteCurveIdentity ?? member?.id ?? String(index)),
    }
  })
  const dispersion = aggregateRobustDispersion(folds.map((fold) => fold.dispersion))
  const decision = classifyGroupEvidence(folds, dispersion)
  return {
    groupId,
    memberCount: members.length,
    folds,
    dispersion,
    ...decision,
  }
}

export const evaluateGroupLOO = evaluateDevelopmentGroup

export function classifyDevelopmentGate(classifications) {
  if (!Array.isArray(classifications) || classifications.length !== 3) return 'INCONCLUSIVE'
  const allowed = new Set(['PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL', 'INCONCLUSIVE'])
  if (classifications.some((classification) => !allowed.has(classification) || classification === 'INCONCLUSIVE')) return 'INCONCLUSIVE'
  const signals = classifications.filter((classification) => classification === 'PEAK_ALIGNMENT_SIGNAL').length
  return signals >= 2 ? 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED' : 'PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED'
}

export function buildDevelopmentGate(groups) {
  if (!Array.isArray(groups) || groups.length !== 3) return { classification: 'INCONCLUSIVE', signalGroupCount: 0, groupCount: groups?.length ?? 0 }
  const classifications = groups.map((group) => group.classification)
  const classification = classifyDevelopmentGate(classifications)
  return {
    classification,
    signalGroupCount: classifications.filter((value) => value === 'PEAK_ALIGNMENT_SIGNAL').length,
    groupCount: groups.length,
  }
}

export const decideDevelopmentGate = buildDevelopmentGate

function isBatchCIdentifier(value) {
  return /batch\s*c|batch-c|fresh[-_ ]real[-_ ]corpus/i.test(String(value))
}

export function assertDevelopmentGroupId(groupId) {
  if (HOLDOUT_GROUP_IDS.includes(groupId)) throw new Error(`holdout group ${groupId} is explicitly rejected from C4b development`)
  if (isBatchCIdentifier(groupId)) throw new Error('Fresh Real Corpus Batch C is sealed and rejected from C4b')
  if (!DEVELOPMENT_GROUP_IDS.includes(groupId)) throw new Error(`group ${groupId} is not an approved C4b development group`)
  return true
}

export const assertC4bDevelopmentGroup = assertDevelopmentGroupId

export function assertNoHoldoutOrBatchC(groupIds) {
  for (const groupId of groupIds) assertDevelopmentGroupId(groupId)
  return true
}

export function verifyRawProvenance(bytes, { expectedSha256, expectedBlobSha } = {}) {
  const rawBytes = Buffer.from(bytes)
  if (rawBytes.length === 0) throw new Error('raw provenance bytes are empty')
  const actualSha256 = hashBytes(rawBytes)
  const actualBlobSha = gitBlobSha1(rawBytes)
  if (expectedSha256 && actualSha256 !== expectedSha256) throw new Error(`raw provenance SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`)
  if (expectedBlobSha && actualBlobSha !== expectedBlobSha) throw new Error(`raw provenance Git blob SHA-1 mismatch: expected ${expectedBlobSha}, got ${actualBlobSha}`)
  return { sha256: actualSha256, blobSha: actualBlobSha, byteLength: rawBytes.length }
}

export const verifyPinnedRawBytes = verifyRawProvenance

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * This schema describes eventual outcome evidence without containing any
 * outcome. It deliberately cannot be mistaken for an executed development
 * run during the protocol-freeze phase.
 */
export function createOutcomeArtifactSchema() {
  return {
    schemaVersion: C4B_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c4b-development-outcome-schema',
    outcomeValuesAllowed: false,
    requiredTopLevel: ['schemaVersion', 'algorithmVersion', 'groupEvidence', 'developmentGate', 'flags', 'evidenceSha256'],
    groupEvidence: {
      required: ['groupId', 'memberCount', 'members', 'folds', 'classification', 'dispersion'],
      memberProvenanceRequired: ['concreteCurveIdentity', 'collection', 'form', 'rig', 'rigClass', 'path', 'upstreamRawUrl', 'blobSha', 'upstreamSha256', 'originalParsedPointsSha256', 'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256'],
      foldRequired: [
        'withheldMemberIdentity',
        'trainingMemberIdentities',
        'canonicalPeakFrequencyHz',
        'individualPeakFrequenciesHz',
        'warpAnchors',
        'pointwise',
        'aligned',
        'peakAlignmentFoldWin',
        'peakShiftDiagnostics',
        'dispersion',
      ],
      metricFields: [
        'registeredTrebleMAE',
        'registeredTrebleRMSE',
        'registeredTrebleMaxAbs',
        'rawTrebleMAE',
        'rawTrebleRMSE',
        'candidateDominantPeakFrequencyHz',
        'withheldDominantPeakFrequencyHz',
        'rawPeakFrequencyErrorOctaves',
        'candidatePeakDb',
        'withheldPeakDb',
        'absolutePeakLevelErrorAfterRegistration',
      ],
    },
    developmentGate: {
      allowed: ['PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED', 'PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED', 'INCONCLUSIVE'],
      minimumSignalGroups: 2,
      totalGroups: 3,
    },
    flags: {
      holdoutExecuted: false,
      batchCExecuted: false,
      freshRealCorpusBatchCExecuted: false,
      outcomesGenerated: false,
      consensusAlgorithmExecuted: false,
      autoEqSolverExecuted: false,
      rawMeasurementsCommitted: false,
    },
  }
}

export function createProtocolManifest({ protocolFreezeCommit = null } = {}) {
  return {
    schemaVersion: C4B_PROTOCOL_SCHEMA_VERSION,
    algorithmVersion: C4B_ALGORITHM_VERSION,
    phase: 'protocol-freeze',
    milestone: 'C4b-protocol-only',
    frozenBoundary: C4B_FROZEN_BOUNDARY,
    c4a: { evidenceSha256: C4A_EVIDENCE_SHA256, classification: C4A_CLASSIFICATION, corpusBoundary: C4A_CORPUS_BOUNDARY },
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    domain: {
      form: C4B_FORM,
      v2MinHz: C4B_V2_MIN_HZ,
      v2MaxHz: C4B_V2_MAX_HZ,
      pointsPerOctave: C4B_V2_POINTS_PER_OCTAVE,
      normalization: { ...C4B_NORMALIZATION },
      terminalClosure: 'terminal-flat-hold-to-v2-max',
    },
    bands: {
      peakSearchHz: [...PEAK_SEARCH_BAND_HZ],
      alignmentHz: [...ALIGNMENT_BAND_HZ],
    },
    baseline: { method: 'POINTWISE_MEDIAN', smoothing: false, weighting: false, confidence: false },
    alignedConsensus: {
      method: 'PEAK_ALIGNED_MEDIAN',
      peakRule: 'max-normalized-db-in-6000-10000hz-ties-lower-frequency',
      anchors: [[6000, 6000], ['p_canonical', 'p_i'], [14000, 14000]],
      interpolation: 'linear-in-log2-frequency',
      outsideBand: 'identity',
      sourceCoverageFailure: 'reject-no-extrapolation-or-clipping',
    },
    evaluation: {
      protocol: 'leave-one-measurement-out',
      registration: 'each-candidate-separately-to-withheld-peak-frame',
      primaryMetric: 'registeredTrebleMAE',
      primaryBandHz: [...ALIGNMENT_BAND_HZ],
      foldWin: 'aligned-registeredTrebleMAE < pointwise-registeredTrebleMAE',
      strictComparison: true,
      secondaryMetrics: ['registeredRMSE', 'registeredMaxAbs', 'rawMAE', 'rawRMSE', 'peakFrequencies', 'rawPeakFrequencyErrorOctaves', 'peakLevels', 'absolutePeakLevelErrorAfterRegistration'],
    },
    diagnostics: {
      peakShifts: ['individualPeakFrequenciesHz', 'log2Shifts', 'absoluteOctaves', 'cents'],
      robustSigma: '1.4826*median_i(abs(x_i-median_j(x_j)))',
      robustSigmaBandsHz: [[6000, 8000], [8000, 10000], [10000, 14000], [6000, 14000]],
      acceptanceThresholds: false,
    },
    groupGate: {
      classification: 'PEAK_ALIGNMENT_SIGNAL iff strict-majority-wins AND lower-median-registered-MAE AND lower-median-full-band-robust-sigma',
      strictMajority: 'wins > K/2',
    },
    developmentGate: {
      requiredGroups: 3,
      minimumSignals: 2,
      supported: 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED',
      notSupported: 'PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED',
      invalid: 'INCONCLUSIVE',
    },
    developmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    developmentGroups: DEVELOPMENT_GROUP_IDS.map((groupId) => ({ groupId, memberCount: 8 })),
    rejectedHoldoutGroupIds: [...HOLDOUT_GROUP_IDS],
    rejectedBatchCToken: BATCH_C_REJECTION_TOKEN,
    protocolFreezeCommit,
    developmentExecuted: false,
    holdoutExecuted: false,
    batchCExecuted: false,
    freshRealCorpusBatchCExecuted: false,
    outcomesGenerated: false,
    consensusAlgorithmExecuted: false,
    autoEqSolverExecuted: false,
    rawMeasurementsCommitted: false,
    artifactSchema: 'schema.json',
    protocolPath: 'research/c4-peak-aligned-consensus-dev/protocol.md',
  }
}

export const createProtocolArtifact = createProtocolManifest

export async function writeProtocolArtifacts({ repositoryRoot = repositoryRootFromModule(), outputDir, protocolFreezeCommit } = {}) {
  const target = outputDir ?? resolve(repositoryRoot, C4B_ARTIFACT_RELATIVE_DIR)
  await mkdir(target, { recursive: true })
  const manifest = createProtocolManifest({ protocolFreezeCommit: protocolFreezeCommit ?? null })
  await writeFile(resolve(target, 'manifest.json'), jsonText(manifest), 'utf8')
  await writeFile(resolve(target, 'schema.json'), jsonText(createOutcomeArtifactSchema()), 'utf8')
  await writeFile(resolve(target, 'protocol-sha256.txt'), `${hashBytes(jsonText(manifest) + jsonText(createOutcomeArtifactSchema()))}\n`, 'utf8')
  return { outputDir: target, manifest }
}

function repositoryRootFromModule() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

/** Validate the frozen C4a bundle before any raw reacquisition. */
export async function verifyFrozenC4aProvenance({ repositoryRoot = repositoryRootFromModule(), artifactDir } = {}) {
  const root = artifactDir ?? resolve(repositoryRoot, '.research-artifacts/c4-peak-aligned-consensus-corpus')
  const readJson = async (name) => JSON.parse(await readFile(resolve(root, name), 'utf8'))
  const manifest = await readJson('manifest.json')
  const groupsEnvelope = await readJson('groups.json')
  const provenance = await readJson('provenance.json')
  const files = new Map()
  for (const name of ['manifest.json', 'groups.json', 'provenance.json', 'rig-inventory.json', 'selection-protocol.md']) {
    files.set(name, await readFile(resolve(root, name)))
  }
  if (manifest.frozenBoundary !== C4A_CORPUS_BOUNDARY) throw new Error('C4a artifact boundary mismatch')
  if (manifest.classification !== C4A_CLASSIFICATION) throw new Error('C4a corpus is not C4_CORPUS_READY')
  if (manifest.hashes?.evidenceSha256 && manifest.hashes.evidenceSha256 !== C4A_EVIDENCE_SHA256) throw new Error('C4a evidence SHA-256 does not match frozen evidence')
  const groups = groupsEnvelope.groups ?? groupsEnvelope
  const expectedGroupIds = [...DEVELOPMENT_GROUP_IDS, ...HOLDOUT_GROUP_IDS]
  const actualGroupIds = groups.map((group) => group.groupId)
  if (actualGroupIds.length !== expectedGroupIds.length || expectedGroupIds.some((groupId) => !actualGroupIds.includes(groupId))) {
    throw new Error('C4a selected groups do not match the frozen C4b corpus')
  }
  // C4a's verifier hashes only the named payloads in manifest.artifactFileHashes.
  validateCorpusProvenance({ manifest, groups, provenance, artifactFiles: files })
  const evidencePaths = ['groups.json', 'manifest.json', 'provenance.json', 'rig-inventory.json', 'selection-protocol.md']
  const actualEvidence = hashC4aEvidenceFiles(files, evidencePaths)
  const recordedEvidence = (await readFile(resolve(root, 'evidence-sha256.txt'), 'utf8')).trim()
  if (recordedEvidence !== C4A_EVIDENCE_SHA256 || actualEvidence !== C4A_EVIDENCE_SHA256) {
    throw new Error('C4a evidence SHA-256 does not match the frozen evidence')
  }
  return { manifest, groups, provenance, evidenceSha256: actualEvidence, artifactDir: root }
}

/** Reacquire one immutable C4a member into the ignored C4b cache. */
export async function reacquirePinnedMember(member, { fetchImpl = globalThis.fetch, cacheRoot } = {}) {
  if (!member?.path || !member.upstreamRawUrl) throw new Error('C4a member lacks immutable raw provenance')
  if (member.form !== C4B_FORM || member.rigClass !== '711-class') throw new Error('C4b member is outside the frozen in-ear 711-class gate')
  if (!member.upstreamRawUrl.includes(`/${UPSTREAM_COMMIT}/`) || member.upstreamRawUrl !== rawUrl(member.path)) throw new Error('member raw URL is not pinned to the frozen commit')
  if (member.integrity?.status !== 'valid') throw new Error('C4a member lacks valid integrity provenance')
  if (typeof fetchImpl !== 'function') throw new Error('C4b requires fetch')
  const cache = cacheRoot ?? resolve(repositoryRootFromModule(), C4B_CACHE_RELATIVE_DIR)
  const cachePath = resolve(cache, hashBytes(member.path))
  let bytes
  try {
    bytes = await readFile(cachePath)
    verifyRawProvenance(bytes, { expectedSha256: member.integrity?.upstreamSha256, expectedBlobSha: member.blobSha })
  } catch (cacheError) {
    const response = await fetchImpl(member.upstreamRawUrl, { redirect: 'error' })
    if (!response.ok) throw new Error(`upstream raw ${response.status}: ${member.upstreamRawUrl}`)
    bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0) throw new Error(`upstream raw empty: ${member.path}`)
    verifyRawProvenance(bytes, { expectedSha256: member.integrity?.upstreamSha256, expectedBlobSha: member.blobSha })
    await mkdir(cache, { recursive: true })
    await writeFile(cachePath, bytes)
  }
  const originalPoints = parseCurveCsv(bytes.toString('utf8'))
  const prepared = prepareCurve(originalPoints, {
    concreteCurveIdentity: member.concreteCurveIdentity,
    collection: member.collection,
    path: member.path,
    rig: member.rig,
  })
  if (member.integrity?.originalParsedPointsSha256 && hashBytes(JSON.stringify(originalPoints)) !== member.integrity.originalParsedPointsSha256) {
    throw new Error(`C4a original parsed-point hash mismatch: ${member.path}`)
  }
  if (member.integrity?.canonicalParsedPointsSha256) {
    const canonical = canonicalizeTerminalEndpoint(originalPoints).points
    if (hashBytes(JSON.stringify(canonical)) !== member.integrity.canonicalParsedPointsSha256) throw new Error(`C4a canonical parsed-point hash mismatch: ${member.path}`)
  }
  if (member.integrity?.normalizedParsedPointsSha256) {
    const canonical = canonicalizeTerminalEndpoint(originalPoints).points
    const normalized = normalizeCurveForIntegrity(canonical)
    if (hashBytes(JSON.stringify(normalized.normalizedPoints)) !== member.integrity.normalizedParsedPointsSha256) throw new Error(`C4a normalized parsed-point hash mismatch: ${member.path}`)
  }
  return { member, bytes, originalPoints, prepared, cachePath, provenance: verifyRawProvenance(bytes, { expectedSha256: member.integrity?.upstreamSha256, expectedBlobSha: member.blobSha }) }
}

/**
 * Development execution is intentionally gated behind a post-freeze commit.
 * Phase 1's default runner cannot acquire curves or emit outcome evidence.
 */
export async function runDevelopmentAfterProtocolFreeze({ protocolFreezeCommit, currentCommit, ...options } = {}) {
  if (options.groupIds) assertNoHoldoutOrBatchC(options.groupIds)
  if (options.holdout || options.batchC) {
    throw new Error('C4b development runner rejects holdout and Fresh Real Corpus Batch C inputs')
  }
  if (!protocolFreezeCommit || !currentCommit || protocolFreezeCommit !== currentCommit) {
    throw new Error('C4b development execution requires the exact protocol-freeze commit')
  }
  // Deliberately no implementation path is reachable during Phase 1. The
  // orchestrator may add execution in a later bounded handoff after freezing.
  throw new Error('C4b development execution is unavailable until protocol-freeze handoff is complete')
}

export async function runC4b(options = {}) {
  if (options.executeDevelopment === true || options.groupIds) return runDevelopmentAfterProtocolFreeze(options)
  const manifest = createProtocolManifest()
  if (options.writeArtifacts === true) return writeProtocolArtifacts(options)
  return manifest
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runC4b({ writeArtifacts: process.argv.includes('--write-artifacts') })
  process.stdout.write(jsonText(result))
}
