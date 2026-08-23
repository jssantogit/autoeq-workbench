import { useState, type InputHTMLAttributes } from 'react'

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

  function commit(candidate: string) {
    setEditText(candidate)
    const numeric = Number(candidate)
    if (candidate.trim() !== '' && Number.isFinite(numeric) && validate(numeric)) {
      onValueChange(numeric)
    }
  }

  return (
    <label className={`number-field ${className}`.trim()}>
      <span>{label}</span>
      <input
        {...props}
        type="number"
        value={editText ?? String(value)}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => setEditText(null)}
      />
    </label>
  )
}
