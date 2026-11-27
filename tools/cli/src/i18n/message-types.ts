/**
 * Turns the pt-BR catalogue of an area (an `as const` object) into the shape every locale must
 * have: literal strings widen to `string`, functions keep their parameters, line lists may differ
 * in length, objects recurse. A missing or extra key in es or en is then a type error. Same idea as
 * `@studio/ui` `Messages`, with line lists added for the multi-line notices of the CLI.
 */
export type Messages<T> = T extends string
  ? string
  : T extends (...args: infer Args) => infer Result
    ? (...args: Args) => Result extends string ? string : Result extends readonly string[] ? readonly string[] : Result
    : T extends readonly string[]
      ? readonly string[]
      : { -readonly [Key in keyof T]: Messages<T[Key]> };
