import type { Curve } from '@autoeq-workbench/core'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { EQUALIZED_FR_APPEARANCE_ID } from '../graph/graphSeries'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { CurveManagerRow, DerivedCurveManagerRow } from './CurveManagerRow'

const source: Curve = {
  id: 'source',
  name: 'A deliberately long imported source curve name.txt',
  kind: 'fr',
  rawPoints: [{ frequencyHz: 20, db: 1 }, { frequencyHz: 20_000, db: 2 }],
  metadata: {},
}

function renderRow(curve: Curve) {
  return render(<table><tbody><CurveManagerRow curve={curve} /></tbody></table>)
}

describe('CurveManagerRow', () => {
  beforeEach(() => {
    workspaceStore.setState({ curves: [source], activeFrId: source.id, activeTargetId: null })
    uiStore.setState({ curveAppearance: {}, baselineCurveId: null })
    uiStore.getState().registerCurve(source.id)
  })

  it('uses two lines with a dominant name and no visible kind badge', () => {
    renderRow(source)
    const row = screen.getByRole('row', { name: source.name })

    expect(row.children).toHaveLength(1)
    expect(row.querySelector('.curve-manager-row__identity')).toHaveTextContent(source.name)
    expect(row.querySelector('.curve-manager-row__actions')).toBeInTheDocument()
    expect(screen.getByTitle(source.name)).toHaveTextContent(source.name)
    expect(screen.queryByRole('button', { name: /set .* active/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^FR$|^Target$/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Rename ${source.name}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Hide ${source.name}` })).toBeInTheDocument()
    expect(screen.getByLabelText(`${source.name} color`)).toBeInTheDocument()
  })

  it('keeps visibility, offset, and baseline display-only without changing raw samples', async () => {
    const user = userEvent.setup()
    const rawSnapshot = structuredClone(source.rawPoints)
    renderRow(source)

    await user.click(screen.getByRole('button', { name: `Hide ${source.name}` }))
    expect(uiStore.getState().curveAppearance.source?.visible).toBe(false)
    await user.click(screen.getByRole('button', { name: `More options for ${source.name}` }))
    const offset = screen.getByLabelText(`${source.name} offset dB`)
    fireEvent.change(offset, { target: { value: '3' } })
    fireEvent.blur(offset)
    expect(uiStore.getState().curveAppearance.source?.offsetDb).toBe(3)
    await user.click(screen.getByRole('button', { name: `Set ${source.name} graph baseline` }))
    expect(uiStore.getState().baselineCurveId).toBe(source.id)
    expect(workspaceStore.getState().curves[0]?.rawPoints).toEqual(rawSnapshot)
  })

  it('renames and removes imported rows while Target uses a fixed gray swatch', async () => {
    const user = userEvent.setup()
    const target: Curve = { ...source, id: 'target', name: 'Target reference', kind: 'target' }
    workspaceStore.setState({ curves: [source, target], activeFrId: source.id, activeTargetId: target.id })
    uiStore.getState().registerCurve(target.id)
    const { rerender } = renderRow(target)

    expect(screen.getByRole('img', { name: 'Target reference fixed gray color' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Target reference color')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rename Target reference' }))
    const rename = screen.getByRole('textbox', { name: 'Rename Target reference' })
    await user.clear(rename)
    await user.type(rename, 'Reference target')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(workspaceStore.getState().curves[1]?.name).toBe('Reference target')

    rerender(<table><tbody><CurveManagerRow curve={workspaceStore.getState().curves[1]!} /></tbody></table>)
    await user.click(screen.getByRole('button', { name: 'Remove Reference target' }))
    expect(workspaceStore.getState().curves.map(({ id }) => id)).toEqual(['source'])
    expect(uiStore.getState().curveAppearance.target).toBeUndefined()
  })

  it('gives the derived FR EQ independent visibility and color without rename or remove', async () => {
    const user = userEvent.setup()
    render(<table><tbody><DerivedCurveManagerRow name={`${source.name} EQ`} /></tbody></table>)

    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Hide ${source.name} EQ` }))
    expect(uiStore.getState().curveAppearance[EQUALIZED_FR_APPEARANCE_ID]?.visible).toBe(false)
    fireEvent.change(screen.getByLabelText(`${source.name} EQ color`), {
      target: { value: '#123456' },
    })
    expect(uiStore.getState().curveAppearance[EQUALIZED_FR_APPEARANCE_ID]?.color).toBe('#123456')
    expect(workspaceStore.getState().curves).toEqual([source])
  })
})
