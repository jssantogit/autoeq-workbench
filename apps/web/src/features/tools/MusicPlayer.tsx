import { useState, type ChangeEvent } from 'react'
import type { AudioEngine, AudioEngineState } from '../../squiglink/sound-tools/audioEngine'

interface MusicPlayerProps {
  engine: AudioEngine
  state: AudioEngineState
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

export function MusicPlayer({ engine, state }: MusicPlayerProps) {
  const [fileName, setFileName] = useState('No local file selected')
  const [localError, setLocalError] = useState<string | null>(null)
  const hasDuration = state.fileLoaded && Number.isFinite(state.duration) && state.duration > 0

  function selectFileSource(): void {
    if (state.source === 'tone' && state.isPlaying) engine.stop()
    engine.setSource('file')
  }

  async function loadLocalFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    setLocalError(null)
    setFileName(file.name)
    selectFileSource()
    try {
      await engine.loadFile(file)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to decode the local audio file')
    }
  }

  async function playFile(): Promise<void> {
    setLocalError(null)
    selectFileSource()
    try {
      await engine.play()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to play the local audio file')
    }
  }

  return (
    <section
      className="sound-tools__source"
      aria-labelledby="music-player-heading"
      style={{ borderTop: '1px solid var(--wb-border)', paddingTop: 9 }}
    >
      <div style={{ display: 'flex', minWidth: 0, alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h4 id="music-player-heading" style={{ flexShrink: 0, margin: 0, fontSize: '0.78rem' }}>Music Player</h4>
        <span style={{ minWidth: 0, overflow: 'hidden', color: 'var(--wb-text-muted)', fontSize: '0.68rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 7, marginTop: 7 }}>
        <label className="file-control" style={{ width: 'fit-content' }}>
          Choose local audio file
          <input type="file" accept="audio/*" aria-label="Choose local audio file" onChange={(event) => void loadLocalFile(event)} />
        </label>

        <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 8 }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
            Playback position
          </span>
          <input
            id="music-playback-position"
            aria-label="Playback position"
            aria-valuetext={`${formatTime(state.currentTime)} / ${formatTime(state.duration)}`}
            type="range"
            min="0"
            max={hasDuration ? state.duration : 0}
            step="0.1"
            value={hasDuration ? Math.min(state.currentTime, state.duration) : 0}
            disabled={!hasDuration}
            onChange={(event) => engine.seek(Number(event.currentTarget.value))}
            style={{ width: '100%', minWidth: 0, accentColor: 'var(--wb-accent)' }}
          />
          <output
            htmlFor="music-playback-position"
            id="music-playback-position-output"
            style={{ minWidth: '5.6rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' }}
          >
            {formatTime(state.currentTime)} / {formatTime(state.duration)}
          </output>
        </label>

        <label style={{ display: 'grid', gridTemplateColumns: '3.2rem minmax(0, 1fr) 2.8rem', alignItems: 'center', gap: 8, color: 'var(--wb-text-muted)', fontSize: '0.68rem' }}>
          <span>Volume</span>
          <input
            id="music-volume"
            aria-label="Music volume"
            aria-valuetext={`${Math.round(state.volume * 100)}%`}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={state.volume}
            onChange={(event) => engine.setVolume(Number(event.currentTarget.value))}
            style={{ width: '100%', minWidth: 0, accentColor: 'var(--wb-accent)' }}
          />
          <output
            htmlFor="music-volume"
            id="music-volume-output"
            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(state.volume * 100)}%
          </output>
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <button className="button" type="button" aria-label="Play file" disabled={!state.fileLoaded} onClick={() => void playFile()}>
            Play
          </button>
          <button className="button" type="button" aria-label="Pause file" disabled={state.source !== 'file' || !state.isPlaying} onClick={() => engine.pause()}>
            Pause
          </button>
          <button className="button" type="button" aria-label="Stop file" disabled={!state.fileLoaded} onClick={() => engine.stop()}>
            Stop
          </button>
          <label style={{ display: 'inline-flex', minHeight: 30, alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: '0.7rem' }}>
            <input
              type="checkbox"
              checked={state.eqEnabled}
              onChange={(event) => engine.setEqEnabled(event.currentTarget.checked)}
            />
            EQ Effect
          </label>
        </div>
      </div>

      {(localError ?? (state.source === 'file' ? state.error : null)) && (
        <p className="field-error" role="alert">{localError ?? state.error}</p>
      )}
    </section>
  )
}
