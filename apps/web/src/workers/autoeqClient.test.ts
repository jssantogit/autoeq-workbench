import type { StandardAutoEqInput } from '@autoeq-workbench/core'
import { DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import { createAutoEqResult } from '../test/autoEqFixture'
import {
  AutoEqCancelledError,
  createAutoEqClient,
  type AutoEqWorkerMessage,
  type AutoEqWorkerRequest,
  type WorkerAdapter,
} from './autoeqClient'

const input: StandardAutoEqInput = {
  source: {
    id: 'fr-1',
    name: 'Synthetic FR',
    kind: 'fr',
    rawPoints: [
      { frequencyHz: 20, db: 1 },
      { frequencyHz: 20_000, db: -1 },
    ],
    metadata: {},
  },
  target: {
    id: 'target-1',
    name: 'Synthetic Target',
    kind: 'target',
    rawPoints: [
      { frequencyHz: 20, db: 0 },
      { frequencyHz: 20_000, db: 0 },
    ],
    metadata: {},
  },
  normalization: { anchorHz: 500, targetDb: 0 },
  settings: { ...DEFAULT_AUTOEQ_SETTINGS },
}

class FakeWorker implements WorkerAdapter {
  onmessage: ((event: MessageEvent<AutoEqWorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly posted: AutoEqWorkerRequest[] = []
  terminated = false
  postFailure: Error | null = null

  postMessage(message: AutoEqWorkerRequest): void {
    if (this.postFailure !== null) throw this.postFailure
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(message: AutoEqWorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<AutoEqWorkerMessage>)
  }
}

function setup() {
  const workers: FakeWorker[] = []
  const client = createAutoEqClient(() => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  return { client, workers }
}

describe('AutoEQ Worker client', () => {
  it('resolves a matching result and disposes its Worker', async () => {
    const { client, workers } = setup()
    const run = client.run('run-1', input)
    const result = createAutoEqResult()

    expect(workers[0]!.posted).toEqual([{ type: 'run', runId: 'run-1', input }])
    workers[0]!.emit({ type: 'result', runId: 'run-1', result })

    await expect(run).resolves.toEqual(result)
    expect(workers[0]!.terminated).toBe(true)
  })

  it('rejects with the structured public Worker error', async () => {
    const { client, workers } = setup()
    const run = client.run('run-1', input)

    workers[0]!.emit({
      type: 'error',
      runId: 'run-1',
      error: { category: 'numeric', message: 'Synthetic numeric failure.' },
    })

    await expect(run).rejects.toMatchObject({
      category: 'numeric',
      message: 'Synthetic numeric failure.',
    })
    expect(workers[0]!.terminated).toBe(true)
  })

  it('disposes the Worker and returns a public error when posting fails', async () => {
    const worker = new FakeWorker()
    worker.postFailure = new Error('Private structured-clone details')
    const client = createAutoEqClient(() => worker)

    await expect(client.run('run-1', input)).rejects.toMatchObject({
      category: 'optimization',
      message: 'AutoEQ optimization failed.',
    })
    expect(worker.terminated).toBe(true)
  })

  it('terminates a cancelled run and creates a fresh Worker for the next run', async () => {
    const { client, workers } = setup()
    const firstRun = client.run('run-1', input)
    const cancelled = expect(firstRun).rejects.toBeInstanceOf(AutoEqCancelledError)

    client.cancel('run-1')

    await cancelled
    expect(workers[0]!.terminated).toBe(true)

    const secondRun = client.run('run-2', input)
    expect(workers).toHaveLength(2)
    expect(workers[1]).not.toBe(workers[0])
    workers[1]!.emit({ type: 'result', runId: 'run-2', result: createAutoEqResult(2) })
    await expect(secondRun).resolves.toMatchObject({ filters: [{ gainDb: 2 }] })
  })

  it('ignores mismatched and late messages from an obsolete runId', async () => {
    const { client, workers } = setup()
    const firstRun = client.run('run-1', input)
    const cancelled = expect(firstRun).rejects.toBeInstanceOf(AutoEqCancelledError)
    client.cancel('run-1')
    await cancelled

    const secondRun = client.run('run-2', input)
    let settled = false
    void secondRun.then(
      () => { settled = true },
      () => { settled = true },
    )

    workers[0]!.emit({ type: 'result', runId: 'run-1', result: createAutoEqResult(9) })
    workers[1]!.emit({ type: 'result', runId: 'run-1', result: createAutoEqResult(8) })
    await Promise.resolve()
    expect(settled).toBe(false)

    workers[1]!.emit({ type: 'result', runId: 'run-2', result: createAutoEqResult(1) })
    await expect(secondRun).resolves.toMatchObject({ filters: [{ gainDb: 1 }] })
  })
})
