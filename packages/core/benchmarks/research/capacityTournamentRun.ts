import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertOracleReferenceSnapshotV1,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import {
  CAPACITY_TOURNAMENT_CASES,
  CAPACITY_TOURNAMENT_CHECKPOINTS_MS,
} from './capacityTournament.js'

interface CapacityTournamentCliOptions {
  snapshot: string
  cases: typeof CAPACITY_TOURNAMENT_CASES[number][]
  checkpointsMs: typeof CAPACITY_TOURNAMENT_CHECKPOINTS_MS[number][]
  out: string
}

interface CapacityTournamentBlockedReport {
  schemaVersion: 1
  program: 'autoeq-capacity-aware-solver'
  status: 'blocked'
  snapshot: {
    path: string
    contentSha256: string | null
  }
  cases: typeof CAPACITY_TOURNAMENT_CASES[number][]
  checkpointsMs: typeof CAPACITY_TOURNAMENT_CHECKPOINTS_MS[number][]
  maxFilters: 10
  registeredVariantIds: []
  runs: []
  blockers: string[]
  excludedFromRuntimeTournament: [20, 40, 64]
  holdout: { executed: false }
  productionPromotion: { executed: false }
}

function requiredOption(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name)
  if (value === undefined || value.length === 0) throw new Error(`Missing required option ${name}`)
  return value
}

function parseOptions(args: readonly string[]): CapacityTournamentCliOptions {
  const values = new Map<string, string>()
  const normalized = args[0] === '--' ? args.slice(1) : args
  for (let index = 0; index < normalized.length; index += 1) {
    const option = normalized[index]!
    if (!option.startsWith('--')) throw new Error(`Unexpected argument ${option}`)
    const value = normalized[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    if (values.has(option)) throw new Error(`Duplicate option ${option}`)
    values.set(option, value)
    index += 1
  }
  const cases = requiredOption(values, '--cases').split(',')
  if (JSON.stringify(cases) !== JSON.stringify([...CAPACITY_TOURNAMENT_CASES])) {
    throw new Error('capacity tournament cases must be exactly titan-to-storm,titan-to-u12t,titan-to-trio')
  }
  const checkpointsMs = requiredOption(values, '--checkpoints-ms').split(',').map((value) => {
    if (!/^\d+$/.test(value)) throw new Error('--checkpoints-ms requires integer milliseconds')
    return Number(value)
  })
  if (JSON.stringify(checkpointsMs) !== JSON.stringify([...CAPACITY_TOURNAMENT_CHECKPOINTS_MS])) {
    throw new Error('--checkpoints-ms must be exactly 5000,15000,30000,60000')
  }
  const known = new Set(['--snapshot', '--cases', '--checkpoints-ms', '--out'])
  for (const key of values.keys()) if (!known.has(key)) throw new Error(`Unknown option ${key}`)
  return {
    snapshot: requiredOption(values, '--snapshot'),
    cases: cases as CapacityTournamentCliOptions['cases'],
    checkpointsMs: checkpointsMs as CapacityTournamentCliOptions['checkpointsMs'],
    out: requiredOption(values, '--out'),
  }
}

function loadSnapshot(path: string): { snapshot: OracleReferenceSnapshotV1 | null; blocker: string | null } {
  try {
    const snapshot: unknown = JSON.parse(readFileSync(resolve(path), 'utf8'))
    assertOracleReferenceSnapshotV1(snapshot)
    return { snapshot, blocker: null }
  } catch (error) {
    return {
      snapshot: null,
      blocker: `oracle-reference-snapshot-unavailable-or-invalid:${path}:${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function blockedReport(options: CapacityTournamentCliOptions): CapacityTournamentBlockedReport {
  const loaded = loadSnapshot(options.snapshot)
  const blockers = [
    ...(loaded.blocker === null ? [] : [loaded.blocker]),
    'task12-shortlist-empty:no evidence-backed runtime survivor is registered',
    'capacity-tournament-not-run:canonical Max10 adversarial run artifacts are unavailable',
  ]
  return {
    schemaVersion: 1,
    program: 'autoeq-capacity-aware-solver',
    status: 'blocked',
    snapshot: {
      path: options.snapshot,
      contentSha256: loaded.snapshot?.contentSha256 ?? null,
    },
    cases: options.cases,
    checkpointsMs: options.checkpointsMs,
    maxFilters: 10,
    registeredVariantIds: [],
    runs: [],
    blockers,
    excludedFromRuntimeTournament: [20, 40, 64],
    holdout: { executed: false },
    productionPromotion: { executed: false },
  }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseOptions(args)
  const report = blockedReport(options)
  const output = resolve(options.out)
  mkdirSync(output, { recursive: true })
  writeFileSync(`${output}/tournament-report.json`, JSON.stringify(report, null, 2) + '\n')
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)
if (isMain) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
