// Creates the LiveKit SIP inbound trunk and dispatch rule for inbound calls,
// and prints the ids to paste into .env.
//
// Run once, after the carrier account exists and you know which SIP hosts it
// sends from:
//
//   node scripts/sip-setup.mjs --numbers +917507041938 \
//     --addresses <YOUR-PROVIDER-SIP-HOST>
//
// --addresses is the carrier's SIP origination host, taken from their console.
// It is the security boundary on the trunk, so it has to be the real value:
//   Plivo   TODO: confirm the origination host for your region once the
//           account exists. Plivo documents it per-region.
//   Exotel  the SIP domain attached to the number.
// Getting it wrong fails closed — the carrier's INVITE is rejected.
//
// Idempotent: a trunk or rule with the same name is reused rather than
// duplicated. Re-run it to print the ids again.
//
// Why a script and not a dashboard page: this is run once per deployment by
// whoever holds the carrier credentials, not by a customer.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SipClient } from "livekit-server-sdk";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Same prefix the agent and docs refer to; see ROOM_NAMING in lib/livekit/sip.ts.
const ROOM_PREFIX = "call";
const TRUNK_NAME = "trellient-inbound";
const RULE_NAME = "trellient-inbound-dispatch";

loadDotEnv();

const args = parseArgs(process.argv.slice(2));
const numbers = args.numbers ?? [];
const addresses = args.addresses ?? [];

const url = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!url || !apiKey || !apiSecret) {
  fail("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in .env.");
}
if (numbers.length === 0) {
  fail("Pass the numbers this trunk answers: --numbers +917507041938[,+91...]");
}
// Without this the trunk answers SIP from anywhere on the internet, and anyone
// who learns the URI can run calls on your account.
if (addresses.length === 0) {
  fail(
    "Pass the carrier SIP hosts: --addresses <provider-sip-host>[,...]\n" +
      "  Refusing to create a trunk that accepts SIP from any address.",
  );
}

const sip = new SipClient(url.replace(/^ws/, "http"), apiKey, apiSecret);

const trunkId = await ensureTrunk();
const ruleId = await ensureRule(trunkId);

console.log("\nSIP inbound is configured.\n");
console.log("Add to .env:");
console.log(`  LIVEKIT_SIP_INBOUND_TRUNK_ID=${trunkId}`);
console.log("\nAlso:");
console.log(`  - set phone_numbers.inbound_trunk_id = '${trunkId}' for ${numbers.join(", ")}`);
console.log(`  - point the carrier at this LiveKit SIP URI (from the LiveKit project settings)`);
console.log(`  - rooms will be named ${ROOM_PREFIX}-<dialled number>-<random>; nothing else`);
console.log(`    predicts that name, the agent resolves context from the dialled number`);
console.log(`\n  dispatch rule: ${ruleId}`);

async function ensureTrunk() {
  const existing = (await sip.listSipInboundTrunk()).find((t) => t.name === TRUNK_NAME);
  if (existing) {
    console.log(`Inbound trunk ${TRUNK_NAME} already exists (${existing.sipTrunkId}).`);
    const current = existing.numbers ?? [];
    const missing = numbers.filter((n) => !current.includes(n));
    if (missing.length) {
      // Left to a human: silently widening which numbers a live trunk answers
      // is not something a setup script should do on a re-run.
      console.log(`  ! It does not answer: ${missing.join(", ")}`);
      console.log(`  ! Add them in the LiveKit dashboard, or delete the trunk and re-run.`);
    }
    return existing.sipTrunkId;
  }

  const trunk = await sip.createSipInboundTrunk(TRUNK_NAME, numbers, {
    allowedAddresses: addresses,
  });
  console.log(`Created inbound trunk ${TRUNK_NAME} (${trunk.sipTrunkId}).`);
  return trunk.sipTrunkId;
}

async function ensureRule(forTrunkId) {
  const existing = (await sip.listSipDispatchRule()).find((r) => r.name === RULE_NAME);
  if (existing) {
    console.log(`Dispatch rule ${RULE_NAME} already exists (${existing.sipDispatchRuleId}).`);
    return existing.sipDispatchRuleId;
  }

  // callee + randomize: one room per call, named after the dialled number.
  // Deliberately not deterministic — see ROOM_NAMING in lib/livekit/sip.ts.
  const rule = await sip.createSipDispatchRule(
    { type: "callee", roomPrefix: ROOM_PREFIX, randomize: true },
    { trunkIds: [forTrunkId], name: RULE_NAME },
  );
  console.log(`Created dispatch rule ${RULE_NAME} (${rule.sipDispatchRuleId}).`);
  return rule.sipDispatchRuleId;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) continue;
    out[flag.slice(2)] = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    i += 1;
  }
  return out;
}

/** Minimal .env reader — this runs before any app code, so no dotenv import. */
function loadDotEnv() {
  try {
    const text = readFileSync(path.join(root, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // No .env — rely on the real environment.
  }
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
