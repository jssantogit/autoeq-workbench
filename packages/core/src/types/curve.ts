export interface CurvePoint {
  frequencyHz: number
  db: number
}

export type CurveKind = 'fr' | 'target'

export type CurveMetadata = Record<string, string | number | boolean>

export interface Curve {
  id: string
  name: string
  kind: CurveKind
  rawPoints: CurvePoint[]
  metadata: CurveMetadata
}

export type NormalizationMode = 'hz' | 'db'

export interface Normalization {
  mode: NormalizationMode
  frequencyHz: number
  levelDb: number
}

export interface PreparedCurve {
  curveId: string
  name: string
  kind: CurveKind
  frequencies: number[]
  db: number[]
  normalization: Normalization
  offsetDb: number
}
