import {
  CoreError,
  runStandardAutoEqV2,
  type AutoEqResultV2,
  type StandardAutoEqInputV2,
} from '@autoeq-workbench/core'

import type {
  AutoEqPublicError,
  AutoEqWorkerMessage,
  AutoEqWorkerRequest,
} from './autoeqClient'

interface WorkerScope {
  onmessage: ((event: MessageEvent<AutoEqWorkerRequest>) => void) | null
  postMessage(message: AutoEqWorkerMessage): void
}

const workerScope = self as unknown as WorkerScope

export function sanitizeAutoEqError(cause: unknown): AutoEqPublicError {
  if (
    cause instanceof CoreError &&
    (cause.category === 'validation' ||
      cause.category === 'optimization' ||
      cause.category === 'numeric')
  ) {
    return { category: cause.category, message: cause.message }
  }
  return { category: 'optimization', message: 'AutoEQ optimization failed.' }
}

export function runAutoEqWorkerInput(input: StandardAutoEqInputV2): AutoEqResultV2 {
  return runStandardAutoEqV2(input)
}

workerScope.onmessage = ({ data }) => {
  if (data.type !== 'run') return

  try {
    workerScope.postMessage({
      type: 'result',
      runId: data.runId,
      result: runAutoEqWorkerInput(data.input),
    })
  } catch (cause) {
    workerScope.postMessage({ type: 'error', runId: data.runId, error: sanitizeAutoEqError(cause) })
  }
}
