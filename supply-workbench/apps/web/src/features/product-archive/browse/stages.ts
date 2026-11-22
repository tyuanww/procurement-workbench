import { lineStageText } from '@sw/domain';

export function purchaseStageButtons<T extends string>(
  byStage: Readonly<Record<T, number>>,
): { readonly code: string; readonly text: string }[] {
  return Object.keys(byStage).flatMap((code) => stageButton({ byStage, code }));
}

function stageButton<T extends string>(input: {
  readonly byStage: Readonly<Record<T, number>>;
  readonly code: string;
}): { readonly code: string; readonly text: string }[] {
  if (!isStageKey(input.byStage, input.code)) return [];
  return [{ code: input.code, text: `${lineStageText(input.code)} ${input.byStage[input.code]}` }];
}

function isStageKey<T extends string>(byStage: Readonly<Record<T, number>>, code: string): code is T {
  return Object.keys(byStage).includes(code);
}
