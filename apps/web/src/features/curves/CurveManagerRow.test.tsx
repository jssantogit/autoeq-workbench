import type { Curve } from '@autoeq-workbench/core'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { CurveManagerRow } from './CurveManagerRow'

const source: Curve = {
  id: 'source',
  name: 'Source',
  kind: 'fr',
  rawPoints: [{ frequencyHz: 20, db: 1 }, { frequencyHz: 20_000, db: 2 }],
  metadata: {},
}

function renderRow(curve: Curve) {
  return render(<table><tbody><CurveManagerRow curve={curve} /></tbody></table>)
}

describe('CurveManagerRow', () => {
  beforeEach(() => {
    workspaceStore.setState({ curves: [source], activeFrId: null, activeTargetId: null })
    uiStore.setState({ curveAppearance: {}, baselineCurveId: null })
    uiStore.getState().registerCurve(source.id)
  })

  it('controls active FR and display-only appearance without changing raw samples', async () => {
    const user = userEvent.setup()
    const rawSnapshot = structuredClone(source.rawPoints)
    renderRow(source)

    await user.click(screen.getByRole('button', { name: /set source as active fr/i }))
    expect(workspaceStore.getState().activeFrId).toBe(source.id)
    const visible = screen.getByRole('checkbox', { name: /source visible/i })
    expect(visible).toBeChecked()
    await user.click(visible)
    expect(uiStore.getState().curveAppearance.source?.visible).toBe(false)

    const offset = screen.getByLabelText(/source offset/i)
    expect(offset).toHaveValue(0)
    fireEvent.change(offset, { target: { value: '3' } })
    fireEvent.blur(offset)
    expect(uiStore.getState().curveAppearance.source?.offsetDb).toBe(3)
    await user.click(screen.getByRole('button', { name: /source.*baseline/i }))
    expect(uiStore.getState().baselineCurveId).toBe(source.id)
    expect(workspaceStore.getState().curves[0]?.rawPoints).toEqual(rawSnapshot)
  })

  it('renames/removes rows and can activate a Target', async () => {
    const user = userEvent.setup()
    const target: Curve = { ...source, id: 'target', name: 'Target', kind: 'target' }
    workspaceStore.setState({ curves: [source, target], activeFrId: null, activeTargetId: null })
    uiStore.getState().registerCurve(target.id)
    const { rerender } = renderRow(target)

    await user.click(screen.getByRole('button', { name: /set target as active target/i }))
    expect(workspaceStore.getState().activeTargetId).toBe(target.id)
    await user.click(screen.getByRole('button', { name: 'Rename Target' }))
    const rename = screen.getByRole('textbox', { name: 'Rename Target' })
    await user.clear(rename)
    await user.type(rename, 'Reference')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(workspaceStore.getState().curves[1]?.name).toBe('Reference')

    rerender(<table><tbody><CurveManagerRow curve={workspaceStore.getState().curves[1]!} /></tbody></table>)
    await user.click(screen.getByRole('button', { name: 'Remove Reference' }))
    expect(workspaceStore.getState().curves.map(({ id }) => id)).toEqual(['source'])
    expect(uiStore.getState().curveAppearance.target).toBeUndefined()
  })
})
