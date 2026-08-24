import type { ReactNode } from 'react'

interface SquiglinkShellProps {
  header: ReactNode
  primary: ReactNode
  secondary: ReactNode
}

export function SquiglinkShell({ header, primary, secondary }: SquiglinkShellProps) {
  return (
    <div className="graphtool">
      {header}
      <main className="main">
        <section className="parts-primary" aria-label="Graph workspace">
          {primary}
        </section>
        <section className="parts-secondary" aria-label="Control workspace">
          {secondary}
        </section>
      </main>
    </div>
  )
}
