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
} from "drizzle-orm";
import { addMinutes } from "./utils";

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
    if (
      (username && username !== user.username) ||
      (firstName && firstName !== user.firstName)
    ) {
      await db
        .update(usersTable)
        .set({ username, firstName })
        .where(eq(usersTable.telegramId, telegramId));
      user = { ...user, username: username ?? user.username, firstName: firstName ?? user.firstName };
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

export async function isAdmin(telegramId: number): Promise<boolean> {
  const ownerIdStr = process.env["OWNER_ID"];
  if (ownerIdStr && Number(ownerIdStr) === telegramId) return true;
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

export async function reserveProduct(
  productId: number,
  userId: number
): Promise<boolean> {
  const product = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.status, "available")
      )
    )
    .then((r) => r[0]);
  if (!product) return false;

  const basketCount = await db
    .select({ count: count() })
    .from(basketsTable)
    .where(eq(basketsTable.userId, userId))
    .then((r) => r[0]?.count ?? 0);
  if (basketCount >= 10) return false;

  const until = addMinutes(new Date(), 15);
  await db
    .update(productsTable)
    .set({ status: "reserved", reservedBy: userId, reservedUntil: until })
    .where(eq(productsTable.id, productId));
  await db
    .insert(basketsTable)
    .values({ userId, productId, reservedUntil: until })
    .onConflictDoNothing();
  return true;
}

export async function releaseBasket(userId: number) {
  const items = await db
    .select()
    .from(basketsTable)
    .where(eq(basketsTable.userId, userId));
  for (const item of items) {
    await db
      .update(productsTable)
      .set({ status: "available", reservedBy: null, reservedUntil: null })
      .where(eq(productsTable.id, item.productId));
  }
  await db.delete(basketsTable).where(eq(basketsTable.userId, userId));
}

export async function getUserBasket(userId: number) {
  const now = new Date();
  const expiredItems = await db
    .select()
    .from(basketsTable)
    .where(
      and(
        eq(basketsTable.userId, userId),
        lt(basketsTable.reservedUntil, now)
      )
    );
  for (const item of expiredItems) {
    await db
      .update(productsTable)
      .set({ status: "available", reservedBy: null, reservedUntil: null })
      .where(eq(productsTable.id, item.productId));
    await db
      .delete(basketsTable)
      .where(eq(basketsTable.id, item.id));
  }
  return db
    .select({
      basketId: basketsTable.id,
      productId: productsTable.id,
      size: productsTable.size,
      price: productsTable.price,
      typeId: productsTable.typeId,
      cityId: productsTable.cityId,
      districtId: productsTable.districtId,
      reservedUntil: basketsTable.reservedUntil,
    })
    .from(basketsTable)
    .innerJoin(productsTable, eq(basketsTable.productId, productsTable.id))
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
  const now = new Date();
  const expired = await db
    .select()
    .from(basketsTable)
    .where(lt(basketsTable.reservedUntil, now));
  for (const item of expired) {
    await db
      .update(productsTable)
      .set({ status: "available", reservedBy: null, reservedUntil: null })
      .where(eq(productsTable.id, item.productId));
  }
  await db.delete(basketsTable).where(lt(basketsTable.reservedUntil, now));
  return expired.length;
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
