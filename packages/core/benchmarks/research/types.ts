import type { Curve } from '../../src/types/curve.js'

export type ResearchCaseId = 'titan-to-storm' | 'titan-to-u12t' | 'titan-to-trio'

export interface ResearchCase {
  id: ResearchCaseId
  source: Curve
  target: Curve
}
