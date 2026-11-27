/**
 * Turns a pt-BR catalogue (an `as const` object) into the shape every locale must have: literal
 * strings widen to `string`, functions keep their parameters, objects recurse. A missing or extra
 * key in es or en is then a type error.
 */
export type Messages<T> = T extends string
  ? string
  : T extends (...args: infer Args) => string
    ? (...args: Args) => string
    : { -readonly [Key in keyof T]: Messages<T[Key]> };
