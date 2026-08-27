import type { AutoEqSettings, Curve, Normalization } from '@autoeq-workbench/core'

export interface AutoEqRunSignatureState {
  curves: readonly Curve[]
  activeFrId: string | null
  activeTargetId: string | null
  normalization: Normalization
  autoeqSettings: AutoEqSettings
}

export function getSelectedAutoEqCurves(
  state: AutoEqRunSignatureState,
): { source: Curve; target: Curve } | null {
  const source = state.curves.find(
    (curve) => curve.id === state.activeFrId && curve.kind === 'fr',
  )
  const target = state.curves.find(
    (curve) => curve.id === state.activeTargetId && curve.kind === 'target',
  )
  return source === undefined || target === undefined ? null : { source, target }
}

export function createAutoEqRunInputSignature(state: AutoEqRunSignatureState): string | null {
  const selected = getSelectedAutoEqCurves(state)
  if (selected === null) return null

  const settings = state.autoeqSettings
  return JSON.stringify({
    activeFrId: selected.source.id,
    activeTargetId: selected.target.id,
    sourcePoints: selected.source.rawPoints.map(({ frequencyHz, db }) => [frequencyHz, db]),
    targetPoints: selected.target.rawPoints.map(({ frequencyHz, db }) => [frequencyHz, db]),
    normalization: [
      state.normalization.mode,
      state.normalization.frequencyHz,
      state.normalization.levelDb,
    ],
    settings: [
      settings.minFrequencyHz,
      settings.maxFrequencyHz,
      settings.minGainDb,
      settings.maxGainDb,
      settings.minQ,
      settings.maxQ,
      settings.maxFilters,
    ],
  })
}
