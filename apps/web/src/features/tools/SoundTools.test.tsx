import type { Filter } from '@autoeq-workbench/core'
import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AudioEngine, AudioEngineState } from '../../squiglink/sound-tools/audioEngine'
import { SoundTools } from './SoundTools'

const initialState: AudioEngineState = {
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

function mockEngine() {
  let listener: ((state: AudioEngineState) => void) | undefined
  const unsubscribe = vi.fn()
  const engine: AudioEngine = {
    getState: vi.fn(() => initialState),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener
      return unsubscribe
    }),
    setSource: vi.fn(),
    loadFile: vi.fn(async () => undefined),
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
  return { engine, emit: (state: AudioEngineState) => listener?.(state), unsubscribe }
}

describe('SoundTools', () => {
  it('owns exactly one subscribed engine for its mounted lifetime and destroys it', () => {
    const mocked = mockEngine()
    const createEngine = vi.fn(() => mocked.engine)
    const { rerender, unmount } = render(<SoundTools filters={[]} preampDb={0} createEngine={createEngine} />)

    expect(createEngine).toHaveBeenCalledOnce()
    expect(mocked.engine.subscribe).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Tone Generator' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Music Player' })).toBeInTheDocument()
    act(() => mocked.emit({ ...initialState, volume: 0.25 }))
    expect(screen.getByRole('slider', { name: 'Tone volume' })).toHaveValue('0.25')
    expect(screen.getByRole('slider', { name: 'Music volume' })).toHaveValue('0.25')

    rerender(<SoundTools filters={[]} preampDb={0} createEngine={createEngine} />)
    expect(createEngine).toHaveBeenCalledOnce()
    expect(mocked.engine.subscribe).toHaveBeenCalledOnce()

    unmount()
    expect(mocked.unsubscribe).toHaveBeenCalledOnce()
    expect(mocked.engine.destroy).toHaveBeenCalledOnce()
  })

  it('syncs canonical filters and preamp changes through the same engine', () => {
    const { engine } = mockEngine()
    const createEngine = vi.fn(() => engine)
    const filter: Filter = {
      id: 'filter-1',
      enabled: true,
      type: 'PK',
      frequencyHz: 1_000,
      gainDb: 3,
      q: 1,
    }
    const { rerender } = render(<SoundTools filters={[]} preampDb={0} createEngine={createEngine} />)

    expect(engine.updateEq).toHaveBeenLastCalledWith({ filters: [], preampDb: 0 })
    rerender(<SoundTools filters={[filter]} preampDb={-3} createEngine={createEngine} />)
    expect(engine.updateEq).toHaveBeenLastCalledWith({ filters: [filter], preampDb: -3 })
    expect(createEngine).toHaveBeenCalledOnce()
  })

  it('destroys every engine created during the StrictMode lifecycle', () => {
    const engines: AudioEngine[] = []
    const createEngine = vi.fn(() => {
      const engine = mockEngine().engine
      engines.push(engine)
      return engine
    })
    const { unmount } = render(
      <StrictMode><SoundTools filters={[]} preampDb={0} createEngine={createEngine} /></StrictMode>,
    )

    unmount()
    expect(engines).not.toHaveLength(0)
    expect(engines.every((engine) => vi.mocked(engine.destroy).mock.calls.length === 1)).toBe(true)
  })
})
