import { CoreError, type CoreErrorCategory } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import { sanitizeAutoEqError } from './autoeq.worker'

describe('AutoEQ Worker error sanitization', () => {
  it.each(['validation', 'optimization', 'numeric'] as const)(
    'preserves an approved %s CoreError category and message',
    (category) => {
      expect(sanitizeAutoEqError(new CoreError(category, `Public ${category} message.`))).toEqual({
        category,
        message: `Public ${category} message.`,
      })
    },
  )

  it.each(['parse', 'export'] satisfies CoreErrorCategory[])(
    'replaces a disallowed %s CoreError without leaking its details',
    (category) => {
      expect(sanitizeAutoEqError(new CoreError(category, `Private ${category} details.`))).toEqual({
        category: 'optimization',
        message: 'AutoEQ optimization failed.',
      })
    },
  )

  it('replaces an unknown exception without leaking its details', () => {
    expect(sanitizeAutoEqError(new Error('Private stack and exception details.'))).toEqual({
      category: 'optimization',
      message: 'AutoEQ optimization failed.',
    })
  })
})
