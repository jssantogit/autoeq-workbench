import { DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { uiStore } from './state/uiStore'
import { workspaceStore } from './state/workspaceStore'

const { exportFrequencyResponseGraphMock } = vi.hoisted(() => ({
  exportFrequencyResponseGraphMock: vi.fn(),
}))

vi.mock('./features/graph/graphScreenshot', () => ({
  exportFrequencyResponseGraph: exportFrequencyResponseGraphMock,
}))

vi.mock('./features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: () => <section aria-label="Frequency Response graph" />,
}))

describe('App', () => {
  beforeEach(() => {
    exportFrequencyResponseGraphMock.mockReset()
    exportFrequencyResponseGraphMock.mockResolvedValue({ ok: true, message: 'Graph screenshot downloaded.' })
    uiStore.setState({ activeDockTab: 'curves', curveAppearance: {}, inspectorEnabled: true })
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      normalization: { anchorHz: 500, targetDb: 0 },
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    })
  })

  it('exports the graph from the utility rail Screenshot control', async () => {
    const user = userEvent.setup()
    render(<App />)

    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })
    const screenshot = within(utilityRail).getByRole('button', { name: 'Screenshot' })
    expect(screenshot).toHaveAttribute('title', 'Download graph screenshot')
    await user.click(screenshot)

    expect(exportFrequencyResponseGraphMock).toHaveBeenCalledOnce()
    expect(within(utilityRail).getByRole('status')).toHaveTextContent('Graph screenshot downloaded.')
  })

  it('renders a compact title and accessible icon-only theme control', () => {
    render(<App />)
    const header = screen.getByRole('banner')
    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })
    expect(within(header).getByRole('heading', { name: /autoeq workbench/i })).toBeInTheDocument()
    expect(screen.queryByText('Frequency response workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Manual frequency response workspace')).not.toBeInTheDocument()
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    const themeToggle = within(utilityRail).getByRole('button', { name: 'Switch to dark theme' })
    expect(themeToggle).toHaveAttribute('title', 'Switch to dark theme')
    expect(themeToggle.textContent).toBe('')
    expect(themeToggle.querySelector('span')).not.toBeInTheDocument()
  })

  it('assembles the graph before the shared workbench dock', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const graph = screen.getByLabelText('Frequency Response graph')
    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })
    const dock = screen.getByRole('region', { name: 'Workbench dock' })
    const shell = container.querySelector('.graphtool')
    const main = shell?.querySelector(':scope > main.main')

    expect(shell?.querySelector(':scope > header.header')).toBe(screen.getByRole('banner'))
    expect(main).toBeInTheDocument()
    expect(main?.querySelector(':scope > .parts-primary')).toContainElement(graph)
    expect(main?.querySelector(':scope > .parts-secondary')).toContainElement(dock)
    expect(utilityRail.compareDocumentPosition(graph)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(graph.compareDocumentPosition(dock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByRole('button', { name: 'Reset View' })).not.toBeInTheDocument()
    expect(within(utilityRail).queryByLabelText('+ FR')).not.toBeInTheDocument()
    expect(within(utilityRail).queryByLabelText('+ Target')).not.toBeInTheDocument()
    const curveManager = screen.getByRole('region', { name: 'Curves workspace' })
    expect(within(curveManager).getAllByLabelText(/^\+ (FR|Target)$/)).toHaveLength(2)
    expect(utilityRail).toHaveClass('utility-rail', 'utility-rail--nowrap')
    expect(within(utilityRail).getByRole('group', { name: 'NORMALIZE' })).toBeVisible()
    expect(within(utilityRail).getByLabelText('Target dB')).toHaveValue(0)
    expect(within(utilityRail).getByLabelText('Anchor Hz')).toHaveValue(500)
    expect(within(utilityRail).queryByText(/FR: None|Target: None|Normalize:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Curves' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    const equalizer = screen.getByRole('region', { name: 'Equalizer workspace' })
    expect(equalizer).toBeVisible()
    expect(within(equalizer).getByRole('group', { name: 'Equalizer profile' })).toBeVisible()
    expect(within(equalizer).queryByText('Manual')).not.toBeInTheDocument()
    expect(within(equalizer).queryByText('48 kHz')).not.toBeInTheDocument()
    expect(within(equalizer).queryByText('20 Hz-20 kHz')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add filter' })).toBeInTheDocument()
    expect(screen.getByText('0 / 64 filters')).toBeVisible()
    expect(within(equalizer).getByRole('button', { name: 'Auto EQ' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Tools' }))
    expect(screen.getByRole('heading', { name: 'Analysis' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Metrics' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Details' })).not.toBeInTheDocument()
    expect(screen.queryByText('Evaluation policy')).not.toBeInTheDocument()
    expect(screen.queryByText('48 kHz')).not.toBeInTheDocument()
    expect(screen.getByText(/active FR and Target/i)).toBeInTheDocument()
  })

  it('commits valid normalization edits directly and toggles inspector without navigation', async () => {
    const user = userEvent.setup()
    uiStore.setState({ activeDockTab: 'tools' })
    render(<App />)
    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })
    const target = within(utilityRail).getByLabelText('Target dB')
    const anchor = within(utilityRail).getByLabelText('Anchor Hz')
    const inspector = within(utilityRail).getByRole('button', { name: 'Inspect' })
    const targetCompound = target.closest('[data-normalization-field]')!
    const anchorCompound = anchor.closest('[data-normalization-field]')!

    expect(anchorCompound).toHaveAttribute('data-selected', 'true')
    expect(targetCompound).toHaveAttribute('data-selected', 'false')
    fireEvent.focus(target)
    expect(targetCompound).toHaveAttribute('data-selected', 'true')
    expect(anchorCompound).toHaveAttribute('data-selected', 'false')
    await user.click(within(anchorCompound as HTMLElement).getByText('Hz'))
    expect(anchorCompound).toHaveAttribute('data-selected', 'true')
    expect(targetCompound).toHaveAttribute('data-selected', 'false')

    expect(inspector).toHaveAttribute('aria-pressed', 'true')
    await user.click(inspector)
    expect(inspector).toHaveAttribute('aria-pressed', 'false')
    expect(uiStore.getState().inspectorEnabled).toBe(false)

    await user.clear(target)
    await user.type(target, '1.5')
    fireEvent.blur(target)
    await user.clear(anchor)
    await user.type(anchor, '800')
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(workspaceStore.getState().normalization).toEqual({ anchorHz: 800, targetDb: 1.5 })
    expect(uiStore.getState().activeDockTab).toBe('tools')

    await user.clear(anchor)
    fireEvent.blur(anchor)
    expect(anchor).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().normalization).toEqual({ anchorHz: 800, targetDb: 1.5 })
    expect(screen.getAllByLabelText('Target dB')).toHaveLength(1)
    expect(screen.getAllByLabelText('Anchor Hz')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Apply normalization' })).not.toBeInTheDocument()
  })

  it('imports FR and Target files from the shared curve upload toolbar', async () => {
    render(<App />)
    const curveManager = screen.getByRole('region', { name: 'Curves workspace' })
    const uploadToolbar = within(curveManager).getByRole('toolbar', { name: 'Curve uploads' })
    const text = '20 0\n20000 0'
    const fr = new File([], 'Measurement.txt', { type: 'text/plain' })
    const target = new File([], 'Target.csv', { type: 'text/csv' })
    Object.defineProperty(fr, 'text', { value: async () => text })
    Object.defineProperty(target, 'text', { value: async () => text })

    fireEvent.change(within(uploadToolbar).getByLabelText('+ FR'), { target: { files: [fr] } })
    fireEvent.change(within(uploadToolbar).getByLabelText('+ Target'), { target: { files: [target] } })

    await waitFor(() => expect(workspaceStore.getState().curves).toHaveLength(2))
    expect(workspaceStore.getState().curves.map(({ kind }) => kind)).toEqual(['fr', 'target'])
    expect(Object.keys(uiStore.getState().curveAppearance)).toHaveLength(2)
  })

  it('keeps import errors beside the relevant upload control', async () => {
    render(<App />)
    const uploadToolbar = screen.getByRole('toolbar', { name: 'Curve uploads' })
    const frImport = within(uploadToolbar)
      .getByLabelText('+ FR')
      .closest<HTMLElement>('.curve-import')!
    const file = new File([], 'broken.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => 'not curve data' })

    fireEvent.change(within(frImport).getByLabelText('+ FR'), {
      target: { files: [file] },
    })

    expect(await within(frImport).findByRole('alert')).toHaveTextContent('[parse]')
    const targetImport = within(uploadToolbar)
      .getByLabelText('+ Target')
      .closest<HTMLElement>('.curve-import')!
    expect(within(targetImport).queryByRole('alert')).not.toBeInTheDocument()
  })
})
