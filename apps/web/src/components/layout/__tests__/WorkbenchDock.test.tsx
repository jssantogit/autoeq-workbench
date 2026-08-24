import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { initializeTheme, uiStore } from '../../../state/uiStore'

vi.mock('../../../features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: () => <section aria-label="Frequency response graph" />,
}))

describe('workbench shell', () => {
  beforeEach(() => {
    localStorage.clear()
    uiStore.setState({ activeDockTab: 'curves', theme: 'light' })
    initializeTheme()
  })

  it('uses one Curves / Equalizer / Details dock and switches content without changing pages', async () => {
    const user = userEvent.setup()
    render(<App />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Curves', 'Equalizer', 'Details'])
    const tablist = screen.getByRole('tablist', { name: 'Workbench tools' })
    expect(tablist).toBeVisible()
    expect(tablist).toHaveClass('dock-tabs', 'dock-tabs--segmented')
    expect(tablist.children).toHaveLength(3)
    const handle = document.querySelector('.workbench-dock__handle')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('tab', { name: 'Curves' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Curves' })).toHaveAttribute(
      'aria-controls',
      'dock-panel-curves',
    )
    expect(screen.getByRole('tabpanel', { name: 'Curves' })).toHaveAttribute(
      'aria-labelledby',
      'dock-tab-curves',
    )

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    expect(screen.getByRole('tab', { name: 'Equalizer' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tabpanel', { name: 'Equalizer' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByRole('tabpanel', { name: 'Details' })).toBeVisible()
  })

  it('supports arrow, Home, and End keyboard navigation with focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    const curves = screen.getByRole('tab', { name: 'Curves' })
    curves.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Equalizer' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Equalizer' })).toBeVisible()

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(curves).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Curves' })).toBeVisible()
  })

  it('starts light and lets the user switch themes persistently', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('autoeq-workbench.theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
  })
})
