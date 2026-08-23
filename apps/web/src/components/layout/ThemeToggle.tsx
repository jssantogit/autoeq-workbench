import { useUiStore } from '../../state/uiStore'

export function ThemeToggle() {
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)
  const nextTheme = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        {theme === 'light' ? (
          <path d="M20.4 15.4A8 8 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      <span>{theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
