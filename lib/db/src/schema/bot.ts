import {
  pgTable,
  serial,
  text,
  bigint,
  integer,
  numeric,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const fileTypeEnum = pgEnum("file_type", [
  "text",
  "photo",
  "document",
  "gif",
  "video",
  "animation",
]);

export const productStatusEnum = pgEnum("product_status", [
  "available",
  "reserved",
  "sold",
  "unavailable",
]);

export const tierMetricEnum = pgEnum("tier_metric", [
  "purchase_count",
  "eur_spent",
]);

export const usersTable = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  isBanned: boolean("is_banned").notNull().default(false),
  isReseller: boolean("is_reseller").notNull().default(false),
  purchaseCount: integer("purchase_count").notNull().default(0),
  eurSpent: numeric("eur_spent", { precision: 12, scale: 2 }).notNull().default("0"),
  tierName: text("tier_name").notNull().default("New"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
});

export const adminsTable = pgTable("bot_admins", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  notifyOnPurchase: boolean("notify_on_purchase").notNull().default(true),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const citiesTable = pgTable("bot_cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const districtsTable = pgTable("bot_districts", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => citiesTable.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productTypesTable = pgTable("bot_product_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  emoji: text("emoji").notNull().default("📦"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productsTable = pgTable("bot_products", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").references(() => citiesTable.id),
  districtId: integer("district_id").references(() => districtsTable.id),
  typeId: integer("type_id").notNull().references(() => productTypesTable.id),
  size: text("size").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  content: text("content"),
  fileId: text("file_id"),
  fileType: fileTypeEnum("file_type").notNull().default("text"),
  status: productStatusEnum("status").notNull().default("available"),
  reservedBy: bigint("reserved_by", { mode: "number" }),
  reservedUntil: timestamp("reserved_until"),
  addedBy: bigint("added_by", { mode: "number" }),
  workerTag: text("worker_tag"),
  mediaFiles: text("media_files"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// "Empty product" catalog slots. An admin defines that a product type is
// offered in a given city/district at a given size+price WITHOUT uploading any
// actual stock. Workers (/klad) then fill these slots with real content, and
// uploaded products inherit the slot price. Customers only ever see slots that
// have actual available stock.
export const productSlotsTable = pgTable(
  "bot_product_slots",
  {
    id: serial("id").primaryKey(),
    cityId: integer("city_id").notNull().references(() => citiesTable.id),
    districtId: integer("district_id").notNull().references(() => districtsTable.id),
    typeId: integer("type_id").notNull().references(() => productTypesTable.id),
    size: text("size").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlot: uniqueIndex("bot_product_slots_uniq").on(
      t.cityId,
      t.districtId,
      t.typeId,
      t.size,
    ),
  }),
);

export const purchasesTable = pgTable("bot_purchases", {
  id: serial("id").primaryKey(),
  queueId: text("queue_id").notNull().unique(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  productId: integer("product_id").notNull(),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  discountCodeUsed: text("discount_code_used"),
  paymentMethod: text("payment_method").notNull().default("balance"),
  txSignature: text("tx_signature"),
  senderWallet: text("sender_wallet"),
  refunded: boolean("refunded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per consumed on-chain Solana transaction. The UNIQUE constraint on
// tx_signature is the authoritative, atomic guard that a single payment can be
// credited at most once across every flow (product purchase or balance top-up).
export const paymentReceiptsTable = pgTable("bot_payment_receipts", {
  id: serial("id").primaryKey(),
  txSignature: text("tx_signature").notNull().unique(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  receivedSol: numeric("received_sol", { precision: 18, scale: 9 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const basketsTable = pgTable("bot_baskets", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  cityId: integer("city_id").notNull(),
  districtId: integer("district_id").notNull(),
  typeId: integer("type_id").notNull(),
  size: text("size").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const discountCodesTable = pgTable("bot_discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  percentOff: integer("percent_off").notNull(),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").notNull().default(0),
  stacksWithSale: boolean("stacks_with_sale").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productDiscountsTable = pgTable("bot_product_discounts", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id"),
  districtId: integer("district_id"),
  typeId: integer("type_id"),
  size: text("size"),
  percentOff: integer("percent_off").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const resellerDiscountsTable = pgTable("bot_reseller_discounts", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id"),
  districtId: integer("district_id"),
  typeId: integer("type_id"),
  size: text("size"),
  percentOff: integer("percent_off").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tierLevelsTable = pgTable("bot_tier_levels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  threshold: integer("threshold").notNull().default(0),
  globalDiscountPercent: integer("global_discount_percent").notNull().default(0),
});

export const tierDiscountRulesTable = pgTable("bot_tier_discount_rules", {
  id: serial("id").primaryKey(),
  tierName: text("tier_name").notNull(),
  cityId: integer("city_id"),
  districtId: integer("district_id"),
  typeId: integer("type_id"),
  size: text("size"),
  percentOff: integer("percent_off").notNull(),
});

export const tierSettingsTable = pgTable("bot_tier_settings", {
  id: serial("id").primaryKey(),
  metric: tierMetricEnum("metric").notNull().default("purchase_count"),
});

export const workersTable = pgTable("bot_workers", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  enabled: boolean("enabled").notNull().default(true),
  totalUploads: integer("total_uploads").notNull().default(0),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const reviewsTable = pgTable("bot_reviews", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  username: text("username"),
  firstName: text("first_name"),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const welcomeTemplatesTable = pgTable("bot_welcome_templates", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const botSettingsTable = pgTable("bot_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const backupTokensTable = pgTable("bot_backup_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const topupInvoicesTable = pgTable("bot_topup_invoices", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  eurAmount: numeric("eur_amount", { precision: 10, scale: 2 }).notNull(),
  solAmount: numeric("sol_amount", { precision: 18, scale: 9 }).notNull(),
  status: text("status").notNull().default("pending"),
  txSignature: text("tx_signature"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Durable record of every PURCHASE SOL invoice we hand out. Top-ups already have
// bot_topup_invoices; purchases previously lived only in memory, so a process
// restart (republish / VM restart / bot failover) or a payment arriving after
// the 15-min window left the buyer's payment with nothing to match against —
// money received, no product, no record. This table is the safety net: every
// invoice's (userId, solAmount) is persisted so a late/orphaned payment can be
// matched back to its buyer and credited. status: open|fulfilled|expired|canceled.
export const invoiceIntentsTable = pgTable("bot_invoice_intents", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  solAmount: numeric("sol_amount", { precision: 18, scale: 9 }).notNull(),
  eurAmount: numeric("eur_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("open"),
  txSignature: text("tx_signature"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
