import { describe, expect, it } from 'vitest'

import { createAutoEqRunStore } from './autoeqRunStore'

describe('AutoEQ transient run store', () => {
  it('transitions idle to running to idle on success', () => {
    const store = createAutoEqRunStore(() => 1_250)

    store.getState().start('run-1')
    expect(store.getState()).toMatchObject({
      status: 'running',
      activeRunId: 'run-1',
      startedAtMs: 1_250,
      error: null,
    })

    store.getState().finish('run-1')
    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, startedAtMs: null, error: null })
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
      startedAtMs: null,
      error: { category: 'validation', message: 'Synthetic input is not ready.' },
    })
  })

  it('dismisses an error and resets any transient state', () => {
    const store = createAutoEqRunStore()
    store.getState().reject({ category: 'numeric', message: 'Synthetic numeric failure.' })
    store.getState().dismissError()
    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, startedAtMs: null, error: null })

    store.getState().start('run-2')
    store.getState().reset()
    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, startedAtMs: null, error: null })
  })

  it('returns cancellation to idle without an error banner', () => {
    const store = createAutoEqRunStore()
    store.getState().start('run-1')

    store.getState().cancel('run-1')

    expect(store.getState()).toMatchObject({ status: 'idle', activeRunId: null, startedAtMs: null, error: null })
  })

  it('ignores terminal state from a replaced run', () => {
    let now = 100
    const store = createAutoEqRunStore(() => now)
    store.getState().start('run-1')
    now = 200
    store.getState().start('run-2')

    store.getState().fail('run-1', { category: 'optimization', message: 'Late failure.' })
    store.getState().finish('run-1')
    store.getState().cancel('run-1')

    expect(store.getState()).toMatchObject({
      status: 'running',
      activeRunId: 'run-2',
      startedAtMs: 200,
      error: null,
    })
  })
})
