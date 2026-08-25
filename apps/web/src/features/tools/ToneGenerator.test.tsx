import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AudioEngine, AudioEngineState } from '../../squiglink/sound-tools/audioEngine'
import { ToneGenerator } from './ToneGenerator'

const toneState: AudioEngineState = {
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

function mockEngine(): AudioEngine {
  return {
    getState: vi.fn(() => toneState),
    subscribe: vi.fn(() => () => undefined),
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
}

describe('ToneGenerator', () => {
  it('maps its slider logarithmically from 20 Hz to 20 kHz and shows numeric Hz', () => {
    const engine = mockEngine()
    const { rerender } = render(<ToneGenerator engine={engine} state={{ ...toneState, toneFrequencyHz: 20 }} />)
    const frequency = screen.getByRole('slider', { name: 'Tone frequency' })

    expect(frequency).toHaveAttribute('min', '0')
    expect(frequency).toHaveAttribute('max', '1')
    expect(screen.getByText('20 Hz')).toBeInTheDocument()

    fireEvent.change(frequency, { target: { value: '0.5' } })
    expect(engine.setToneFrequency).toHaveBeenLastCalledWith(expect.closeTo(632.4555, 3))

    fireEvent.change(frequency, { target: { value: '1' } })
    expect(engine.setToneFrequency).toHaveBeenLastCalledWith(20_000)
    rerender(<ToneGenerator engine={engine} state={{ ...toneState, toneFrequencyHz: 20_000 }} />)
    expect(screen.getByText('20000 Hz')).toBeInTheDocument()
  })

  it('plays and stops a sine tone from explicit controls, stopping file playback first', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    render(<ToneGenerator engine={engine} state={{ ...toneState, source: 'file', isPlaying: true }} />)

    expect(screen.getByText('Sine wave')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play tone' }))
    expect(engine.stop).toHaveBeenCalledOnce()
    expect(engine.setSource).toHaveBeenCalledWith('tone')
    expect(engine.play).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Stop tone' }))
    expect(engine.stop).toHaveBeenCalledTimes(2)
  })

  it('updates shared volume and changes the active tone frequency live', () => {
    const engine = mockEngine()
    render(<ToneGenerator engine={engine} state={{ ...toneState, isPlaying: true }} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Tone volume' }), { target: { value: '0.35' } })
    expect(engine.setVolume).toHaveBeenCalledWith(0.35)

    fireEvent.change(screen.getByRole('slider', { name: 'Tone frequency' }), { target: { value: '0.25' } })
    expect(engine.setToneFrequency).toHaveBeenCalledWith(expect.closeTo(112.468, 3))
    expect(engine.play).not.toHaveBeenCalled()
  })

  it('exposes accessible aria-valuetext and programmatic output association for frequency and volume', () => {
    const engine = mockEngine()
    render(<ToneGenerator engine={engine} state={{ ...toneState, toneFrequencyHz: 1000, volume: 0.75 }} />)

    const frequencySlider = screen.getByRole('slider', { name: 'Tone frequency' })
    expect(frequencySlider).toHaveAttribute('aria-valuetext', '1000 Hz')
    expect(frequencySlider).toHaveAttribute('id', 'tone-frequency')
    const frequencyOutput = screen.getByText('1000 Hz')
    expect(frequencyOutput.tagName.toLowerCase()).toBe('output')
    expect(frequencyOutput).toHaveAttribute('for', 'tone-frequency')

    const volumeSlider = screen.getByRole('slider', { name: 'Tone volume' })
    expect(volumeSlider).toHaveAttribute('aria-valuetext', '75%')
    expect(volumeSlider).toHaveAttribute('id', 'tone-volume')
    const volumeOutput = screen.getByText('75%')
    expect(volumeOutput.tagName.toLowerCase()).toBe('output')
    expect(volumeOutput).toHaveAttribute('for', 'tone-volume')
  })
})
