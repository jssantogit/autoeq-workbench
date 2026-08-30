import { expect, test, type Download, type Page } from '@playwright/test'
import {
  applyEqToSource,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  MVP_NUMERIC_POLICY,
  parseCurveText,
  prepareCurve,
  residualError,
  type Filter,
} from '@autoeq-workbench/core'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

const SBAF_DATA_COMMIT = '7b33e41be47ccb57a59e1a88c48b367eb7329494'
const SOURCE_NAME = 'SBAF cEAR30 Sennheiser HD800 L.txt'
const TARGET_NAME = 'SBAF cEAR30 Sennheiser HD600 L.txt'
const SOURCE_URL = `https://raw.githubusercontent.com/superbestaudiofriends/headphone-measurements-frequency-response/${SBAF_DATA_COMMIT}/cEAR30-Sennheiser-HD800-L.txt`
const TARGET_URL = `https://raw.githubusercontent.com/superbestaudiofriends/headphone-measurements-frequency-response/${SBAF_DATA_COMMIT}/cEAR30-Sennheiser-HD600-L.txt`
const METRIC_EPSILON_DB = 1e-5

async function fetchPinnedCurve(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch pinned real-world curve: ${response.status} ${url}`)
  }
  return response.text()
}

async function importCurveText(
  page: Page,
  kind: 'FR' | 'Target',
  filename: string,
  text: string,
) {
  await page.getByRole('button', { name: 'Import FR / Target' }).click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('group', { name: 'Curve type' }).getByRole('button', { name: kind }).click()
  await (await chooserPromise).setFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from(text, 'utf8'),
  })
  await expect(page.getByRole('row', { name: filename })).toBeVisible()
}

async function downloadText(download: Download): Promise<string> {
  const filename = await download.path()
  expect(filename).not.toBeNull()
  return readFile(filename!, 'utf8')
}

async function exportSession(page: Page) {
  await page.getByRole('tab', { name: 'Tools' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Session' }).click()
  return JSON.parse(await downloadText(await downloadPromise)) as {
    autoeqSettings: { maxFilters: number; timeLimitSeconds: number }
    filters: Filter[]
    autoEqRun: {
      manifest: {
        algorithmVersion: string
        autoeqSettings: { maxFilters: number; timeLimitSeconds: number }
        metrics: { maeDb: number; rmseDb: number; maxAbsDb: number; maxAbsFrequencyHz: number }
        terminationReason: 'target-reached' | 'converged' | 'time-limit'
        targetAchieved: boolean
      }
    } | null
  }
}

function bandRmse(
  residual: readonly number[],
  frequencies: readonly number[],
  minFrequencyHz: number,
  maxFrequencyHz: number,
): number {
  let squared = 0
  let count = 0
  for (let index = 0; index < frequencies.length; index += 1) {
    const frequencyHz = frequencies[index]!
    if (frequencyHz < minFrequencyHz || frequencyHz > maxFrequencyHz) continue
    squared += residual[index]! ** 2
    count += 1
  }
  if (count === 0) throw new Error('Real-world smoke band contains no evaluation samples')
  return Math.sqrt(squared / count)
}

test('Standard v2 real-world closeout smoke: SBAF HD 800 to SBAF HD 600', async ({ page }) => {
  test.setTimeout(240_000)

  const [sourceText, targetText] = await Promise.all([
    fetchPinnedCurve(SOURCE_URL),
    fetchPinnedCurve(TARGET_URL),
  ])

  const normalization = { mode: 'hz' as const, frequencyHz: 500, levelDb: 60 }
  const sourceCurve = parseCurveText(sourceText, { name: SOURCE_NAME, kind: 'fr' })
  const targetCurve = parseCurveText(targetText, { name: TARGET_NAME, kind: 'target' })
  const frequencies = createEvaluationGrid()
  const preparedSource = prepareCurve(sourceCurve, normalization, frequencies)
  const preparedTarget = prepareCurve(targetCurve, normalization, frequencies)
  const baselineResidual = residualError(preparedTarget.db, preparedSource.db)
  const baselineMetrics = calculateErrorMetrics(baselineResidual, frequencies)
  const baselineMidTrebleRmse = bandRmse(baselineResidual, frequencies, 1_000, 20_000)
  const baselineTrebleRmse = bandRmse(baselineResidual, frequencies, 8_000, 20_000)

  await page.goto('/')
  await importCurveText(page, 'FR', SOURCE_NAME, sourceText)
  await importCurveText(page, 'Target', TARGET_NAME, targetText)

  const graph = page.getByLabel('Frequency response graph').locator('svg[data-fr-graph]')
  await expect(graph).toBeVisible()
  expect(await graph.locator('path').count()).toBeGreaterThan(0)

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  const timeLimit = page.getByRole('combobox', { name: 'AutoEQ time limit' })
  await expect(timeLimit).toHaveValue('60')
  await page.getByRole('button', { name: 'Settings' }).click()

  const autoEq = page.getByRole('button', { name: 'AutoEQ', exact: true })
  await autoEq.click()
  await expect(page.getByRole('status', { name: 'AutoEQ running' })).toBeVisible()
  await expect(autoEq).toHaveText('AutoEQ', { timeout: 150_000 })
  await expect(page.locator('.autoeq-error')).toHaveCount(0)

  const filterRows = page.getByRole('row', { name: /^Filter \d+$/ })
  const deliveredCount = await filterRows.count()
  expect(deliveredCount).toBeGreaterThan(0)
  expect(deliveredCount).toBeLessThanOrEqual(10)
  expect(await graph.locator('path').count()).toBeGreaterThan(0)

  const fullRunSession = await exportSession(page)
  expect(fullRunSession.autoEqRun).not.toBeNull()
  expect(fullRunSession.autoEqRun!.manifest.algorithmVersion).toBe('standard-v2')
  expect(fullRunSession.autoeqSettings.timeLimitSeconds).toBe(60)
  expect(fullRunSession.autoEqRun!.manifest.autoeqSettings.timeLimitSeconds).toBe(60)
  expect(fullRunSession.filters).toHaveLength(deliveredCount)
  expect(fullRunSession.filters.length).toBeLessThanOrEqual(fullRunSession.autoeqSettings.maxFilters)

  const peqDb = cascadeMagnitudeDb(
    fullRunSession.filters,
    frequencies,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const finalResidual = residualError(
    preparedTarget.db,
    applyEqToSource(preparedSource.db, peqDb),
  )
  const finalMetrics = calculateErrorMetrics(finalResidual, frequencies)
  const finalMidTrebleRmse = bandRmse(finalResidual, frequencies, 1_000, 20_000)
  const finalTrebleRmse = bandRmse(finalResidual, frequencies, 8_000, 20_000)

  expect(finalMetrics.rmseDb).toBeLessThan(baselineMetrics.rmseDb)
  expect(finalMidTrebleRmse).toBeLessThan(baselineMidTrebleRmse)
  expect(finalTrebleRmse).toBeLessThan(baselineTrebleRmse)
  expect(Math.abs(finalMetrics.rmseDb - fullRunSession.autoEqRun!.manifest.metrics.rmseDb)).toBeLessThan(METRIC_EPSILON_DB)
  expect(Math.abs(finalMetrics.maxAbsDb - fullRunSession.autoEqRun!.manifest.metrics.maxAbsDb)).toBeLessThan(METRIC_EPSILON_DB)

  console.log(JSON.stringify({
    source: SOURCE_NAME,
    target: TARGET_NAME,
    sbafDataCommit: SBAF_DATA_COMMIT,
    baseline: {
      rmseDb: baselineMetrics.rmseDb,
      midTrebleRmseDb: baselineMidTrebleRmse,
      trebleRmseDb: baselineTrebleRmse,
    },
    fullRun: {
      filters: fullRunSession.filters.length,
      terminationReason: fullRunSession.autoEqRun!.manifest.terminationReason,
      targetAchieved: fullRunSession.autoEqRun!.manifest.targetAchieved,
      rmseDb: finalMetrics.rmseDb,
      maxAbsDb: finalMetrics.maxAbsDb,
      midTrebleRmseDb: finalMidTrebleRmse,
      trebleRmseDb: finalTrebleRmse,
    },
  }, null, 2))

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await timeLimit.selectOption('5')
  await page.getByRole('button', { name: 'Settings' }).click()
  await autoEq.click()
  await expect(page.getByRole('status', { name: 'AutoEQ running' })).toBeVisible()
  await expect(autoEq).toHaveText('AutoEQ', { timeout: 30_000 })
  await expect(page.locator('.autoeq-error')).toHaveCount(0)

  const shortRunSession = await exportSession(page)
  expect(shortRunSession.autoEqRun).not.toBeNull()
  expect(shortRunSession.autoeqSettings.timeLimitSeconds).toBe(5)
  expect(shortRunSession.autoEqRun!.manifest.autoeqSettings.timeLimitSeconds).toBe(5)
  expect(shortRunSession.filters.length).toBeLessThanOrEqual(shortRunSession.autoeqSettings.maxFilters)

  await page.getByRole('tab', { name: 'Equalizer' }).click()
  const beforeCancelFilters = JSON.stringify(shortRunSession.filters)
  await autoEq.click()
  await expect(page.getByRole('status', { name: 'AutoEQ running' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('status', { name: 'AutoEQ running' })).toHaveCount(0)
  await expect(page.locator('.autoeq-error')).toHaveCount(0)

  const afterCancelSession = await exportSession(page)
  expect(JSON.stringify(afterCancelSession.filters)).toBe(beforeCancelFilters)
  expect(afterCancelSession.filters.length).toBeLessThanOrEqual(afterCancelSession.autoeqSettings.maxFilters)
})
