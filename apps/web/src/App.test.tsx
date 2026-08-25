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

async function chooseCurveKind(
  user: ReturnType<typeof userEvent.setup>,
  curveManager: HTMLElement,
  kind: 'FR' | 'Target',
) {
  await user.click(within(curveManager).getByRole('button', { name: 'Import FR / Target' }))
  const chooser = within(curveManager).getByRole('group', { name: 'Curve type' })
  await user.click(within(chooser).getByRole('button', { name: kind }))
}

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

  it('exports the graph from the graph toolbar Screenshot control', async () => {
    const user = userEvent.setup()
    render(<App />)

    const graphToolbar = screen.getByRole('toolbar', { name: 'Graph tools' })
    const screenshot = within(graphToolbar).getByRole('button', { name: 'Screenshot' })
    expect(screenshot).toHaveAttribute('title', 'Download graph screenshot')
    await user.click(screenshot)

    expect(exportFrequencyResponseGraphMock).toHaveBeenCalledOnce()
    expect(within(graphToolbar).getByRole('status')).toHaveTextContent('Graph screenshot downloaded.')
  })

  it('renders a compact title and accessible icon-only theme control', () => {
    render(<App />)
    const header = screen.getByRole('banner')
    const graphToolbar = screen.getByRole('toolbar', { name: 'Graph tools' })
    expect(within(header).getByRole('heading', { name: /autoeq workbench/i })).toBeInTheDocument()
    expect(screen.queryByText('Frequency response workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Manual frequency response workspace')).not.toBeInTheDocument()
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    const themeToggle = within(graphToolbar).getByRole('button', { name: 'Switch to dark theme' })
    expect(themeToggle).toHaveAttribute('title', 'Switch to dark theme')
    expect(themeToggle.textContent).toBe('')
    expect(themeToggle.querySelector('span')).not.toBeInTheDocument()
  })

  it('assembles the graph before the shared workbench dock', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const graph = screen.getByLabelText('Frequency Response graph')
    const graphToolbar = screen.getByRole('toolbar', { name: 'Graph tools' })
    const dock = screen.getByRole('region', { name: 'Workbench dock' })
    const shell = container.querySelector('.graphtool')
    const main = shell?.querySelector(':scope > main.main')

    expect(shell?.querySelector(':scope > header.header')).toBe(screen.getByRole('banner'))
    expect(main).toBeInTheDocument()
    expect(main?.querySelector(':scope > .parts-primary')).toContainElement(graph)
    expect(main?.querySelector(':scope > .parts-secondary')).toContainElement(dock)
    expect(graphToolbar.compareDocumentPosition(graph)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(graph.compareDocumentPosition(dock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByRole('button', { name: 'Reset View' })).not.toBeInTheDocument()
    expect(within(graphToolbar).queryByText('Import FR / Target')).not.toBeInTheDocument()
    const curveManager = screen.getByRole('region', { name: 'Curves workspace' })
    expect(within(curveManager).getAllByRole('button', { name: 'Import FR / Target' })).toHaveLength(1)
    expect(within(curveManager).queryByText('Upload FR')).not.toBeInTheDocument()
    expect(within(curveManager).queryByText('Upload Target')).not.toBeInTheDocument()
    expect(graphToolbar).toHaveClass('tools', 'graph-toolbar')
    expect(within(graphToolbar).getByRole('group', { name: 'Normalize' })).toBeVisible()
    expect(within(graphToolbar).getByLabelText('Normalize dB')).toHaveValue(0)
    expect(within(graphToolbar).getByLabelText('Normalize Hz')).toHaveValue(500)
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
    expect(within(equalizer).getByRole('button', { name: 'AutoEQ' })).toBeEnabled()
    await user.click(screen.getByRole('tab', { name: 'Tools' }))
    const tools = screen.getByRole('region', { name: 'Tools workspace' })
    expect(within(tools).getByRole('heading', { name: 'Sound Tools' })).toBeVisible()
    expect(within(tools).getByRole('heading', { name: 'Tone Generator' })).toBeVisible()
    expect(within(tools).getByRole('heading', { name: 'Music Player' })).toBeVisible()
    expect(within(tools).getByRole('heading', { name: 'Compare A/B' })).toBeVisible()
    expect(within(tools).getByText('Analysis').closest('details')).not.toHaveAttribute('open')
    expect(within(tools).queryByRole('heading', { name: 'Metrics' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Details' })).not.toBeInTheDocument()
    expect(screen.queryByText('Evaluation policy')).not.toBeInTheDocument()
    expect(screen.queryByText('48 kHz')).not.toBeInTheDocument()
    expect(within(tools).queryByText('Active filters')).not.toBeInTheDocument()
    expect(within(tools).queryByText('Total filters')).not.toBeInTheDocument()
    expect(within(tools).queryByText('Solution state')).not.toBeInTheDocument()
    expect(within(tools).queryByText('Provenance')).not.toBeInTheDocument()
  })

  it('commits valid normalization edits directly and toggles inspector without navigation', async () => {
    const user = userEvent.setup()
    uiStore.setState({ activeDockTab: 'tools' })
    render(<App />)
    const graphToolbar = screen.getByRole('toolbar', { name: 'Graph tools' })
    const target = within(graphToolbar).getByLabelText('Normalize dB')
    const anchor = within(graphToolbar).getByLabelText('Normalize Hz')
    const inspector = within(graphToolbar).getByRole('button', { name: 'Inspect' })

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
    expect(screen.getAllByLabelText('Normalize dB')).toHaveLength(1)
    expect(screen.getAllByLabelText('Normalize Hz')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Apply normalization' })).not.toBeInTheDocument()
  })

  it('imports FR and Target files through one explicit curve import flow', async () => {
    const user = userEvent.setup()
    render(<App />)
    const curveManager = screen.getByRole('region', { name: 'Curves workspace' })
    const text = '20 0\n20000 0'
    const fr = new File([], 'Measurement.txt', { type: 'text/plain' })
    const target = new File([], 'Target.csv', { type: 'text/csv' })
    Object.defineProperty(fr, 'text', { value: async () => text })
    Object.defineProperty(target, 'text', { value: async () => text })

    await chooseCurveKind(user, curveManager, 'FR')
    fireEvent.change(within(curveManager).getByLabelText('Curve file'), { target: { files: [fr] } })
    await waitFor(() => expect(workspaceStore.getState().curves).toHaveLength(1))

    await chooseCurveKind(user, curveManager, 'Target')
    fireEvent.change(within(curveManager).getByLabelText('Curve file'), { target: { files: [target] } })

    await waitFor(() => expect(workspaceStore.getState().curves).toHaveLength(2))
    expect(workspaceStore.getState().curves.map(({ kind }) => kind)).toEqual(['fr', 'target'])
    expect(Object.keys(uiStore.getState().curveAppearance)).toHaveLength(2)
  })

  it('keeps import errors beside the unified curve import control', async () => {
    const user = userEvent.setup()
    render(<App />)
    const curveManager = screen.getByRole('region', { name: 'Curves workspace' })
    const curveImport = within(curveManager)
      .getByRole('button', { name: 'Import FR / Target' })
      .closest<HTMLElement>('.curve-import')!
    const file = new File([], 'broken.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => 'not curve data' })

    await chooseCurveKind(user, curveManager, 'FR')
    fireEvent.change(within(curveImport).getByLabelText('Curve file'), {
      target: { files: [file] },
    })

    expect(await within(curveImport).findByRole('alert')).toHaveTextContent('[parse]')
    expect(within(curveManager).getAllByRole('alert')).toHaveLength(1)
  })
})
