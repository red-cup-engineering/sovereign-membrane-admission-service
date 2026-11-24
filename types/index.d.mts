export class SovereignMembraneAdmissionError extends Error {}

export interface EnterpriseAccountProvisionedReceipt {
  type: "EnterpriseAccountProvisioned";
  account: string;
  actor: string;
  [key: string]: unknown;
}

export interface SigningMaterial {
  kid: string;
  privateKeyPem: string;
  jwks: { keys: Array<{ crv: string; x: string; kty: string; kid: string; alg: string; use: string }> };
}

export interface AgentCard {
  name: string;
  capabilities: {
    extensions: Array<{
      uri: string;
      required: boolean;
      params: { profile: string; account: string; authority: string; custody: string; territory: string };
    }>;
  };
}

export interface AdmitSovereignMembraneOptions {
  settlementPath: string;
  urn: string;
  chainId: number;
  rpcUrl: string;
  bundlerUrl: string;
  paymasterUrl: string;
  credentialRoot: string;
  workspace?: string;
  providerBin: string;
  spawn?: (...args: unknown[]) => { status: number | null; stdout: string; stderr?: string };
  now?: () => Date;
}

export interface AdmitSovereignMembraneResult {
  nodeId: string;
  account: string;
  provisioningReceipt: EnterpriseAccountProvisionedReceipt;
  privateKeyPath: string;
  jwksPath: string;
  agentCardPath: string;
}

export function provisionChainAccount(options: Omit<AdmitSovereignMembraneOptions, "chainId">): EnterpriseAccountProvisionedReceipt;
export function generateSigningMaterial(nodeId: string, options?: { now?: () => Date }): SigningMaterial;
export function composeAgentCard(options: { nodeId: string; chainId: number; account: string }): AgentCard;
export function admitSovereignMembrane(options: AdmitSovereignMembraneOptions): Promise<AdmitSovereignMembraneResult>;
