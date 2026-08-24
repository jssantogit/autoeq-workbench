import { useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string
  value: number
  onValueChange: (value: number) => void
  validate?: (value: number) => boolean
  unit?: string
}

export function NumberField({
  label,
  value,
  onValueChange,
  validate = Number.isFinite,
  unit,
  className = '',
  ...props
}: NumberFieldProps) {
  const [editText, setEditText] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  if (!Object.is(value, lastValue)) {
    setLastValue(value)
    setEditText(null)
    setInvalid(false)
  }

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
    <label className={`number-field${unit === undefined ? '' : ' number-field--with-unit'} ${className}`.trim()}>
      <span>{label}</span>
      <span className="number-field__control">
        <input
          {...props}
          type="number"
          value={editText ?? String(value)}
          aria-label={label}
          aria-invalid={invalid}
          onChange={(event) => {
            setEditText(event.target.value)
            setInvalid(false)
          }}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        {unit !== undefined && <span className="number-field__unit" aria-hidden="true">{unit}</span>}
      </span>
    </label>
  )
}
