export type PartyRef = {
  readonly id: string | null;
  readonly displayName: string | null;
  readonly rawName: string | null;
};

export type UserRef = {
  readonly id: string;
  readonly name: string;
};

export type NoInput = Record<string, never>;

export type FileBytes = { readonly bytes: Uint8Array; readonly fileName: string };
