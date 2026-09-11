import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STORM_FROZEN_INPUT_BUNDLE_VERSION = 'autoeq-storm-frozen-inputs-v1' as const
export const DEFAULT_CAPACITY_RECOVERY_ROOT = '/tmp/autoeq-capacity-recovery-20260908' as const

export const REQUIRED_STORM_FROZEN_INPUTS = Object.freeze([
  'OracleReferenceSnapshotV1.json',
  'mp-seeds/titan-to-storm-teacher-student.json',
  'mp-seeds/titan-to-u12t-teacher-student.json',
  'mp-seeds/titan-to-trio-teacher-student.json',
  'same-runtime-tournament/tournament-report.json',
] as const)

export const LEGACY_PINNED_SHA256 = Object.freeze({
  'OracleReferenceSnapshotV1.json':
    'a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd',
  'same-runtime-tournament/tournament-report.json':
    'cb0b1fe6c0fe78cc2b809831f2e6b0a98f1a4cb5af4fa84cc4390bd113ccb3d9',
} as const)

type FrozenInputRelativePath = (typeof REQUIRED_STORM_FROZEN_INPUTS)[number]

interface FrozenInputFileManifest {
  path: FrozenInputRelativePath
  sha256: string
}

export interface StormFrozenInputManifestV1 {
  schemaVersion: 1
  bundleVersion: typeof STORM_FROZEN_INPUT_BUNDLE_VERSION
  provenance: {
    historicalRoot: typeof DEFAULT_CAPACITY_RECOVERY_ROOT
    referenceCampaignRepositorySha: '576dd7442091ac6da76c90f18d78646a1cdfb5b8'
  }
  files: FrozenInputFileManifest[]
}

function safeRelativePath(relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith('/') ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(`invalid frozen-input relative path: ${relativePath}`)
  }
  return relativePath
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function resolveCapacityRecoveryRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env.AUTOEQ_CAPACITY_RECOVERY_ROOT?.trim()
  return resolve(configured && configured.length > 0
    ? configured
    : DEFAULT_CAPACITY_RECOVERY_ROOT)
}

export function resolveCapacityRecoveryPath(
  relativePath: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return resolve(resolveCapacityRecoveryRoot(env), safeRelativePath(relativePath))
}

function bundleFilePath(bundleRoot: string, relativePath: FrozenInputRelativePath): string {
  return resolve(bundleRoot, 'capacity-recovery', safeRelativePath(relativePath))
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 hex digest`)
  }
}

function parseManifest(value: unknown): StormFrozenInputManifestV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('frozen-input manifest must be an object')
  }
  const manifest = value as Partial<StormFrozenInputManifestV1>
  if (manifest.schemaVersion !== 1) throw new Error('unsupported frozen-input manifest schema')
  if (manifest.bundleVersion !== STORM_FROZEN_INPUT_BUNDLE_VERSION) {
    throw new Error('unexpected frozen-input bundle version')
  }
  if (!Array.isArray(manifest.files)) throw new Error('frozen-input manifest files are required')

  const expected = [...REQUIRED_STORM_FROZEN_INPUTS].sort()
  const actual = manifest.files.map((entry) => entry.path).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('frozen-input manifest does not contain the exact required file set')
  }
  for (const entry of manifest.files) {
    if (!REQUIRED_STORM_FROZEN_INPUTS.includes(entry.path)) {
      throw new Error(`unexpected frozen-input file: ${entry.path}`)
    }
    assertSha256(entry.sha256, `sha256 for ${entry.path}`)
  }
  if (
    manifest.provenance?.historicalRoot !== DEFAULT_CAPACITY_RECOVERY_ROOT ||
    manifest.provenance?.referenceCampaignRepositorySha !==
      '576dd7442091ac6da76c90f18d78646a1cdfb5b8'
  ) {
    throw new Error('frozen-input provenance does not match the accepted recovery campaign')
  }
  return manifest as StormFrozenInputManifestV1
}

export function packStormFrozenInputs(
  sourceRoot: string,
  outRoot: string,
): StormFrozenInputManifestV1 {
  const resolvedSource = resolve(sourceRoot)
  const resolvedOut = resolve(outRoot)
  const files: FrozenInputFileManifest[] = []

  for (const relativePath of REQUIRED_STORM_FROZEN_INPUTS) {
    const source = resolve(resolvedSource, safeRelativePath(relativePath))
    if (!existsSync(source)) throw new Error(`missing frozen research input: ${source}`)
    const destination = bundleFilePath(resolvedOut, relativePath)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
    files.push({ path: relativePath, sha256: sha256File(destination) })
  }

  const manifest: StormFrozenInputManifestV1 = {
    schemaVersion: 1,
    bundleVersion: STORM_FROZEN_INPUT_BUNDLE_VERSION,
    provenance: {
      historicalRoot: DEFAULT_CAPACITY_RECOVERY_ROOT,
      referenceCampaignRepositorySha: '576dd7442091ac6da76c90f18d78646a1cdfb5b8',
    },
    files,
  }
  mkdirSync(resolvedOut, { recursive: true })
  writeFileSync(resolve(resolvedOut, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  verifyStormFrozenInputs(resolvedOut)
  return manifest
}

export function verifyStormFrozenInputs(bundleRoot: string): StormFrozenInputManifestV1 {
  const resolvedRoot = resolve(bundleRoot)
  const manifestPath = resolve(resolvedRoot, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`frozen-input manifest is missing: ${manifestPath}`)
  }
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown)

  for (const entry of manifest.files) {
    const path = bundleFilePath(resolvedRoot, entry.path)
    if (!existsSync(path)) throw new Error(`frozen research input is missing: ${entry.path}`)
    const actual = sha256File(path)
    if (actual !== entry.sha256) {
      throw new Error(
        `frozen research input hash mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}`,
      )
    }
    const pinned = LEGACY_PINNED_SHA256[entry.path as keyof typeof LEGACY_PINNED_SHA256]
    if (pinned !== undefined && actual !== pinned) {
      throw new Error(
        `legacy pinned hash mismatch for ${entry.path}: expected ${pinned}, got ${actual}`,
      )
    }
  }
  return manifest
}

function requiredFlag(args: readonly string[], name: string): string {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  if (value === undefined || value.startsWith('--')) throw new Error(`missing ${name}`)
  return value
}

function usage(): string {
  return [
    'Storm frozen research input bundle',
    '',
    'Pack the one-time legacy local freeze:',
    '  frozenResearchInputs.ts pack --source-root <capacity-recovery-root> --out <bundle-root>',
    '',
    'Verify a downloaded bundle:',
    '  frozenResearchInputs.ts verify --root <bundle-root>',
  ].join('\n')
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv]
  const command = args[0]
  if (command === '--help' || command === '-h' || command === undefined) {
    process.stdout.write(usage() + '\n')
    return
  }
  if (command === 'pack') {
    const out = requiredFlag(args, '--out')
    packStormFrozenInputs(requiredFlag(args, '--source-root'), out)
    process.stdout.write(`bundle-root=${resolve(out)}\n`)
    process.stdout.write(`manifest-sha256=${sha256File(resolve(out, 'manifest.json'))}\n`)
    return
  }
  if (command === 'verify') {
    const root = requiredFlag(args, '--root')
    verifyStormFrozenInputs(root)
    process.stdout.write(`verified-bundle-root=${resolve(root)}\n`)
    process.stdout.write(`manifest-sha256=${sha256File(resolve(root, 'manifest.json'))}\n`)
    return
  }
  throw new Error(`unknown frozen-input command: ${command}`)
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main()
}
