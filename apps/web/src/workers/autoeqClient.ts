import type { AutoEqResultV2, StandardAutoEqInputV2 } from '@autoeq-workbench/core'

export interface AutoEqPublicError {
  category: 'validation' | 'optimization' | 'numeric'
  message: string
}

export interface AutoEqWorkerRequest {
  type: 'run'
  runId: string
  input: StandardAutoEqInputV2
}

export type AutoEqWorkerMessage =
  | { type: 'result'; runId: string; result: AutoEqResultV2 }
  | { type: 'error'; runId: string; error: AutoEqPublicError }

export interface WorkerAdapter {
  onmessage: ((event: MessageEvent<AutoEqWorkerMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: AutoEqWorkerRequest): void
  terminate(): void
}

export class AutoEqCancelledError extends Error {
  constructor() {
    super('AutoEQ run cancelled.')
    this.name = 'AutoEqCancelledError'
  }
}

export class AutoEqWorkerError extends Error implements AutoEqPublicError {
  readonly category: AutoEqPublicError['category']

  constructor(error: AutoEqPublicError) {
    super(error.message)
    this.name = 'AutoEqWorkerError'
    this.category = error.category
  }
}

interface ActiveRun {
  runId: string
  worker: WorkerAdapter
  reject: (reason: unknown) => void
}

export interface AutoEqClient {
  run(runId: string, input: StandardAutoEqInputV2): Promise<AutoEqResultV2>
  cancel(runId?: string): void
}

function createBrowserWorker(): WorkerAdapter {
  return new Worker(new URL('./autoeq.worker.ts', import.meta.url), { type: 'module' })
}

export function createAutoEqClient(
  createWorker: () => WorkerAdapter = createBrowserWorker,
): AutoEqClient {
  let active: ActiveRun | null = null

  const dispose = (run: ActiveRun): void => {
    run.worker.onmessage = null
    run.worker.onerror = null
    run.worker.terminate()
    if (active === run) active = null
  }

  const cancel = (runId?: string): void => {
    const run = active
    if (run === null || (runId !== undefined && run.runId !== runId)) return
    dispose(run)
    run.reject(new AutoEqCancelledError())
  }

  return {
    run: (runId, input) => {
      cancel()
      const worker = createWorker()

      return new Promise<AutoEqResultV2>((resolve, reject) => {
        const run: ActiveRun = { runId, worker, reject }
        active = run

        worker.onmessage = ({ data }) => {
          if (active !== run || data.runId !== runId) return
          dispose(run)
          if (data.type === 'result') resolve(data.result)
          else reject(new AutoEqWorkerError(data.error))
        }
        worker.onerror = () => {
          if (active !== run) return
          dispose(run)
          reject(new AutoEqWorkerError({
            category: 'optimization',
            message: 'AutoEQ optimization failed.',
          }))
        }

        try {
          worker.postMessage({ type: 'run', runId, input })
        } catch {
          dispose(run)
          reject(new AutoEqWorkerError({
            category: 'optimization',
            message: 'AutoEQ optimization failed.',
          }))
        }
      })
    },
    cancel,
  }
}

export const autoEqClient = createAutoEqClient()
