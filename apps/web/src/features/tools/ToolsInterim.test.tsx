import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
import { ToolsInterim } from './ToolsInterim'

describe('ToolsInterim', () => {
  it('keeps the existing analysis output available under Tools', () => {
    render(<ToolsInterim derived={deriveWorkspace(createWorkspaceStore().getState())} />)

    expect(screen.getByRole('region', { name: 'Tools workspace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Analysis' })).toBeInTheDocument()
    expect(screen.getByText('MAE')).toBeInTheDocument()
    expect(screen.getByText('RMSE')).toBeInTheDocument()
    expect(screen.getByText('Preamp')).toBeInTheDocument()
  })
})
