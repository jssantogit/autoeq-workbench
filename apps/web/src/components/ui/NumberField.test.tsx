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

it('renders a visual unit outside the numeric value without changing commits', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<NumberField label="Frequency Hz" unit="Hz" value={1_000} onValueChange={onValueChange} />)

  const input = screen.getByRole('spinbutton', { name: 'Frequency Hz' })
  expect(screen.getByText('Hz')).toHaveAttribute('aria-hidden', 'true')
  expect(input).toHaveValue(1_000)
  expect(input).not.toHaveValue('1000 Hz')

  await user.clear(input)
  await user.type(input, '1200')
  fireEvent.blur(input)
  expect(onValueChange).toHaveBeenCalledWith(1_200)
})
