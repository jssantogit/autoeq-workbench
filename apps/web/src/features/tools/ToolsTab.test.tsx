import type { Filter } from '@autoeq-workbench/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
import { ToolsTab } from './ToolsTab'

const soundToolsMock = vi.fn()

vi.mock('./SoundTools', () => ({
  SoundTools: (props: unknown) => {
    soundToolsMock(props)
    return <section aria-label="Sound Tools">Sound Tools</section>
  },
}))

vi.mock('./EqCompare', () => ({
  EqCompare: () => <section aria-label="Compare A/B">Compare A/B</section>,
}))

describe('ToolsTab', () => {
  it('orders Sound Tools, Compare A/B, Session, then secondary Analysis and forwards canonical EQ', () => {
    const filter: Filter = {
      id: 'filter-1',
      enabled: true,
      type: 'PK',
      frequencyHz: 1_000,
      gainDb: 8,
      q: 1,
    }
    const derived = {
      ...deriveWorkspace(createWorkspaceStore().getState()),
      preamp: { preampDb: -2.5, maxBoostDb: 2.5, maxBoostFrequencyHz: 1_000 },
    }

    const { container } = render(<ToolsTab filters={[filter]} derived={derived} />)

    const tools = screen.getByRole('region', { name: 'Tools workspace' })
    expect([...tools.children]).toEqual([
      screen.getByRole('region', { name: 'Sound Tools' }),
      screen.getByRole('region', { name: 'Compare A/B' }),
      screen.getByRole('region', { name: 'Session' }),
      container.querySelector('details'),
    ])
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    expect(soundToolsMock).toHaveBeenCalledWith({ filters: [filter], preampDb: -2.5 })
  })
})
