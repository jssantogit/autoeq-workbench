export type CoreErrorCategory =
  | 'parse'
  | 'validation'
  | 'optimization'
  | 'numeric'
  | 'export'

export class CoreError extends Error {
  readonly category: CoreErrorCategory

  constructor(category: CoreErrorCategory, message: string) {
    super(message)
    this.name = 'CoreError'
    this.category = category
  }
}
