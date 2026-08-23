import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLElement> {
  title: string
  actions?: ReactNode
}

export function Panel({ title, actions, children, className = '', ...props }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()} {...props}>
      <header className="panel__header">
        <h2>{title}</h2>
        {actions}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}
