import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'

it('keeps temporary invalid text until an external value change synchronizes it', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  const { rerender } = render(
    <NumberField label="Gain" value={0} validate={(value) => value <= 15} onValueChange={onValueChange} />,
  )
  const input = screen.getByRole('spinbutton', { name: 'Gain' })

  await user.clear(input)
  await user.type(input, '16')
  fireEvent.blur(input)
  expect(input).toHaveValue(16)
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(onValueChange).not.toHaveBeenCalled()

  rerender(
    <NumberField label="Gain" value={2} validate={(value) => value <= 15} onValueChange={onValueChange} />,
  )
  expect(input).toHaveValue(2)
  expect(input).toHaveAttribute('aria-invalid', 'false')
})
