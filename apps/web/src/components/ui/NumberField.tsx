import { useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string
  value: number
  onValueChange: (value: number) => void
  validate?: (value: number) => boolean
}

export function NumberField({
  label,
  value,
  onValueChange,
  validate = Number.isFinite,
  className = '',
  ...props
}: NumberFieldProps) {
  const [editText, setEditText] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  function commit(candidate: string) {
    const numeric = Number(candidate)
    if (candidate.trim() !== '' && Number.isFinite(numeric) && validate(numeric)) {
      onValueChange(numeric)
      setEditText(null)
      setInvalid(false)
    } else {
      setEditText(candidate)
      setInvalid(true)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit(event.currentTarget.value)
  }

  return (
    <label className={`number-field ${className}`.trim()}>
      <span>{label}</span>
      <input
        {...props}
        type="number"
        value={editText ?? String(value)}
        aria-invalid={invalid}
        onChange={(event) => {
          setEditText(event.target.value)
          setInvalid(false)
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}
