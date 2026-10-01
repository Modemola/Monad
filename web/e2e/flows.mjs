// End-to-end: the three things a judge does, through the real UI, against a real chain.
//
//   ./scripts/e2e.sh            # starts anvil, deploys, builds, serves and runs this
//
// Or by hand, with anvil deployed and the app served at BASE_URL:
//
//   BASE_URL=http://localhost:3200 node e2e/flows.mjs
//
// The browser gets a minimal EIP-1193 wallet that forwards every request to anvil, whose default
// accounts are unlocked, so `eth_sendTransaction` signs without a key in this file. Each flow uses
// its own account so the faucet button (shown only to a wallet holding under 100 USDC) appears.
// Screenshots of any failure land in e2e/artifacts/.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3200";
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), "artifacts");
mkdirSync(ARTIFACTS, { recursive: true });

// anvil's well-known default accounts #1–#3; #0 is the deployer.
const TRADER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BORROWER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const UNDERWRITER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let failed = false;

async function session(account, name, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(
    ({ account, rpc }) => {
      window.ethereum = {
        isMetaMask: true,
        on() {},
        removeListener() {},
        async request({ method, params = [] }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
          if (method === "wallet_switchEthereumChain") return null;
          if (method === "eth_sendTransaction") params[0].from = account;
          const response = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
          });
          const body = await response.json();
          if (body.error) throw Object.assign(new Error(body.error.message), body.error);
          return body.result;
        },
      };
    },
    { account, rpc: RPC_URL },
  );

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const has = (text, timeout = 30_000) =>
    page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), text, { timeout });
  // Cards reveal as they scroll into view; walk the page once so every control is on screen.
  const reveal = async () => {
    for (let y = 0; y < 3200; y += 400) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);
    }
    await page.mouse.wheel(0, -4000);
    await page.waitForTimeout(400);
  };
  const button = (name) => page.getByRole("button", { name });
  const amountCleared = () =>
    page.waitForFunction(() => document.querySelector("input[placeholder='0.00']")?.value === "", null, {
      timeout: 30_000,
    });

  console.log(`\n${name}`);
  let current = "load";
  try {
    const step = async (label, fn) => {
      current = label;
      await fn();
      console.log(`  ok  ${label}`);
    };
    await run({ page, step, has, reveal, button, amountCleared });
    if (errors.length) throw new Error(`console errors: ${errors.slice(0, 3).join(" | ")}`);
  } catch (error) {
    failed = true;
    console.log(`  FAIL ${current}: ${String(error).split("\n")[0]}`);
    await page.screenshot({ path: join(ARTIFACTS, `${name.toLowerCase()}-failure.png`), fullPage: true });
  }
  await context.close();
}

async function connect({ page, step, has, reveal, button }, path, account) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
  await step("connect wallet", async () => {
    await button(/connect wallet/i).click();
    await has(account.slice(0, 6));
  });
  await reveal();
}

await session(TRADER, "Trade", async (t) => {
  const { page, step, has, button, amountCleared } = t;
  await connect(t, "/trade", TRADER);
  const amount = page.locator("input[placeholder='0.00']").first();
  await step("mint test USDC", async () => {
    await button(/250,000 test USDC/i).click();
    await has("$250,000.00");
  });
  await step("approve", async () => {
    await amount.fill("20000");
    await button(/^approve$/i).click();
    await button(/^deposit$/i).waitFor({ timeout: 30_000 });
  });
  await step("deposit margin", async () => {
    await amount.fill("20000");
    await button(/^deposit$/i).click();
    await has("$20,000.00");
    await amountCleared();
  });
  await step("go long 10 lots", async () => {
    await button(/^10$/).click();
    await button(/go long/i).click();
    await has("Filled. Your position is live.");
    await page.waitForFunction(() => !document.body.innerText.includes("No open position in the front contract"), null, {
      timeout: 30_000,
    });
  });
});

await session(BORROWER, "Credit", async (t) => {
  const { page, step, has, button } = t;
  await connect(t, "/trade", BORROWER);
  await step("mint test USDC", async () => {
    await button(/250,000 test USDC/i).click();
    await has("$250,000.00");
  });
  await page.goto(`${BASE_URL}/credit`, { waitUntil: "load" });
  await t.reveal();
  await step("fill the origination form", async () => {
    await page.locator("input[placeholder='100000']").fill("50000");
    await page.locator("input[placeholder='100']").fill("80");
    await page.locator("input[placeholder='0.00']").first().fill("30000");
  });
  await step("approve USDC", async () => {
    const approve = button(/approve usdc/i);
    if (await approve.count()) await approve.click();
    await button(/draw, hedged/i).waitFor({ timeout: 30_000 });
  });
  await step("draw, hedged", async () => {
    await button(/draw, hedged/i).click();
    await has("Drawn, and hedged in the same block.");
  });
});

await session(UNDERWRITER, "Underwrite", async (t) => {
  const { page, step, has, button, amountCleared } = t;
  await connect(t, "/trade", UNDERWRITER);
  await step("mint test USDC", async () => {
    await button(/250,000 test USDC/i).click();
    await has("$250,000.00");
  });
  await page.goto(`${BASE_URL}/underwrite`, { waitUntil: "load" });
  await t.reveal();
  const amount = page.locator("input[placeholder='0.00']").first();
  await step("approve", async () => {
    await amount.fill("10000");
    const approve = button(/^approve$/i);
    if (await approve.count()) await approve.click();
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].find((b) => /^deposit$/i.test(b.innerText.trim()))?.disabled === false,
      null,
      { timeout: 30_000 },
    );
  });
  await step("deposit", async () => {
    await amount.fill("10000");
    await button(/^deposit$/i).click();
    await amountCleared();
    await page.waitForFunction(() => /Your shares\s*[\d,]+\.\d{2}/.test(document.body.innerText), null, { timeout: 30_000 });
  });
  await step("redeem all", async () => {
    await button(/redeem all/i).click();
    await page.waitForFunction(() => /Your shares\s*0\.00/.test(document.body.innerText), null, { timeout: 30_000 });
  });
});

await browser.close();
console.log(failed ? "\nend-to-end: FAILED" : "\nend-to-end: all flows passed");
process.exit(failed ? 1 : 0);
