export const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
export const USDC_ISSUER = process.env.NEXT_PUBLIC_USDC_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
/** Testnet only, everywhere. */
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerAccount = (address: string) => `https://stellar.expert/explorer/testnet/account/${address}`;
