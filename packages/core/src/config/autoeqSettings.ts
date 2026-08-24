import { MVP_NUMERIC_POLICY } from './numericPolicy.js'

export interface AutoEqSettings {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
}

export const DEFAULT_AUTOEQ_SETTINGS: Readonly<AutoEqSettings> = Object.freeze({
  minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
  maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
  minGainDb: -15,
  maxGainDb: 15,
  minQ: 0.1,
  maxQ: 12,
})

export function isValidAutoEqSettings(settings: AutoEqSettings): boolean {
  return (
    Number.isFinite(settings.minFrequencyHz) &&
    Number.isFinite(settings.maxFrequencyHz) &&
    Number.isFinite(settings.minGainDb) &&
    Number.isFinite(settings.maxGainDb) &&
    Number.isFinite(settings.minQ) &&
    Number.isFinite(settings.maxQ) &&
    settings.minFrequencyHz >= MVP_NUMERIC_POLICY.minFrequencyHz &&
    settings.maxFrequencyHz <= MVP_NUMERIC_POLICY.maxFrequencyHz &&
    settings.minFrequencyHz < settings.maxFrequencyHz &&
    settings.minGainDb < settings.maxGainDb &&
    settings.minQ > 0 &&
    settings.minQ < settings.maxQ
  )
}
