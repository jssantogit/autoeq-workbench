export interface CurvePoint {
  frequencyHz: number
  db: number
}

export type CurveRole = 'source' | 'target' | 'derived'

export type CurveMetadata = Record<string, string | number | boolean>

export interface Curve {
  id: string
  name: string
  role: CurveRole
  rawPoints: CurvePoint[]
  metadata: CurveMetadata
}

export interface Normalization {
  anchorHz: number
  targetDb: number
}

export interface PreparedCurve {
  curveId: string
  name: string
  role: CurveRole
  frequencies: number[]
  db: number[]
  normalization: Normalization
  offsetDb: number
}
