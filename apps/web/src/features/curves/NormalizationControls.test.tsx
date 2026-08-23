import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultNormalization, workspaceStore } from '../../state/workspaceStore'
import { CurvesTab } from './CurvesTab'

describe('NormalizationControls', () => {
  beforeEach(() => {
    workspaceStore.setState({
      sourceNormalization: { ...defaultNormalization },
      targetNormalization: { ...defaultNormalization },
    })
  })

  it('shows 500 Hz and 0 dB defaults for both curves and shared controls', () => {
    render(<CurvesTab />)

    expect(screen.getByLabelText('Source anchor Hz')).toHaveValue(500)
    expect(screen.getByLabelText('Source target dB')).toHaveValue(0)
    expect(screen.getByLabelText('Target anchor Hz')).toHaveValue(500)
    expect(screen.getByLabelText('Target target dB')).toHaveValue(0)
    expect(screen.getByLabelText('Together anchor Hz')).toHaveValue(500)
    expect(screen.getByLabelText('Together target dB')).toHaveValue(0)
  })

  it('updates Source and Target normalization independently', async () => {
    const user = userEvent.setup()
    render(<CurvesTab />)

    const sourceAnchor = screen.getByLabelText('Source anchor Hz')
    await user.clear(sourceAnchor)
    await user.type(sourceAnchor, '1000')
    expect(workspaceStore.getState().sourceNormalization.anchorHz).toBe(500)
    await user.keyboard('{Enter}')
    expect(workspaceStore.getState().sourceNormalization.anchorHz).toBe(1_000)
    expect(workspaceStore.getState().targetNormalization.anchorHz).toBe(500)

    const targetDb = screen.getByLabelText('Target target dB')
    await user.clear(targetDb)
    await user.type(targetDb, '-2')
    await user.keyboard('{Enter}')
    expect(workspaceStore.getState().targetNormalization.targetDb).toBe(-2)
    expect(workspaceStore.getState().sourceNormalization.targetDb).toBe(0)
  })

  it('applies one anchor and level to both curves', async () => {
    const user = userEvent.setup()
    render(<CurvesTab />)

    const togetherAnchor = screen.getByLabelText('Together anchor Hz')
    const togetherDb = screen.getByLabelText('Together target dB')
    await user.clear(togetherAnchor)
    await user.type(togetherAnchor, '800')
    await user.clear(togetherDb)
    await user.type(togetherDb, '1.5')
    await user.click(screen.getByRole('button', { name: 'Normalize Together' }))

    expect(workspaceStore.getState().sourceNormalization).toEqual({
      anchorHz: 800,
      targetDb: 1.5,
    })
    expect(workspaceStore.getState().targetNormalization).toEqual({
      anchorHz: 800,
      targetDb: 1.5,
    })
  })
})
