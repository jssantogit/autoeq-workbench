import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Filter } from '@autoeq-workbench/core'
import {
  createAudioEngine,
  type AudioEngine,
  type AudioEngineDependencies,
  type AudioEngineState,
} from '../../squiglink/sound-tools/audioEngine'
import { createEqCompareStore } from '../../state/eqCompareStore'
import { MusicPlayer } from './MusicPlayer'
import { ToneGenerator } from './ToneGenerator'

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 2,
  q: 1,
}

function capture(gainDb: number) {
  return {
    filters: [{ ...filter, gainDb }],
    filterProvenance: 'manual' as const,
    solutionState: 'clean' as const,
    autoEqRun: null,
    preampDb: -Math.max(0, gainDb),
  }
}

const baseAudioState: AudioEngineState = {
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

function mockEngine(loadFile: AudioEngine['loadFile'] = vi.fn(async () => undefined)): AudioEngine {
  return {
    getState: vi.fn(() => baseAudioState),
    subscribe: vi.fn(() => () => undefined),
    setSource: vi.fn(),
    loadFile,
    setVolume: vi.fn(),
    setToneFrequency: vi.fn(),
    setEqEnabled: vi.fn(),
    updateEq: vi.fn(),
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    destroy: vi.fn(),
  }
}

class FakeAudioParam {
  value = 0
}

class FakeAudioNode {
  connections: FakeAudioNode[] = []

  connect(node: FakeAudioNode) {
    this.connections.push(node)
    return node
  }

  disconnect() {
    this.connections = []
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam()
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  start = vi.fn()
  stop = vi.fn()
  onended: (() => void) | null = null
}

class FakeAudioContext {
  currentTime = 0
  state: AudioContextState = 'suspended'
  destination = new FakeAudioNode()
  decodedBuffer = { duration: 30 } as AudioBuffer
  bufferSources: FakeBufferSourceNode[] = []
  decodeAudioData = vi.fn(async () => this.decodedBuffer)
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })

  createGain() {
    return new FakeGainNode()
  }

  createBufferSource() {
    const source = new FakeBufferSourceNode()
    this.bufferSources.push(source)
    return source
  }
}

function localFile(name: string, bytes = new Uint8Array([1, 2, 3])): File {
  const file = new File([bytes], name, { type: 'audio/wav' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn(async () => bytes.buffer.slice(0)),
  })
  return file
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Remake 04 closeout regressions', () => {
  it('never coalesces a new edit into a snapshot already assigned to A or B', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const store = createEqCompareStore()

    store.getState().record(capture(1))
    store.getState().flush()
    const pinnedId = store.getState().snapshots[0]!.id
    store.getState().setA(pinnedId)

    vi.advanceTimersByTime(100)
    store.getState().record(capture(4))
    store.getState().flush()

    expect(store.getState().snapshots).toHaveLength(2)
    expect(store.getState().snapshots[0]).toMatchObject({
      id: pinnedId,
      filters: [{ gainDb: 1 }],
    })
    expect(store.getState().snapshots[1]?.filters[0]?.gainDb).toBe(4)
    expect(store.getState().aSnapshotId).toBe(pinnedId)
  })

  it('does not let the Tone stop control stop an active file source', () => {
    const engine = mockEngine()
    render(
      <ToneGenerator
        engine={engine}
        state={{ ...baseAudioState, source: 'file', fileLoaded: true, isPlaying: true }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Stop tone' })).toBeDisabled()
    expect(engine.stop).not.toHaveBeenCalled()
  })

  it('does not let the file stop control stop an active tone source', () => {
    const engine = mockEngine()
    render(
      <MusicPlayer
        engine={engine}
        state={{ ...baseAudioState, source: 'tone', fileLoaded: true, duration: 30, isPlaying: true }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Stop file' })).toBeDisabled()
    expect(engine.stop).not.toHaveBeenCalled()
  })

  it('keeps the last successful file name when a replacement decode fails', async () => {
    const user = userEvent.setup()
    const loadFile = vi
      .fn<AudioEngine['loadFile']>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Unable to decode local audio file: unsupported format'))
    const engine = mockEngine(loadFile)
    render(<MusicPlayer engine={engine} state={{ ...baseAudioState, source: 'file' }} />)
    const input = screen.getByLabelText('Choose local audio file')

    await user.upload(input, localFile('working.wav'))
    expect(screen.getByText('working.wav')).toBeVisible()

    await user.upload(input, localFile('broken.wav', new Uint8Array([9])))
    expect(await screen.findByRole('alert')).toHaveTextContent('unsupported format')
    expect(screen.getByText('working.wav')).toBeVisible()
    expect(screen.queryByText('broken.wav')).not.toBeInTheDocument()
  })

  it('discards a failed pending decode so Play reuses the last decoded buffer without retrying it', async () => {
    const context = new FakeAudioContext()
    const dependencies: AudioEngineDependencies = {
      createAudioContext: () => context as unknown as AudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    }
    const engine = createAudioEngine(dependencies)
    engine.setSource('file')
    await engine.loadFile(localFile('working.wav'))
    await engine.play()
    engine.stop()
    const originalBuffer = context.decodedBuffer

    context.decodeAudioData.mockRejectedValue(new DOMException('Unsupported', 'EncodingError'))
    await expect(engine.loadFile(localFile('broken.wav', new Uint8Array([9])))).rejects.toThrow(
      'Unable to decode local audio file',
    )

    expect(engine.getState()).toMatchObject({ fileLoaded: true, duration: 30 })
    await expect(engine.play()).resolves.toBeUndefined()
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(context.bufferSources.at(-1)?.buffer).toBe(originalBuffer)

    engine.destroy()
    await waitFor(() => expect(context.close).toHaveBeenCalledOnce())
  })
})
