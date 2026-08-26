import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { AutoEqPublicError } from '../workers/autoeqClient'

export type AutoEqRunStatus = 'idle' | 'running' | 'error'

export type { AutoEqPublicError }

export interface AutoEqRunUiState {
  status: AutoEqRunStatus
  activeRunId: string | null
  error: AutoEqPublicError | null
}

export interface AutoEqRunState extends AutoEqRunUiState {
  start: (runId: string) => void
  finish: (runId: string) => void
  fail: (runId: string, error: AutoEqPublicError) => void
  reject: (error: AutoEqPublicError) => void
  cancel: (runId: string) => void
  dismissError: () => void
  reset: () => void
}

const idleState: AutoEqRunUiState = {
  status: 'idle',
  activeRunId: null,
  error: null,
}

export function createAutoEqRunStore() {
  return createStore<AutoEqRunState>()((set) => ({
    ...idleState,
    start: (activeRunId) => set({ status: 'running', activeRunId, error: null }),
    finish: (runId) => set((state) => state.activeRunId === runId ? idleState : state),
    fail: (runId, error) => set((state) => state.activeRunId === runId
      ? { status: 'error', activeRunId: null, error: { ...error } }
      : state),
    reject: (error) => set({ status: 'error', activeRunId: null, error: { ...error } }),
    cancel: (runId) => set((state) => state.activeRunId === runId ? idleState : state),
    dismissError: () => set(idleState),
    reset: () => set(idleState),
  }))
}

export const autoEqRunStore = createAutoEqRunStore()

export function useAutoEqRunStore<T>(selector: (state: AutoEqRunState) => T): T {
  return useStore(autoEqRunStore, selector)
}
