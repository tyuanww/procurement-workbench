export type OAuthStateStore = {
  issue(input: { readonly stateHash: string; readonly nonceHash: string; readonly redirectUri: string; readonly returnTo: string; readonly createdAt: string; readonly expiresAt: string }): Promise<void>;
  consume(input: { readonly stateHash: string; readonly nonceHash: string; readonly at: string }): Promise<{ readonly redirectUri: string; readonly returnTo: string } | undefined>;
};
