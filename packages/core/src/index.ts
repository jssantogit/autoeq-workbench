export {
  applyEqToSource,
  desiredCorrection,
  prepareCurve,
  residualError,
} from './curves/derive.js'
export { MVP_NUMERIC_POLICY, createEvaluationGrid } from './config/numericPolicy.js'
export {
  AUTOEQ_PRODUCT_LIMITS,
  DEFAULT_AUTOEQ_SETTINGS,
  isValidAutoEqSettings,
} from './config/autoeqSettings.js'
export type { AutoEqSettings } from './config/autoeqSettings.js'
export { createLogGrid } from './curves/grid.js'
export { interpolateLogFrequency } from './curves/interpolate.js'
export { applyOffset, normalizationOffset } from './curves/normalize.js'
export { biquadCoefficients } from './dsp/biquad.js'
export type { BiquadCoefficients } from './dsp/biquad.js'
export { cascadeMagnitudeDb } from './dsp/cascade.js'
export { biquadMagnitudeDb } from './dsp/response.js'
export { parseCurveText } from './io/parseCurve.js'
export type { ParseCurveOptions } from './io/parseCurve.js'
export { calculateErrorMetrics } from './metrics/errorMetrics.js'
export type { ErrorMetrics } from './metrics/errorMetrics.js'
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
  PreparedCurve,
} from './types/curve.js'
