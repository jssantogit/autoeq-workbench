import { describe, expect, it } from 'vitest'

import { createAutoEqRunStore } from './autoeqRunStore'

describe('AutoEQ transient run store', () => {
  it('transitions idle to running to idle on success', () => {
    const store = createAutoEqRunStore()

    store.getState().start('run-1')
    expect(store.getState()).toMatchObject({
      status: 'running',
      activeRunId: 'run-1',
      error: null,
    })

    store.getState().finish('run-1')
    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('transitions idle to running to a structured error without an active run', () => {
    const store = createAutoEqRunStore()
    store.getState().start('run-1')

    store.getState().fail('run-1', {
      category: 'validation',
      message: 'Synthetic input is not ready.',
    })

    expect(store.getState()).toMatchObject({
      status: 'error',
      activeRunId: null,
      error: { category: 'validation', message: 'Synthetic input is not ready.' },
    })
  })

  it('dismisses an error and resets any transient state', () => {
    const store = createAutoEqRunStore()
    store.getState().reject({ category: 'numeric', message: 'Synthetic numeric failure.' })
    store.getState().dismissError()
    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })

    store.getState().start('run-2')
    store.getState().reset()
    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('returns cancellation to idle without an error banner', () => {
    const store = createAutoEqRunStore()
    store.getState().start('run-1')

    store.getState().cancel('run-1')

    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('ignores terminal state from a replaced run', () => {
    const store = createAutoEqRunStore()
    store.getState().start('run-1')
    store.getState().start('run-2')

    store.getState().fail('run-1', { category: 'optimization', message: 'Late failure.' })
    store.getState().finish('run-1')

    expect(store.getState()).toMatchObject({
      status: 'running',
      activeRunId: 'run-2',
      error: null,
    })
  })
})
