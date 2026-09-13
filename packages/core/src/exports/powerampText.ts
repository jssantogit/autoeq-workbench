import { AUTOEQ_PRODUCT_LIMITS } from '../config/autoeqSettings.js'
import { POWERAMP_MANUAL_ENTRY_POLICY } from '../autoeq/quantize.js'
import { CoreError } from '../types/error.js'
import type { Filter, FilterType } from '../types/filter.js'

export interface PowerampTextInput {
  name: string
  preampDb: number
  filters: readonly Filter[]
}

const SUPPORTED_FILTER_TYPES: ReadonlySet<FilterType> = new Set(['PK', 'LS', 'HS'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOnGrid(value: number, step: number): boolean {
  const steps = value / step
  const nearest = Math.round(steps)
  const tolerance = Math.max(1, Math.abs(nearest)) * Number.EPSILON * 64
  return Math.abs(steps - nearest) <= tolerance
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || value === 0 ? 0 : value
}

function formatPreamp(preampDb: number): string {
  const normalized = normalizeZero(preampDb)
  const formatted = normalized.toFixed(1)
  return formatted === '-0.0' ? '0.0' : formatted
}

function formatGain(gainDb: number): string {
  const normalized = normalizeZero(gainDb)
  const formatted = normalized.toFixed(1)
  return formatted === '-0.0' ? '0.0' : formatted
}

function formatQ(q: number): string {
  const normalized = normalizeZero(q)
  const formatted = normalized.toFixed(2)
  return formatted === '-0.00' ? '0.00' : formatted
}

function formatFrequency(frequencyHz: number): string {
  const normalized = normalizeZero(frequencyHz)
  return normalized.toFixed(0)
}

export function formatPowerampText(input: PowerampTextInput): string {
  if (!input || typeof input !== 'object') {
    throw new CoreError('export', 'Poweramp export input must be an object')
  }
  if (typeof input.name !== 'string') {
    throw new CoreError('export', 'Poweramp preset name must be a string')
  }
  if (/[\r\n]/.test(input.name)) {
    throw new CoreError('export', 'Poweramp preset name cannot contain newline characters')
  }
  if (!isFiniteNumber(input.preampDb)) {
    throw new CoreError('export', 'Poweramp preamp must be finite')
  }
  if (!Array.isArray(input.filters)) {
    throw new CoreError('export', 'Poweramp filters must be an array')
  }

  const enabledFilters: Filter[] = []

  for (const filter of input.filters) {
    if (!filter || typeof filter !== 'object') {
      throw new CoreError('export', 'Filter must be an object')
    }
    if (typeof filter.enabled !== 'boolean') {
      throw new CoreError('export', 'Filter enabled property must be a boolean')
    }
    if (!filter.enabled) {
      continue
    }

    if (!SUPPORTED_FILTER_TYPES.has(filter.type)) {
      throw new CoreError('export', `Unsupported filter type: ${String(filter.type)}`)
    }

    if (!isFiniteNumber(filter.frequencyHz)) {
      throw new CoreError('export', 'Filter frequency must be finite')
    }
    if (
      filter.frequencyHz < AUTOEQ_PRODUCT_LIMITS.minFrequencyHz ||
      filter.frequencyHz > AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz
    ) {
      throw new CoreError(
        'export',
        `Filter frequency ${filter.frequencyHz} Hz must be between ${AUTOEQ_PRODUCT_LIMITS.minFrequencyHz} and ${AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz} Hz`,
      )
    }
    if (!isOnGrid(filter.frequencyHz, POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz)) {
      throw new CoreError(
        'export',
        `Filter frequency ${filter.frequencyHz} Hz is not on the manual-entry grid (step: ${POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz} Hz)`,
      )
    }

    if (!isFiniteNumber(filter.gainDb)) {
      throw new CoreError('export', 'Filter gain must be finite')
    }
    if (
      filter.gainDb < AUTOEQ_PRODUCT_LIMITS.minGainDb ||
      filter.gainDb > AUTOEQ_PRODUCT_LIMITS.maxGainDb
    ) {
      throw new CoreError(
        'export',
        `Filter gain ${filter.gainDb} dB must be between ${AUTOEQ_PRODUCT_LIMITS.minGainDb} and ${AUTOEQ_PRODUCT_LIMITS.maxGainDb} dB`,
      )
    }
    if (!isOnGrid(filter.gainDb, POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb)) {
      throw new CoreError(
        'export',
        `Filter gain ${filter.gainDb} dB is not on the manual-entry grid (step: ${POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb} dB)`,
      )
    }

    if (!isFiniteNumber(filter.q)) {
      throw new CoreError('export', 'Filter Q must be finite')
    }
    if (
      filter.q < AUTOEQ_PRODUCT_LIMITS.minQ ||
      filter.q > AUTOEQ_PRODUCT_LIMITS.maxQ
    ) {
      throw new CoreError(
        'export',
        `Filter Q ${filter.q} must be between ${AUTOEQ_PRODUCT_LIMITS.minQ} and ${AUTOEQ_PRODUCT_LIMITS.maxQ}`,
      )
    }
    if (!isOnGrid(filter.q, POWERAMP_MANUAL_ENTRY_POLICY.qStep)) {
      throw new CoreError(
        'export',
        `Filter Q ${filter.q} is not on the manual-entry grid (step: ${POWERAMP_MANUAL_ENTRY_POLICY.qStep})`,
      )
    }

    enabledFilters.push(filter)
  }

  if (enabledFilters.length > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) {
    throw new CoreError(
      'export',
      `Poweramp export cannot contain more than ${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters} filters`,
    )
  }

  const lines: string[] = [
    `# AutoEQ Workbench — ${input.name}`,
    '# Poweramp-style manual-entry preset',
    `Preamp: ${formatPreamp(input.preampDb)} dB`,
  ]

  for (const [index, filter] of enabledFilters.entries()) {
    const filterNumber = index + 1
    const freq = formatFrequency(filter.frequencyHz)
    const gain = formatGain(filter.gainDb)
    const q = formatQ(filter.q)
    lines.push(`Filter ${filterNumber}: ON ${filter.type} Fc ${freq} Hz Gain ${gain} dB Q ${q}`)
  }

  return lines.join('\n')
}
