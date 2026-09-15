import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const PRIMARY_GROUP_IDS = Object.freeze(['c1g-ebdb284a8c7563a12c5f','c1g-3f4de360d87a28aea240','c1g-f2a43144c5936389d89d','c1g-8bd11cb5d7772ff2165b','c1g-6c369c990dd73512951b','c1g-dc1ade324d0c4b3192d6'])
export const BATCH_C_TOKEN = 'fresh-real-corpus-v1.2:Batch C'
export const MODEL_SHA = '65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00'
export const C1_HEAD = 'bf9581cba91f546e34e8e47a56c44cb61b744e52'
export const STANDARD_V2 = '7c9ebbbe6eefeb131c6c698055c737b429f5b0c6'
const ARTIFACT = resolve(ROOT, '.research-artifacts/c1-confidence-causal-online')
const HOLDOUT = resolve(ROOT, '.research-artifacts/c1-confidence-targeting-holdout')
const DEV = resolve(ROOT, '.research-artifacts/c1-confidence-targeting-dev')
const BAND = [4000, 14000]
const SETTINGS = Object.freeze({ minFrequencyHz:20,maxFrequencyHz:20000,minGainDb:-15,maxGainDb:15,minQ:.1,maxQ:12,maxFilters:10,timeLimitSeconds:60 })
const NORMALIZATION = Object.freeze({mode:'hz',frequencyHz:500,levelDb:60})
const canonical = (v) => v === null || typeof v !== 'object' ? v : Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]))
export const hashJson = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
const hashText = s => createHash('sha256').update(s).digest('hex')
const mean = a => a.reduce((x,y)=>x+y,0)/a.length
const median = a => { const b=[...a].sort((x,y)=>x-y); return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2 }
const rms = a => Math.sqrt(mean(a.map(x=>x*x)))
const metric = (a, f) => { const pick=(lo,hi)=>a.filter((_,i)=>f[i]>=lo&&f[i]<=hi); const p=pick(...BAND); if(!p.length)throw Error('primary grid empty'); const abs=p.map(Math.abs); const full=a.map(Math.abs); return {artifactRmse4_14k:rms(p),artifactMae4_14k:mean(abs),artifactMaxAbs4_14k:Math.max(...abs),artifactMaxAbsFrequencyHz:f[a.findIndex((x,i)=>f[i]>=BAND[0]&&f[i]<=BAND[1]&&Math.abs(x)===Math.max(...abs))],artifactRmseFullGrid:rms(a),artifactMaeFullGrid:mean(full),nineBands:[[20,500],[500,1000],[1000,2000],[2000,4000],[4000,6000],[6000,8000],[8000,10000],[10000,14000],[14000,20000]].map(([lo,hi])=>({bandHz:[lo,hi],rmse:rms(pick(lo,hi)),mae:mean(pick(lo,hi).map(Math.abs))}))} }
export function validateModel(model, expected=MODEL_SHA) { if(!model||model.modelSha256!==expected||hashJson(Object.fromEntries(Object.entries(model).filter(([k])=>k!=='modelSha256')))!==expected) throw Error('frozen confidence model hash mismatch'); for(const p of [model.weights?.globalFallback?.w_conf,...Object.values(model.weights?.byRigClass??{}).map(x=>x.w_conf)]) for(const w of p?.valuesDb??[]) if(!Number.isFinite(w)||w<=0||w>1) throw Error('invalid confidence weight'); return model }
export function assertWritablePath(token) { if(String(token).includes(BATCH_C_TOKEN)||String(token).includes('fresh-real-corpus-v1-metadata-repair/cases.json')) throw Error('Batch C is sealed'); const p=resolve(ROOT,String(token)); if(!p.startsWith(resolve(ROOT,'research/c1-confidence-causal-online'))&&!p.startsWith(resolve(ROOT,'.research-artifacts/c1-confidence-causal-online'))) throw Error('C1d may write only its campaign directories'); return p }
export function buildArmCorrections(frequencies, disagreement, confidence) { if(frequencies.length!==disagreement.length||confidence.length!==frequencies.length)throw Error('grid mismatch'); const idx=frequencies.map((f,i)=>f>=BAND[0]&&f<=BAND[1]?i:-1).filter(i=>i>=0); const wBar=mean(idx.map(i=>confidence[i])); const base=disagreement.map(x=>x === 0 ? 0 : -x); return {wBar,baseline:base,constant:base.map((x,i)=>idx.includes(i)?wBar*x:x),confidence:base.map((x,i)=>idx.includes(i)?confidence[i]*x:x)} }
export function classifyObservation({baseline,constant,confidence}) { if(![baseline,constant,confidence].every(Number.isFinite)||baseline<=0||constant<=0)return {classification:'INCONCLUSIVE'}; const gainVsBaseline=(baseline-confidence)/baseline, gainVsConstant=(constant-confidence)/constant, combinedGain=Math.min(gainVsBaseline,gainVsConstant); return {gainVsBaseline,gainVsConstant,combinedGain,classification:gainVsBaseline>=.05&&gainVsConstant>=.05?'CAUSAL_CONFIDENCE_WIN':'CAUSAL_CONFIDENCE_LOSS'} }
export function classifyGroup(observations) { if(observations.some(x=>x.classification==='INCONCLUSIVE')) return {classification:'INCONCLUSIVE'}; const info=observations.filter(x=>x.classification==='CAUSAL_CONFIDENCE_WIN'||x.classification==='CAUSAL_CONFIDENCE_LOSS'); if(!info.length)return {classification:'INCONCLUSIVE'}; const wins=info.filter(x=>x.classification==='CAUSAL_CONFIDENCE_WIN').length, med=median(info.map(x=>x.combinedGain)); return {informativeCount:info.length,wins,medianCombinedGain:med,classification:wins>info.length/2&&med>=.05?'CAUSAL_CONFIDENCE_SIGNAL':'NO_CAUSAL_CONFIDENCE_SIGNAL'} }
export function classifyCampaign(groups) { if(groups.some(x=>x.classification==='INCONCLUSIVE'))return {classification:'INCONCLUSIVE'}; const count=groups.filter(x=>x.classification==='CAUSAL_CONFIDENCE_SIGNAL').length; return {signalGroups:count,classification:count>=4?'C1D_CAUSAL_INTEGRATION_SUPPORTED':'C1D_CAUSAL_INTEGRATION_NOT_SUPPORTED'} }
function manifest() { return {schemaVersion:1,artifactKind:'c1d-causal-confidence-protocol-freeze',phase:'protocol-freeze',outcomesGenerated:false,solverExecuted:false,primaryExecuted:false,secondaryExecuted:false,batchCExecuted:false,freshRealBatchCExecuted:false,c1CampaignHead:C1_HEAD,standardV2:{publishedIdentity:STANDARD_V2,historicalProductBoundary:'31cc11982ebd07e009788d5e2c5c3537e9e6b615',semanticCompatibility:'executed Standard V2 path differs only by inactive optional research tracing; experimental structural modules are not called'},confidenceModel:{path:'.research-artifacts/c1-confidence-targeting-dev/confidence-model.json',sha256:MODEL_SHA,immutable:true,retrainingAllowed:false},primaryGroupIds:PRIMARY_GROUP_IDS,secondary:{primaryGateInput:false,source:'.research-artifacts/c1-confidence-targeting-dev/group-*.json'},rejectedBatchCToken:BATCH_C_TOKEN,freshRealBatchCRejected:true,arms:['FROZEN_BASELINE','CONSTANT_AUTHORITY_CONTROL','CONFIDENCE_SHAPED'],settings:SETTINGS,normalization:NORMALIZATION,primaryMetric:'artifact_rmse_4_14k of delivered PEQ cascade against zero correction',threshold:.05,groupRule:'strict majority of informative observations and median combined gain >= 0.05',campaignGate:'at least 4 of exactly 6 primary groups'} }
export async function freezeProtocol() { const m=manifest(), schema={type:'object',required:['artifactKind','primaryGroupIds','arms','settings','threshold','campaignGate']}; await mkdir(ARTIFACT,{recursive:true}); const mt=JSON.stringify(m,null,2)+'\n', st=JSON.stringify(schema,null,2)+'\n'; await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/manifest.json'),mt); await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/schema.json'),st); await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/protocol-sha256.txt'),hashText(mt+st)+'\n'); return m }
async function core() { return import('../../packages/core/src/index.ts') }
function curve(id,name,kind,freq,db){return{id,name,kind,rawPoints:freq.map((frequencyHz,i)=>({frequencyHz,db:db[i]})),metadata:{c1d:true}}}
async function runArm(label, frequencies, sourceDb, targetDb) { const {runStandardAutoEqV2,cascadeMagnitudeDb}=await core(); const started=performance.now(); const result=runStandardAutoEqV2({source:curve(`${label}-source`,label,'fr',frequencies,sourceDb),target:curve(`${label}-target`,label,'target',frequencies,targetDb),normalization:NORMALIZATION,settings:SETTINGS}); const response=cascadeMagnitudeDb(result.filters,frequencies,48000); const d=metric(response,frequencies); return {arm:label,...d,deliveredFilterCount:result.filters.length,sumAbsGainDb:result.filters.reduce((s,x)=>s+Math.abs(x.gainDb),0),maxAbsGainDb:Math.max(0,...result.filters.map(x=>Math.abs(x.gainDb))),maxQ:Math.max(0,...result.filters.map(x=>x.q)),preampDb:result.preampDb,cancellationScore:result.cancellationAudit.totalScore,solverInternalMetrics:result.metrics,terminationReason:result.manifest.terminationReason,elapsedMs:performance.now()-started,filters:result.filters} }
async function executeSet(sourceDir, ids, split, freezeCommit) {
  const model = validateModel(JSON.parse(await readFile(resolve(DEV, 'confidence-model.json'), 'utf8')))
  const done = []
  for (const id of ids) {
    const group = JSON.parse(await readFile(resolve(sourceDir, `group-${id}.json`), 'utf8'))
    const observations = []
    for (const obs of group.observations) {
      const selected = model.weights.byRigClass?.[obs.rigClass] ?? model.weights.globalFallback
      const w = selected.w_conf.valuesDb
      const arms = buildArmCorrections(obs.frequenciesHz, obs.deltaDb, w)
      const source = group.consensus.valuesDb.map((x, i) => x + obs.deltaDb[i])
      const armResults = []
      for (const [name, d] of [['FROZEN_BASELINE', arms.baseline], ['CONSTANT_AUTHORITY_CONTROL', arms.constant], ['CONFIDENCE_SHAPED', arms.confidence]]) {
        armResults.push(await runArm(name, obs.frequenciesHz, source, source.map((x, i) => x + d[i])))
      }
      const by = Object.fromEntries(armResults.map(x => [x.arm, x]))
      observations.push({
        observationId: obs.observationId, rigClass: obs.rigClass, profileSource: selected.source,
        confidenceKind: selected.source, weightProfileHash: selected.w_conf.profileSha256,
        confidence: { mean: mean(w), min: Math.min(...w), max: Math.max(...w), wBar: arms.wBar }, arms: armResults,
        comparison: classifyObservation({ baseline: by.FROZEN_BASELINE.artifactRmse4_14k, constant: by.CONSTANT_AUTHORITY_CONTROL.artifactRmse4_14k, confidence: by.CONFIDENCE_SHAPED.artifactRmse4_14k }),
      })
    }
    const gate = classifyGroup(observations.map(x => x.comparison))
    const output = { artifactKind:'c1d-group-causal-online-evidence', groupId:id, split, primaryGateInput:split==='primary', freezeCommit, observations, gate }
    await writeFile(assertWritablePath(`.research-artifacts/c1-confidence-causal-online/group-${id}.json`), JSON.stringify(output,null,2)+'\n')
    done.push(output)
  }
  return done
}
async function execute(kind) {
  const ids = kind === 'primary' ? PRIMARY_GROUP_IDS : (await readdir(DEV)).filter(x=>/^group-c1g-.*\.json$/.test(x)).map(x=>x.slice(6,-5))
  const existing = await readdir(ARTIFACT)
  if (ids.some(id => existing.includes(`group-${id}.json`))) throw Error(`one-shot ${kind} execution: matching outcome artifact already exists`)
  const freeze = execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()
  if(!/^[0-9a-f]{40}$/.test(freeze)) throw Error('unable to determine protocol freeze commit')
  const made = kind === 'primary' ? await executeSet(HOLDOUT, ids, 'primary', freeze) : await executeSet(DEV, ids, 'secondary', freeze)
  const groups = []
  for (const file of (await readdir(ARTIFACT)).filter(x => /^group-.*\.json$/.test(x))) groups.push(JSON.parse(await readFile(resolve(ARTIFACT,file),'utf8')))
  const primary = groups.filter(x => x.primaryGateInput)
  const secondary = groups.filter(x => !x.primaryGateInput)
  const aggregate={artifactKind:'c1d-causal-online-aggregate-evidence',freezeCommit:freeze,primaryGate:primary.length===6?classifyCampaign(primary.map(x=>x.gate)):null,primaryGroups:primary.map(x=>x.groupId),secondaryGroups:secondary.map(x=>x.groupId),batchCExecuted:false}
  await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/aggregate-evidence.json'),JSON.stringify(aggregate,null,2)+'\n')
  await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/outcome-manifest.json'),JSON.stringify({freezeCommit:freeze,kind,primaryExecuted:primary.length===6,secondaryExecuted:secondary.length>0,batchCExecuted:false},null,2)+'\n')
  const files=(await readdir(ARTIFACT)).filter(x=>x!=='evidence-sha256.txt').sort(); const hashes=[]; for(const f of files) hashes.push(`${hashText(await readFile(resolve(ARTIFACT,f),'utf8'))}  ${f}`)
  await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/evidence-sha256.txt'),hashes.join('\n')+'\n')
  await writeFile(assertWritablePath('.research-artifacts/c1-confidence-causal-online/final-report.md'),`# C1d evidence\n\nPrimary gate: ${aggregate.primaryGate?.classification??'not executed'}\n`)
  return made
}
if(import.meta.url===`file://${process.argv[1]}`){ if(process.argv[2]==='--freeze')await freezeProtocol(); else if(process.argv[2]==='--execute-primary')await execute('primary'); else if(process.argv[2]==='--execute-secondary')await execute('secondary'); else throw Error('use --freeze, --execute-primary, or --execute-secondary') }
