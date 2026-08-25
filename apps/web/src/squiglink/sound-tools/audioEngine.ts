import type { Filter } from '@autoeq-workbench/core'

export type AudioSourceKind = 'tone' | 'file'

export interface AudioEngineState {
  source: AudioSourceKind
  isPlaying: boolean
  fileLoaded: boolean
  currentTime: number
  duration: number
  volume: number
  toneFrequencyHz: number
  eqEnabled: boolean
  error: string | null
}

export interface AudioEngineEqState {
  filters: readonly Filter[]
  preampDb: number
}

export interface AudioEngineDependencies {
  createAudioContext(): AudioContext
  requestAnimationFrame(callback: FrameRequestCallback): number
  cancelAnimationFrame(handle: number): void
}

export interface AudioEngine {
  getState(): AudioEngineState
  subscribe(listener: (state: AudioEngineState) => void): () => void
  setSource(source: AudioSourceKind): void
  loadFile(file: File): Promise<void>
  setVolume(linear: number): void
  setToneFrequency(frequencyHz: number): void
  setEqEnabled(enabled: boolean): void
  updateEq(eq: AudioEngineEqState): void
  play(): Promise<void>
  pause(): void
  stop(): void
  seek(seconds: number): void
  destroy(): void
}

const DEFAULT_STATE: AudioEngineState = {
  source: 'tone',
  isPlaying: false,
  fileLoaded: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  toneFrequencyHz: 440,
  eqEnabled: true,
  error: null,
}

function defaultDependencies(): AudioEngineDependencies {
  return {
    createAudioContext: () => new AudioContext(),
    requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

function decodeError(error: unknown): Error {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
  return new Error(`Unable to decode local audio file${detail}`, { cause: error })
}

export function createAudioEngine(
  dependencies: AudioEngineDependencies = defaultDependencies(),
): AudioEngine {
  let state = { ...DEFAULT_STATE }
  let eqState: AudioEngineEqState = { filters: [], preampDb: 0 }
  let context: AudioContext | null = null
  let volumeNode: GainNode | null = null
  let preampNode: GainNode | null = null
  let filterNodes: BiquadFilterNode[] = []
  let activeSource: AudioScheduledSourceNode | null = null
  let activeOscillator: OscillatorNode | null = null
  let audioBuffer: AudioBuffer | null = null
  let pendingFile: { bytes: ArrayBuffer; generation: number } | null = null
  let fileGeneration = 0
  let fileStartedAt = 0
  let fileStartOffset = 0
  let progressFrame: number | null = null
  let destroyed = false
  const listeners = new Set<(nextState: AudioEngineState) => void>()

  function snapshot(): AudioEngineState {
    return { ...state }
  }

  function notify(): void {
    const nextState = snapshot()
    for (const listener of listeners) listener({ ...nextState })
  }

  function cancelProgress(): void {
    if (progressFrame === null) return
    dependencies.cancelAnimationFrame(progressFrame)
    progressFrame = null
  }

  function currentFileTime(): number {
    if (!context || !state.isPlaying || state.source !== 'file') return state.currentTime
    return clamp(fileStartOffset + context.currentTime - fileStartedAt, 0, state.duration)
  }

  function releaseSource(): void {
    const source = activeSource
    activeSource = null
    activeOscillator = null
    if (!source) return
    source.onended = null
    try {
      source.stop()
    } catch {
      // A source can already have ended between progress frames.
    }
    source.disconnect()
  }

  function scheduleProgress(): void {
    cancelProgress()
    const update = () => {
      progressFrame = null
      if (destroyed || !state.isPlaying || state.source !== 'file') return
      state.currentTime = currentFileTime()
      if (state.currentTime >= state.duration) {
        releaseSource()
        state.isPlaying = false
        notify()
        return
      }
      notify()
      progressFrame = dependencies.requestAnimationFrame(update)
    }
    progressFrame = dependencies.requestAnimationFrame(update)
  }

  function disconnectEq(): void {
    preampNode?.disconnect()
    preampNode = null
    for (const node of filterNodes) node.disconnect()
    filterNodes = []
  }

  function rebuildRouting(): void {
    if (!context || !volumeNode) return
    activeSource?.disconnect()
    disconnectEq()

    let input: AudioNode = volumeNode
    if (state.eqEnabled) {
      preampNode = context.createGain()
      preampNode.gain.value = 10 ** (eqState.preampDb / 20)
      input = preampNode
      let output: AudioNode = preampNode

      for (const filter of eqState.filters) {
        if (!filter.enabled) continue
        const node = context.createBiquadFilter()
        node.type = filter.type === 'PK' ? 'peaking' : filter.type === 'LS' ? 'lowshelf' : 'highshelf'
        node.frequency.value = filter.frequencyHz
        node.gain.value = filter.gainDb
        node.Q.value = filter.q
        output.connect(node)
        output = node
        filterNodes.push(node)
      }
      output.connect(volumeNode)
    }
    activeSource?.connect(input)
  }

  function ensureContext(): AudioContext {
    if (context) return context
    context = dependencies.createAudioContext()
    volumeNode = context.createGain()
    volumeNode.gain.value = state.volume
    volumeNode.connect(context.destination)
    rebuildRouting()
    return context
  }

  async function decodeAndCommit(bytes: ArrayBuffer, generation: number): Promise<boolean> {
    const audioContext = context
    if (!audioContext) return false
    try {
      const decoded = await audioContext.decodeAudioData(bytes.slice(0))
      if (destroyed || generation !== fileGeneration) return false
      if (state.source === 'file' && state.isPlaying) releaseSource()
      cancelProgress()
      audioBuffer = decoded
      pendingFile = null
      state.fileLoaded = true
      state.duration = decoded.duration
      state.currentTime = 0
      state.isPlaying = false
      state.error = null
      notify()
      return true
    } catch (error) {
      if (destroyed || generation !== fileGeneration) return false
      pendingFile = null
      state.fileLoaded = audioBuffer !== null
      if (audioBuffer === null) {
        state.duration = 0
        state.currentTime = 0
      }
      const failure = decodeError(error)
      state.error = failure.message
      notify()
      throw failure
    }
  }

  function startTone(audioContext: AudioContext): void {
    releaseSource()
    const oscillator = audioContext.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = state.toneFrequencyHz
    activeSource = oscillator
    activeOscillator = oscillator
    oscillator.connect(state.eqEnabled ? preampNode! : volumeNode!)
    oscillator.start()
    state.isPlaying = true
    state.error = null
    notify()
  }

  function startFile(audioContext: AudioContext): void {
    if (!audioBuffer) throw new Error('Load a local audio file before playback')
    releaseSource()
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    activeSource = source
    source.connect(state.eqEnabled ? preampNode! : volumeNode!)
    fileStartOffset = clamp(state.currentTime, 0, state.duration)
    fileStartedAt = audioContext.currentTime
    source.onended = () => {
      if (destroyed || activeSource !== source) return
      activeSource = null
      source.disconnect()
      cancelProgress()
      state.currentTime = state.duration
      state.isPlaying = false
      notify()
    }
    source.start(0, fileStartOffset)
    state.isPlaying = true
    state.error = null
    notify()
    scheduleProgress()
  }

  return {
    getState: snapshot,

    subscribe(listener) {
      if (destroyed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    setSource(source) {
      if (destroyed || state.source === source) return
      releaseSource()
      cancelProgress()
      state.source = source
      state.isPlaying = false
      state.currentTime = 0
      notify()
    },

    async loadFile(file) {
      if (destroyed) throw new Error('Audio engine has been destroyed')
      const generation = ++fileGeneration
      const bytes = await file.arrayBuffer()
      if (destroyed || generation !== fileGeneration) return
      pendingFile = { bytes, generation }
      state.fileLoaded = true
      state.error = null
      notify()
      if (context) await decodeAndCommit(bytes, generation)
    },

    setVolume(linear) {
      if (destroyed) return
      state.volume = clamp(linear, 0, 1)
      if (volumeNode) volumeNode.gain.value = state.volume
      notify()
    },

    setToneFrequency(frequencyHz) {
      if (destroyed) return
      state.toneFrequencyHz = clamp(frequencyHz, 20, 20_000)
      if (activeOscillator) activeOscillator.frequency.value = state.toneFrequencyHz
      notify()
    },

    setEqEnabled(enabled) {
      if (destroyed || state.eqEnabled === enabled) return
      state.eqEnabled = enabled
      rebuildRouting()
      notify()
    },

    updateEq(eq) {
      if (destroyed) return
      eqState = {
        filters: eq.filters.map((filter) => ({ ...filter })),
        preampDb: eq.preampDb,
      }
      if (state.eqEnabled) rebuildRouting()
    },

    async play() {
      if (destroyed) throw new Error('Audio engine has been destroyed')
      if (state.isPlaying) return
      const audioContext = ensureContext()
      if (audioContext.state !== 'running') await audioContext.resume()
      if (destroyed) throw new Error('Audio engine has been destroyed')

      if (state.source === 'tone') {
        startTone(audioContext)
        return
      }
      if (pendingFile) await decodeAndCommit(pendingFile.bytes, pendingFile.generation)
      if (destroyed) throw new Error('Audio engine has been destroyed')
      startFile(audioContext)
    },

    pause() {
      if (destroyed || !state.isPlaying) return
      if (state.source === 'file') state.currentTime = currentFileTime()
      releaseSource()
      cancelProgress()
      state.isPlaying = false
      notify()
    },

    stop() {
      if (destroyed) return
      releaseSource()
      cancelProgress()
      state.isPlaying = false
      state.currentTime = 0
      notify()
    },

    seek(seconds) {
      if (destroyed || state.source !== 'file' || !state.fileLoaded) return
      state.currentTime = clamp(seconds, 0, state.duration)
      if (state.isPlaying && context && audioBuffer) startFile(context)
      else notify()
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      fileGeneration += 1
      pendingFile = null
      releaseSource()
      cancelProgress()
      disconnectEq()
      volumeNode?.disconnect()
      volumeNode = null
      state.isPlaying = false
      listeners.clear()
      const closingContext = context
      context = null
      if (closingContext && closingContext.state !== 'closed') {
        void closingContext.close().catch(() => undefined)
      }
    },
  }
}
