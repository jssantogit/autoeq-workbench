import type { Curve } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceStore } from '../../state/workspaceStore'
import { CurveImport } from './CurveImport'

const previousSource: Curve = {
  id: 'source-existing',
  name: 'Previous Source.csv',
  role: 'source',
  rawPoints: [
    { frequencyHz: 20, db: -1 },
    { frequencyHz: 20_000, db: 1 },
  ],
  metadata: {},
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function fileWithText(name: string, text: () => Promise<string>) {
  const file = new File([], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: vi.fn(text) })
  return file
}

describe('CurveImport', () => {
  beforeEach(() => {
    workspaceStore.setState({ source: previousSource })
  })

  it('reports a structured parse failure without replacing the previous curve', async () => {
    render(<CurveImport role="source" />)
    const file = new File(['not curve data'], 'broken.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => 'not curve data' })

    fireEvent.change(screen.getByLabelText('Import Source curve'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('[parse]')
    })
    expect(screen.getByText('Previous Source.csv')).toBeInTheDocument()
    expect(workspaceStore.getState().source).toBe(previousSource)
  })

  it('ignores an older slow success after a newer selection fails', async () => {
    const olderRead = deferred<string>()
    const older = fileWithText('older.csv', () => olderRead.promise)
    const newer = fileWithText('newer.csv', async () => 'not curve data')
    render(<CurveImport role="source" />)
    const input = screen.getByLabelText('Import Source curve')

    fireEvent.change(input, { target: { files: [older] } })
    fireEvent.change(input, { target: { files: [newer] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')

    await act(async () => {
      olderRead.resolve('20 10\n20000 12')
      await olderRead.promise
    })
    expect(workspaceStore.getState().source).toBe(previousSource)
    expect(screen.getByRole('alert')).toHaveTextContent('[parse]')
  })

  it('ignores an older slow error after a newer selection succeeds', async () => {
    const olderRead = deferred<string>()
    const older = fileWithText('older.csv', () => olderRead.promise)
    const newer = fileWithText('newer.csv', async () => '20 2\n20000 4')
    render(<CurveImport role="source" />)
    const input = screen.getByLabelText('Import Source curve')

    fireEvent.change(input, { target: { files: [older] } })
    fireEvent.change(input, { target: { files: [newer] } })
    await screen.findByText('newer.csv')

    await act(async () => {
      olderRead.reject(new Error('slow read failed'))
      await olderRead.promise.catch(() => undefined)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(workspaceStore.getState().source?.name).toBe('newer.csv')
  })
})
