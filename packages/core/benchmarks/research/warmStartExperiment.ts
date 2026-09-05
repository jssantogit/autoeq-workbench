import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { runStandardAutoEqV2 } from '../../src/index.js'
import { runResearchCell } from './run.js'

const outputIndex = process.argv.indexOf('--output-dir')
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1]! : '/tmp/autoeq-warm-start')
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'metadata.json'), JSON.stringify({
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, platform: process.platform, arch: process.arch,
  runId: process.env.GITHUB_RUN_ID ?? null,
  design: 'Same process paired A/B; reversed order by budget; no speed acceptance from one pair',
}, null, 2))
const rows = []
const budgets = process.argv.includes('--matrix') ? [5, 15, 30] as const : [30] as const
for (const budgetSeconds of budgets) {
for (const caseId of ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio'] as const) {
  for (const geometryWarmStart of budgetSeconds === 15 ? [true, false] : [false, true]) {
    const row = await runResearchCell({
      caseId, budgetSeconds, maxFilters: 10, repeatIndex: 0,
      telemetryMode: 'light',
      run: (input, runtime) => runStandardAutoEqV2(input, { ...runtime, geometryWarmStart }),
    })
    rows.push({ geometryWarmStart, ...row })
    writeFileSync(resolve(output, 'results.json'), JSON.stringify(rows, null, 2))
    console.log(JSON.stringify({ caseId, budgetSeconds, geometryWarmStart, elapsedMs: row.elapsedMs,
      final: row.final, counters: row.counters }))
  }
}
}
