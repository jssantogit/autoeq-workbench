import { describe, expect, it } from 'vitest'
import {
  getFilterExportFilenameBase,
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

  describe('getFilterExportFilenameBase', () => {
    it.each([
      ['Source.txt', 'Target.txt'],
      ['Source.csv', 'Target.CSV'],
    ])('removes terminal curve extensions from AutoEQ components', (sourceName, targetName) => {
      expect(getFilterExportFilenameBase({
        activeFrName: 'Renamed FR',
        filterProvenance: 'autoeq',
        autoEqRun: { manifest: { sourceName, targetName } },
      })).toBe('Source - [Target]')
    })

    it('removes a terminal curve extension from a manual-EQ source', () => {
      expect(getFilterExportFilenameBase({
        activeFrName: 'Source.txt',
        filterProvenance: 'manual',
        autoEqRun: null,
      })).toBe('Source - [EQ]')
    })

    it('preserves non-terminal curve extension text', () => {
      expect(getFilterExportFilenameBase({
        activeFrName: 'comparison.txt v2',
        filterProvenance: 'manual',
        autoEqRun: null,
      })).toBe('comparison.txt v2 - [EQ]')
    })

    it('uses frozen AutoEQ manifest names instead of renamed current curves', () => {
      expect(getFilterExportFilenameBase({
        activeFrName: 'Renamed FR',
        filterProvenance: 'autoeq',
        autoEqRun: { manifest: { sourceName: 'Dunu Titan S2', targetName: 'JM-1' } },
      })).toBe('Dunu Titan S2 - [JM-1]')
    })

    it('uses the current FR with an EQ label for manual filters and falls back without an FR', () => {
      expect(getFilterExportFilenameBase({
        activeFrName: 'HD 600',
        filterProvenance: 'manual',
        autoEqRun: null,
      })).toBe('HD 600 - [EQ]')
      expect(getFilterExportFilenameBase({
        activeFrName: null,
        filterProvenance: null,
        autoEqRun: null,
      })).toBe('Workbench - [EQ]')
    })

    it('sanitizes AutoEQ name components without removing the provenance structure', () => {
      expect(getFilterExportFilenameBase({
        activeFrName: 'Renamed FR',
        filterProvenance: 'autoeq',
        autoEqRun: { manifest: { sourceName: 'Dunu/Titan:S2?', targetName: 'JM<1>|*' } },
      })).toBe('Dunu_Titan_S2_ - [JM_1___]')
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
