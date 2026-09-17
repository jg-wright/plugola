export interface Plugin<
  EC extends Record<string, unknown> = Record<string, unknown>,
  RC extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string
  dependencies?: string[]
  optionalDependencies?: string[]
  enableTimeout?: number
  enable?(context: EC): any
  run?(context: RC): any
}
