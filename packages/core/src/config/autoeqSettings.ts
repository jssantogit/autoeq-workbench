import { MVP_NUMERIC_POLICY } from './numericPolicy.js'

export const AUTOEQ_TIME_LIMIT_OPTIONS = [5, 15, 30, 60, 120] as const
export type AutoEqTimeLimitSeconds = (typeof AUTOEQ_TIME_LIMIT_OPTIONS)[number]

export interface AutoEqSettingsV1 {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
  maxFilters: number
}

export interface AutoEqSettings extends AutoEqSettingsV1 {
  timeLimitSeconds: AutoEqTimeLimitSeconds
}

export const AUTOEQ_PRODUCT_LIMITS = Object.freeze({
  minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
  maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
  minGainDb: -15,
  maxGainDb: 15,
  minQ: 0.1,
  maxQ: 12,
  defaultMaxFilters: 10,
  hardMaxFilters: 64,
})

export const DEFAULT_AUTOEQ_SETTINGS_V1: Readonly<AutoEqSettingsV1> = Object.freeze({
  minFrequencyHz: AUTOEQ_PRODUCT_LIMITS.minFrequencyHz,
  maxFrequencyHz: AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz,
  minGainDb: AUTOEQ_PRODUCT_LIMITS.minGainDb,
  maxGainDb: AUTOEQ_PRODUCT_LIMITS.maxGainDb,
  minQ: AUTOEQ_PRODUCT_LIMITS.minQ,
  maxQ: AUTOEQ_PRODUCT_LIMITS.maxQ,
  maxFilters: AUTOEQ_PRODUCT_LIMITS.defaultMaxFilters,
})

export const DEFAULT_AUTOEQ_SETTINGS: Readonly<AutoEqSettings> = Object.freeze({
  ...DEFAULT_AUTOEQ_SETTINGS_V1,
  timeLimitSeconds: 30,
})

export function isValidAutoEqSettingsV1(settings: AutoEqSettingsV1): boolean {
  return (
    Number.isFinite(settings.minFrequencyHz) &&
    Number.isFinite(settings.maxFrequencyHz) &&
    Number.isFinite(settings.minGainDb) &&
    Number.isFinite(settings.maxGainDb) &&
    Number.isFinite(settings.minQ) &&
    Number.isFinite(settings.maxQ) &&
    Number.isInteger(settings.maxFilters) &&
    settings.minFrequencyHz >= AUTOEQ_PRODUCT_LIMITS.minFrequencyHz &&
    settings.maxFrequencyHz <= AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz &&
    settings.minFrequencyHz < settings.maxFrequencyHz &&
    settings.minGainDb >= AUTOEQ_PRODUCT_LIMITS.minGainDb &&
    settings.maxGainDb <= AUTOEQ_PRODUCT_LIMITS.maxGainDb &&
    settings.minGainDb < settings.maxGainDb &&
    settings.minQ >= AUTOEQ_PRODUCT_LIMITS.minQ &&
    settings.maxQ <= AUTOEQ_PRODUCT_LIMITS.maxQ &&
    settings.minQ < settings.maxQ &&
    settings.maxFilters >= 0 &&
    settings.maxFilters <= AUTOEQ_PRODUCT_LIMITS.hardMaxFilters
  )
}

export function isValidAutoEqSettings(settings: AutoEqSettings): boolean {
  return (
    isValidAutoEqSettingsV1(settings) &&
    AUTOEQ_TIME_LIMIT_OPTIONS.includes(settings.timeLimitSeconds)
  )
}
