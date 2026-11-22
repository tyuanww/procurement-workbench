export interface ImportSource {
  /** P2：从飞书表拉内容。v1 不实现。 */
  pull(token: string): Promise<Uint8Array>;
}
