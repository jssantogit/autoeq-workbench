import { expect, test, type Download, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name)

async function importCurve(page: Page, kind: 'FR' | 'Target', filename: string) {
  await page.getByRole('button', { name: 'Import FR / Target' }).click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('group', { name: 'Curve type' }).getByRole('button', { name: kind }).click()
  await (await chooserPromise).setFiles(fixture(filename))
  await expect(page.getByRole('row', { name: filename })).toBeVisible()
}

async function downloadText(download: Download): Promise<string> {
  const filename = await download.path()
  expect(filename).not.toBeNull()
  return readFile(filename!, 'utf8')
}

async function exportFilters(page: Page, format: 'Equalizer APO' | 'Poweramp' | 'Wavelet') {
  await page.getByLabel('Export format').selectOption(format)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  return downloadText(await downloadPromise)
}

test('authoritative Workbench workflow survives export and Session restore', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')

  await importCurve(page, 'FR', 'source.txt')
  await importCurve(page, 'Target', 'target.csv')
  await expect(page.getByRole('row', { name: 'source.txt' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'target.csv' })).toBeVisible()

  const normalize = page.getByRole('group', { name: 'Normalize' })
  const dbButton = normalize.getByRole('button', { name: 'dB' })
  const hzButton = normalize.getByRole('button', { name: 'Hz' })
  await expect(hzButton).toHaveAttribute('aria-pressed', 'true')
  await expect(normalize.getByLabel('Normalize Hz')).toHaveValue('500')
  await expect(normalize.getByLabel('Normalize dB')).toHaveValue('60')
  await dbButton.press('Enter')
  await expect(dbButton).toHaveAttribute('aria-pressed', 'true')
  await hzButton.press('Enter')
  await expect(hzButton).toHaveAttribute('aria-pressed', 'true')
  await expect(normalize.getByLabel('Normalize dB')).toHaveValue('60')

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  await page.getByLabel('Filter 1 frequency Hz').fill('750')
  await page.getByLabel('Filter 1 frequency Hz').press('Enter')
  await page.getByLabel('Filter 1 gain dB').fill('2.5')
  await page.getByLabel('Filter 1 gain dB').press('Enter')
  await page.getByLabel('Filter 1 Q').fill('1.4')
  await page.getByLabel('Filter 1 Q').press('Enter')
  await expect(page.getByLabel('Filter 1 frequency Hz')).toHaveValue('750')

  const autoEq = page.getByRole('button', { name: 'AutoEQ', exact: true })
  await autoEq.click()
  await expect(page.getByLabel('Filter 1 frequency Hz')).not.toHaveValue('750', { timeout: 120_000 })
  await expect(autoEq).toHaveText('AutoEQ')
  const filterRows = page.getByRole('row', { name: /^Filter \d+$/ })
  const deliveredCount = await filterRows.count()
  expect(deliveredCount).toBeGreaterThan(0)
  expect(deliveredCount).toBeLessThanOrEqual(10)

  await page.getByLabel('Filter 1 gain dB').fill('5.5')
  await page.getByLabel('Filter 1 gain dB').press('Enter')
  await page.getByRole('tab', { name: 'Tools' }).click()
  await page.getByText('Analysis', { exact: true }).click()
  await expect(page.getByText('Modified', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  const disabledFrequency = await page.getByLabel('Filter 1 frequency Hz').inputValue()
  await page.getByLabel('Enable filter 1').uncheck()
  await expect(page.getByRole('row', { name: 'Filter 1' })).toHaveAttribute('data-enabled', 'false')

  const apo = await exportFilters(page, 'Equalizer APO')
  expect(apo).toContain('Preamp:')
  expect(apo).not.toContain(`Fc ${disabledFrequency} Hz`)
  const poweramp = await exportFilters(page, 'Poweramp')
  expect(poweramp).toContain('# Poweramp-style manual-entry preset')
  expect(poweramp).not.toContain(`Fc ${disabledFrequency} Hz`)
  const disabledWavelet = await exportFilters(page, 'Wavelet')
  expect(disabledWavelet).toMatch(/^GraphicEQ: /)
  await page.getByLabel('Enable filter 1').check()
  const enabledWavelet = await exportFilters(page, 'Wavelet')
  expect(enabledWavelet).not.toBe(disabledWavelet)
  await page.getByLabel('Enable filter 1').uncheck()

  await page.getByRole('tab', { name: 'Tools' }).click()
  const sessionDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Session' }).click()
  const sessionPath = await (await sessionDownloadPromise).path()
  expect(sessionPath).not.toBeNull()

  await dbButton.press('Enter')
  await normalize.getByLabel('Normalize dB').fill('80')
  await normalize.getByLabel('Normalize dB').press('Enter')
  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()

  await page.getByRole('tab', { name: 'Tools' }).click()
  await page.getByLabel('Import Workbench session').setInputFiles(sessionPath!)
  await expect(hzButton).toHaveAttribute('aria-pressed', 'true')
  await expect(normalize.getByLabel('Normalize Hz')).toHaveValue('500')
  await expect(normalize.getByLabel('Normalize dB')).toHaveValue('60')
  await expect(page.getByText('Modified', { exact: true })).toBeVisible()
  await expect(page.getByText('No EQ snapshots yet.')).toBeVisible()

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await expect(page.getByRole('row', { name: 'Filter 1' })).toHaveAttribute('data-enabled', 'false')
  await expect(filterRows).toHaveCount(deliveredCount)
})
