// Admits a sovereign membrane for a die already present on disk: binds the
// smart-account-provisioning capability at arm's length through its own
// independently addressed provider CapCell (enterprise-account-provisioning-service),
// then generates the die's own Ed25519 agent-card-signing material and Agent
// Card as inert local material. Never mints chain custody in-process.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  EMPTY_WITNESS_ROOT,
  identifyNormalizedSemanticContent,
} from "@red-cup-engineering/semantic-content-identify-service";
import { jsonToTerm } from "@red-cup-engineering/relation-model-notation-json-codec";
import { inferTy } from "@red-cup-engineering/relation-model-notation-typing";

export class SovereignMembraneAdmissionError extends Error {
  constructor(message) {
    super(message);
    this.name = "SovereignMembraneAdmissionError";
    this.code = "SOVEREIGN_MEMBRANE_ADMISSION_REFUSED";
  }
}

function identity(label) {
  const term = jsonToTerm(label);
  const semanticType = inferTy([], term);
  if (semanticType === null) throw new SovereignMembraneAdmissionError("membrane label did not derive an RMN type");
  return identifyNormalizedSemanticContent({
    objectKind: "sovereign-membrane.label",
    semanticType,
    term,
    witnessRoot: EMPTY_WITNESS_ROOT,
  }).token;
}

function readNodeId(settlementPath) {
  const manifestPath = join(settlementPath, "package.json");
  if (!existsSync(manifestPath)) {
    throw new SovereignMembraneAdmissionError(`settlement package.json is absent: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const nodeId = manifest["x-agentic-metro-enterprise"]?.["node-id"];
  if (!nodeId) {
    throw new SovereignMembraneAdmissionError("settlement does not declare x-agentic-metro-enterprise.node-id");
  }
  return nodeId;
}

// Binds smart-account-provisioning through its own independently addressed
// provider (the existing, live enterprise-account-provisioning-service) at
// arm's length via subprocess invocation -- never imported in-process, since
// account custody and deployment are effects, not inert material.
export function provisionChainAccount({
  settlementPath,
  urn,
  rpcUrl,
  bundlerUrl,
  paymasterUrl,
  credentialRoot,
  workspace,
  providerBin,
  spawn = spawnSync,
}) {
  const args = [
    providerBin,
    "--rpc-url", rpcUrl,
    "--bundler-url", bundlerUrl,
    "--paymaster-url", paymasterUrl,
    "--urn", urn,
    "--credential-root", credentialRoot,
    "--settlement", settlementPath,
    ...(workspace ? ["--workspace", workspace] : []),
  ];
  const result = spawn(process.execPath, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new SovereignMembraneAdmissionError(
      `smart-account-provisioning provider refused: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch {
    throw new SovereignMembraneAdmissionError("smart-account-provisioning provider returned a non-JSON receipt");
  }
  if (receipt.type !== "EnterpriseAccountProvisioned" || typeof receipt.account !== "string") {
    throw new SovereignMembraneAdmissionError("smart-account-provisioning provider returned an unrecognized receipt shape");
  }
  return receipt;
}

// Ed25519 agent-card-signing material is inert local material (pure compute,
// no network, no chain custody) and is generated in-process, matching every
// existing die's content/agent-card-signing + data/agent-card-signing shape.
export function generateSigningMaterial(nodeId, { now = () => new Date() } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const kid = `${nodeId}-${now().toISOString().slice(0, 10)}`;
  const jwk = publicKey.export({ format: "jwk" });
  return {
    kid,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    jwks: { keys: [{ crv: jwk.crv, x: jwk.x, kty: jwk.kty, kid, alg: "EdDSA", use: "sig" }] },
  };
}

export function composeAgentCard({ nodeId, chainId, account }) {
  const label = `${nodeId}:sovereign-membrane`;
  return {
    name: nodeId,
    capabilities: {
      extensions: [
        {
          uri: identity("org.emsenn.rmn.sovereign-circuit-interface.v1"),
          required: true,
          params: {
            profile: "org.emsenn.rmn.sovereign-circuit-interface.v1",
            account: `eip155:${chainId}:${account}`,
            authority: identity(`${label}:authority`),
            custody: identity(`${label}:custody`),
            territory: identity(`${label}:territory`),
          },
        },
      ],
    },
  };
}

export async function admitSovereignMembrane({
  settlementPath,
  urn,
  chainId,
  rpcUrl,
  bundlerUrl,
  paymasterUrl,
  credentialRoot,
  workspace,
  providerBin,
  spawn,
  now,
}) {
  const nodeId = readNodeId(settlementPath);
  const receipt = provisionChainAccount({ settlementPath, urn, rpcUrl, bundlerUrl, paymasterUrl, credentialRoot, workspace, providerBin, spawn });
  const signing = generateSigningMaterial(nodeId, { now });
  const agentCard = composeAgentCard({ nodeId, chainId, account: receipt.account });

  const signingDir = join(settlementPath, "data", "agent-card-signing");
  const publicSigningDir = join(settlementPath, "content", "agent-card-signing");
  const agentCardsDir = join(settlementPath, "content", "agent-cards");
  mkdirSync(signingDir, { recursive: true });
  mkdirSync(publicSigningDir, { recursive: true });
  mkdirSync(agentCardsDir, { recursive: true });

  const privateKeyPath = join(signingDir, "ed25519-private.pem");
  const jwksPath = join(publicSigningDir, "jwks.json");
  const agentCardPath = join(agentCardsDir, `${nodeId}.json`);
  writeFileSync(privateKeyPath, signing.privateKeyPem, { mode: 0o600 });
  writeFileSync(jwksPath, `${JSON.stringify(signing.jwks, null, 2)}\n`);
  writeFileSync(agentCardPath, `${JSON.stringify(agentCard, null, 2)}\n`);

  return Object.freeze({
    nodeId,
    account: receipt.account,
    provisioningReceipt: receipt,
    privateKeyPath,
    jwksPath,
    agentCardPath,
  });
}
