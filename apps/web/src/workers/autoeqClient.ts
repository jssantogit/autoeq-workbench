import {
  DEFAULT_AUTOEQ_SETTINGS,
  type AutoEqResultV2,
  type AutoEqSettings,
  type StandardAutoEqInputV2,
} from '@autoeq-workbench/core'

export const EXPERIMENTAL_STRUCTURAL_AUTOEQ_MODE =
  'max10-q31-b4-p8-experimental-zero-start' as const

export type AutoEqExecutionMode =
  | 'standard'
  | typeof EXPERIMENTAL_STRUCTURAL_AUTOEQ_MODE

export interface AutoEqRunOptions {
  mode?: AutoEqExecutionMode
}

export function isExperimentalStructuralAutoEqEligible(
  settings: AutoEqSettings,
): boolean {
  return (
    settings.minFrequencyHz === DEFAULT_AUTOEQ_SETTINGS.minFrequencyHz &&
    settings.maxFrequencyHz === DEFAULT_AUTOEQ_SETTINGS.maxFrequencyHz &&
    settings.minGainDb === DEFAULT_AUTOEQ_SETTINGS.minGainDb &&
    settings.maxGainDb === DEFAULT_AUTOEQ_SETTINGS.maxGainDb &&
    settings.minQ === DEFAULT_AUTOEQ_SETTINGS.minQ &&
    settings.maxQ === DEFAULT_AUTOEQ_SETTINGS.maxQ &&
    settings.maxFilters === 10
  )
}

export interface AutoEqPublicError {
  category: 'validation' | 'optimization' | 'numeric'
  message: string
}

export interface AutoEqWorkerRequest {
  type: 'run'
  runId: string
  input: StandardAutoEqInputV2
  mode?: AutoEqExecutionMode
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
  run(
    runId: string,
    input: StandardAutoEqInputV2,
    options?: AutoEqRunOptions,
  ): Promise<AutoEqResultV2>
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
    run: (runId, input, options) => {
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
          const mode = options?.mode ?? 'standard'
          worker.postMessage(
            mode === 'standard'
              ? { type: 'run', runId, input }
              : { type: 'run', runId, input, mode },
          )
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
