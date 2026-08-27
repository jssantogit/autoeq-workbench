import { describe, expect, it } from 'vitest'
import {
  getExportFilenameBase,
  safeFilenameBase,
  safePowerampPresetName,
} from './exportSanitizers'

describe('exportSanitizers', () => {
  describe('safeFilenameBase', () => {
    it('replaces filesystem-reserved characters and ASCII control characters with underscore', () => {
      expect(safeFilenameBase('A:B/C\\D*E?F"G<H>I|J')).toBe('A_B_C_D_E_F_G_H_I_J')
      expect(safeFilenameBase('Line1\r\nLine2\tLine3\0')).toBe('Line1__Line2_Line3_')
    })

    it('leaves valid alphanumeric and common punctuation untouched', () => {
      expect(safeFilenameBase('HD600 (Left) [Sample #1] - 2026.08')).toBe(
        'HD600 (Left) [Sample #1] - 2026.08',
      )
    })
  })

  describe('getExportFilenameBase', () => {
    it('returns sanitized name when valid', () => {
      expect(getExportFilenameBase('Studio/Left:Take?')).toBe('Studio_Left_Take_')
    })

    it('falls back to Workbench when null, undefined, or empty/spaces after trimming', () => {
      expect(getExportFilenameBase(null)).toBe('Workbench')
      expect(getExportFilenameBase(undefined)).toBe('Workbench')
      expect(getExportFilenameBase('')).toBe('Workbench')
      expect(getExportFilenameBase('   ')).toBe('Workbench')
      expect(getExportFilenameBase('\t\r\n')).toBe('Workbench')
      expect(getExportFilenameBase('???', 'DefaultName')).toBe('DefaultName')
    })
  })

  describe('safePowerampPresetName', () => {
    it('collapses CR, LF, tab, and control characters into single space separators and trims', () => {
      expect(safePowerampPresetName('Studio\r\nTake 1\tSample')).toBe('Studio Take 1 Sample')
      expect(safePowerampPresetName('\n\n  My Preset  \r\n')).toBe('My Preset')
    })

    it('preserves valid characters and non-control punctuation', () => {
      expect(safePowerampPresetName('HD 600 / Left (Target: Harman 2019)')).toBe(
        'HD 600 / Left (Target: Harman 2019)',
      )
    })

    it('falls back to Workbench when null, undefined, or empty/whitespace only', () => {
      expect(safePowerampPresetName(null)).toBe('Workbench')
      expect(safePowerampPresetName(undefined)).toBe('Workbench')
      expect(safePowerampPresetName('')).toBe('Workbench')
      expect(safePowerampPresetName('   \r\n\t  ')).toBe('Workbench')
    })
  })
})
