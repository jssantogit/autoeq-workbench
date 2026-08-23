import { ThemeToggle } from './ThemeToggle'

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__identity">
        <h1>AutoEQ Workbench</h1>
        <p>Frequency response workspace</p>
      </div>
      <ThemeToggle />
    </header>
  )
}
