export {
  applyEqToSource,
  desiredCorrection,
  prepareCurve,
  residualError,
} from './curves/derive.js'
export { MVP_NUMERIC_POLICY, createEvaluationGrid } from './config/numericPolicy.js'
export {
  AUTOEQ_PRODUCT_LIMITS,
  AUTOEQ_TIME_LIMIT_OPTIONS,
  DEFAULT_AUTOEQ_SETTINGS,
  DEFAULT_AUTOEQ_SETTINGS_V1,
  isValidAutoEqSettings,
  isValidAutoEqSettingsV1,
} from './config/autoeqSettings.js'
export type {
  AutoEqSettings,
  AutoEqSettingsV1,
  AutoEqTimeLimitSeconds,
} from './config/autoeqSettings.js'
export { STANDARD_V1_CONFIG, resolveStandardAutoEqConfig } from './autoeq/config.js'
export { evaluateObjective } from './autoeq/loss.js'
export type { ObjectiveInput } from './autoeq/loss.js'
export { findResidualRegions, generateCandidates } from './autoeq/candidates.js'
export type { FilterCandidate, ResidualRegion } from './autoeq/candidates.js'
export { auditCancellations } from './autoeq/cancellation.js'
export { discreteRefine } from './autoeq/discreteRefine.js'
export { refineFilters } from './autoeq/refine.js'
export { optimizeGreedy } from './autoeq/optimize.js'
export type { OptimizationState } from './autoeq/optimize.js'
export { pruneFilters } from './autoeq/prune.js'
export { POWERAMP_MANUAL_ENTRY_POLICY, quantizeFilters } from './autoeq/quantize.js'
export { runStandardAutoEq } from './autoeq/runStandardAutoEq.js'
export {
  STANDARD_V2_CONFIG,
  calculateWorkingMaxFilters,
  resolveStandardAutoEqV2Config,
} from './autoeq/v2/config.js'
export type { StandardAutoEqV2Config } from './autoeq/v2/config.js'
export { compareV2Solutions, isV2TargetAchieved } from './autoeq/v2/ranking.js'
export type { V2Solution } from './autoeq/v2/ranking.js'
export { createStandardV2Deadline } from './autoeq/v2/runtime.js'
export type { StandardV2Deadline, StandardV2Runtime } from './autoeq/v2/runtime.js'
export {
  appendV2ResponseCacheFilter,
  createV2ResponseCache,
  replaceV2ResponseCacheFilter,
} from './autoeq/v2/responseCache.js'
export type { V2ResponseCache } from './autoeq/v2/responseCache.js'
export type {
  AutoEqConfig,
  AutoEqResult,
  AutoEqResultV1,
  AutoEqResultV2,
  CancellationAudit,
  CancellationPair,
  RunManifest,
  RunManifestV1,
  RunManifestV2,
  StandardAlgorithmParameters,
  StandardAutoEqInput,
  StandardAutoEqInputV1,
  StandardAutoEqInputV2,
  StandardV2AlgorithmParameters,
  StandardV2TerminationReason,
} from './autoeq/types.js'
export { createLogGrid } from './curves/grid.js'
export { interpolateLogFrequency } from './curves/interpolate.js'
export { calculateSquiglinkLoudnessOffset } from './curves/loudnessNormalize.js'
export { applyOffset, normalizationOffset } from './curves/normalize.js'
export { biquadCoefficients } from './dsp/biquad.js'
export type { BiquadCoefficients } from './dsp/biquad.js'
export { cascadeMagnitudeDb } from './dsp/cascade.js'
export { biquadMagnitudeDb } from './dsp/response.js'
export {
  formatEqualizerApoFilters,
  parseEqualizerApoFilters,
} from './io/equalizerApo.js'
export type { FilterDefinition } from './io/equalizerApo.js'
export { formatPowerampText } from './exports/powerampText.js'
export type { PowerampTextInput } from './exports/powerampText.js'
export { createGraphicEq, formatGraphicEq } from './io/graphicEq.js'
export type { GraphicEqPoint } from './io/graphicEq.js'
export { parseCurveText } from './io/parseCurve.js'
export type { ParseCurveOptions } from './io/parseCurve.js'
export { calculateErrorMetrics } from './metrics/errorMetrics.js'
export type { ErrorMetrics } from './metrics/errorMetrics.js'
export { calculateBandMetrics } from './metrics/bandMetrics.js'
export type { BandMetric, MetricBand } from './metrics/bandMetrics.js'
export { calculatePreampDb } from './metrics/preamp.js'
export type { PreampResult } from './metrics/preamp.js'
export { CoreError } from './types/error.js'
export type { CoreErrorCategory } from './types/error.js'
export type { Filter, FilterType } from './types/filter.js'
export type {
  Curve,
  CurveKind,
  CurveMetadata,
  CurvePoint,
  Normalization,
  NormalizationMode,
  PreparedCurve,
} from './types/curve.js'
