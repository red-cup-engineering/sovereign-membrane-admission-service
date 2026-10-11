#!/usr/bin/env node
import { resolve } from "node:path";
import { argument as option } from "@red-cup-engineering/javascript-node-services-section/argv";
import { admitSovereignMembrane } from "../src/admit-sovereign-membrane.mjs";

function required(name) {
  const value = option(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const settlementPath = resolve(required("--settlement"));
const urn = required("--urn");
const chainId = Number(option("--chain-id") ?? "31337");
const rpcUrl = required("--rpc-url");
const bundlerUrl = required("--bundler-url");
const paymasterUrl = required("--paymaster-url");
const credentialRoot = resolve(required("--credential-root"));
const workspace = option("--workspace") ? resolve(option("--workspace")) : undefined;
const providerBin = resolve(required("--provider-bin"));

const result = await admitSovereignMembrane({
  settlementPath, urn, chainId, rpcUrl, bundlerUrl, paymasterUrl, credentialRoot, workspace, providerBin,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
