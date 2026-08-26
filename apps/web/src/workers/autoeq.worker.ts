import { CoreError, runStandardAutoEq } from '@autoeq-workbench/core'

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

function publicError(cause: unknown): AutoEqPublicError {
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

workerScope.onmessage = ({ data }) => {
  if (data.type !== 'run') return

  try {
    workerScope.postMessage({
      type: 'result',
      runId: data.runId,
      result: runStandardAutoEq(data.input),
    })
  } catch (cause) {
    workerScope.postMessage({ type: 'error', runId: data.runId, error: publicError(cause) })
  }
}
