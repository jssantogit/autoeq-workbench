import type { Filter } from '@autoeq-workbench/core'
import { describe, expect, it, vi } from 'vitest'
import { createAudioEngine, type AudioEngineDependencies } from './audioEngine'

class FakeAudioParam {
  value = 0
}

class FakeAudioNode {
  connections: FakeAudioNode[] = []
  disconnectCalls = 0

  connect(node: FakeAudioNode) {
    this.connections.push(node)
    return node
  }

  disconnect() {
    this.disconnectCalls += 1
    this.connections = []
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam()
}

class FakeBiquadNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass'
  frequency = new FakeAudioParam()
  gain = new FakeAudioParam()
  Q = new FakeAudioParam()
}

class FakeSourceNode extends FakeAudioNode {
  start = vi.fn()
  stop = vi.fn()
  onended: (() => void) | null = null
}

class FakeOscillatorNode extends FakeSourceNode {
  type: OscillatorType = 'square'
  frequency = new FakeAudioParam()
}

class FakeBufferSourceNode extends FakeSourceNode {
  buffer: AudioBuffer | null = null
}

class FakeAudioContext {
  currentTime = 0
  state: AudioContextState = 'suspended'
  destination = new FakeAudioNode()
  gains: FakeGainNode[] = []
  biquads: FakeBiquadNode[] = []
  oscillators: FakeOscillatorNode[] = []
  bufferSources: FakeBufferSourceNode[] = []
  decodedBuffer = { duration: 120 } as AudioBuffer
  decodeAudioData = vi.fn(async () => this.decodedBuffer)
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })

  createGain() {
    const node = new FakeGainNode()
    this.gains.push(node)
    return node
  }

  createBiquadFilter() {
    const node = new FakeBiquadNode()
    this.biquads.push(node)
    return node
  }

  createOscillator() {
    const node = new FakeOscillatorNode()
    this.oscillators.push(node)
    return node
  }

  createBufferSource() {
    const node = new FakeBufferSourceNode()
    this.bufferSources.push(node)
    return node
  }
}

function makeHarness() {
  const contexts: FakeAudioContext[] = []
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const dependencies: AudioEngineDependencies = {
    createAudioContext: () => {
      const context = new FakeAudioContext()
      contexts.push(context)
      return context as unknown as AudioContext
    },
    requestAnimationFrame: (callback) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  }

  return {
    contexts,
    frames,
    engine: createAudioEngine(dependencies),
    runFrame() {
      const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined
      if (!entry) return
      frames.delete(entry[0])
      entry[1](0)
    },
  }
}

function localFile(bytes = new Uint8Array([1, 2, 3])) {
  const file = new File([bytes], 'synthetic.wav', { type: 'audio/wav' })
  const arrayBuffer = vi.fn(async () => bytes.buffer.slice(0))
  Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer })
  return { file, arrayBuffer }
}

const filters: Filter[] = [
  { id: 'pk', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 3, q: 1.2 },
  { id: 'ls', enabled: true, type: 'LS', frequencyHz: 120, gainDb: -2, q: 0.7 },
  { id: 'hs', enabled: true, type: 'HS', frequencyHz: 8_000, gainDb: 1.5, q: 0.9 },
  { id: 'off', enabled: false, type: 'PK', frequencyHz: 500, gainDb: 9, q: 3 },
]

describe('shared audio engine', () => {
  it('creates and resumes exactly one context only after explicit play', async () => {
    const harness = makeHarness()
    harness.engine.setVolume(0.5)
    harness.engine.setToneFrequency(1_000)
    harness.engine.updateEq({ filters, preampDb: -3 })

    expect(harness.contexts).toEqual([])
    await harness.engine.play()
    await harness.engine.play()

    expect(harness.contexts).toHaveLength(1)
    expect(harness.contexts[0]!.resume).toHaveBeenCalledTimes(1)
  })

  it('plays one sine oscillator, clamps frequency, and updates it live', async () => {
    const { engine, contexts } = makeHarness()
    engine.setToneFrequency(-1)
    await engine.play()
    const context = contexts[0]!
    const oscillator = context.oscillators[0]!

    expect(oscillator.type).toBe('sine')
    expect(oscillator.frequency.value).toBe(20)
    expect(oscillator.start).toHaveBeenCalledOnce()

    engine.setToneFrequency(99_000)
    expect(engine.getState().toneFrequencyHz).toBe(20_000)
    expect(oscillator.frequency.value).toBe(20_000)
    expect(context.oscillators).toHaveLength(1)
  })

  it('stops and disconnects the previous source when switching source', async () => {
    const { engine, contexts } = makeHarness()
    await engine.play()
    const oscillator = contexts[0]!.oscillators[0]!

    engine.setSource('file')

    expect(oscillator.stop).toHaveBeenCalledOnce()
    expect(oscillator.disconnectCalls).toBe(1)
    expect(engine.getState()).toMatchObject({ source: 'file', isPlaying: false })
  })

  it('reads and decodes a local File without a network path', async () => {
    const { engine, contexts } = makeHarness()
    const { file, arrayBuffer } = localFile()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    engine.setSource('file')
    await engine.loadFile(file)
    expect(contexts).toEqual([])
    expect(engine.getState()).toMatchObject({ fileLoaded: true, duration: 0 })

    await engine.play()

    expect(arrayBuffer).toHaveBeenCalledOnce()
    expect(contexts[0]!.decodeAudioData).toHaveBeenCalledOnce()
    expect(contexts[0]!.bufferSources[0]!.buffer).toBe(contexts[0]!.decodedBuffer)
    expect(contexts[0]!.bufferSources[0]!.start).toHaveBeenCalledWith(0, 0)
    expect(engine.getState()).toMatchObject({ isPlaying: true, duration: 120 })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('keeps pause position, recreates on seek, and resets stop to zero', async () => {
    const harness = makeHarness()
    const { engine } = harness
    engine.setSource('file')
    await engine.loadFile(localFile().file)
    await engine.play()
    const context = harness.contexts[0]!
    const first = context.bufferSources[0]!

    context.currentTime = 12.5
    harness.runFrame()
    expect(engine.getState().currentTime).toBe(12.5)
    engine.pause()
    expect(first.stop).toHaveBeenCalledOnce()
    expect(first.disconnectCalls).toBe(1)
    expect(engine.getState()).toMatchObject({ isPlaying: false, currentTime: 12.5 })
    expect(harness.frames.size).toBe(0)

    engine.seek(30)
    await engine.play()
    expect(context.bufferSources[1]!.start).toHaveBeenCalledWith(0, 30)
    engine.seek(500)
    expect(context.bufferSources[1]!.disconnectCalls).toBe(1)
    expect(context.bufferSources[2]!.start).toHaveBeenCalledWith(0, 120)

    engine.stop()
    expect(context.bufferSources[2]!.disconnectCalls).toBe(1)
    expect(engine.getState()).toMatchObject({ isPlaying: false, currentTime: 0 })
    expect(harness.frames.size).toBe(0)
  })

  it('preserves the prior decoded file and EQ after a clear decode failure', async () => {
    const { engine, contexts } = makeHarness()
    engine.updateEq({ filters, preampDb: -4 })
    engine.setSource('file')
    await engine.loadFile(localFile().file)
    await engine.play()
    engine.stop()
    const context = contexts[0]!
    const originalBuffer = context.decodedBuffer
    const originalBiquads = [...context.biquads]
    context.decodeAudioData.mockRejectedValueOnce(new DOMException('Unsupported', 'EncodingError'))

    await expect(engine.loadFile(localFile(new Uint8Array([9])).file)).rejects.toThrow(
      'Unable to decode local audio file',
    )

    expect(engine.getState()).toMatchObject({ fileLoaded: true, duration: 120 })
    expect(engine.getState().error).toContain('Unable to decode local audio file')
    expect(context.biquads).toEqual(originalBiquads)
    await engine.play()
    expect(context.bufferSources.at(-1)!.buffer).toBe(originalBuffer)
  })

  it('maps enabled canonical filters and preamp into the Web Audio EQ chain', async () => {
    const { engine, contexts } = makeHarness()
    engine.updateEq({ filters, preampDb: -6 })
    await engine.play()
    const context = contexts[0]!

    expect(context.biquads.map((node) => node.type)).toEqual(['peaking', 'lowshelf', 'highshelf'])
    expect(context.biquads.map((node) => [node.frequency.value, node.gain.value, node.Q.value])).toEqual([
      [1_000, 3, 1.2],
      [120, -2, 0.7],
      [8_000, 1.5, 0.9],
    ])
    expect(context.gains.some((node) => Math.abs(node.gain.value - 10 ** (-6 / 20)) < 1e-12)).toBe(true)
  })

  it('bypasses EQ without mutating input and rebuilds live routing cleanly', async () => {
    const { engine, contexts } = makeHarness()
    const input = structuredClone(filters)
    engine.updateEq({ filters: input, preampDb: -2 })
    await engine.play()
    const context = contexts[0]!
    const oscillator = context.oscillators[0]!
    const oldFilters = [...context.biquads]
    const oldPreamp = context.gains[1]!

    engine.setEqEnabled(false)
    expect(input).toEqual(filters)
    expect(oldFilters.every((node) => node.disconnectCalls === 1)).toBe(true)
    expect(oldPreamp.disconnectCalls).toBe(1)
    expect(oscillator.connections).toEqual([context.gains[0]])

    engine.setEqEnabled(true)
    engine.updateEq({ filters: [filters[0]!], preampDb: -1 })
    expect(context.biquads).toHaveLength(7)
    expect(context.biquads.slice(3, 6).every((node) => node.disconnectCalls === 1)).toBe(true)
    expect(oscillator.connections[0]).toBe(context.gains.at(-1))
    expect(engine.getState().isPlaying).toBe(true)
  })

  it('clamps linear volume and notifies subscribers with independent state snapshots', async () => {
    const { engine, contexts } = makeHarness()
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)

    engine.setVolume(-2)
    await engine.play()
    engine.setVolume(5)

    expect(engine.getState().volume).toBe(1)
    expect(contexts[0]!.gains[0]!.gain.value).toBe(1)
    expect(listener).toHaveBeenCalled()
    expect(listener.mock.calls.at(-1)![0]).not.toBe(engine.getState())
    unsubscribe()
    const calls = listener.mock.calls.length
    engine.stop()
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('cancels progress and destroys every resource idempotently', async () => {
    const harness = makeHarness()
    await harness.engine.play()
    const context = harness.contexts[0]!
    const oscillator = context.oscillators[0]!
    expect(harness.frames.size).toBe(0)

    harness.engine.destroy()
    harness.engine.destroy()

    expect(oscillator.stop).toHaveBeenCalledOnce()
    expect(oscillator.disconnectCalls).toBe(1)
    expect(context.gains.every((node) => node.disconnectCalls === 1)).toBe(true)
    expect(context.close).toHaveBeenCalledOnce()
    await expect(harness.engine.play()).rejects.toThrow('Audio engine has been destroyed')
  })

  it('cannot be revived by a late file read after destroy', async () => {
    const harness = makeHarness()
    let finishRead!: (value: ArrayBuffer) => void
    const file = new File([], 'late.wav')
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn(() => new Promise<ArrayBuffer>((resolve) => { finishRead = resolve })),
    })
    const loading = harness.engine.loadFile(file)

    harness.engine.destroy()
    finishRead(new ArrayBuffer(1))
    await loading

    expect(harness.contexts).toEqual([])
    expect(harness.engine.getState()).toMatchObject({ fileLoaded: false, isPlaying: false })
  })

  it('cannot be revived by a decode that finishes after destroy', async () => {
    const harness = makeHarness()
    await harness.engine.play()
    harness.engine.stop()
    const context = harness.contexts[0]!
    let finishDecode!: (value: AudioBuffer) => void
    context.decodeAudioData.mockImplementationOnce(
      () => new Promise<AudioBuffer>((resolve) => { finishDecode = resolve }),
    )

    const loading = harness.engine.loadFile(localFile().file)
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce())
    harness.engine.destroy()
    finishDecode({ duration: 999 } as AudioBuffer)
    await loading

    expect(harness.engine.getState()).toMatchObject({ duration: 0, isPlaying: false })
    expect(context.bufferSources).toEqual([])
    expect(context.close).toHaveBeenCalledOnce()
  })
})
