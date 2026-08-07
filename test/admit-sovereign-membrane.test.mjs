import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  admitSovereignMembrane,
  composeAgentCard,
  generateSigningMaterial,
  provisionChainAccount,
  SovereignMembraneAdmissionError,
} from "../src/admit-sovereign-membrane.mjs";

function settlementFixture(nodeId) {
  const dir = mkdtempSync(join(tmpdir(), "membrane-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `@red-cup-engineering/${nodeId}`,
    "x-agentic-metro-enterprise": { "node-id": nodeId },
  }));
  return dir;
}

test("generateSigningMaterial produces one Ed25519 jwks entry keyed by node id", () => {
  const material = generateSigningMaterial("example-service", { now: () => new Date("2026-07-25T00:00:00Z") });
  assert.equal(material.jwks.keys.length, 1);
  assert.equal(material.jwks.keys[0].kty, "OKP");
  assert.equal(material.jwks.keys[0].crv, "Ed25519");
  assert.equal(material.jwks.keys[0].kid, "example-service-2026-07-25");
  assert.match(material.privateKeyPem, /BEGIN PRIVATE KEY/);
});

test("composeAgentCard names the sovereign circuit interface with the provisioned account", () => {
  const card = composeAgentCard({ nodeId: "example-service", chainId: 31337, account: "0x" + "1".repeat(40) });
  assert.equal(card.name, "example-service");
  const params = card.capabilities.extensions[0].params;
  assert.equal(params.profile, "org.emsenn.rmn.sovereign-circuit-interface.v1");
  assert.equal(params.account, `eip155:31337:0x${"1".repeat(40)}`);
});

test("provisionChainAccount refuses a non-zero provider exit rather than fabricating a receipt", () => {
  const spawn = () => ({ status: 1, stdout: "", stderr: "provider refused: insufficient sponsorship" });
  assert.throws(
    () => provisionChainAccount({
      settlementPath: "/tmp/does-not-matter", urn: "urn:ame:example", rpcUrl: "http://x", bundlerUrl: "http://x",
      paymasterUrl: "http://x", credentialRoot: "/tmp", providerBin: "/bin/true", spawn,
    }),
    SovereignMembraneAdmissionError,
  );
});

test("provisionChainAccount refuses an unrecognized receipt shape rather than trusting it", () => {
  const spawn = () => ({ status: 0, stdout: JSON.stringify({ type: "SomethingElse" }) });
  assert.throws(
    () => provisionChainAccount({
      settlementPath: "/tmp/does-not-matter", urn: "urn:ame:example", rpcUrl: "http://x", bundlerUrl: "http://x",
      paymasterUrl: "http://x", credentialRoot: "/tmp", providerBin: "/bin/true", spawn,
    }),
    SovereignMembraneAdmissionError,
  );
});

test("admitSovereignMembrane refuses a settlement missing node-id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "membrane-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@red-cup-engineering/no-node-id" }));
  try {
    await assert.rejects(
      () => admitSovereignMembrane({ settlementPath: dir, urn: "urn:ame:x", chainId: 31337 }),
      SovereignMembraneAdmissionError,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("admitSovereignMembrane writes signing material and agent card from a stubbed provider", async () => {
  const dir = settlementFixture("fixture-die");
  const account = "0x" + "2".repeat(40);
  const spawn = () => ({
    status: 0,
    stdout: JSON.stringify({ type: "EnterpriseAccountProvisioned", account, actor: "urn:ame:fixture-die" }),
  });
  try {
    const result = await admitSovereignMembrane({
      settlementPath: dir,
      urn: "urn:ame:fixture-die",
      chainId: 31337,
      rpcUrl: "http://127.0.0.1:8545",
      bundlerUrl: "http://127.0.0.1:4337",
      paymasterUrl: "http://127.0.0.1:7677",
      credentialRoot: "/tmp/credentials",
      providerBin: "/bin/true",
      spawn,
      now: () => new Date("2026-07-25T00:00:00Z"),
    });
    assert.equal(result.nodeId, "fixture-die");
    assert.equal(result.account, account);
    const card = JSON.parse(readFileSync(result.agentCardPath, "utf8"));
    assert.equal(card.capabilities.extensions[0].params.account, `eip155:31337:${account}`);
    const jwks = JSON.parse(readFileSync(join(dir, "content", "agent-card-signing", "jwks.json"), "utf8"));
    assert.equal(jwks.keys[0].kid, "fixture-die-2026-07-25");
    const privateKey = readFileSync(join(dir, "data", "agent-card-signing", "ed25519-private.pem"), "utf8");
    assert.match(privateKey, /BEGIN PRIVATE KEY/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
