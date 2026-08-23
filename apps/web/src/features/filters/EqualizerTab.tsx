import { FilterEditor } from './FilterEditor'

export function EqualizerTab() {
  return (
    <section className="equalizer-tab" aria-label="Equalizer workspace">
      <header className="equalizer-tab__top">
        <div className="equalizer-tab__meta" role="group" aria-label="Equalizer profile">
          <span>Manual</span>
          <span>48 kHz</span>
          <span>20 Hz-20 kHz</span>
        </div>
      </header>
      <FilterEditor />
    </section>
  )
}
