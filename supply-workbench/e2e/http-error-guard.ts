export type ResponseError = {
  readonly status: number;
  readonly url: string;
};

export type ExpectedServerError = {
  readonly status: 500;
  readonly path: string;
};

export function unexpectedHttpErrors(input: { readonly responses: readonly ResponseError[]; readonly expected: readonly ExpectedServerError[] }): readonly ResponseError[] {
  return input.responses.filter((response) => !isExpected(response, input.expected));
}

function isExpected(response: ResponseError, expected: readonly ExpectedServerError[]): boolean {
  if (response.status === 401 || response.status === 404) return true;
  if (response.status !== 500) return false;
  return expected.some((item) => response.url.includes(item.path));
}
