import { AUTOEQ_PRODUCT_LIMITS } from '../config/autoeqSettings.js'
import { CoreError } from '../types/error.js'
import type { Filter, FilterType } from '../types/filter.js'

export type FilterDefinition = Omit<Filter, 'id'>

const FILTER_LINE =
  /^Filter\s*\d+:\s*(\S+)\s+(\S+)\s+Fc\s*(\S+)\s*Hz\s*Gain\s*(\S+)\s*dB(?:\s*Q\s*(\S+))?\s*$/i

const FILTER_TYPES: Readonly<Record<string, FilterType>> = {
  PK: 'PK',
  LS: 'LS',
  LSQ: 'LS',
  LSC: 'LS',
  HS: 'HS',
  HSQ: 'HS',
  HSC: 'HS',
}

function parseFiniteNumber(value: string, field: string, lineNumber: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new CoreError('validation', `Filter line ${lineNumber} ${field} must be finite`)
  }

  return parsed
}

function validateBounds(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
  lineNumber: number,
): void {
  if (value < minimum || value > maximum) {
    throw new CoreError(
      'validation',
      `Filter line ${lineNumber} ${field} must be between ${minimum} and ${maximum}`,
    )
  }
}

export function parseEqualizerApoFilters(text: string): FilterDefinition[] {
  const filters: FilterDefinition[] = []

  for (const [index, sourceLine] of text.split(/\r\n?|\n/).entries()) {
    const line = sourceLine.trim()

    if (!/^Filter(?:\b|(?=\d))/i.test(line)) {
      continue
    }

    const match = FILTER_LINE.exec(line)
    const lineNumber = index + 1

    if (!match) {
      throw new CoreError('parse', `Malformed filter line ${lineNumber}`)
    }

    const [, stateLabel, typeLabel, frequencyText, gainText, qText] = match
    const state = stateLabel.toUpperCase()
    const type = FILTER_TYPES[typeLabel.toUpperCase()]

    if (state !== 'ON' && state !== 'OFF') {
      throw new CoreError('parse', `Filter line ${lineNumber} has unsupported state ${stateLabel}`)
    }
    if (!type) {
      throw new CoreError('parse', `Filter line ${lineNumber} has unsupported type ${typeLabel}`)
    }
    if (type === 'PK' && qText === undefined) {
      throw new CoreError('parse', `Filter line ${lineNumber} PK filter requires Q`)
    }

    const frequencyHz = parseFiniteNumber(frequencyText, 'frequency', lineNumber)
    const gainDb = parseFiniteNumber(gainText, 'gain', lineNumber)
    const q = qText === undefined ? 0.707 : parseFiniteNumber(qText, 'Q', lineNumber)

    validateBounds(
      frequencyHz,
      'frequency',
      AUTOEQ_PRODUCT_LIMITS.minFrequencyHz,
      AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz,
      lineNumber,
    )
    validateBounds(
      gainDb,
      'gain',
      AUTOEQ_PRODUCT_LIMITS.minGainDb,
      AUTOEQ_PRODUCT_LIMITS.maxGainDb,
      lineNumber,
    )
    validateBounds(
      q,
      'Q',
      AUTOEQ_PRODUCT_LIMITS.minQ,
      AUTOEQ_PRODUCT_LIMITS.maxQ,
      lineNumber,
    )

    filters.push({ enabled: state === 'ON', type, frequencyHz, gainDb, q })

    if (filters.length > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) {
      throw new CoreError(
        'validation',
        `Equalizer APO input cannot contain more than ${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters} filters`,
      )
    }
  }

  if (filters.length === 0) {
    throw new CoreError('parse', 'Equalizer APO input contains no recognized filters')
  }

  return filters
}

export function formatEqualizerApoFilters(
  filters: readonly Filter[],
  preampDb: number,
): string {
  if (!Number.isFinite(preampDb)) {
    throw new CoreError('export', 'Equalizer APO preamp must be finite')
  }

  const typeLabels: Readonly<Record<FilterType, string>> = {
    PK: 'PK',
    LS: 'LSC',
    HS: 'HSC',
  }
  const lines = [`Preamp: ${preampDb.toFixed(1)} dB`]

  for (const [index, filter] of filters.entries()) {
    lines.push(
      `Filter ${index + 1}: ${filter.enabled ? 'ON' : 'OFF'} ${typeLabels[filter.type]} ` +
        `Fc ${filter.frequencyHz.toFixed(0)} Hz Gain ${filter.gainDb.toFixed(1)} dB ` +
        `Q ${filter.q.toFixed(3)}`,
    )
  }

  return lines.join('\r\n')
}
