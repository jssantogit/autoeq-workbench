import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AudioEngine, AudioEngineState } from '../../squiglink/sound-tools/audioEngine'
import { MusicPlayer } from './MusicPlayer'

const fileState: AudioEngineState = {
  source: 'file',
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
    getState: vi.fn(() => fileState),
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

describe('MusicPlayer', () => {
  it('loads only a browser-local file and exposes no upload or network UI', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    render(<MusicPlayer engine={engine} state={fileState} />)
    const input = screen.getByLabelText('Choose local audio file')
    const file = new File(['synthetic audio'], 'synthetic.wav', { type: 'audio/wav' })

    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'audio/*')
    await user.upload(input, file)
    expect(engine.setSource).toHaveBeenCalledWith('file')
    expect(engine.loadFile).toHaveBeenCalledWith(file)
    expect(screen.queryByText(/upload|url|network/i)).not.toBeInTheDocument()
  })

  it('supports playback controls, shared volume, seek, and playback-only EQ Effect', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    const { rerender } = render(<MusicPlayer engine={engine} state={fileState} />)

    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeDisabled()
    rerender(<MusicPlayer engine={engine} state={{ ...fileState, fileLoaded: true, duration: 125 }} />)
    await user.click(screen.getByRole('button', { name: 'Play file' }))
    expect(engine.setSource).toHaveBeenCalledWith('file')
    expect(engine.play).toHaveBeenCalledOnce()
    rerender(<MusicPlayer engine={engine} state={{ ...fileState, fileLoaded: true, duration: 125, isPlaying: true }} />)
    await user.click(screen.getByRole('button', { name: 'Pause file' }))
    await user.click(screen.getByRole('button', { name: 'Stop file' }))
    expect(engine.pause).toHaveBeenCalledOnce()
    expect(engine.stop).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByRole('slider', { name: 'Music volume' }), { target: { value: '0.4' } })
    expect(engine.setVolume).toHaveBeenCalledWith(0.4)
    await user.click(screen.getByRole('checkbox', { name: 'EQ Effect' }))
    expect(engine.setEqEnabled).toHaveBeenCalledWith(false)

    rerender(<MusicPlayer engine={engine} state={{ ...fileState, fileLoaded: true, duration: 125, currentTime: 5 }} />)
    const seek = screen.getByRole('slider', { name: 'Playback position' })
    expect(seek).toBeEnabled()
    fireEvent.change(seek, { target: { value: '42' } })
    expect(engine.seek).toHaveBeenCalledWith(42)
  })

  it('keeps seek disabled for a non-meaningful duration and reports local decode failures clearly', async () => {
    const user = userEvent.setup()
    const loadFile = vi.fn(async () => {
      throw new Error('Unable to decode local audio file: unsupported format')
    })
    const engine = mockEngine(loadFile)
    render(<MusicPlayer engine={engine} state={{ ...fileState, fileLoaded: true, duration: 0 }} />)

    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeDisabled()
    await user.upload(
      screen.getByLabelText('Choose local audio file'),
      new File(['invalid'], 'invalid.wav', { type: 'audio/wav' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to decode local audio file: unsupported format')
  })

  it('exposes accessible aria-valuetext and output association for seek position and volume', () => {
    const engine = mockEngine()
    render(
      <MusicPlayer
        engine={engine}
        state={{ ...fileState, fileLoaded: true, duration: 125, currentTime: 45, volume: 0.8 }}
      />,
    )

    const seekSlider = screen.getByRole('slider', { name: 'Playback position' })
    expect(seekSlider).toHaveAttribute('aria-valuetext', '0:45 / 2:05')
    expect(seekSlider).toHaveAttribute('id', 'music-playback-position')
    const seekOutput = screen.getByText('0:45 / 2:05')
    expect(seekOutput.tagName.toLowerCase()).toBe('output')
    expect(seekOutput).toHaveAttribute('for', 'music-playback-position')

    const volumeSlider = screen.getByRole('slider', { name: 'Music volume' })
    expect(volumeSlider).toHaveAttribute('aria-valuetext', '80%')
    expect(volumeSlider).toHaveAttribute('id', 'music-volume')
    const volumeOutput = screen.getByText('80%')
    expect(volumeOutput.tagName.toLowerCase()).toBe('output')
    expect(volumeOutput).toHaveAttribute('for', 'music-volume')
  })
})
