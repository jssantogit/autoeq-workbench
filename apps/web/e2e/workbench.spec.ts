import { expect, test, type Download, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name)

function silentWav(): Buffer {
  const sampleCount = 80
  const dataSize = sampleCount * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVEfmt ', 8, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8_000, 24)
  wav.writeUInt32LE(16_000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(dataSize, 40)
  return wav
}

async function importCurve(page: Page, kind: 'FR' | 'Target', filename: string) {
  await page.getByRole('button', { name: 'Import FR / Target' }).click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('group', { name: 'Curve type' }).getByRole('button', { name: kind }).click()
  await (await chooserPromise).setFiles(fixture(filename))
  await expect(page.getByRole('row', { name: filename })).toBeVisible()
}

async function importFr(page: Page) {
  await page.getByRole('button', { name: 'Import FR / Target' }).click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('group', { name: 'Curve type' }).getByRole('button', { name: 'FR' }).click()
  await (await chooserPromise).setFiles(fixture('source.txt'))
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
  await dbButton.click()
  await expect(dbButton).toHaveAttribute('aria-pressed', 'true')
  await hzButton.click()
  await expect(hzButton).toHaveAttribute('aria-pressed', 'true')
  await expect(normalize.getByLabel('Normalize dB')).toHaveValue('60')

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Constraints', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/\/ 64 filters/)).toHaveCount(0)
  expect(await page.getByLabel('Export format').getByRole('option').allTextContents()).toEqual([
    'Equalizer APO',
    'Poweramp',
    'Wavelet',
  ])
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
  await expect(page.getByRole('status', { name: 'AutoEQ running' })).toContainText(/^\d{2}:\d{2}$/)
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
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

  await dbButton.click()
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

for (const width of [360, 390]) {
  test(`curve manager stays compact and operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await importFr(page)
    await importFr(page)
    await importFr(page)

    const rows = page.locator('tr.curve-manager-row')
    await expect(rows).toHaveCount(3)
    const firstRow = rows.first()
    await firstRow.getByRole('button', { name: 'Rename source.txt' }).click()
    const longName = 'A deliberately long imported source curve name over forty characters'
    await firstRow.getByRole('textbox', { name: 'Rename source.txt' }).fill(longName)
    await firstRow.getByRole('textbox', { name: 'Rename source.txt' }).press('Enter')

    const name = firstRow.getByTitle(longName)
    await expect(name).toHaveCSS('text-overflow', 'ellipsis')
    await expect(name).toHaveCSS('white-space', 'nowrap')
    for (const control of [
      firstRow.getByLabel(`${longName} offset dB`),
      firstRow.getByRole('button', { name: `Set ${longName} graph baseline` }),
      firstRow.getByRole('button', { name: `Hide ${longName}` }),
      firstRow.getByRole('button', { name: `Remove ${longName}` }),
    ]) {
      await expect(control).toBeVisible()
      const [rowBox, controlBox] = await Promise.all([firstRow.boundingBox(), control.boundingBox()])
      expect(rowBox).not.toBeNull()
      expect(controlBox).not.toBeNull()
      expect(controlBox!.x).toBeGreaterThanOrEqual(rowBox!.x)
      expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width)
      expect(controlBox!.y).toBeGreaterThanOrEqual(rowBox!.y)
      expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height)
    }
    expect((await firstRow.boundingBox())!.height).toBeLessThanOrEqual(89)
  })
}

for (const width of [390, 1440]) {
  test(`equalizer remains legible with zero, five, and ten filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await importCurve(page, 'FR', 'source.txt')
    await importCurve(page, 'Target', 'target.csv')
    await page.getByRole('tab', { name: 'Equalizer' }).click()

    const panel = page.getByRole('region', { name: 'Equalizer workspace' })
    await expect(panel.getByText('Add a filter to begin EQ.')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Settings' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'AutoEQ' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Import' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Export' })).toBeVisible()

    await panel.getByRole('button', { name: 'Settings' }).click()
    const settings = panel.getByRole('region', { name: 'AutoEQ Settings' })
    const targetActions = panel.getByRole('group', { name: 'Target and AutoEQ' })
    const [settingsBox, targetBox] = await Promise.all([settings.boundingBox(), targetActions.boundingBox()])
    expect(settingsBox).not.toBeNull()
    expect(targetBox).not.toBeNull()
    expect(targetBox!.y).toBeGreaterThanOrEqual(settingsBox!.y + settingsBox!.height)
    await panel.getByRole('button', { name: 'Settings' }).click()

    const add = panel.getByRole('button', { name: 'Add filter' })
    for (let index = 0; index < 5; index += 1) await add.click()
    await expect(panel.getByRole('row', { name: /^Filter \d+$/ })).toHaveCount(5)
    for (let index = 0; index < 5; index += 1) await add.click()
    const rows = panel.getByRole('row', { name: /^Filter \d+$/ })
    await expect(rows).toHaveCount(10)
    await rows.last().scrollIntoViewIfNeeded()
    await expect(rows.last()).toBeVisible()
    await expect(panel.getByRole('columnheader')).toHaveCount(4)
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  })
}

test('Tools stays cohesive with audio, snapshots, Session, and Analysis on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Tools' }).click()

  const tools = page.getByRole('region', { name: 'Tools workspace' })
  await expect(tools.getByText('No local file selected')).toBeVisible()
  await expect(tools.getByText('No EQ snapshots yet.')).toBeVisible()
  await expect(tools.getByRole('button', { name: 'Export Session' })).toBeVisible()
  await expect(tools.getByRole('button', { name: 'Import Session' })).toBeVisible()

  await tools.getByLabel('Choose local audio file').setInputFiles({
    name: 'synthetic-silence.wav',
    mimeType: 'audio/wav',
    buffer: silentWav(),
  })
  await expect(tools.getByText('synthetic-silence.wav')).toBeVisible()
  await expect(tools.getByRole('button', { name: 'Play file' })).toBeEnabled()

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('tab', { name: 'Tools' }).click()
  await expect(tools.getByRole('listitem')).toHaveCount(1)
  await tools.getByRole('button', { name: /^Set A:/ }).click()

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await page.getByLabel('Filter 1 gain dB').fill('2')
  await page.getByLabel('Filter 1 gain dB').press('Enter')
  await page.waitForTimeout(600)
  await page.getByRole('tab', { name: 'Tools' }).click()
  await expect(tools.getByRole('listitem')).toHaveCount(2)

  const analysis = tools.getByText('Analysis', { exact: true }).locator('..')
  await tools.getByText('Analysis', { exact: true }).click()
  await expect(analysis).toHaveAttribute('open', '')
  expect(await tools.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})
