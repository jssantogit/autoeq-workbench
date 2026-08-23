export { desiredCorrection, prepareCurve } from './curves/derive.js'
export { createLogGrid } from './curves/grid.js'
export { interpolateLogFrequency } from './curves/interpolate.js'
export { applyOffset, normalizationOffset } from './curves/normalize.js'
export { biquadCoefficients } from './dsp/biquad.js'
export type { BiquadCoefficients } from './dsp/biquad.js'
export { cascadeMagnitudeDb } from './dsp/cascade.js'
export { biquadMagnitudeDb } from './dsp/response.js'
export { parseCurveText } from './io/parseCurve.js'
export type { ParseCurveOptions } from './io/parseCurve.js'
export { CoreError } from './types/error.js'
export type { CoreErrorCategory } from './types/error.js'
export type { Filter, FilterType } from './types/filter.js'
export type {
  Curve,
  CurveMetadata,
  CurvePoint,
  CurveRole,
  Normalization,
  PreparedCurve,
} from './types/curve.js'
