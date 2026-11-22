export type EnumLabels<T extends string> = { readonly [K in T]: string };

export type EnumDef<T extends string> = {
  readonly values: readonly T[];
  readonly labels: EnumLabels<T>;
  label(value: T): string;
  text(code: string): string;
};

export function vocabularyText<T extends string>(
  table: { readonly values: readonly T[]; readonly label: (value: T) => string },
  code: string,
): string {
  const known = table.values.find((item) => item === code);
  if (known === undefined) return code;
  return table.label(known);
}

export function defineEnum<const T extends readonly string[]>(
  values: T,
  labels: EnumLabels<T[number]>,
): EnumDef<T[number]> {
  const label = (value: T[number]): string => labels[value];
  return {
    values,
    labels,
    label,
    text(code: string): string {
      return vocabularyText({ values, label }, code);
    },
  };
}
