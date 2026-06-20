import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  usersTable,
  productsTable,
  purchasesTable,
  basketsTable,
  discountCodesTable,
  productTypesTable,
  citiesTable,
  districtsTable,
  paymentReceiptsTable,
  topupInvoicesTable,
  invoiceIntentsTable,
  adminsTable,
} from "@workspace/db";
import { eq, and, sql, desc, inArray, lt } from "drizzle-orm";
import { formatEur, generateQueueId, addMinutes, formatDate } from "../utils";
import { getUser, getUserBasket, releaseBasket, updateUserTier } from "../db";
import { inlineKeyboard, BACK_BTN } from "../keyboards";

const DEFAULT_SOL_WALLET = "HtbWwMXAMJ6jT5meYGJ1hcV1JRarGKoJa8hTz36zCL59";

// Multiple public RPC endpoints tried in order — if one is rate-limited or
// unreachable the next is used automatically. Free cloud IPs often get 429s
// from mainnet-beta, so having fallbacks is critical on Railway.
const SOL_RPCS = [
  process.env["SOL_RPC"] ?? "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.publicnode.com",
];

// Send a JSON-RPC call to the Solana network, trying each endpoint in order.
// Throws only when all endpoints fail or time out.
async function solRpcFetch(body: object, timeoutMs = 12000): Promise<any> {
  let lastErr: unknown;
  for (const rpc of SOL_RPCS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      // 429 = rate limited — try next endpoint
      if (res.status === 429) continue;
      const data = (await res.json()) as any;
      // Solana RPC rate-limit error code
      if (data?.error?.code === -32005 || data?.error?.code === 429) continue;
      return data;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error("All Solana RPC endpoints failed");
}

let solWalletCache: string | null = null;
let solWalletCacheTs = 0;

export async function getSolWallet(): Promise<string> {
  const now = Date.now();
  if (solWalletCache && now - solWalletCacheTs < 30_000) {
    return solWalletCache;
  }
  // Priority: DB setting (admin tools) → SOL_WALLET env var → hardcoded default.
  // DB wins so the admin can change the wallet from the bot without redeploying.
  const { getSetting } = await import("../db");
  const saved = await getSetting("sol_wallet");
  const envWallet = process.env["SOL_WALLET"];
  const wallet = saved || envWallet || DEFAULT_SOL_WALLET;
  solWalletCache = wallet;
  solWalletCacheTs = now;
  return wallet;
}

export function clearSolWalletCache() {
  solWalletCache = null;
  solWalletCacheTs = 0;
}

// Re-export for legacy compatibility during transition; prefer getSolWallet().
export const SOL_WALLET = DEFAULT_SOL_WALLET;

type InlineKb = { text: string; callback_data: string }[][];
type LiveInvoice = {
  chatId: number;
  messageId: number;
  expiresAt: number;
  baseText: string;
  keyboard: InlineKb;
  kind: "purchase" | "topup";
  topupInvoiceId?: number;
  lastText?: string;
  // On-chain auto-confirm bookkeeping.
  lastChecked?: number;
  solAmount?: number;
  expectedEur?: number;
  createdAt?: number;
  purchase?: PurchaseDescriptor;
};
const pendingInvoices = new Map<number, LiveInvoice>();

// Builds the live countdown line appended to the invoice each tick.
// Uses whole-minute granularity so the ticker only edits the message once per
// minute instead of every few seconds — dramatically reduces "edited" flicker.
export function countdownLine(expiresAt: number): string {
  const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const mins = Math.ceil(remaining / 60);
  if (mins <= 0) return `⏳ Time remaining: <b>less than a minute</b>`;
  return `⏳ Time remaining: <b>${mins} min</b>`;
}

export function registerPendingInvoice(userId: number, invoice: LiveInvoice) {
  // The amount was reserved synchronously at allocation time; now that the
  // invoice is live in pendingInvoices (which clash-checks guard against), we
  // can release the short-lived reservation.
  if (typeof invoice.solAmount === "number") {
    reservedAmounts.delete(invoice.solAmount);
  }
  pendingInvoices.set(userId, invoice);
}

export function cancelPendingInvoice(userId: number) {
  pendingInvoices.delete(userId);
}

// ── Durable purchase-invoice intents + payment reconciliation ───────────────
// Purchase invoices used to live only in `pendingInvoices` (memory). A restart
// (republish / VM restart / bot failover) or a payment arriving after the 15-min
// window meant the buyer's on-chain payment had nothing to match — money in,
// no product. We now persist every purchase invoice to bot_invoice_intents, and
// a background sweep reconciles any wallet payment that wasn't consumed by the
// live flow, crediting the buyer's balance (idempotent via the signature claim).

const INTENT_LOOKBACK_MS = 48 * 60 * 60 * 1000; // how far back a payment can match an intent

// Record a purchase invoice so a late/orphaned payment can be matched later.
// Supersedes any still-open intent for the same user (mirrors the topup flow).
export async function recordPurchaseIntent(
  userId: number,
  solAmount: number,
  eurAmount: number,
  expiresAt: number,
): Promise<void> {
  await db
    .update(invoiceIntentsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(invoiceIntentsTable.userId, userId),
        eq(invoiceIntentsTable.status, "open"),
      ),
    )
    .catch(() => {});
  await db
    .insert(invoiceIntentsTable)
    .values({
      userId,
      solAmount: solAmount.toFixed(9),
      eurAmount: eurAmount.toFixed(2),
      status: "open",
      expiresAt: new Date(expiresAt),
    })
    .catch(() => {});
}

// Mark a user's open purchase intent as fulfilled once their purchase completes
// (called from both the tap and auto-confirm finalize paths). No-op for balance
// purchases (which never create an intent).
export async function markPurchaseIntentFulfilled(
  userId: number,
  signature?: string,
): Promise<void> {
  await db
    .update(invoiceIntentsTable)
    .set({ status: "fulfilled", txSignature: signature ?? null })
    .where(
      and(
        eq(invoiceIntentsTable.userId, userId),
        eq(invoiceIntentsTable.status, "open"),
      ),
    )
    .catch(() => {});
}

// Mark a user's open purchase intent expired/canceled (invoice timed out or was
// canceled by an admin). Reconciliation still considers expired intents so a
// payment that lands just after expiry is recovered to balance.
export async function markPurchaseIntentExpired(userId: number): Promise<void> {
  await db
    .update(invoiceIntentsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(invoiceIntentsTable.userId, userId),
        eq(invoiceIntentsTable.status, "open"),
      ),
    )
    .catch(() => {});
}

export async function markPurchaseIntentCanceled(userId: number): Promise<void> {
  await db
    .update(invoiceIntentsTable)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invoiceIntentsTable.userId, userId),
        eq(invoiceIntentsTable.status, "open"),
      ),
    )
    .catch(() => {});
}

// True if some live in-memory invoice is currently watching this SOL amount, so
// the reconciliation sweep leaves it to the live flow (which delivers product
// rather than crediting balance) and never double-handles it.
function isAmountLive(amount: number): boolean {
  for (const inv of pendingInvoices.values()) {
    if (typeof inv.solAmount === "number" && Math.abs(inv.solAmount - amount) <= MATCH_TOL) {
      return true;
    }
  }
  return false;
}

type InboundPayment = {
  signature: string;
  receivedSol: number;
  senderWallet: string | null;
  blockTimeMs: number;
};

// Fetch recent INBOUND payments to the shop wallet (post-balance increased).
// Used by the reconciliation sweep and the admin "Unmatched Payments" tool.
export async function fetchInboundPayments(
  limit = 40,
): Promise<InboundPayment[]> {
  const wallet = await getSolWallet();
  const sigData = await solRpcFetch({
    jsonrpc: "2.0",
    id: 1,
    method: "getSignaturesForAddress",
    params: [wallet, { limit }],
  });
  const signatures: any[] = sigData?.result ?? [];

  const out: InboundPayment[] = [];
  for (const sig of signatures) {
    if (sig.err) continue;
    const txData = await solRpcFetch({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        sig.signature,
        { encoding: "json", maxSupportedTransactionVersion: 0 },
      ],
    });
    const tx = txData?.result;
    if (!tx) continue;
    const accountKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
    const walletIndex = accountKeys.indexOf(wallet);
    if (walletIndex === -1) continue;
    const pre = tx.meta?.preBalances?.[walletIndex] ?? 0;
    const post = tx.meta?.postBalances?.[walletIndex] ?? 0;
    const receivedSol = (post - pre) / LAMPORTS_PER_SOL;
    if (receivedSol <= 0) continue;

    const pres: number[] = tx.meta?.preBalances ?? [];
    const posts: number[] = tx.meta?.postBalances ?? [];
    let senderWallet: string | null = accountKeys[0] ?? null;
    let maxDecrease = 0;
    for (let i = 0; i < accountKeys.length; i++) {
      if (i === walletIndex) continue;
      const decrease = (pres[i] ?? 0) - (posts[i] ?? 0);
      if (decrease > maxDecrease) {
        maxDecrease = decrease;
        senderWallet = accountKeys[i] ?? senderWallet;
      }
    }
    out.push({
      signature: sig.signature,
      receivedSol,
      senderWallet,
      blockTimeMs: (sig.blockTime ?? 0) * 1000,
    });
  }
  return out;
}

// Returns the set of tx signatures already consumed (so we never re-handle a
// payment that the live flow or a prior sweep already credited/delivered).
async function getClaimedSignatures(sigs: string[]): Promise<Set<string>> {
  if (sigs.length === 0) return new Set();
  const rows = await db
    .select({ s: paymentReceiptsTable.txSignature })
    .from(paymentReceiptsTable)
    .where(inArray(paymentReceiptsTable.txSignature, sigs));
  return new Set(rows.map((r) => r.s));
}

// Credit a recovered/late payment to a user's balance, atomically claiming the
// signature so it can never be credited twice (same UNIQUE guard as topups).
// Returns the new balance, or null if the signature was already consumed.
export async function creditOrphanToBalance(
  telegram: any,
  userId: number,
  signature: string,
  receivedSol: number,
  kind: "purchase" | "topup",
  intentId?: number,
): Promise<number | null> {
  const solPrice = await getSolPrice();
  const creditedEur = solPrice > 0 ? receivedSol * solPrice : 0;
  if (creditedEur <= 0) return null;

  let newBalance: number | null = null;
  try {
    newBalance = await db.transaction(async (tx) => {
      const claimRows = await tx
        .insert(paymentReceiptsTable)
        .values({
          txSignature: signature,
          userId,
          kind,
          receivedSol: receivedSol.toFixed(9),
        })
        .onConflictDoNothing({ target: paymentReceiptsTable.txSignature })
        .returning({ id: paymentReceiptsTable.id });
      if (claimRows.length === 0) return null; // already consumed elsewhere
      const [u] = await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${creditedEur}` })
        .where(eq(usersTable.telegramId, userId))
        .returning({ balance: usersTable.balance });
      if (intentId !== undefined) {
        await tx
          .update(invoiceIntentsTable)
          .set({ status: "fulfilled", txSignature: signature })
          .where(eq(invoiceIntentsTable.id, intentId));
      }
      return Number(u?.balance ?? 0);
    });
  } catch {
    return null;
  }
  if (newBalance === null) return null;

  const { refreshAdminLiveStatsNow } = await import("./admin");
  refreshAdminLiveStatsNow();

  await telegram
    .sendMessage(
      userId,
      `✅ <b>Payment received</b>\n\n` +
        `We received your payment of <b>${receivedSol.toFixed(6)} SOL</b> (${formatEur(creditedEur)}).\n` +
        `It arrived after your order window closed, so we added <b>${formatEur(creditedEur)}</b> to your balance.\n` +
        `💰 New balance: <b>${formatEur(newBalance)}</b>\n\n` +
        `You can use your balance to buy instantly.\n` +
        `<i>Gavome jūsų mokėjimą — suma įskaityta į balansą.</i>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 Home", callback_data: "shop:home" }]],
        },
      },
    )
    .catch(() => {});
  return newBalance;
}

// A buyer paid for a live purchase invoice but sent LESS than the asked amount.
// We never silently keep their money: claim the signature (idempotent), credit
// what they actually sent to their balance, release the held stock, and tell
// them to send the exact amount next time. They can finish with their balance.
// Returns true when the payment was handled (credited, or already consumed
// elsewhere) and the invoice can be closed; false when it should be retried
// later (e.g. the SOL price feed is temporarily unavailable) — never claim the
// signature without crediting, or the buyer's money would vanish.
async function handleUnderpaymentToBalance(
  telegram: any,
  userId: number,
  chatId: number,
  signature: string,
  receivedSol: number,
  expectedSol: number,
  messageId?: number,
): Promise<boolean> {
  const solPrice = await getSolPrice();
  // Price feed down: don't consume the signature now. The caller leaves the
  // invoice live so the next tick retries once a price is available.
  if (solPrice <= 0) return false;
  const creditedEur = receivedSol * solPrice;

  let newBalance: number | null = null;
  try {
    newBalance = await db.transaction(async (tx) => {
      const claimRows = await tx
        .insert(paymentReceiptsTable)
        .values({
          txSignature: signature,
          userId,
          kind: "purchase",
          receivedSol: receivedSol.toFixed(9),
        })
        .onConflictDoNothing({ target: paymentReceiptsTable.txSignature })
        .returning({ id: paymentReceiptsTable.id });
      if (claimRows.length === 0) return null; // already consumed elsewhere
      const [u] = await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${creditedEur}` })
        .where(eq(usersTable.telegramId, userId))
        .returning({ balance: usersTable.balance });
      return Number(u?.balance ?? 0);
    });
  } catch {
    return false;
  }
  if (newBalance === null) return true; // already consumed elsewhere — done

  await releaseBasket(userId).catch(() => {});
  await markPurchaseIntentFulfilled(userId, signature).catch(() => {});
  cancelPendingInvoice(userId);
  const { refreshAdminLiveStatsNow } = await import("./admin");
  refreshAdminLiveStatsNow();

  const text =
    `⚠️ <b>Not enough sent</b>\n\n` +
    `You sent <b>${receivedSol.toFixed(6)} SOL</b> (${formatEur(creditedEur)}), but this order needed <b>${expectedSol.toFixed(6)} SOL</b>.\n\n` +
    `We did NOT lose your money — we added <b>${formatEur(creditedEur)}</b> to your balance.\n` +
    `💰 Balance: <b>${formatEur(newBalance)}</b>\n\n` +
    `⚠️ <b>NEXT TIME SEND THE EXACT AMOUNT SHOWN.</b>\n` +
    `<i>KITĄ KARTĄ SIŲSKITE TIKSLIĄ NURODYTĄ SUMĄ.</i>\n\n` +
    `You can finish your order now using your balance.`;
  const reply_markup = {
    inline_keyboard: [[{ text: "🏠 Home", callback_data: "shop:home" }]],
  };
  if (messageId) {
    try {
      await telegram.editMessageText(chatId, messageId, undefined, text, {
        parse_mode: "HTML",
        reply_markup,
      });
      return true;
    } catch {
      // fall through to a fresh message if the original can't be edited
    }
  }
  await telegram
    .sendMessage(chatId, text, { parse_mode: "HTML", reply_markup })
    .catch(() => {});
  return true;
}

let reconcileRunning = false;
// Background sweep: find wallet payments that the live flow never consumed and
// match each back to its buyer's persisted invoice (purchase intent or topup),
// crediting the balance. This is what makes payments survive restarts and late
// arrivals. Conservative: only auto-credits when EXACTLY ONE recent unfulfilled
// invoice matches the amount; ambiguous cases are left for the admin tool.
export async function reconcilePayments(telegram: any): Promise<void> {
  if (reconcileRunning) return;
  reconcileRunning = true;
  try {
    const payments = await fetchInboundPayments(40);
    if (payments.length === 0) return;
    const claimed = await getClaimedSignatures(payments.map((p) => p.signature));
    const now = Date.now();

    for (const p of payments) {
      if (claimed.has(p.signature)) continue;
      if (isAmountLive(p.receivedSol)) continue; // live flow will deliver it
      if (p.blockTimeMs && now - p.blockTimeMs > INTENT_LOOKBACK_MS) continue;

      const matches = await findInvoiceMatches(p.receivedSol, p.blockTimeMs || now);
      if (matches.length !== 1) continue; // none or ambiguous -> admin tool
      const m = matches[0]!;
      await creditOrphanToBalance(
        telegram,
        m.userId,
        p.signature,
        p.receivedSol,
        m.kind,
        m.kind === "purchase" ? m.id : undefined,
      ).catch(() => {});
      if (m.kind === "topup") {
        await db
          .update(topupInvoicesTable)
          .set({ status: "completed", txSignature: p.signature })
          .where(
            and(
              eq(topupInvoicesTable.id, m.id),
              inArray(topupInvoicesTable.status, ["pending", "expired"]),
            ),
          )
          .catch(() => {});
      }
    }
  } catch {
    // network/db hiccup — retry next cycle
  } finally {
    reconcileRunning = false;
  }
}

type InvoiceMatch = { kind: "purchase" | "topup"; id: number; userId: number };

// All unfulfilled invoices (purchase intents + topups) whose SOL amount matches
// `amount` within tolerance, were created before the payment, and are within the
// lookback window. Used to attribute an orphaned payment to a buyer.
//
// We use ACCEPT_TOL (not the tight MATCH_TOL) in BOTH directions so that:
//   - Underpayments (buyer sent less than invoice): intent.solAmount is HIGHER
//     than received, up to ACCEPT_TOL above → lo stays tight, hi widens.
//   - Overpayments (buyer sent more than invoice): intent.solAmount is LOWER
//     than received, up to ACCEPT_TOL below → lo widens, hi stays tight.
// Without this, a buyer who sent a rounded/wrong amount would have their payment
// stuck in the wallet forever with no credit to their balance.
async function findInvoiceMatches(
  amount: number,
  paymentTimeMs: number,
): Promise<InvoiceMatch[]> {
  const lo = (amount - ACCEPT_TOL).toFixed(9); // covers overpayments
  const hi = (amount + ACCEPT_TOL).toFixed(9); // covers underpayments
  const since = new Date(paymentTimeMs - INTENT_LOOKBACK_MS);
  const before = new Date(paymentTimeMs + 60000); // small clock slack

  const intents = await db
    .select({
      id: invoiceIntentsTable.id,
      userId: invoiceIntentsTable.userId,
    })
    .from(invoiceIntentsTable)
    .where(
      and(
        inArray(invoiceIntentsTable.status, ["open", "expired"]),
        sql`${invoiceIntentsTable.solAmount} BETWEEN ${lo}::numeric AND ${hi}::numeric`,
        sql`${invoiceIntentsTable.createdAt} <= ${before}`,
        sql`${invoiceIntentsTable.createdAt} >= ${since}`,
      ),
    );

  const topups = await db
    .select({
      id: topupInvoicesTable.id,
      userId: topupInvoicesTable.userId,
    })
    .from(topupInvoicesTable)
    .where(
      and(
        inArray(topupInvoicesTable.status, ["pending", "expired"]),
        sql`${topupInvoicesTable.solAmount} BETWEEN ${lo}::numeric AND ${hi}::numeric`,
        sql`${topupInvoicesTable.createdAt} <= ${before}`,
        sql`${topupInvoicesTable.createdAt} >= ${since}`,
      ),
    );

  return [
    ...intents.map((i) => ({ kind: "purchase" as const, id: i.id, userId: i.userId })),
    ...topups.map((t) => ({ kind: "topup" as const, id: t.id, userId: t.userId })),
  ];
}

// For the admin "Unmatched Payments" tool: inbound wallet payments with no
// receipt yet, annotated with a best-guess buyer (from a matching invoice) when
// one exists. Lets the owner recover historical orphans (no persisted intent).
export async function listUnmatchedPayments(): Promise<
  Array<{
    signature: string;
    receivedSol: number;
    senderWallet: string | null;
    blockTimeMs: number;
    suggestedUserId: number | null;
  }>
> {
  const payments = await fetchInboundPayments(40);
  if (payments.length === 0) return [];
  const claimed = await getClaimedSignatures(payments.map((p) => p.signature));
  const out = [];
  for (const p of payments) {
    if (claimed.has(p.signature)) continue;
    // Never surface a payment that the live purchase flow is still watching — an
    // admin crediting it would claim the signature first and stop the live flow
    // from delivering the product (recreating "paid but no product").
    if (isAmountLive(p.receivedSol)) continue;
    const matches = await findInvoiceMatches(p.receivedSol, p.blockTimeMs || Date.now());
    out.push({
      signature: p.signature,
      receivedSol: p.receivedSol,
      senderWallet: p.senderWallet,
      blockTimeMs: p.blockTimeMs,
      suggestedUserId: matches.length === 1 ? matches[0]!.userId : null,
    });
  }
  return out;
}

// Uniqueness step for invoice SOL amounts (1e-5 SOL ≈ a fraction of a cent).
const UNIQUE_STEP = 1e-5;
// On-chain match tolerance. Kept strictly below UNIQUE_STEP/2 so each invoice's
// acceptance window is disjoint from every other active invoice's — a payment
// can satisfy at most ONE pending invoice.
export const MATCH_TOL = 2e-6;

// Wider acceptance band (in SOL) for purchases, to forgive customers who don't
// send the exact amount (they round, or just overpay). It is ONLY ever applied
// when the payment can belong to exactly ONE in-flight invoice — so it can never
// let one buyer's payment satisfy a different buyer's order. ~0.02 SOL (a few €).
const ACCEPT_TOL = 0.02;

// Decide whether an incoming `receivedSol` should be accepted for an invoice
// expecting `expectedSol`, using the live in-memory invoices to stay unambiguous.
// Used for both purchases and top-ups when allowFuzzy is true. Over/under-payment
// is sorted out by the caller after acceptance.
function acceptsPayment(receivedSol: number, expectedSol: number): boolean {
  // Exact tier: each live invoice has a guaranteed-unique amount, so a tight
  // match is always unambiguous and safe.
  if (Math.abs(receivedSol - expectedSol) <= MATCH_TOL) return true;
  // Fuzzy tier: forgive a rounded/over/under payment, but stay strictly
  // amount-bound. The payment must (a) be within ACCEPT_TOL of THIS invoice and
  // (b) be within ACCEPT_TOL of EXACTLY ONE live invoice. This keeps attribution
  // unambiguous and prevents an unrelated inbound deposit (far from any invoice)
  // from being consumed, even when only one invoice is open.
  if (Math.abs(receivedSol - expectedSol) > ACCEPT_TOL) return false;
  let near = 0;
  for (const inv of pendingInvoices.values()) {
    if (
      typeof inv.solAmount === "number" &&
      Math.abs(inv.solAmount - receivedSol) <= ACCEPT_TOL
    ) {
      near++;
    }
  }
  return near === 1;
}

// Amounts handed out by makeUniqueSolAmount but not yet registered as a live
// invoice. Reserving synchronously here closes the race where two near-
// simultaneous invoice-creation flows read the same pending-invoice snapshot
// (before either has registered) and pick the same amount. Entries are released
// on registerPendingInvoice and pruned by TTL in case creation is abandoned.
const reservedAmounts = new Map<number, number>(); // amount -> reservedAt(ms)
const RESERVATION_TTL_MS = 120000;

// Returns a SOL amount guaranteed distinct (by more than 2*MATCH_TOL) from every
// currently-active invoice AND every amount reserved-but-not-yet-registered, by
// adding a small tail in UNIQUE_STEP increments. Two buyers ordering the same
// EUR total therefore get different SOL totals, so one buyer's payment can never
// match the other's invoice. This function performs NO awaits, so its
// snapshot-and-reserve is atomic with respect to other invoice creations.
export function makeUniqueSolAmount(baseSol: number): number {
  const now = Date.now();
  for (const [amt, ts] of reservedAmounts) {
    if (now - ts > RESERVATION_TTL_MS) reservedAmounts.delete(amt);
  }
  const active = [
    ...Array.from(pendingInvoices.values())
      .map((i) => i.solAmount)
      .filter((v): v is number => typeof v === "number"),
    ...reservedAmounts.keys(),
  ];
  const clashes = (candidate: number) =>
    active.some((a) => Math.abs(a - candidate) <= 2 * MATCH_TOL);
  const reserve = (candidate: number) => {
    reservedAmounts.set(candidate, now);
    return candidate;
  };
  // Randomized start so concurrent same-price invoices spread out, then walk
  // the step space until a non-clashing slot is found. The search is unbounded
  // (deterministic) so it always returns a truly unique amount.
  const start = Math.floor(Math.random() * 200) + 1;
  for (let k = 0; k < 200; k++) {
    const step = ((start + k - 1) % 200) + 1; // 1..200
    const candidate = parseFloat((baseSol + step * UNIQUE_STEP).toFixed(6));
    if (!clashes(candidate)) return reserve(candidate);
  }
  for (let step = 201; step < 1_000_000; step++) {
    const candidate = parseFloat((baseSol + step * UNIQUE_STEP).toFixed(6));
    if (!clashes(candidate)) return reserve(candidate);
  }
  // Practically unreachable; reserve whatever we computed last.
  return reserve(parseFloat((baseSol + UNIQUE_STEP).toFixed(6)));
}

// Snapshot of the live in-memory pending invoices, for the admin "Cancel
// Pending Order" tool. These exist only while a buyer has an open invoice.
export function listPendingInvoices(): Array<{
  userId: number;
  kind: "purchase" | "topup";
  expiresAt: number;
  solAmount?: number;
  expectedEur?: number;
}> {
  return Array.from(pendingInvoices.entries()).map(([userId, inv]) => ({
    userId,
    kind: inv.kind,
    expiresAt: inv.expiresAt,
    solAmount: inv.solAmount,
    expectedEur: inv.expectedEur,
  }));
}

// Admin-initiated cancel of a buyer's open invoice: stops the bot watching the
// wallet for that order (so it can't auto-deliver after a direct/manual deal),
// releases any reserved stock, and tells the buyer the order was cancelled.
export async function adminCancelInvoice(
  telegram: any,
  userId: number,
): Promise<boolean> {
  const inv = pendingInvoices.get(userId);
  if (!inv) return false;
  pendingInvoices.delete(userId);
  if (inv.kind === "purchase") {
    await releaseBasket(userId).catch(() => {});
    await markPurchaseIntentCanceled(userId).catch(() => {});
  } else if (inv.kind === "topup" && inv.topupInvoiceId) {
    await db
      .update(topupInvoicesTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(topupInvoicesTable.id, inv.topupInvoiceId),
          eq(topupInvoicesTable.status, "pending"),
        ),
      )
      .catch(() => {});
  }
  await telegram
    .editMessageText(
      inv.chatId,
      inv.messageId,
      undefined,
      "🛑 <b>Order Cancelled</b>\n\nThis order was cancelled by the shop. " +
        "If you already paid or arranged payment directly, please contact the shop.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 Home", callback_data: "shop:home" }]],
        },
      },
    )
    .catch(() => {});
  return true;
}

// Single ticker that keeps every active invoice's countdown live by editing the
// invoice message in place, and finalizes the message when it expires. Runs
// often enough to feel live but well within Telegram's edit rate limits.
// Process-scoped singleton: bot failover recreates the Telegraf instance in the
// same process, so guard against spawning duplicate intervals. The shared
// `telegram` reference is updated on each call so edits use the live instance.
let invoiceTickerStarted = false;
let invoiceTelegram: any = null;
let tickerRunning = false;
// How often to poll the chain per invoice. The countdown still updates every
// tick; on-chain checks are throttled to stay well within RPC rate limits.
const AUTO_CONFIRM_INTERVAL_MS = 15000;
export function startInvoiceBackgroundChecker(telegram: any) {
  invoiceTelegram = telegram;
  if (invoiceTickerStarted) return;
  invoiceTickerStarted = true;
  setInterval(async () => {
    const telegram = invoiceTelegram;
    if (!telegram) return;
    // Skip this tick if the previous one is still working (on-chain checks can
    // take several seconds each), so polls never pile up or overlap.
    if (tickerRunning) return;
    tickerRunning = true;
    try {
      await runInvoiceTick(telegram);
    } finally {
      tickerRunning = false;
    }
  }, 5000);

  // Reconciliation safety net: catch payments the live flow missed (process was
  // restarted, or payment landed after the 15-min window). Run shortly after
  // startup so a restart immediately recovers anything that came in while down,
  // then every 60s. Guarded internally so runs never overlap.
  // Deployment-only: the workspace shares the same mainnet shop wallet but a
  // SEPARATE dev DB, so auto-crediting from dev could attribute a real payment
  // to a dev test intent. Only the live deployment auto-reconciles; in the
  // workspace, use Tools → Payment Recovery → Unmatched Payments to inspect.
  const isDeployment =
    process.env.REPLIT_DEPLOYMENT === "1" ||
    process.env.NODE_ENV === "production";
  if (isDeployment) {
    setTimeout(() => {
      reconcilePayments(invoiceTelegram).catch(() => {});
    }, 8000);
    setInterval(() => {
      if (!invoiceTelegram) return;
      reconcilePayments(invoiceTelegram).catch(() => {});
    }, 60000);
  }
}

async function runInvoiceTick(telegram: any) {
  {
    const now = Date.now();
    for (const [userId, inv] of Array.from(pendingInvoices.entries())) {
      if (now >= inv.expiresAt) {
        pendingInvoices.delete(userId);
        if (inv.kind === "purchase") {
          await releaseBasket(userId).catch(() => {});
          await markPurchaseIntentExpired(userId).catch(() => {});
        } else if (inv.kind === "topup" && inv.topupInvoiceId) {
          await db
            .update(topupInvoicesTable)
            .set({ status: "expired" })
            .where(
              and(
                eq(topupInvoicesTable.id, inv.topupInvoiceId),
                eq(topupInvoicesTable.status, "pending"),
              ),
            )
            .catch(() => {});
        }
        const timeoutText =
          inv.kind === "purchase"
            ? "⏰ <b>Payment Timeout</b>\n\nYour payment invoice has expired. Your basket has been cleared."
            : "⏰ <b>Top-Up Expired</b>\n\nYour invoice has expired. Start a new top-up when ready.";
        await telegram
          .editMessageText(inv.chatId, inv.messageId, undefined, timeoutText, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🏠 Home", callback_data: "shop:home" }],
              ],
            },
          })
          .catch(() => {});
        continue;
      }

      // Auto-confirm: poll the chain (throttled) and finalize without any user
      // action. If finalized, the invoice is gone — skip the countdown render.
      if (
        !inv.lastChecked ||
        now - inv.lastChecked >= AUTO_CONFIRM_INTERVAL_MS
      ) {
        inv.lastChecked = now;
        try {
          let finalized = false;
          if (inv.kind === "purchase") {
            finalized = await autoConfirmPurchaseInvoice(telegram, userId, inv);
          } else if (inv.kind === "topup") {
            const { autoConfirmTopupInvoice } = await import("./topup");
            finalized = await autoConfirmTopupInvoice(telegram, userId, inv);
          }
          if (finalized) continue;
        } catch {
          // Network/RPC error — leave the invoice pending and retry next cycle.
        }
      }

      const text = inv.baseText + "\n\n" + countdownLine(inv.expiresAt);
      if (text === inv.lastText) continue;
      inv.lastText = text;
      await telegram
        .editMessageText(inv.chatId, inv.messageId, undefined, text, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inv.keyboard },
        })
        .catch(() => {});
    }
  }
}
const LAMPORTS_PER_SOL = 1_000_000_000;

let cachedSolPrice = 0;
let cachedSolPriceTs = 0;
const SOL_PRICE_TTL_MS = 60_000; // 1 minute cache

export async function getSolPrice(): Promise<number> {
  // Return cached price if still fresh
  if (cachedSolPrice > 0 && Date.now() - cachedSolPriceTs < SOL_PRICE_TTL_MS) {
    return cachedSolPrice;
  }

  // Try CoinGecko first
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur",
      { signal: controller.signal },
    );
    const data = (await res.json()) as any;
    const price = Number(data?.solana?.eur ?? 0);
    if (price > 0) {
      cachedSolPrice = price;
      cachedSolPriceTs = Date.now();
      return price;
    }
  } catch {
    // CoinGecko failed — try fallback
  } finally {
    clearTimeout(timer);
  }

  // Fallback: Binance SOL/USDT then convert to EUR via USDT/EUR
  const binanceController = new AbortController();
  const binanceTimer = setTimeout(() => binanceController.abort(), 8000);
  try {
    const [solUsdtRes, usdtEurRes] = await Promise.all([
      fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
        { signal: binanceController.signal },
      ),
      fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT",
        { signal: binanceController.signal },
      ),
    ]);
    const solUsdt = (await solUsdtRes.json()) as any;
    const usdtEur = (await usdtEurRes.json()) as any;
    const solPriceUsdt = Number(solUsdt?.price ?? 0);
    const eurPriceUsdt = Number(usdtEur?.price ?? 0); // EURUSDT = how many USDT per 1 EUR
    if (solPriceUsdt > 0 && eurPriceUsdt > 0) {
      const price = solPriceUsdt / eurPriceUsdt; // SOL_USDT / (USDT_per_EUR) = SOL in EUR
      cachedSolPrice = price;
      cachedSolPriceTs = Date.now();
      return price;
    }
  } catch {
    // Fallback also failed — return cached price if available, else 0
  } finally {
    clearTimeout(binanceTimer);
  }

  return cachedSolPrice > 0 ? cachedSolPrice : 0;
}

export async function showCryptoMenu(
  ctx: Context & { session: BotSession },
  eurAmount: number,
) {
  ctx.session.data = { ...(ctx.session.data ?? {}), pendingEur: eurAmount };
  const kb = inlineKeyboard([
    [{ text: "◎ Solana (SOL)", callback_data: "pay:crypto:sol" }],
    [{ text: "✖ Cancel", callback_data: "pay:cancel" }],
  ]);
  const text = `💳 <b>Total: ${formatEur(eurAmount)}</b>\n\nSelect payment method:`;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function showSolInvoice(ctx: Context & { session: BotSession }) {
  const data = ctx.session.data ?? {};
  const eurAmount = Number(data["discountedTotal"] ?? data["pendingEur"] ?? 0);

  const solPrice = await getSolPrice();
  if (solPrice <= 0) {
    await ctx.editMessageText(
      "⚠️ Could not fetch SOL price. Please try again.",
      { ...inlineKeyboard([[BACK_BTN("shop:basket")]]) },
    );
    return;
  }

  const solAmount = makeUniqueSolAmount(eurAmount / solPrice);
  const expiresAt = addMinutes(new Date(), 15);

  const telegramId = ctx.from!.id;
  const chatId = ctx.chat!.id;
  const items = await getUserBasket(telegramId);

  let itemsText = "";
  for (const it of items) {
    const [type] = await db
      .select()
      .from(productTypesTable)
      .where(eq(productTypesTable.id, it.typeId));
    const [city] = await db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.id, it.cityId));
    const [district] = await db
      .select()
      .from(districtsTable)
      .where(eq(districtsTable.id, it.districtId));
    itemsText += `  • ${type?.emoji ?? "💎"} ${type?.name ?? "?"} ${it.size} — ${city?.name ?? "?"}/${district?.name ?? "?"} (${formatEur(it.price)})\n`;
  }

  const baseText =
    `🧾 <b>Payment Invoice</b>\n\n` +
    (itemsText ? `<b>Items:</b>\n${itemsText}\n` : "") +
    `Total: <b>${formatEur(eurAmount)}</b>\n` +
    `────────────────────────\n` +
    `Send exactly: <code>${solAmount}</code> SOL\n\n` +
    `To address:\n<code>${(await getSolWallet())}</code>\n` +
    `────────────────────────\n` +
    `⚠️ <b>SEND THE EXACT AMOUNT</b> ⚠️\n` +
    `<b>‼️ SIŲSKITE TIKSLIĄ SUMĄ ‼️</b>\n` +
    `We can only match your payment if the amount is exactly <code>${solAmount}</code> SOL.`;

  const text = baseText + "\n\n" + countdownLine(expiresAt.getTime());

  ctx.session.data = {
    ...data,
    solAmount,
    invoiceExpiresAt: expiresAt.getTime(),
    invoiceCreatedAt: Date.now(),
    invoiceBaseText: baseText,
  };

  const keyboard = [
    [{ text: "🔄 Check Payment", callback_data: "pay:check_sol" }],
    [{ text: "✖ Cancel", callback_data: "pay:cancel" }],
  ];

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });

  const messageId = (ctx.callbackQuery?.message as { message_id?: number })
    ?.message_id;
  if (messageId) {
    const isPaynow = Boolean(data["paynow"]);
    registerPendingInvoice(telegramId, {
      chatId,
      messageId,
      expiresAt: expiresAt.getTime(),
      baseText,
      keyboard,
      kind: "purchase",
      solAmount,
      expectedEur: eurAmount,
      createdAt: Date.now(),
      purchase: {
        isPaynow,
        discountCode: data["appliedCode"] as string | undefined,
        discountedTotal: eurAmount,
        paynowSpec: isPaynow
          ? {
              cityId: data["cityId"] as number,
              districtId: data["districtId"] as number,
              typeId: data["typeId"] as number,
              size: data["size"] as string,
            }
          : undefined,
      },
    });
  }
  // Persist a durable record of this invoice so a payment that arrives after a
  // restart or after the live window closes can still be matched to this buyer.
  await recordPurchaseIntent(
    telegramId,
    solAmount,
    eurAmount,
    expiresAt.getTime(),
  ).catch(() => {});
}

// Scan the shop wallet's recent transactions for an incoming payment of at least
// `expectedSol` (with a 1% tolerance) that arrived after the invoice was created.
// Returns the matching signature + received amount, or null if none found yet.
// Throws on network/RPC failure so callers can distinguish "not paid" from
// "couldn't check". Shared by the manual "Check Payment" tap and the background
// auto-confirm ticker.
export async function scanForPayment(
  expectedSol: number,
  createdAt: number,
  opts?: { allowFuzzy?: boolean },
): Promise<{
  signature: string;
  receivedSol: number;
  senderWallet: string | null;
} | null> {
  const allowFuzzy = opts?.allowFuzzy ?? false;
  const wallet = await getSolWallet();
  const sigData = await solRpcFetch({
    jsonrpc: "2.0",
    id: 1,
    method: "getSignaturesForAddress",
    params: [wallet, { limit: 25 }],
  });
  const signatures: any[] = sigData?.result ?? [];

  for (const sig of signatures) {
    if (sig.err) continue;
    if (sig.blockTime && sig.blockTime * 1000 < createdAt - 60000) continue;

    const txData = await solRpcFetch({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        sig.signature,
        { encoding: "json", maxSupportedTransactionVersion: 0 },
      ],
    });
    const tx = txData?.result;
    if (!tx) continue;

    const accountKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
    const walletIndex = accountKeys.indexOf(wallet);
    if (walletIndex === -1) continue;

    const pre = tx.meta?.preBalances?.[walletIndex] ?? 0;
    const post = tx.meta?.postBalances?.[walletIndex] ?? 0;
    const receivedSol = (post - pre) / LAMPORTS_PER_SOL;

    // Each invoice has a guaranteed-unique amount (makeUniqueSolAmount), so a
    // tight match binds a payment to one specific order. When allowFuzzy is true
    // we ALSO accept non-exact amounts (rounded/over/under) via acceptsPayment,
    // but only when the payment belongs to exactly ONE in-flight invoice — this
    // prevents one buyer's payment from satisfying a different buyer's invoice.
    const accepted = allowFuzzy
      ? acceptsPayment(receivedSol, expectedSol)
      : Math.abs(receivedSol - expectedSol) <= MATCH_TOL;
    if (accepted) {
      // Identify who sent the funds: the account with the largest balance
      // decrease (the fee payer / signer who paid). Falls back to the first
      // account key, which is the transaction's fee payer.
      const pres: number[] = tx.meta?.preBalances ?? [];
      const posts: number[] = tx.meta?.postBalances ?? [];
      let senderWallet: string | null = accountKeys[0] ?? null;
      let maxDecrease = 0;
      for (let i = 0; i < accountKeys.length; i++) {
        if (i === walletIndex) continue;
        const decrease = (pres[i] ?? 0) - (posts[i] ?? 0);
        if (decrease > maxDecrease) {
          maxDecrease = decrease;
          senderWallet = accountKeys[i] ?? senderWallet;
        }
      }
      return { signature: sig.signature, receivedSol, senderWallet };
    }
  }
  return null;
}

export async function checkSolPayment(
  ctx: Context & { session: BotSession },
): Promise<void> {
  const data = ctx.session.data ?? {};
  const expectedSol = Number(data["solAmount"] ?? 0);
  const expiresAt = Number(data["invoiceExpiresAt"] ?? 0);
  const createdAt = Number(data["invoiceCreatedAt"] ?? 0);

  if (!expectedSol || !expiresAt) {
    await ctx.answerCbQuery("No active invoice.", { show_alert: true });
    return;
  }

  if (Date.now() > expiresAt) {
    cancelPendingInvoice(ctx.from!.id);
    ctx.session.data = undefined;
    await ctx.answerCbQuery("Invoice expired. Please start over.", {
      show_alert: true,
    });
    await ctx
      .editMessageText(
        "⏰ <b>Payment Timeout</b>\n\nYour invoice has expired. Your basket has been cleared.",
        {
          parse_mode: "HTML",
          ...inlineKeyboard([[{ text: "🏠 Home", callback_data: "shop:home" }]]),
        },
      )
      .catch(() => {});
    await releaseBasket(ctx.from!.id).catch(() => {});
    return;
  }

  // The global callback_query middleware already answered this callback, so the
  // loading spinner is dismissed; the live ticker keeps the countdown moving.
  try {
    const hit = await scanForPayment(expectedSol, createdAt, {
      allowFuzzy: true,
    });
    if (hit) {
      // Under/over is judged in SOL (what the buyer actually sent vs the asked
      // amount), NOT in EUR — so a SOL price move between invoice creation and
      // payment never makes an exact payment look like an underpayment.
      if (expectedSol - hit.receivedSol > MATCH_TOL) {
        // Customer sent LESS than the invoice amount. Don't deliver; keep their
        // money safe by crediting it to balance and tell them to send exactly.
        const chatId = ctx.chat?.id ?? ctx.from!.id;
        const messageId = (
          ctx.callbackQuery?.message as { message_id?: number } | undefined
        )?.message_id;
        const handled = await handleUnderpaymentToBalance(
          ctx.telegram,
          ctx.from!.id,
          chatId,
          hit.signature,
          hit.receivedSol,
          expectedSol,
          messageId,
        );
        if (handled) {
          ctx.session.data = undefined;
          ctx.session.step = undefined;
          return;
        }
        // Price feed unavailable — leave the invoice ticking and retry later.
        return;
      }
      // Paid enough (exact or over). Atomically claim this transaction. If
      // another handler already consumed it (purchase or top-up), skip it.
      const claimed = await claimSignature(
        hit.signature,
        ctx.from!.id,
        "purchase",
        hit.receivedSol,
      );
      if (claimed) {
        const solPrice = await getSolPrice();
        const overpaySol = Math.max(0, hit.receivedSol - expectedSol);
        const overpayEur = overpaySol * solPrice;
        await completePurchase(
          ctx,
          "sol",
          overpayEur,
          hit.signature,
          hit.senderWallet,
        );
        return;
      }
    }

    // No payment found yet. The background ticker keeps the countdown live,
    // so there is nothing to re-render here — just leave the invoice ticking.
  } catch {
    await ctx
      .reply("⚠️ Could not reach Solana network. Please try again.")
      .catch(() => {});
  }
}

// Background auto-confirm for a purchase invoice. Returns true when the invoice
// has been finalized (and removed from the registry), false when still pending.
// Mirrors checkSolPayment's logic but runs without a Telegraf Context.
async function autoConfirmPurchaseInvoice(
  telegram: any,
  userId: number,
  inv: LiveInvoice,
): Promise<boolean> {
  if (!inv.purchase || !inv.solAmount || !inv.createdAt) return false;
  const expectedSol = inv.solAmount;
  const hit = await scanForPayment(expectedSol, inv.createdAt, {
    allowFuzzy: true,
  });
  if (!hit) return false;
  // Underpayment (judged in SOL): don't deliver — credit what they sent to
  // balance and tell them to send the exact amount next time.
  if (expectedSol - hit.receivedSol > MATCH_TOL) {
    // Returns false only if the price feed is down — keep polling so the next
    // tick retries instead of consuming the payment without crediting.
    return await handleUnderpaymentToBalance(
      telegram,
      userId,
      inv.chatId,
      hit.signature,
      hit.receivedSol,
      expectedSol,
      inv.messageId,
    );
  }
  const claimed = await claimSignature(
    hit.signature,
    userId,
    "purchase",
    hit.receivedSol,
  );
  // If the signature was already claimed elsewhere, the other path is
  // finalizing this same payment — treat the invoice as done and stop polling.
  if (!claimed) return true;
  const solPrice = await getSolPrice();
  const overpaySol = Math.max(0, hit.receivedSol - expectedSol);
  const overpayEur = overpaySol * solPrice;
  await finalizePurchase(
    telegram,
    userId,
    inv.chatId,
    inv.purchase,
    "sol",
    overpayEur,
    hit.signature,
    inv.messageId,
    hit.senderWallet,
  );
  return true;
}

// Atomically claim an on-chain Solana transaction signature so it can be
// credited exactly once across every flow (purchase or top-up). Relies on the
// UNIQUE constraint on bot_payment_receipts.tx_signature: the INSERT either
// wins (returns true) or conflicts because another concurrent handler already
// claimed it (returns false). This closes the read-then-act race.
export async function claimSignature(
  signature: string,
  userId: number,
  kind: "purchase" | "topup",
  receivedSol: number,
): Promise<boolean> {
  const rows = await db
    .insert(paymentReceiptsTable)
    .values({
      txSignature: signature,
      userId,
      kind,
      receivedSol: receivedSol.toFixed(9),
    })
    .onConflictDoNothing({ target: paymentReceiptsTable.txSignature })
    .returning({ id: paymentReceiptsTable.id });
  return rows.length > 0;
}

// Describes everything needed to fulfil a purchase WITHOUT a Telegraf Context,
// so the same finalization logic can run from a user tap (completePurchase) or
// from the background auto-confirm ticker (finalizePurchase).
export type PurchaseDescriptor = {
  isPaynow: boolean;
  discountCode?: string;
  discountedTotal: number;
  paynowSpec?: { cityId: number; districtId: number; typeId: number; size: string };
};

// Fire-and-forget: notifies every admin who has notifyOnPurchase=true after a
// successful purchase, sending product info + the actual uploaded media.
async function notifyAdminsOfPurchase(
  telegram: any,
  buyer: { telegramId: number; username: string | null; firstName: string | null },
  productsById: Map<number, any>,
  purchased: { productId: number; size: string; pricePaid: number }[],
) {
  const admins = await db
    .select({ telegramId: adminsTable.telegramId })
    .from(adminsTable)
    .where(eq(adminsTable.notifyOnPurchase, true));
  if (admins.length === 0) return;

  const buyerLabel = buyer.username
    ? `@${buyer.username}`
    : buyer.firstName ?? `#${buyer.telegramId}`;

  for (const p of purchased) {
    const product = productsById.get(p.productId);
    if (!product) continue;

    const [details] = await db
      .select({
        typeName: productTypesTable.name,
        typeEmoji: productTypesTable.emoji,
        cityName: citiesTable.name,
        districtName: districtsTable.name,
      })
      .from(productsTable)
      .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
      .leftJoin(citiesTable, eq(productsTable.cityId, citiesTable.id))
      .leftJoin(districtsTable, eq(productsTable.districtId, districtsTable.id))
      .where(eq(productsTable.id, p.productId));

    const header =
      `🛒 <b>New Sale!</b>\n\n` +
      (details
        ? `${details.typeEmoji ?? ""} <b>${details.typeName} ${p.size}</b>\n` +
          `📍 ${details.cityName} · ${details.districtName}\n`
        : `📦 <b>${p.size}</b>\n`) +
      `💶 ${formatEur(p.pricePaid)}\n` +
      `👤 ${buyerLabel}`;

    for (const admin of admins) {
      try {
        await telegram.sendMessage(admin.telegramId, header, {
          parse_mode: "HTML",
        });
        await sendProductMediaTo(telegram, admin.telegramId, product);
      } catch {
        // admin blocked bot or invalid chat — skip silently
      }
    }
  }
}

// Context-free purchase finalization. Delivers all messages/media through the
// raw Telegram client so it works both for interactive taps and the background
// auto-confirm ticker. When editMessageId is provided, the result is rendered by
// editing that message (the live invoice); otherwise messages are sent fresh.
export async function finalizePurchase(
  telegram: any,
  telegramId: number,
  chatId: number,
  desc: PurchaseDescriptor,
  paymentMethod: string,
  overpayEur = 0,
  txSignature?: string,
  editMessageId?: number,
  senderWallet?: string | null,
): Promise<void> {
  cancelPendingInvoice(telegramId);
  const user = await getUser(telegramId);
  if (!user) return;

  const { isPaynow, discountCode, discountedTotal } = desc;

  const editOrSend = async (text: string, kb?: InlineKb) => {
    const extra: Record<string, unknown> = { parse_mode: "HTML" };
    if (kb) extra["reply_markup"] = { inline_keyboard: kb };
    if (editMessageId) {
      try {
        await telegram.editMessageText(chatId, editMessageId, undefined, text, extra);
        return;
      } catch {
        // fall through to a fresh message
      }
    }
    await telegram.sendMessage(chatId, text, extra).catch(() => {});
  };

  type Spec = {
    cityId: number;
    districtId: number;
    typeId: number;
    size: string;
    price: number;
  };

  let specs: Spec[];

  if (isPaynow) {
    const ps = desc.paynowSpec!;
    specs = [
      {
        cityId: ps.cityId,
        districtId: ps.districtId,
        typeId: ps.typeId,
        size: ps.size,
        price: discountedTotal,
      },
    ];
  } else {
    const basketItems = await getUserBasket(telegramId);
    if (basketItems.length === 0) {
      // The on-chain payment was already claimed upstream, so we must not
      // silently drop the funds — credit everything paid to the balance.
      const refundTotal = discountedTotal + overpayEur;
      if (refundTotal > 0) {
        await db
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${refundTotal}` })
          .where(eq(usersTable.telegramId, telegramId));
      }
      const { refreshAdminLiveStatsNow } = await import("./admin");
      refreshAdminLiveStatsNow();
      await editOrSend(
        refundTotal > 0
          ? "⚠️ Your basket was empty, so your payment was added to your balance."
          : "⚠️ Basket is empty. Please add items and try again.",
        [[{ text: "🏠 Home", callback_data: "shop:home" }]],
      );
      return;
    }
    const perItemPrice =
      discountedTotal > 0 ? discountedTotal / basketItems.length : 0;
    specs = basketItems.map((it) => ({
      cityId: it.cityId,
      districtId: it.districtId,
      typeId: it.typeId,
      size: it.size,
      price: perItemPrice > 0 ? perItemPrice : Number(it.price),
    }));
  }

  const purchased: { productId: number; size: string; queueId: string; pricePaid: number }[] = [];
  let unpurchasedRefund = 0;

  for (const spec of specs) {
    const queueId = generateQueueId();
    // Claim the item and record the purchase atomically: either the product is
    // marked sold AND the purchase row is written, or neither happens. Without
    // this, a failure between the two writes leaves a product stuck as "sold"
    // with no buyer — an item that silently "disappears" from stock.
    const row = await db
      .transaction(async (tx) => {
        const result = await tx.execute(sql`
          UPDATE bot_products
          SET status = 'sold', reserved_by = NULL, reserved_until = NULL
          WHERE id = (
            SELECT id FROM bot_products
            WHERE city_id = ${spec.cityId}
              AND district_id = ${spec.districtId}
              AND type_id = ${spec.typeId}
              AND size = ${spec.size}
              AND status = 'available'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, size
        `);
        const claimed = result.rows[0] as
          | { id: number; size: string }
          | undefined;
        if (!claimed) return undefined;
        await tx.insert(purchasesTable).values({
          queueId,
          userId: telegramId,
          productId: claimed.id,
          pricePaid: spec.price.toFixed(2),
          discountCodeUsed: discountCode,
          paymentMethod,
          txSignature,
          senderWallet: senderWallet ?? null,
        });
        return claimed;
      })
      .catch(() => undefined);
    if (!row) {
      unpurchasedRefund += spec.price;
      continue;
    }
    purchased.push({ productId: row.id, size: row.size, queueId, pricePaid: spec.price });
  }

  if (purchased.length === 0) {
    const refundTotal = discountedTotal + overpayEur;
    if (refundTotal > 0) {
      await db
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${refundTotal}` })
        .where(eq(usersTable.telegramId, telegramId));
    }
    const { refreshAdminLiveStatsNow } = await import("./admin");
    refreshAdminLiveStatsNow();
    if (!isPaynow) await releaseBasket(telegramId);
    await editOrSend(
      "⚠️ Sorry, all items went out of stock just now. Your balance has been refunded.",
      [[{ text: "🏠 Home", callback_data: "shop:home" }]],
    );
    return;
  }

  if (!isPaynow) await releaseBasket(telegramId);

  // This buyer's SOL invoice was satisfied and product delivered — close out the
  // persisted intent so the reconciliation sweep never re-credits this payment.
  if (txSignature) {
    await markPurchaseIntentFulfilled(telegramId, txSignature).catch(() => {});
  }

  if (discountCode) {
    await db
      .update(discountCodesTable)
      .set({ usesCount: sql`${discountCodesTable.usesCount} + 1` })
      .where(eq(discountCodesTable.code, discountCode))
      .catch(() => {});
  }

  const totalCredit = overpayEur + unpurchasedRefund;
  if (totalCredit > 0) {
    await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${totalCredit}` })
      .where(eq(usersTable.telegramId, telegramId));
    const { refreshAdminLiveStatsNow } = await import("./admin");
    refreshAdminLiveStatsNow();
  }

  const totalPaid = purchased.reduce((s, p) => s + p.pricePaid, 0);
  await db
    .update(usersTable)
    .set({
      purchaseCount: user.purchaseCount + purchased.length,
      eurSpent: (Number(user.eurSpent) + totalPaid).toFixed(2),
    })
    .where(eq(usersTable.telegramId, telegramId));

  await updateUserTier(telegramId);

  let msg =
    `✅ <b>Purchase Successful!</b>\n\n` +
    `Total paid: <b>${formatEur(totalPaid)}</b>\n`;
  if (overpayEur > 0)
    msg += `💰 Overpay credited: <b>${formatEur(overpayEur)}</b>\n`;
  if (unpurchasedRefund > 0)
    msg += `↩ Out-of-stock refund: <b>${formatEur(unpurchasedRefund)}</b>\n`;
  msg += `\n<b>Your items:</b>\n`;

  const productsToDeliver: any[] = [];
  for (const { productId, size, queueId } of purchased) {
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .then((r) => r[0]);
    if (!product) continue;
    msg += `\n📦 <b>${size}</b> — <code>${queueId}</code>\n`;
    if (product.fileType === "text" && product.content) {
      msg += `<code>${product.content}</code>\n`;
    }
    productsToDeliver.push(product);
  }

  await editOrSend(msg);

  for (const product of productsToDeliver) {
    await sendProductMediaTo(telegram, chatId, product);
  }

  // Notify opted-in admins (fire-and-forget — must not block or throw).
  const productsById = new Map<number, any>(
    productsToDeliver.map((p: any) => [p.id, p]),
  );
  notifyAdminsOfPurchase(telegram, user, productsById, purchased).catch(() => {});

  await telegram
    .sendMessage(chatId, "Thank you for your purchase! 🙏", {
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 Home", callback_data: "shop:home" }]],
      },
    })
    .catch(() => {});
}

// Thin Context wrapper around finalizePurchase: reads the purchase descriptor
// from the session, clears it, and delegates to the context-free core.
export async function completePurchase(
  ctx: Context & { session: BotSession },
  paymentMethod: string,
  overpayEur = 0,
  txSignature?: string,
  senderWallet?: string | null,
): Promise<void> {
  const telegramId = ctx.from!.id;
  const data = ctx.session.data ?? {};
  const isPaynow = Boolean(data["paynow"]);
  const desc: PurchaseDescriptor = {
    isPaynow,
    discountCode: data["appliedCode"] as string | undefined,
    discountedTotal: Number(data["discountedTotal"] ?? 0),
    paynowSpec: isPaynow
      ? {
          cityId: data["cityId"] as number,
          districtId: data["districtId"] as number,
          typeId: data["typeId"] as number,
          size: data["size"] as string,
        }
      : undefined,
  };
  const editMessageId = (ctx.callbackQuery?.message as { message_id?: number })
    ?.message_id;
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  await finalizePurchase(
    ctx.telegram,
    telegramId,
    ctx.chat!.id,
    desc,
    paymentMethod,
    overpayEur,
    txSignature,
    editMessageId,
    senderWallet,
  );
}

export async function sendProductMedia(ctx: any, product: any) {
  const files: { fileId: string; fileType: string }[] = [];

  if (product.fileId && product.fileType !== "text") {
    files.push({ fileId: product.fileId, fileType: product.fileType });
  }

  if (product.mediaFiles) {
    try {
      const extra = JSON.parse(product.mediaFiles) as {
        fileId: string;
        fileType: string;
      }[];
      files.push(...extra);
    } catch {}
  }

  for (const f of files) {
    try {
      if (f.fileType === "photo") await ctx.replyWithPhoto(f.fileId);
      else if (f.fileType === "document") await ctx.replyWithDocument(f.fileId);
      else if (f.fileType === "video") await ctx.replyWithVideo(f.fileId);
      else if (f.fileType === "animation" || f.fileType === "gif")
        await ctx.replyWithAnimation(f.fileId);
      else if (f.fileType === "text")
        // Text stored in mediaFiles uses fileId as the raw text value.
        await ctx.reply(`<code>${f.fileId}</code>`, { parse_mode: "HTML" });
    } catch {}
  }
}

// Context-free variant of sendProductMedia used by the background auto-confirm
// flow, which has no Telegraf Context — delivers media via the raw client.
export async function sendProductMediaTo(
  telegram: any,
  chatId: number,
  product: any,
) {
  const files: { fileId: string; fileType: string }[] = [];

  if (product.fileId && product.fileType !== "text") {
    files.push({ fileId: product.fileId, fileType: product.fileType });
  }

  if (product.mediaFiles) {
    try {
      const extra = JSON.parse(product.mediaFiles) as {
        fileId: string;
        fileType: string;
      }[];
      files.push(...extra);
    } catch {}
  }

  for (const f of files) {
    try {
      if (f.fileType === "photo") await telegram.sendPhoto(chatId, f.fileId);
      else if (f.fileType === "document")
        await telegram.sendDocument(chatId, f.fileId);
      else if (f.fileType === "video") await telegram.sendVideo(chatId, f.fileId);
      else if (f.fileType === "animation" || f.fileType === "gif")
        await telegram.sendAnimation(chatId, f.fileId);
      else if (f.fileType === "text")
        await telegram.sendMessage(chatId, `<code>${f.fileId}</code>`, {
          parse_mode: "HTML",
        });
    } catch {}
  }
}
