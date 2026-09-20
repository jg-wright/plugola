export function NamedMixin<C extends abstract new (...args: any[]) => any>(
  Class: C,
  name: string,
): Named &
  (abstract new (
    ...args: ConstructorParameters<C>
  ) => InstanceType<C> & Named) {
  abstract class NamedMixin extends Class implements Named {
    static readonly $name = name
    readonly $name = name
  }

  return NamedMixin
}

export interface Named {
  $name: string
}
