import type { Filter } from '@autoeq-workbench/core'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  createAudioEngine,
  type AudioEngine,
  type AudioEngineState,
} from '../../squiglink/sound-tools/audioEngine'
import { MusicPlayer } from './MusicPlayer'
import { ToneGenerator } from './ToneGenerator'

interface SoundToolsProps {
  filters: readonly Filter[]
  preampDb: number
  createEngine?: () => AudioEngine
}

type OwnedEngine = { engine: AudioEngine; state: AudioEngineState } | null

function createEngineHolder() {
  let snapshot: OwnedEngine = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: OwnedEngine) {
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

export function SoundTools({ filters, preampDb, createEngine = createAudioEngine }: SoundToolsProps) {
  const [holder] = useState(createEngineHolder)
  const owned = useSyncExternalStore(holder.subscribe, holder.getSnapshot, holder.getSnapshot)

  useEffect(() => {
    const engine = createEngine()
    holder.set({ engine, state: engine.getState() })
    const unsubscribe = engine.subscribe((state) => {
      if (holder.getSnapshot()?.engine === engine) holder.set({ engine, state })
    })
    return () => {
      unsubscribe()
      engine.destroy()
      if (holder.getSnapshot()?.engine === engine) holder.set(null)
    }
  }, [createEngine, holder])

  useEffect(() => {
    owned?.engine.updateEq({ filters, preampDb })
  }, [owned?.engine, filters, preampDb])

  return (
    <section className="tools-section sound-tools" aria-labelledby="sound-tools-heading">
      <h3 id="sound-tools-heading">Sound Tools</h3>
      {owned !== null && (
        <div style={{ display: 'grid', minWidth: 0, gap: 9 }}>
          <ToneGenerator engine={owned.engine} state={owned.state} />
          <MusicPlayer engine={owned.engine} state={owned.state} />
        </div>
      )}
    </section>
  )
}
