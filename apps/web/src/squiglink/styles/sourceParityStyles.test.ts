import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import baseCss from './squiglink-base.css?raw'
import themeCss from './workbench-theme.css?raw'

function rule(css: string, selectorPattern: RegExp, label: string): string {
  const match = css.match(selectorPattern)
  expect(match, `Missing CSS rule for ${label}`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('Squiglink source parity styles', () => {
  it('keeps the toolbar theme toggle in normal horizontal scroll flow', () => {
    const themeToggleRule = rule(
      baseCss,
      /\.graph-toolbar\s*>\s*\.theme-toggle\s*\{([^}]*)\}/s,
      '.graph-toolbar > .theme-toggle',
    )
    expect(themeToggleRule).not.toMatch(/position\s*:\s*sticky/)
    expect(themeToggleRule).not.toMatch(/left\s*:/)
    expect(themeToggleRule).not.toMatch(/z-index\s*:/)
  })

  it('uses solid accent fill for selected dock and graph controls', () => {
    const dockSelected = rule(
      indexCss,
      /\.dock-tabs\s+button\[aria-selected='true'\]\s*\{([^}]*)\}/s,
      ".dock-tabs button[aria-selected='true']",
    )
    expect(dockSelected).toMatch(/background(?:-color)?\s*:\s*var\(--(?:color|wb)-accent\)/)
    expect(dockSelected).not.toContain('accent-soft')
    expect(dockSelected).not.toMatch(/box-shadow\s*:/)

    const graphSelected = rule(
      themeCss,
      /\.graph-toolbar\s+button\[aria-pressed='true'\]\s*\{([^}]*)\}/s,
      ".graph-toolbar button[aria-pressed='true']",
    )
    expect(graphSelected).toMatch(/background(?:-color)?\s*:\s*var\(--wb-accent\)/)
    expect(graphSelected).toMatch(/border-color\s*:\s*var\(--wb-accent\)/)
    expect(graphSelected).not.toContain('surface-muted')
  })

  it('ports the source manageTable flex geometry and wide import control', () => {
    const table = rule(baseCss, /\.manageTable\s*\{([^}]*)\}/s, '.manageTable')
    expect(table).toMatch(/display\s*:\s*flex/)
    expect(table).toMatch(/flex-direction\s*:\s*column/)
    expect(table).toMatch(/width\s*:\s*100%/)

    const row = rule(
      baseCss,
      /tbody\.curves\s*>\s*tr\s*\{([^}]*)\}/s,
      'tbody.curves > tr',
    )
    expect(row).toMatch(/display\s*:\s*flex/)
    expect(row).toMatch(/align-items\s*:\s*flex-start/)

    const cell = rule(
      baseCss,
      /tbody\.curves\s*>\s*tr\s*>\s*td\s*\{([^}]*)\}/s,
      'tbody.curves > tr > td',
    )
    expect(cell).toMatch(/min-height\s*:\s*50px/)

    const importTrigger = rule(
      baseCss,
      /\.curve-import__trigger\s*\{([^}]*)\}/s,
      '.curve-import__trigger',
    )
    expect(importTrigger).toMatch(/width\s*:\s*100%/)
    expect(importTrigger).toMatch(/height\s*:\s*36px/)
    expect(importTrigger).toMatch(/border-radius\s*:\s*6px/)
  })

  it('contains no decorative dock handle styles', () => {
    expect(indexCss).not.toContain('.workbench-dock__handle')
    expect(baseCss).not.toContain('.workbench-dock__handle')
  })
})
