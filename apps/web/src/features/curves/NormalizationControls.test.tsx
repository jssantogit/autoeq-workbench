import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultNormalization, workspaceStore } from '../../state/workspaceStore'
import { CurvesTab } from './CurvesTab'

describe('NormalizationControls', () => {
  beforeEach(() => {
    workspaceStore.setState({
      normalization: { ...defaultNormalization },
    })
  })

  it('shows exactly one global Anchor Hz and Target dB control', () => {
    render(<CurvesTab />)

    expect(screen.getAllByLabelText('Anchor Hz')).toHaveLength(1)
    expect(screen.getByLabelText('Anchor Hz')).toHaveValue(500)
    expect(screen.getAllByLabelText('Target dB')).toHaveLength(1)
    expect(screen.getByLabelText('Target dB')).toHaveValue(0)
    expect(screen.queryByText(/normalize together/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/source anchor/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/target anchor/i)).not.toBeInTheDocument()
  })

  it('commits Anchor Hz and Target dB as one global history action', async () => {
    const user = userEvent.setup()
    render(<CurvesTab />)

    const anchor = screen.getByLabelText('Anchor Hz')
    const targetDb = screen.getByLabelText('Target dB')
    await user.clear(anchor)
    await user.type(anchor, '800')
    await user.clear(targetDb)
    await user.type(targetDb, '1.5')
    expect(workspaceStore.getState().normalization).toEqual(defaultNormalization)
    await user.click(screen.getByRole('button', { name: 'Apply normalization' }))

    expect(workspaceStore.getState().normalization).toEqual({
      anchorHz: 800,
      targetDb: 1.5,
    })
    workspaceStore.getState().undo()
    expect(workspaceStore.getState().normalization).toEqual(defaultNormalization)
    expect(workspaceStore.getState().canUndo).toBe(false)
  })
})
