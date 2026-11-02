export interface Named<Name extends string> {
  readonly $name: Name
}

export type NameOf<T extends Named<string>> =
  T extends Named<infer Name> ? Name : never
