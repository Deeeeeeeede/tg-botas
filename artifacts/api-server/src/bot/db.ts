import { db } from "@workspace/db";
import {
  usersTable,
  adminsTable,
  citiesTable,
  districtsTable,
  productTypesTable,
  productsTable,
  purchasesTable,
  basketsTable,
  discountCodesTable,
  tierLevelsTable,
  tierSettingsTable,
  workersTable,
  reviewsTable,
  welcomeTemplatesTable,
  botSettingsTable,
  backupTokensTable,
} from "@workspace/db";
import {
  eq,
  and,
  lt,
  gt,
  gte,
  lte,
  desc,
  asc,
  count,
  sql,
  sum,
  ne,
  isNull,
  or,
  ilike,
} from "drizzle-orm";

// How often to flush lastActiveAt to the DB for an active user.
// Skipping redundant writes on every button press is the single biggest
// latency win — each DB round-trip adds ~2–5 ms.
const LAST_ACTIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function getOrCreateUser(
  telegramId: number,
  username?: string,
  firstName?: string
) {
  let user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .then((r) => r[0]);
  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({ telegramId, username, firstName })
      .returning();
    user = created!;
    await updateUserTier(telegramId);
  } else {
    const changedProfile =
      (username && username !== user.username) ||
      (firstName && firstName !== user.firstName);
    const lastActive = user.lastActiveAt
      ? new Date(user.lastActiveAt).getTime()
      : 0;
    const activityStale = Date.now() - lastActive > LAST_ACTIVE_TTL_MS;
    if (changedProfile || activityStale) {
      await db
        .update(usersTable)
        .set(
          changedProfile
            ? { username, firstName, lastActiveAt: new Date() }
            : { lastActiveAt: new Date() },
        )
        .where(eq(usersTable.telegramId, telegramId));
      if (changedProfile) {
        user = {
          ...user,
          username: username ?? user.username,
          firstName: firstName ?? user.firstName,
        };
      }
    }
  }
  return user;
}

export async function getUser(telegramId: number) {
  return db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .then((r) => r[0]);
}

export function getOwnerId(): number | null {
  const ownerIdStr = process.env["OWNER_ID"];
  if (!ownerIdStr) return null;
  const id = Number(ownerIdStr);
  return Number.isFinite(id) ? id : null;
}

export function isOwner(telegramId: number): boolean {
  return getOwnerId() === telegramId;
}

export async function isAdmin(telegramId: number): Promise<boolean> {
  if (isOwner(telegramId)) return true;
  const admin = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.telegramId, telegramId))
    .then((r) => r[0]);
  return !!admin;
}

export async function isWorker(telegramId: number): Promise<boolean> {
  const worker = await db
    .select()
    .from(workersTable)
    .where(
      and(
        eq(workersTable.telegramId, telegramId),
        eq(workersTable.enabled, true)
      )
    )
    .then((r) => r[0]);
  return !!worker;
}

export async function updateUserTier(telegramId: number) {
  const user = await getUser(telegramId);
  if (!user) return;
  const settings = await db
    .select()
    .from(tierSettingsTable)
    .then((r) => r[0]);
  const metric = settings?.metric ?? "purchase_count";
  const value =
    metric === "purchase_count"
      ? user.purchaseCount
      : Number(user.eurSpent);
  const tiers = await db
    .select()
    .from(tierLevelsTable)
    .orderBy(desc(tierLevelsTable.threshold));
  let newTier = "New";
  for (const tier of tiers) {
    if (value >= tier.threshold) {
      newTier = tier.name;
      break;
    }
  }
  await db
    .update(usersTable)
    .set({ tierName: newTier })
    .where(eq(usersTable.telegramId, telegramId));
}

export async function getCities() {
  return db.select().from(citiesTable).orderBy(asc(citiesTable.name));
}

export async function getDistricts(cityId: number) {
  return db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.cityId, cityId))
    .orderBy(asc(districtsTable.name));
}

export async function getProductTypes() {
  return db
    .select()
    .from(productTypesTable)
    .orderBy(asc(productTypesTable.name));
}

export async function getAvailableProducts(
  cityId: number,
  districtId: number,
  typeId: number
) {
  return db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.status, "available")
      )
    )
    .orderBy(asc(productsTable.size), asc(productsTable.price));
}

export async function getSizesForTypeInDistrict(
  cityId: number,
  districtId: number,
  typeId: number
): Promise<{ size: string; price: string; count: number }[]> {
  const rows = await db
    .select({
      size: productsTable.size,
      price: productsTable.price,
      count: count(),
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.status, "available")
      )
    )
    .groupBy(productsTable.size, productsTable.price)
    .orderBy(asc(productsTable.price));
  return rows;
}

export async function addToBasket(
  userId: number,
  cityId: number,
  districtId: number,
  typeId: number,
  size: string,
  price: number
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await db
    .select()
    .from(basketsTable)
    .where(
      and(
        eq(basketsTable.userId, userId),
        eq(basketsTable.cityId, cityId),
        eq(basketsTable.districtId, districtId),
        eq(basketsTable.typeId, typeId),
        eq(basketsTable.size, size)
      )
    )
    .then((r) => r[0]);
  if (existing) return { ok: false, reason: "already" };

  const basketCount = await db
    .select({ count: count() })
    .from(basketsTable)
    .where(eq(basketsTable.userId, userId))
    .then((r) => r[0]?.count ?? 0);
  if (basketCount >= 10) return { ok: false, reason: "full" };

  const [available] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.size, size),
        eq(productsTable.status, "available")
      )
    );
  if ((available?.count ?? 0) === 0) return { ok: false, reason: "unavailable" };

  await db.insert(basketsTable).values({
    userId,
    cityId,
    districtId,
    typeId,
    size,
    price: price.toFixed(2),
  });
  return { ok: true };
}

export async function releaseBasket(userId: number) {
  await db.delete(basketsTable).where(eq(basketsTable.userId, userId));
}

export async function getUserBasket(userId: number) {
  return db
    .select()
    .from(basketsTable)
    .where(eq(basketsTable.userId, userId));
}

export async function getWelcomeText(): Promise<string> {
  const template = await db
    .select()
    .from(welcomeTemplatesTable)
    .where(eq(welcomeTemplatesTable.isActive, true))
    .then((r) => r[0]);
  return template?.text ?? "Welcome to the shop! Browse our products below.";
}

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await db
    .select()
    .from(botSettingsTable)
    .where(eq(botSettingsTable.key, key))
    .then((r) => r[0]);
  return row?.value;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(botSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value } });
}

export async function getDashboardStats() {
  const [userCount] = await db
    .select({ count: count() })
    .from(usersTable);
  const [balanceSum] = await db
    .select({ total: sum(usersTable.balance) })
    .from(usersTable);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [salesSum] = await db
    .select({ total: sum(purchasesTable.pricePaid) })
    .from(purchasesTable)
    .where(
      and(
        gte(purchasesTable.createdAt, thirtyDaysAgo),
        eq(purchasesTable.refunded, false)
      )
    );
  const [productCount] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.status, "available"));

  return {
    users: userCount?.count ?? 0,
    balances: Number(balanceSum?.total ?? 0),
    sales30d: Number(salesSum?.total ?? 0),
    products: productCount?.count ?? 0,
  };
}

export async function clearExpiredReservations() {
  // Only free reservations that have actually expired (or have no expiry set,
  // which would otherwise leave a product stuck as "reserved" forever). Active,
  // not-yet-expired reservations are left alone so we never yank an item out
  // from under a customer who is mid-checkout.
  const result = await db
    .update(productsTable)
    .set({ status: "available", reservedBy: null, reservedUntil: null })
    .where(
      and(
        eq(productsTable.status, "reserved"),
        or(
          isNull(productsTable.reservedUntil),
          lt(productsTable.reservedUntil, new Date()),
        ),
      ),
    )
    .returning({ id: productsTable.id });
  return result.length;
}

export async function searchUser(query: string) {
  const numId = Number(query);
  if (!isNaN(numId)) {
    return db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, numId))
      .then((r) => r[0]);
  }
  const username = query.replace("@", "").toLowerCase();
  const all = await db.select().from(usersTable);
  return all.find(
    (u) => (u.username ?? "").toLowerCase() === username
  );
}

// Search users by numeric Telegram ID (exact) or username (partial, case-insensitive).
// Returns a list of matches, ordered by most recently active first.
export async function searchUsers(query: string, limit = 12) {
  const trimmed = query.trim();
  const numId = Number(trimmed);
  if (trimmed !== "" && !isNaN(numId)) {
    return db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, numId));
  }
  const term = trimmed.replace("@", "");
  if (term === "") return [];
  return db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.username, `%${term}%`))
    .orderBy(desc(usersTable.lastActiveAt))
    .limit(limit);
}

export async function getRecentlyActiveUsers(limit = 15) {
  return db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.lastActiveAt))
    .limit(limit);
}
