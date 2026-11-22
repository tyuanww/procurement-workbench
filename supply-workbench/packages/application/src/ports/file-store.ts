export interface StoredBlob {
  readonly sha256: string;
  readonly originalName: string;
  readonly size: number;
  readonly mime: string;
}

export interface FileStore {
  /** 按内容哈希去重。相同字节返回已有记录。 */
  put(input: { readonly bytes: Uint8Array; readonly originalName: string; readonly mime: string }): Promise<StoredBlob>;
  /** 找不到返回 undefined。 */
  read(sha256: string): Promise<Uint8Array | undefined>;
}
