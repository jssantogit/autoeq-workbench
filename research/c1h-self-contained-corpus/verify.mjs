import { fileURLToPath } from 'node:url'
import { verifySelfContainedCorpus } from './materialize.mjs'

export { verifySelfContainedCorpus }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifySelfContainedCorpus().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 })
}
