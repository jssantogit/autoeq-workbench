import type { Curve } from '@autoeq-workbench/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
