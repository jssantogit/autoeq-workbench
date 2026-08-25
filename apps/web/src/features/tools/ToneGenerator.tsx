import { useState } from 'react'
import type { AudioEngine, AudioEngineState } from '../../squiglink/sound-tools/audioEngine'

interface ToneGeneratorProps {
  engine: AudioEngine
  state: AudioEngineState
}

function sliderToFrequency(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 20 * Math.pow(20_000 / 20, clamped)
}

function frequencyToSlider(frequencyHz: number): number {
  const clamped = Math.min(20_000, Math.max(20, frequencyHz))
  return Math.log(clamped / 20) / Math.log(20_000 / 20)
}

export function ToneGenerator({ engine, state }: ToneGeneratorProps) {
  const [playError, setPlayError] = useState<string | null>(null)

  async function playTone(): Promise<void> {
    setPlayError(null)
    if (state.source === 'file') engine.stop()
    engine.setSource('tone')
    try {
      await engine.play()
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : 'Unable to play the tone')
    }
  }

  return (
    <section className="sound-tools__source" aria-labelledby="tone-generator-heading">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h4 id="tone-generator-heading" style={{ margin: 0, fontSize: '0.78rem' }}>Tone Generator</h4>
        <span style={{ color: 'var(--wb-text-muted)', fontSize: '0.68rem' }}>Sine wave</span>
      </div>

      <div style={{ display: 'grid', gap: 7, marginTop: 7 }}>
        <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 5.2rem', alignItems: 'center', gap: 8 }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
            Tone frequency
          </span>
          <input
            aria-label="Tone frequency"
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={frequencyToSlider(state.toneFrequencyHz)}
            onChange={(event) => engine.setToneFrequency(sliderToFrequency(Number(event.currentTarget.value)))}
            style={{ width: '100%', minWidth: 0, accentColor: 'var(--wb-accent)' }}
          />
          <output style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.74rem' }}>
            {Math.round(state.toneFrequencyHz)} Hz
          </output>
        </label>

        <label style={{ display: 'grid', gridTemplateColumns: '3.2rem minmax(0, 1fr) 2.8rem', alignItems: 'center', gap: 8, color: 'var(--wb-text-muted)', fontSize: '0.68rem' }}>
          <span>Volume</span>
          <input
            aria-label="Tone volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={state.volume}
            onChange={(event) => engine.setVolume(Number(event.currentTarget.value))}
            style={{ width: '100%', minWidth: 0, accentColor: 'var(--wb-accent)' }}
          />
          <output style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(state.volume * 100)}%</output>
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button className="button" type="button" aria-label="Play tone" onClick={() => void playTone()}>
            Play
          </button>
          <button className="button" type="button" aria-label="Stop tone" onClick={() => engine.stop()}>
            Stop
          </button>
        </div>
      </div>

      {(playError ?? (state.source === 'tone' ? state.error : null)) && (
        <p className="field-error" role="alert">{playError ?? state.error}</p>
      )}
    </section>
  )
}
