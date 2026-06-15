import { Telegraf, session } from "telegraf";
import { message } from "telegraf/filters";
import { db } from "@workspace/db";
import {
  usersTable,
  citiesTable,
  districtsTable,
  productTypesTable,
  productsTable,
  productSlotsTable,
  discountCodesTable,
  welcomeTemplatesTable,
  tierLevelsTable,
  tierSettingsTable,
  workersTable,
  basketsTable,
  backupTokensTable,
  productDiscountsTable,
  resellerDiscountsTable,
  purchasesTable,
  reviewsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { BotSession } from "./session";
import {
  getOrCreateUser,
  isAdmin,
  isWorker,
  releaseBasket,
  updateUserTier,
  getCities,
  getDistricts,
  getProductTypes,
  getSetting,
  setSetting,
  searchUsers,
  getRecentlyActiveUsers,
} from "./db";
import { showAdminMenu, showAnalytics, refreshAdminLiveStatsNow, setAdminTelegram } from "./handlers/admin";
import {
  showAdminManagers,
  addAdmin,
  removeAdmin,
} from "./handlers/admin-managers";
import {
  showTopUpMenu,
  handleTopUpAmount,
  checkTopUpPayment,
  cancelTopUp,
} from "./handlers/topup";
import {
  showGeographyMenu,
  showCitiesList,
  showCityDetail,
  deleteCity,
  confirmDeleteCity,
  showDistrictsCitySelect,
  showDistrictsList,
  showDistrictDetail,
  deleteDistrict,
  confirmDeleteDistrict,
} from "./handlers/admin-geography";
import {
  showProductsMenu,
  showProductTypes,
  showTypeDetail,
  deleteProductType,
  showStock,
  showManageProducts,
  showManageProdDistricts,
  showManageProdTypes,
  showProductList,
  deleteAllProducts,
  showReassignSourceTypes,
  showReassignDestTypes,
  doReassignType,
  showBulkPriceTypes,
  applyBulkPrice,
} from "./handlers/admin-products";
import {
  showEmptyProductStart,
  promptEmptyProductSizes,
  parseSizesInput,
  showEmptyProductCities,
  toggleEmptyProductCity,
  showEmptyProductDistricts,
  toggleEmptyProductDistrict,
  selectAllEmptyProductDistricts,
  showEmptyProductConfirm,
  createEmptyProductSlots,
  showCatalog,
  showCatalogType,
  deleteCatalogSlot,
  deleteCatalogType,
} from "./handlers/admin-slots";
import {
  showUsersMenu,
  showUserProfile,
  banUser,
  unbanUser,
  makeReseller,
  removeReseller,
  exportUsersCsv,
} from "./handlers/admin-users";
import {
  showReportMenu,
  generateReport,
  salesByCity,
  salesByType,
  showPurchases,
  salesToday,
  viewSaleContent,
} from "./handlers/admin-analytics";
import {
  showCommsMenu,
  showWelcomeMenu,
  activateWelcomeTemplate,
  deleteWelcomeTemplate,
  showReviews,
} from "./handlers/admin-comms";
import {
  showDiscountsMenu,
  showDiscountCodes,
  deleteDiscountCode,
  showProductDiscounts,
  showTierSystem,
  switchTierMetric,
  resetTierDefaults,
  deleteTier,
} from "./handlers/admin-discounts";
import {
  showToolsMenu,
  clearAllReservations,
  showRecentPurchasesForRefund,
  showRefundConfirm,
  doRefund,
  showPaymentRecoveryMenu,
  showOrderRecoveryById,
  renderOrderRecovery,
  showBackupTokens,
  deleteBackupToken,
  showChangeWallet,
  doChangeWallet,
  resetWalletToDefault,
} from "./handlers/admin-tools";
import {
  showWorkersMenu,
  showWorkersList,
  showWorkerDetail,
  toggleWorker,
  removeWorker,
  showKladMenu,
  showKladCities,
  showKladDistricts,
  showKladTypes,
  showKladSizes,
  showKladMyUploads,
} from "./handlers/worker";
import {
  showHome,
  showProfile,
  showPriceList,
  showShopCities,
  showShopDistricts,
  showShopTypes,
  showShopSizes,
  showSizeDetail,
  addToBasket,
  payNow,
  showPaymentSummary,
  doPayNow,
  showBasket,
  checkout,
  applyDiscountCode,
  showOrders,
  showCustomerReviews,
  showReviewsMenu,
} from "./handlers/shop";
import {
  showCryptoMenu,
  showSolInvoice,
  checkSolPayment,
  completePurchase,
  cancelPendingInvoice,
  startInvoiceBackgroundChecker,
} from "./handlers/payments";
import { formatEur } from "./utils";
import { inlineKeyboard, BACK_BTN } from "./keyboards";

// Credit an admin-granted balance top-up and notify the user. Returns the new
// balance, or null if the target user no longer exists. Shared by the Tools and
// user-profile confirmation flows.
async function applyAddBalance(
  telegram: Telegraf["telegram"],
  targetId: number,
  amount: number,
): Promise<number | null> {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, targetId))
    .then((r) => r[0]);
  if (!user) return null;
  // Relative, atomic update so concurrent credits/debits (refunds, top-ups,
  // other admin grants) can't clobber each other via read-then-write.
  const [updated] = await db
    .update(usersTable)
    .set({ balance: sql`${usersTable.balance} + ${amount}` })
    .where(eq(usersTable.telegramId, targetId))
    .returning({ balance: usersTable.balance });
  const newBal = Number(updated?.balance ?? 0);
  try {
    await telegram.sendMessage(
      targetId,
      `💰 Your balance has been topped up by ${formatEur(amount)}. New balance: ${formatEur(newBal)}.`,
    );
  } catch {}
  await refreshAdminLiveStatsNow();
  return newBal;
}

export function createBot(token?: string): Telegraf {
  const botToken = token ?? process.env["BOT_TOKEN"];
  if (!botToken) throw new Error("BOT_TOKEN environment variable is required");

  const bot = new Telegraf(botToken);

  bot.use(
    session({
      defaultSession: (): BotSession => ({
        step: undefined,
        data: undefined,
      }),
    }),
  );

  bot.use(async (ctx: any, next) => {
    if (!ctx.from) return next();
    await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    return next();
  });

  bot.command("start", async (ctx: any) => {
    await showHome(ctx);
  });

  bot.command("admin", async (ctx: any) => {
    if (!(await isAdmin(ctx.from.id))) {
      return ctx.reply("❌ You are not authorized to use this command.");
    }
    await showAdminMenu(ctx);
  });

  bot.command("terminate", async (ctx: any) => {
    if (!(await isAdmin(ctx.from.id))) return;
    ctx.session.step = undefined;
    ctx.session.data = undefined;
    await showAdminMenu(ctx);
  });

  bot.command("klad", async (ctx: any) => {
    if (!(await isWorker(ctx.from.id))) {
      if (await isAdmin(ctx.from.id)) {
        await showKladMenu(ctx);
        return;
      }
      return ctx.reply(
        "❌ You are not registered as a worker or your access has been disabled.",
      );
    }
    await showKladMenu(ctx);
  });

  // Register /done BEFORE the text handler so it is intercepted as a command,
  // not treated as a product text message when a worker is in the upload flow.
  bot.command("done", async (ctx: any) => {
    const step = ctx.session.step as string | undefined;

    if (
      step === "admin:add_product:more_files" ||
      step === "admin:add_product:content"
    ) {
      const data = ctx.session.data ?? {};
      const fileCount = ((data["fileCount"] as number) ?? 0) + 1;
      ctx.session.step = undefined;
      ctx.session.data = undefined;
      await ctx.reply(
        `✅ Lot complete. ${fileCount} file(s) saved — one buyer will receive all of them.`,
      );
      if (await isAdmin(ctx.from.id)) {
        await showProductsMenu(ctx);
      } else {
        await showKladMenu(ctx);
      }
    } else if (step === "admin:add_product:bulk") {
      const count = (ctx.session.data as any)?.["bulkCount"] ?? 0;
      ctx.session.step = undefined;
      ctx.session.data = undefined;
      await ctx.reply(`✅ Bulk upload complete. ${count} units added.`);
      if (await isAdmin(ctx.from.id)) {
        await showProductsMenu(ctx);
      } else {
        await showKladMenu(ctx);
      }
    }
  });

  bot.on(message("text"), async (ctx: any) => {
    const step = ctx.session.step as string | undefined;
    const data = (ctx.session.data ?? {}) as Record<string, any>;
    const text = ctx.message.text as string;

    if (!step) return;

    if (step === "admin:add_city") {
      const name = text.trim();
      if (!name) return ctx.reply("Please enter a valid city name.");
      await db.insert(citiesTable).values({ name }).onConflictDoNothing();
      ctx.session.step = undefined;
      await ctx.reply(`✅ City "<b>${name}</b>" added.`, {
        parse_mode: "HTML",
      });
      await showGeographyMenu(ctx);
      return;
    }

    if (step === "admin:rename_city") {
      const cityId = data["cityId"] as number;
      await db
        .update(citiesTable)
        .set({ name: text.trim() })
        .where(eq(citiesTable.id, cityId));
      ctx.session.step = undefined;
      await ctx.reply("✅ City renamed.");
      await showCitiesList(ctx);
      return;
    }

    if (step === "admin:add_district") {
      const cityId = data["cityId"] as number;
      await db.insert(districtsTable).values({ cityId, name: text.trim() });
      ctx.session.step = undefined;
      await ctx.reply(`✅ District added.`);
      await showDistrictsList(ctx, cityId);
      return;
    }

    if (step === "admin:rename_district") {
      const districtId = data["districtId"] as number;
      const cityId = data["cityId"] as number;
      await db
        .update(districtsTable)
        .set({ name: text.trim() })
        .where(eq(districtsTable.id, districtId));
      ctx.session.step = undefined;
      await ctx.reply("✅ District renamed.");
      await showDistrictsList(ctx, cityId);
      return;
    }

    if (step === "admin:add_type_name") {
      ctx.session.data = { ...data, typeName: text.trim() };
      ctx.session.step = "admin:add_type_emoji";
      await ctx.reply(
        "Enter an emoji for this type (e.g. 💎):",
        inlineKeyboard([[BACK_BTN("admin:products")]]),
      );
      return;
    }

    if (step === "admin:add_type_emoji") {
      const name = data["typeName"] as string;
      const emoji = text.trim();
      await db
        .insert(productTypesTable)
        .values({ name, emoji })
        .onConflictDoNothing();
      ctx.session.step = undefined;
      await ctx.reply(`✅ Product type <b>${emoji} ${name}</b> added.`, {
        parse_mode: "HTML",
      });
      await showProductTypes(ctx);
      return;
    }

    if (step === "admin:rename_type") {
      const typeId = data["typeId"] as number;
      await db
        .update(productTypesTable)
        .set({ name: text.trim() })
        .where(eq(productTypesTable.id, typeId));
      ctx.session.step = undefined;
      await ctx.reply("✅ Type renamed.");
      await showProductTypes(ctx);
      return;
    }

    if (step === "eprod:new_type_name") {
      ctx.session.data = { ...data, eprodNewTypeName: text.trim() };
      ctx.session.step = "eprod:new_type_emoji";
      await ctx.reply(
        "Enter an emoji for this product (e.g. ❄️):",
        inlineKeyboard([[BACK_BTN("prod:empty")]]),
      );
      return;
    }

    if (step === "eprod:new_type_emoji") {
      const name = data["eprodNewTypeName"] as string;
      const emoji = text.trim();
      await db
        .insert(productTypesTable)
        .values({ name, emoji })
        .onConflictDoNothing();
      const type = await db
        .select()
        .from(productTypesTable)
        .where(eq(productTypesTable.name, name))
        .then((r) => r[0]);
      ctx.session.data = { eprodTypeId: type?.id };
      await promptEmptyProductSizes(ctx, false);
      return;
    }

    if (step === "eprod:sizes") {
      const sizes = parseSizesInput(text);
      if (sizes.length === 0) {
        await ctx.reply(
          "Couldn't read any sizes. Send one per line like:\n1g 10\n2g 18",
        );
        return;
      }
      ctx.session.data = { ...data, eprodSizes: sizes };
      await showEmptyProductCities(ctx);
      return;
    }

    if (
      step === "admin:add_product:size" ||
      step === "admin:add_product:bulk_setup" ||
      step === "admin:add_product:size_bulk"
    ) {
      const isBulk =
        step === "admin:add_product:bulk_setup" ||
        step === "admin:add_product:size_bulk";
      ctx.session.data = { ...data, size: text.trim(), isBulk };
      ctx.session.step = "admin:add_product:price";
      await ctx.reply(
        "Enter the price in EUR (e.g. 12.50):",
        inlineKeyboard([[BACK_BTN("admin:products")]]),
      );
      return;
    }

    if (step === "admin:add_product:price") {
      const price = parseFloat(text.trim());
      if (isNaN(price) || price <= 0) {
        return ctx.reply("Invalid price. Enter a number like 12.50:");
      }
      ctx.session.data = { ...data, price };
      ctx.session.step = "admin:add_product:content";
      const isBulk = data["isBulk"] as boolean;
      if (isBulk) {
        await ctx.reply(
          "📤 Send the <b>first file</b> for this lot.\n\n" +
            "Each lot = one buyer gets ALL files you send before /done.\n" +
            "To add another lot after this one, start the upload again.",
          {
            parse_mode: "HTML",
            ...inlineKeyboard([[BACK_BTN("admin:products")]]),
          },
        );
      } else {
        await ctx.reply(
          "📤 Send files for this product lot.\n\n" +
            "All files you send will go to ONE buyer.\n" +
            "Type /done when finished.",
          {
            parse_mode: "HTML",
            ...inlineKeyboard([[BACK_BTN("admin:products")]]),
          },
        );
      }
      return;
    }

    if (
      step === "admin:add_product:content" ||
      step === "admin:add_product:more_files"
    ) {
      const { cityId, districtId, typeId, size, price, addedBy } = data;
      const currentProductId = data["currentProductId"] as number | undefined;

      const workerData = await db
        .select()
        .from(workersTable)
        .where(eq(workersTable.telegramId, addedBy as number))
        .then((r) => r[0]);
      const userRow = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, addedBy as number))
        .then((r) => r[0]);
      const workerTag =
        workerData?.username ?? userRow?.username ?? String(addedBy);

      if (step === "admin:add_product:content" || !currentProductId) {
        const [inserted] = await db
          .insert(productsTable)
          .values({
            cityId: cityId as number,
            districtId: districtId as number,
            typeId: typeId as number,
            size: size as string,
            price: (price as number).toFixed(2),
            content: text,
            fileType: "text",
            addedBy: addedBy as number,
            workerTag,
            status: "available",
          })
          .returning();
        if (workerData) {
          await db
            .update(workersTable)
            .set({ totalUploads: (workerData.totalUploads || 0) + 1 })
            .where(eq(workersTable.id, workerData.id));
        }
        ctx.session.data = {
          ...data,
          currentProductId: inserted?.id,
        };
        ctx.session.step = "admin:add_product:more_files";
        await ctx.reply(
          "✅ Text saved. Send more files or press Done when finished.",
          inlineKeyboard([[{ text: "✅ Done", callback_data: "klad:done" }]]),
        );
      } else {
        const product = await db
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, currentProductId))
          .then((r) => r[0]);
        if (product) {
          const existing = product.mediaFiles
            ? (JSON.parse(product.mediaFiles) as {
                fileId: string;
                fileType: string;
              }[])
            : [];
          existing.push({ fileId: text, fileType: "text" });
          await db
            .update(productsTable)
            .set({ mediaFiles: JSON.stringify(existing) })
            .where(eq(productsTable.id, currentProductId));
        }
        await ctx.reply(
          "✅ Text added to lot. Send more files or /done to finish.",
        );
      }
      return;
    }

    if (step === "admin:search_user") {
      ctx.session.step = undefined;
      const query = text.trim();
      const matches = await searchUsers(query);
      if (matches.length === 0) {
        await ctx.reply(
          "No users found.",
          inlineKeyboard([[BACK_BTN("admin:users")]]),
        );
        return;
      }
      if (matches.length === 1) {
        await showUserProfile(ctx, String(matches[0]!.telegramId));
        return;
      }
      const rows = matches.map((u) => [
        {
          text: u.username ? `@${u.username}` : `ID ${u.telegramId}`,
          callback_data: `users:view:${u.telegramId}`,
        },
      ]);
      rows.push([BACK_BTN("admin:users")]);
      await ctx.reply(
        `🔍 <b>${matches.length} matches</b> — pick one:`,
        { parse_mode: "HTML", ...inlineKeyboard(rows) },
      );
      return;
    }

    if (step === "admin:broadcast") {
      ctx.session.step = undefined;
      const users = await db.select().from(usersTable);
      const total = users.length;
      let sent = 0;
      let failed = 0;

      const progress = await ctx.reply(
        `📢 Broadcasting to ${total} user${total === 1 ? "" : "s"}…`,
      );
      const progressChatId = progress.chat.id;
      const progressMsgId = progress.message_id;

      // Telegram allows ~30 messages/sec to different users. We stay well under
      // that with a fixed batch size and a pause between batches, and back off
      // when Telegram explicitly asks us to (429 with retry_after).
      const BATCH_SIZE = 25;
      const BATCH_PAUSE_MS = 1100;
      const sleep = (ms: number) =>
        new Promise<void>((r) => setTimeout(r, ms));

      const sendOne = async (telegramId: number): Promise<boolean> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await bot.telegram.sendMessage(telegramId, text, {
              parse_mode: "HTML",
            });
            return true;
          } catch (err: any) {
            const retryAfter = err?.parameters?.retry_after;
            if (retryAfter) {
              // Flood limit hit — wait the requested cooldown, then retry.
              await sleep((retryAfter + 1) * 1000);
              continue;
            }
            // Any other error (user blocked the bot, deactivated, etc.) is
            // permanent for this recipient — count it as failed and move on.
            return false;
          }
        }
        return false;
      };

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((u) => sendOne(u.telegramId)),
        );
        for (const ok of results) ok ? sent++ : failed++;

        await bot.telegram
          .editMessageText(
            progressChatId,
            progressMsgId,
            undefined,
            `📢 Broadcasting… ${sent + failed}/${total} processed (${sent} ✅ / ${failed} ❌)`,
          )
          .catch(() => {});

        if (i + BATCH_SIZE < total) await sleep(BATCH_PAUSE_MS);
      }

      await bot.telegram
        .editMessageText(
          progressChatId,
          progressMsgId,
          undefined,
          `✅ <b>Broadcast complete</b>\n\n📨 Delivered: <b>${sent}</b>\n⚠️ Failed: <b>${failed}</b>\n👥 Total: <b>${total}</b>`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
      await showCommsMenu(ctx);
      return;
    }

    if (step === "admin:welcome_template") {
      await db.insert(welcomeTemplatesTable).values({ text, isActive: false });
      ctx.session.step = undefined;
      await ctx.reply("✅ Welcome template saved.");
      await showWelcomeMenu(ctx);
      return;
    }

    if (step === "admin:create_discount_code:name") {
      ctx.session.data = { ...data, code: text.trim().toUpperCase() };
      ctx.session.step = "admin:create_discount_code:percent";
      await ctx.reply(
        "Enter discount % (1-100):",
        inlineKeyboard([[BACK_BTN("admin:discounts")]]),
      );
      return;
    }

    if (step === "admin:create_discount_code:percent") {
      const pct = parseInt(text.trim());
      if (isNaN(pct) || pct < 1 || pct > 100)
        return ctx.reply("Enter a number between 1 and 100:");
      ctx.session.data = { ...data, percentOff: pct };
      ctx.session.step = "admin:create_discount_code:uses";
      await ctx.reply(
        "Max uses? (leave empty for unlimited):",
        inlineKeyboard([[BACK_BTN("admin:discounts")]]),
      );
      return;
    }

    if (step === "admin:create_discount_code:uses") {
      const maxUses = text.trim() === "" ? null : parseInt(text.trim());
      ctx.session.data = { ...data, maxUses };
      ctx.session.step = "admin:create_discount_code:stacks";
      await ctx.reply(
        "Does this code stack with active sales?",
        inlineKeyboard([
          [
            {
              text: "✅ Yes — stacks with sales",
              callback_data: "disc:code_stack:yes",
            },
          ],
          [
            {
              text: "❌ No — applies to original price",
              callback_data: "disc:code_stack:no",
            },
          ],
          [BACK_BTN("admin:discounts")],
        ]),
      );
      return;
    }

    if (step === "admin:add_product_disc:percent") {
      const pct = parseInt(text.trim());
      if (isNaN(pct) || pct < 1 || pct > 100)
        return ctx.reply("Enter a number between 1 and 100:");
      const { cityId, districtId, typeId, size } = data;
      await db.insert(productDiscountsTable).values({
        cityId: (cityId as number) ?? null,
        districtId: (districtId as number) ?? null,
        typeId: (typeId as number) ?? null,
        size: (size as string) ?? null,
        percentOff: pct,
      });
      ctx.session.step = undefined;
      await ctx.reply(`✅ Product discount of ${pct}% added.`);
      await showProductDiscounts(ctx);
      return;
    }

    if (step === "admin:add_worker") {
      const query = text.trim();
      const numId = Number(query.replace("@", ""));
      let targetId: number | undefined;
      let username: string | undefined;

      if (!isNaN(numId) && numId > 0) {
        targetId = numId;
      } else {
        const uname = query.replace("@", "");
        const user = await db
          .select()
          .from(usersTable)
          .then((users) =>
            users.find(
              (u) => (u.username ?? "").toLowerCase() === uname.toLowerCase(),
            ),
          );
        if (!user) {
          return ctx.reply(
            "User not found. Make sure they have /start'd the bot first.",
          );
        }
        targetId = user.telegramId;
        username = user.username ?? undefined;
      }

      await db
        .insert(workersTable)
        .values({ telegramId: targetId!, username })
        .onConflictDoNothing();
      ctx.session.step = undefined;
      await ctx.reply(
        `✅ Worker ${username ? `@${username}` : targetId} added.`,
      );
      await showWorkersMenu(ctx);
      return;
    }

    if (step === "admin:add_balance") {
      const [idStr, amtStr] = text.trim().split(" ");
      const targetId = Number(idStr);
      const amount = parseFloat(amtStr ?? "");
      if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
        return ctx.reply(
          "Usage: <telegram_id> <amount>\nExample: 123456789 50.00",
        );
      }
      const user = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, targetId))
        .then((r) => r[0]);
      if (!user) return ctx.reply("User not found.");
      ctx.session.step = undefined;
      ctx.session.data = undefined;
      const newBal = Number(user.balance) + amount;
      await ctx.reply(
        `⚠️ <b>Confirm Balance Top-Up</b>\n\n` +
          `User: <code>${targetId}</code>\n` +
          `Add: <b>${formatEur(amount)}</b>\n` +
          `New balance: <b>${formatEur(newBal)}</b>`,
        {
          parse_mode: "HTML",
          ...inlineKeyboard([
            [
              {
                text: "✅ Confirm",
                callback_data: `tools:confirm_add_balance:${targetId}:${amount.toFixed(2)}`,
              },
            ],
            [BACK_BTN("admin:tools")],
          ]),
        },
      );
      return;
    }

    if (step === "admin:bulk_price") {
      const typeId = ctx.session.data?.typeId as number | undefined;
      const newPrice = parseFloat(text.trim().replace(",", "."));
      if (typeId === undefined || isNaN(newPrice) || newPrice <= 0) {
        return ctx.reply("Enter a valid price, e.g. 25.00");
      }
      await applyBulkPrice(ctx, typeId, newPrice);
      return;
    }

    if (step === "admin:add_admin") {
      ctx.session.step = undefined;
      await addAdmin(ctx, text.trim());
      return;
    }

    if (step === "admin:change_wallet") {
      ctx.session.step = undefined;
      await doChangeWallet(ctx, text.trim());
      return;
    }

    if (step === "admin:add_balance_for_user") {
      const targetId = data["targetUserId"] as number;
      const amount = parseFloat(text.trim());
      if (isNaN(amount) || amount <= 0)
        return ctx.reply("Enter a valid amount (e.g. 50.00):");
      const user = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, targetId))
        .then((r) => r[0]);
      if (!user) return ctx.reply("User not found.");
      ctx.session.step = undefined;
      ctx.session.data = undefined;
      const newBal = Number(user.balance) + amount;
      await ctx.reply(
        `⚠️ <b>Confirm Balance Top-Up</b>\n\n` +
          `User: <code>${targetId}</code>\n` +
          `Add: <b>${formatEur(amount)}</b>\n` +
          `New balance: <b>${formatEur(newBal)}</b>`,
        {
          parse_mode: "HTML",
          ...inlineKeyboard([
            [
              {
                text: "✅ Confirm",
                callback_data: `users:confirm_add_bal:${targetId}:${amount.toFixed(2)}`,
              },
            ],
            [{ text: "✖ Cancel", callback_data: `users:view:${targetId}` }],
          ]),
        },
      );
      return;
    }

    if (step === "admin:tier_add:name") {
      ctx.session.data = { ...data, tierName: text.trim() };
      ctx.session.step = "admin:tier_add:threshold";
      await ctx.reply(
        "Enter threshold (number of purchases or EUR spent):",
        inlineKeyboard([[BACK_BTN("admin:discounts")]]),
      );
      return;
    }

    if (step === "admin:tier_add:threshold") {
      const threshold = parseInt(text.trim());
      if (isNaN(threshold)) return ctx.reply("Enter a valid number:");
      ctx.session.data = { ...data, threshold };
      ctx.session.step = "admin:tier_add:discount";
      await ctx.reply(
        "Enter global discount % (0 for none):",
        inlineKeyboard([[BACK_BTN("admin:discounts")]]),
      );
      return;
    }

    if (step === "admin:tier_add:discount") {
      const discount = parseInt(text.trim());
      if (isNaN(discount)) return ctx.reply("Enter a valid number:");
      const { tierName, threshold } = data;
      await db.insert(tierLevelsTable).values({
        name: tierName as string,
        threshold: threshold as number,
        globalDiscountPercent: discount,
      });
      ctx.session.step = undefined;
      await ctx.reply(`✅ Tier <b>${tierName}</b> added.`, {
        parse_mode: "HTML",
      });
      await showTierSystem(ctx);
      return;
    }

    if (step === "admin:payment_recovery") {
      const queueId = text.trim().toUpperCase();
      const purchase = await db
        .select()
        .from(purchasesTable)
        .where(eq(purchasesTable.queueId, queueId))
        .then((r) => r[0]);
      ctx.session.step = undefined;
      if (!purchase) {
        return ctx.reply("Order not found.");
      }
      await renderOrderRecovery(ctx, purchase);
      return;
    }

    if (step === "admin:add_backup_token") {
      const tokenVal = text.trim();
      // Validate the token with Telegram before saving
      try {
        const testBot = new Telegraf(tokenVal);
        const me = await testBot.telegram.getMe();
        await db
          .insert(backupTokensTable)
          .values({ token: tokenVal })
          .onConflictDoNothing();
        ctx.session.step = undefined;
        await ctx.reply(`✅ Backup token saved — @${me.username}`);
        await showBackupTokens(ctx);
      } catch {
        await ctx.reply(
          "❌ That token is invalid or Telegram rejected it. Please check it and try again, or press Back.",
        );
      }
      return;
    }

    if (step === "admin:set_home_media") {
      if (!(await isAdmin(ctx.from.id))) return;
      const msg = ctx.message as any;
      let fileId: string | undefined;
      let mediaType: string | undefined;
      if (msg?.animation) {
        fileId = msg.animation.file_id;
        mediaType = "animation";
      } else if (msg?.video) {
        fileId = msg.video.file_id;
        mediaType = "video";
      } else if (msg?.photo?.length) {
        fileId = msg.photo[msg.photo.length - 1].file_id;
        mediaType = "photo";
      } else if (msg?.document) {
        fileId = msg.document.file_id;
        mediaType = "photo";
      }
      if (!fileId) {
        await ctx.reply("Please send a GIF, photo, or video file.");
        return;
      }
      await setSetting("home_media_file_id", fileId);
      await setSetting("home_media_type", mediaType!);
      ctx.session.step = undefined;
      await ctx.reply("✅ Home screen media updated! It will show on the next /start.");
      await showToolsMenu(ctx);
      return;
    }

    if (step === "shop:review") {
      const user = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, ctx.from.id))
        .then((r) => r[0]);
      await db.insert(reviewsTable).values({
        userId: ctx.from.id,
        username: user?.username,
        text,
      });
      ctx.session.step = undefined;
      await ctx.reply("⭐ Thank you for your review!");
      await showHome(ctx);
      return;
    }

    if (
      step === "shop:apply_code_paynow" ||
      step === "shop:apply_code_basket"
    ) {
      const returnTo = step === "shop:apply_code_paynow" ? "paynow" : "basket";
      await applyDiscountCode(ctx, text, returnTo);
      return;
    }

    if (step === "topup:enter_amount") {
      await handleTopUpAmount(ctx, text);
      return;
    }

    if (step === "klad:size_custom") {
      const { cityId, districtId, typeId, price } = data;
      const size = text.trim();
      ctx.session.data = {
        cityId,
        districtId,
        typeId,
        size,
        price,
        addedBy: ctx.from.id,
      };
      ctx.session.step = "admin:add_product:content";
      await ctx.reply(
        "Send the product files (all files go to ONE buyer). Type /done when finished.",
        inlineKeyboard([[BACK_BTN("klad:exit")]]),
      );
      return;
    }
  });

  async function handleFileMessage(ctx: any) {
    const step = ctx.session.step as string | undefined;
    const data = (ctx.session.data ?? {}) as Record<string, any>;

    if (step === "admin:set_home_media") {
      if (!(await isAdmin(ctx.from.id))) return;
      const msg = ctx.message as any;
      let mediaFileId: string | undefined;
      let mediaType: string | undefined;
      if (msg?.animation) {
        mediaFileId = msg.animation.file_id;
        mediaType = "animation";
      } else if (msg?.video) {
        mediaFileId = msg.video.file_id;
        mediaType = "video";
      } else if (msg?.photo?.length) {
        mediaFileId = msg.photo[msg.photo.length - 1].file_id;
        mediaType = "photo";
      } else if (msg?.document) {
        mediaFileId = msg.document.file_id;
        mediaType = "photo";
      }
      if (!mediaFileId) {
        await ctx.reply("Please send a GIF, photo, or video file.");
        return;
      }
      await setSetting("home_media_file_id", mediaFileId);
      await setSetting("home_media_type", mediaType!);
      ctx.session.step = undefined;
      await ctx.reply(
        "✅ Home screen media updated! It will show on the next /start.",
      );
      await showToolsMenu(ctx);
      return;
    }

    const validSteps = [
      "admin:add_product:content",
      "admin:add_product:more_files",
      "admin:add_product:bulk",
    ];
    if (!step || !validSteps.includes(step)) return;

    const msg = ctx.message as any;
    let fileId: string;
    let fileType: string;

    if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      fileType = "photo";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      fileType = "document";
    } else if (msg.video) {
      fileId = msg.video.file_id;
      fileType = "video";
    } else if (msg.animation) {
      fileId = msg.animation.file_id;
      fileType = "animation";
    } else {
      return;
    }

    const { cityId, districtId, typeId, size, price, addedBy } = data;
    const workerData = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.telegramId, addedBy as number))
      .then((r) => r[0]);
    const userRow = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, addedBy as number))
      .then((r) => r[0]);
    const workerTag =
      workerData?.username ?? userRow?.username ?? String(addedBy);

    const currentProductId = data["currentProductId"] as number | undefined;

    if (step === "admin:add_product:content" && !currentProductId) {
      const [inserted] = await db
        .insert(productsTable)
        .values({
          cityId: cityId as number,
          districtId: districtId as number,
          typeId: typeId as number,
          size: size as string,
          price: (price as number).toFixed(2),
          fileId,
          fileType: fileType as any,
          addedBy: addedBy as number,
          workerTag,
          status: "available",
        })
        .returning();

      if (workerData) {
        await db
          .update(workersTable)
          .set({ totalUploads: (workerData.totalUploads || 0) + 1 })
          .where(eq(workersTable.id, workerData.id));
      }

      ctx.session.data = { ...data, currentProductId: inserted?.id };
      ctx.session.step = "admin:add_product:more_files";
      await ctx.reply(
        "✅ File saved! Send more files to add to this lot, or press Done to finish.",
        inlineKeyboard([[{ text: "✅ Done", callback_data: "klad:done" }]]),
      );
    } else if (
      (step === "admin:add_product:more_files" ||
        step === "admin:add_product:content") &&
      currentProductId
    ) {
      const product = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, currentProductId))
        .then((r) => r[0]);

      if (product) {
        const existing = product.mediaFiles
          ? (JSON.parse(product.mediaFiles) as {
              fileId: string;
              fileType: string;
            }[])
          : [];
        existing.push({ fileId, fileType });
        await db
          .update(productsTable)
          .set({ mediaFiles: JSON.stringify(existing) })
          .where(eq(productsTable.id, currentProductId));
      }
      const newFileCount = ((data["fileCount"] as number) ?? 1) + 1;
      await ctx.reply(
        `✅ File ${newFileCount} added to lot. Send more or press Done to finish.`,
        inlineKeyboard([[{ text: "✅ Done", callback_data: "klad:done" }]]),
      );
      ctx.session.data = {
        ...data,
        fileCount: newFileCount,
      };
    } else if (step === "admin:add_product:bulk") {
      const [inserted] = await db
        .insert(productsTable)
        .values({
          cityId: cityId as number,
          districtId: districtId as number,
          typeId: typeId as number,
          size: size as string,
          price: (price as number).toFixed(2),
          fileId,
          fileType: fileType as any,
          addedBy: addedBy as number,
          workerTag,
          status: "available",
        })
        .returning();

      if (workerData) {
        await db
          .update(workersTable)
          .set({ totalUploads: (workerData.totalUploads || 0) + 1 })
          .where(eq(workersTable.id, workerData.id));
      }

      const bulkCount = ((data["bulkCount"] as number) ?? 0) + 1;
      ctx.session.data = { ...data, bulkCount };
      await ctx.reply(
        `✅ Unit ${bulkCount} added. Send another file or press Done to finish.`,
        inlineKeyboard([[{ text: "✅ Done", callback_data: "klad:done" }]]),
      );
    }
  }

  bot.on(message("photo"), handleFileMessage);
  bot.on(message("document"), handleFileMessage);
  bot.on(message("video"), handleFileMessage);
  bot.on(message("animation"), handleFileMessage);

  bot.on("callback_query", async (ctx: any) => {
    const cbData: string = ctx.callbackQuery.data ?? "";
    await ctx.answerCbQuery().catch(() => {});
    const [action, ...parts] = cbData.split(":");

    try {
      if (action === "admin") {
        if (!(await isAdmin(ctx.from.id)))
          return ctx.answerCbQuery("Not authorized.", { show_alert: true });
        const sub = parts[0];
        if (sub === "main") return showAdminMenu(ctx);
        if (sub === "geography") return showGeographyMenu(ctx);
        if (sub === "products") return showProductsMenu(ctx);
        if (sub === "users") return showUsersMenu(ctx);
        if (sub === "analytics") return showAnalytics(ctx);
        if (sub === "comms") return showCommsMenu(ctx);
        if (sub === "discounts") return showDiscountsMenu(ctx);
        if (sub === "tools") return showToolsMenu(ctx);
        if (sub === "workers") return showWorkersMenu(ctx);
        if (sub === "autoads") {
          return ctx.editMessageText(
            "📡 <b>Auto Ads System</b>\n\nAuto Ads requires separate Telegram user accounts.\n\n<i>Contact support for configuration assistance.</i>",
            {
              parse_mode: "HTML",
              ...inlineKeyboard([[BACK_BTN("admin:main")]]),
            },
          );
        }
        if (sub === "purchases") {
          const page = parseInt(parts[1] ?? "0");
          return showPurchases(ctx, page);
        }
        if (sub === "manage_admins") return showAdminManagers(ctx);
        return;
      }

      if (action === "admin_mgr") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "add") {
          ctx.session.step = "admin:add_admin";
          return ctx.editMessageText(
            "Enter the Telegram ID of the user to make admin:",
            inlineKeyboard([[BACK_BTN("admin:manage_admins")]]),
          );
        }
        if (sub === "remove") return removeAdmin(ctx, parseInt(parts[1]!));
        return;
      }

      if (action === "geo") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "add_city") {
          ctx.session.step = "admin:add_city";
          return ctx.editMessageText(
            "Enter the new city name:",
            inlineKeyboard([[BACK_BTN("admin:geography")]]),
          );
        }
        if (sub === "cities") return showCitiesList(ctx);
        if (sub === "city_detail")
          return showCityDetail(ctx, parseInt(parts[1]!));
        if (sub === "rename_city") {
          ctx.session.step = "admin:rename_city";
          ctx.session.data = { cityId: parseInt(parts[1]!) };
          return ctx.editMessageText(
            "Enter new name for this city:",
            inlineKeyboard([[BACK_BTN("admin:geography")]]),
          );
        }
        if (sub === "del_city") return deleteCity(ctx, parseInt(parts[1]!));
        if (sub === "confirm_del_city") return confirmDeleteCity(ctx, parseInt(parts[1]!));
        if (sub === "districts_select") return showDistrictsCitySelect(ctx);
        if (sub === "dist_city")
          return showDistrictsList(ctx, parseInt(parts[1]!));
        if (sub === "dist_detail")
          return showDistrictDetail(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
          );
        if (sub === "add_dist") {
          ctx.session.step = "admin:add_district";
          ctx.session.data = { cityId: parseInt(parts[1]!) };
          return ctx.editMessageText(
            "Enter the district name:",
            inlineKeyboard([[BACK_BTN(`geo:city_detail:${parts[1]}`)]]),
          );
        }
        if (sub === "rename_dist") {
          ctx.session.step = "admin:rename_district";
          ctx.session.data = {
            districtId: parseInt(parts[1]!),
            cityId: parseInt(parts[2]!),
          };
          return ctx.editMessageText(
            "Enter new name for this district:",
            inlineKeyboard([[BACK_BTN(`geo:city_detail:${parts[2]}`)]]),
          );
        }
        if (sub === "del_dist")
          return deleteDistrict(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "confirm_del_dist")
          return confirmDeleteDistrict(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        return;
      }

      if (action === "prod") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "types") return showProductTypes(ctx);
        if (sub === "add_type") {
          ctx.session.step = "admin:add_type_name";
          return ctx.editMessageText(
            "Enter the product type name (e.g. Coffee):",
            inlineKeyboard([[BACK_BTN("admin:products")]]),
          );
        }
        if (sub === "type_detail")
          return showTypeDetail(ctx, parseInt(parts[1]!));
        if (sub === "rename_type") {
          ctx.session.step = "admin:rename_type";
          ctx.session.data = { typeId: parseInt(parts[1]!) };
          return ctx.editMessageText(
            "Enter new name:",
            inlineKeyboard([[BACK_BTN("prod:types")]]),
          );
        }
        if (sub === "del_type")
          return deleteProductType(ctx, parseInt(parts[1]!));
        if (sub === "stock") return showStock(ctx);
        if (sub === "empty") return showEmptyProductStart(ctx);
        if (sub === "manage") return showManageProducts(ctx);
        if (sub === "add" || sub === "bulk_add") {
          const cityId = parts[1] ? parseInt(parts[1]) : undefined;
          const districtId = parts[2] ? parseInt(parts[2]) : undefined;
          const typeId = parts[3] ? parseInt(parts[3]) : undefined;
          if (cityId && districtId && typeId) {
            const isBulk = sub === "bulk_add";
            ctx.session.step = isBulk
              ? "admin:add_product:bulk_setup"
              : "admin:add_product:size";
            ctx.session.data = {
              cityId,
              districtId,
              typeId,
              addedBy: ctx.from.id,
              isBulk,
            };
            return ctx.editMessageText("Enter the size (e.g. 5g, 1 unit):");
          }
          const cities = await getCities();
          const mode = sub === "bulk_add" ? "bulk" : "single";
          const kb = inlineKeyboard([
            ...cities.map((c) => [
              {
                text: c.name,
                callback_data: `prod_add_flow:city:${c.id}:${mode}`,
              },
            ]),
            [BACK_BTN("admin:products")],
          ]);
          return ctx.editMessageText("Select city:", { ...kb });
        }
        if (sub === "log") {
          const products = await db
            .select()
            .from(productsTable)
            .orderBy(desc(productsTable.createdAt))
            .limit(20);
          let text = "📋 <b>Added Products Log</b>\n\n";
          for (const p of products) {
            text += `• ${p.size} — ${formatEur(p.price)} — ${p.status} — ${p.workerTag ? `@${p.workerTag}` : "admin"}\n`;
          }
          return ctx.editMessageText(text, {
            parse_mode: "HTML",
            ...inlineKeyboard([[BACK_BTN("admin:products")]]),
          });
        }
        if (sub === "reassign") return showReassignSourceTypes(ctx);
        if (sub === "reassign_from")
          return showReassignDestTypes(ctx, parseInt(parts[1]!));
        if (sub === "reassign_to")
          return doReassignType(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "bulk_price") return showBulkPriceTypes(ctx);
        if (sub === "bulk_price_type") {
          ctx.session.step = "admin:bulk_price";
          ctx.session.data = { typeId: parseInt(parts[1]!) };
          return ctx.editMessageText(
            "💰 Enter the new price (EUR) to apply to all available products of this type:",
            inlineKeyboard([[BACK_BTN("prod:bulk_price")]]),
          );
        }
        return;
      }

      if (action === "eprod") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "catalog") return showCatalog(ctx);
        if (sub === "cat_type")
          return showCatalogType(ctx, parseInt(parts[1]!));
        if (sub === "cat_del")
          return deleteCatalogSlot(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
          );
        if (sub === "cat_delall")
          return deleteCatalogType(ctx, parseInt(parts[1]!));
        if (sub === "new_type") {
          ctx.session.step = "eprod:new_type_name";
          ctx.session.data = {};
          return ctx.editMessageText(
            "Enter the new product name (e.g. ❄️ Snaiges):",
            inlineKeyboard([[BACK_BTN("prod:empty")]]),
          );
        }
        if (sub === "type") {
          const typeId = parseInt(parts[1]!);
          ctx.session.data = { eprodTypeId: typeId };
          return promptEmptyProductSizes(ctx, true);
        }
        if (sub === "city_toggle")
          return toggleEmptyProductCity(ctx, parseInt(parts[1]!));
        if (sub === "cities_done") return showEmptyProductDistricts(ctx);
        if (sub === "cities_back") return showEmptyProductCities(ctx);
        if (sub === "dist_toggle")
          return toggleEmptyProductDistrict(ctx, parseInt(parts[1]!));
        if (sub === "dist_all") return selectAllEmptyProductDistricts(ctx);
        if (sub === "dists_done") return showEmptyProductConfirm(ctx);
        if (sub === "dists_back") return showEmptyProductDistricts(ctx);
        if (sub === "confirm") return createEmptyProductSlots(ctx);
        return;
      }

      if (action === "prod_add_flow") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        const isBulk = parts[parts.length - 1] === "bulk";
        const mode = isBulk ? "bulk" : "single";
        if (sub === "city") {
          const cityId = parseInt(parts[1]!);
          const districts = await getDistricts(cityId);
          const kb = inlineKeyboard([
            ...districts.map((d) => [
              {
                text: d.name,
                callback_data: `prod_add_flow:dist:${cityId}:${d.id}:${mode}`,
              },
            ]),
            [BACK_BTN("admin:products")],
          ]);
          return ctx.editMessageText("Select district:", { ...kb });
        }
        if (sub === "dist") {
          const cityId = parseInt(parts[1]!);
          const distId = parseInt(parts[2]!);
          const types = await getProductTypes();
          const kb = inlineKeyboard([
            ...types.map((t) => [
              {
                text: `${t.emoji} ${t.name}`,
                callback_data: `prod_add_flow:type:${cityId}:${distId}:${t.id}:${mode}`,
              },
            ]),
            [BACK_BTN(`prod_add_flow:city:${cityId}:${mode}`)],
          ]);
          return ctx.editMessageText("Select product type:", { ...kb });
        }
        if (sub === "type") {
          const cityId = parseInt(parts[1]!);
          const distId = parseInt(parts[2]!);
          const typeId = parseInt(parts[3]!);
          ctx.session.step = isBulk
            ? "admin:add_product:bulk_setup"
            : "admin:add_product:size";
          ctx.session.data = {
            cityId,
            districtId: distId,
            typeId,
            addedBy: ctx.from.id,
            isBulk,
          };
          return ctx.editMessageText("Enter size (e.g. 5g, 1 unit):");
        }
        return;
      }

      if (action === "manage_prod") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "city")
          return showManageProdDistricts(ctx, parseInt(parts[1]!));
        if (sub === "dist")
          return showManageProdTypes(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
          );
        if (sub === "type") {
          const page = parseInt(parts[4] ?? "0");
          return showProductList(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
            page,
          );
        }
        if (sub === "del") {
          const productId = parseInt(parts[1]!);
          // Hard-delete, but only while the unit is still available. Sold units
          // are kept so purchase history and refunds stay intact.
          await db
            .delete(productsTable)
            .where(
              and(
                eq(productsTable.id, productId),
                eq(productsTable.status, "available"),
              ),
            );
          await ctx.answerCbQuery("Product deleted.");
          const page = parseInt(parts[5] ?? "0");
          return showProductList(
            ctx,
            parseInt(parts[2]!),
            parseInt(parts[3]!),
            parseInt(parts[4]!),
            page,
          );
        }
        if (sub === "delall") {
          const c = parseInt(parts[1]!);
          const d = parseInt(parts[2]!);
          const t = parseInt(parts[3]!);
          return ctx.editMessageText(
            "⚠️ <b>Delete ALL available stock</b> for this city/district/type?\n\nThis permanently removes every available unit here. Sold units are kept.",
            {
              parse_mode: "HTML",
              ...inlineKeyboard([
                [
                  {
                    text: "🗑 Yes, delete all",
                    callback_data: `manage_prod:confirm_delall:${c}:${d}:${t}`,
                  },
                ],
                [BACK_BTN(`manage_prod:dist:${c}:${d}`)],
              ]),
            },
          );
        }
        if (sub === "confirm_delall")
          return deleteAllProducts(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
          );
        return;
      }

      if (action === "users") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "search") {
          ctx.session.step = "admin:search_user";
          return ctx.editMessageText(
            "Enter a Telegram ID or part of a @username:",
            inlineKeyboard([[BACK_BTN("admin:users")]]),
          );
        }
        if (sub === "recent") {
          const recent = await getRecentlyActiveUsers();
          if (recent.length === 0) {
            return ctx.editMessageText("No users yet.", {
              ...inlineKeyboard([[BACK_BTN("admin:users")]]),
            });
          }
          const rows = recent.map((u) => [
            {
              text: u.username ? `@${u.username}` : `ID ${u.telegramId}`,
              callback_data: `users:view:${u.telegramId}`,
            },
          ]);
          rows.push([BACK_BTN("admin:users")]);
          return ctx.editMessageText("🕒 <b>Recently Active Users</b>", {
            parse_mode: "HTML",
            ...inlineKeyboard(rows),
          });
        }
        if (sub === "view")
          return showUserProfile(ctx, String(parseInt(parts[1]!)));
        if (sub === "confirm_add_bal") {
          const targetId = parseInt(parts[1]!);
          const amount = parseFloat(parts[2]!);
          if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
            await ctx.answerCbQuery("Nothing to confirm.", { show_alert: true });
            return showUsersMenu(ctx);
          }
          const newBal = await applyAddBalance(bot.telegram, targetId, amount);
          if (newBal === null) {
            await ctx.answerCbQuery("User not found.", { show_alert: true });
            return showUsersMenu(ctx);
          }
          await ctx.answerCbQuery(
            `Added ${formatEur(amount)}. New balance ${formatEur(newBal)}.`,
            { show_alert: true },
          );
          return showUserProfile(ctx, String(targetId));
        }
        if (sub === "ban") return banUser(ctx, parseInt(parts[1]!));
        if (sub === "unban") return unbanUser(ctx, parseInt(parts[1]!));
        if (sub === "mk_reseller")
          return makeReseller(ctx, parseInt(parts[1]!));
        if (sub === "rm_reseller")
          return removeReseller(ctx, parseInt(parts[1]!));
        if (sub === "export") return exportUsersCsv(ctx);
        if (sub === "resellers") {
          const resellers = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.isReseller, true));
          let text = "👑 <b>Resellers</b>\n\n";
          if (resellers.length === 0) text += "No resellers.";
          else
            text += resellers
              .map((r) =>
                r.username ? `• @${r.username}` : `• ${r.telegramId}`,
              )
              .join("\n");
          return ctx.editMessageText(text, {
            parse_mode: "HTML",
            ...inlineKeyboard([[BACK_BTN("admin:users")]]),
          });
        }
        if (sub === "add_bal") {
          ctx.session.step = "admin:add_balance_for_user";
          ctx.session.data = { targetUserId: parseInt(parts[1]!) };
          return ctx.editMessageText(
            "Enter the amount to add (e.g. 50.00):",
            inlineKeyboard([[BACK_BTN("admin:users")]]),
          );
        }
        return;
      }

      if (action === "analytics") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "report") return showReportMenu(ctx);
        if (sub === "today") return salesToday(ctx, parseInt(parts[1] ?? "0"));
        if (sub === "view_sale") return viewSaleContent(ctx, parseInt(parts[1]!));
        if (sub === "rpt") return generateReport(ctx, parts[1]!);
        if (sub === "city") return salesByCity(ctx);
        if (sub === "type") return salesByType(ctx);
        if (sub === "top") {
          const { count: drizzleCount, sum: drizzleSum } = await import(
            "drizzle-orm"
          );
          const rows = await db
            .select({
              size: productsTable.size,
              cnt: drizzleCount(),
              total: drizzleSum(purchasesTable.pricePaid),
            })
            .from(purchasesTable)
            .innerJoin(
              productsTable,
              eq(purchasesTable.productId, productsTable.id),
            )
            .where(eq(purchasesTable.refunded, false))
            .groupBy(productsTable.size)
            .orderBy(desc(drizzleCount()))
            .limit(10);
          let text = "🏆 <b>Top Products</b>\n\n";
          rows.forEach((r, i) => {
            text += `${i + 1}. ${r.size} — ${r.cnt} sales — ${formatEur(r.total ?? 0)}\n`;
          });
          return ctx.editMessageText(text, {
            parse_mode: "HTML",
            ...inlineKeyboard([[BACK_BTN("admin:analytics")]]),
          });
        }
        return;
      }

      if (action === "comms") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "broadcast") {
          ctx.session.step = "admin:broadcast";
          return ctx.editMessageText(
            "Type the message to broadcast (HTML supported):",
            inlineKeyboard([[BACK_BTN("admin:comms")]]),
          );
        }
        if (sub === "welcome") return showWelcomeMenu(ctx);
        if (sub === "welcome_add") {
          ctx.session.step = "admin:welcome_template";
          return ctx.editMessageText(
            "Write the welcome template text:",
            inlineKeyboard([[BACK_BTN("admin:comms")]]),
          );
        }
        if (sub === "welcome_activate")
          return activateWelcomeTemplate(ctx, parseInt(parts[1]!));
        if (sub === "welcome_del")
          return deleteWelcomeTemplate(ctx, parseInt(parts[1]!));
        if (sub === "welcome_reset") {
          await db.update(welcomeTemplatesTable).set({ isActive: false });
          await ctx.answerCbQuery("Welcome message reset to default.");
          return showWelcomeMenu(ctx);
        }
        if (sub === "reviews") {
          const page = parseInt(parts[1] ?? "0");
          return showReviews(ctx, page);
        }
        if (sub === "del_review") {
          await db
            .delete(reviewsTable)
            .where(eq(reviewsTable.id, parseInt(parts[1]!)));
          await ctx.answerCbQuery("Review deleted.");
          return showReviews(ctx, parseInt(parts[2] ?? "0"));
        }
        return;
      }

      if (action === "disc") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "codes") return showDiscountCodes(ctx);
        if (sub === "create_code") {
          ctx.session.step = "admin:create_discount_code:name";
          return ctx.editMessageText(
            "Enter the discount code (will be uppercased):",
            inlineKeyboard([[BACK_BTN("admin:discounts")]]),
          );
        }
        if (sub === "del_code")
          return deleteDiscountCode(ctx, parseInt(parts[1]!));
        if (sub === "code_stack") {
          const stacks = parts[1] === "yes";
          const d = ctx.session.data ?? {};
          await db.insert(discountCodesTable).values({
            code: (d as any)["code"],
            percentOff: (d as any)["percentOff"],
            maxUses: (d as any)["maxUses"],
            stacksWithSale: stacks,
          });
          ctx.session.step = undefined;
          await ctx.editMessageText(
            `✅ Discount code <b>${(d as any)["code"]}</b> created.`,
            { parse_mode: "HTML" },
          );
          return showDiscountCodes(ctx);
        }
        if (sub === "product") return showProductDiscounts(ctx);
        if (sub === "add_product_disc") {
          ctx.session.step = "admin:add_product_disc:percent";
          ctx.session.data = {};
          const types = await getProductTypes();
          const kb = inlineKeyboard([
            [
              {
                text: "All products",
                callback_data: "disc:prod_disc_scope:all",
              },
            ],
            ...types.map((t) => [
              {
                text: `${t.emoji} ${t.name}`,
                callback_data: `disc:prod_disc_scope:type:${t.id}`,
              },
            ]),
            [BACK_BTN("admin:discounts")],
          ]);
          return ctx.editMessageText("Select scope for this discount:", {
            ...kb,
          });
        }
        if (sub === "prod_disc_scope") {
          const scope = parts[1];
          if (scope === "all") {
            ctx.session.step = "admin:add_product_disc:percent";
            return ctx.editMessageText(
              "Enter discount % (1-100):",
              inlineKeyboard([[BACK_BTN("admin:discounts")]]),
            );
          }
          if (scope === "type") {
            ctx.session.data = {
              ...(ctx.session.data ?? {}),
              typeId: parseInt(parts[2]!),
            };
            ctx.session.step = "admin:add_product_disc:percent";
            return ctx.editMessageText(
              "Enter discount % (1-100):",
              inlineKeyboard([[BACK_BTN("admin:discounts")]]),
            );
          }
          return;
        }
        if (sub === "del_prod_disc") {
          await db
            .delete(productDiscountsTable)
            .where(eq(productDiscountsTable.id, parseInt(parts[1]!)));
          await ctx.answerCbQuery("Discount removed.");
          return showProductDiscounts(ctx);
        }
        if (sub === "reseller") {
          const discounts = await db.select().from(resellerDiscountsTable);
          let text = "👑 <b>Reseller Discounts</b>\n\n";
          if (discounts.length === 0) text += "No reseller discounts set.";
          else discounts.forEach((d) => (text += `• ${d.percentOff}% off\n`));
          return ctx.editMessageText(text, {
            parse_mode: "HTML",
            ...inlineKeyboard([[BACK_BTN("admin:discounts")]]),
          });
        }
        if (sub === "tiers") return showTierSystem(ctx);
        return;
      }

      if (action === "tiers") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "switch") return switchTierMetric(ctx, parts[1] as any);
        if (sub === "reset") return resetTierDefaults(ctx);
        if (sub === "del") return deleteTier(ctx, parseInt(parts[1]!));
        if (sub === "add") {
          ctx.session.step = "admin:tier_add:name";
          return ctx.editMessageText(
            "Enter tier name (e.g. VIP, Bronze):",
            inlineKeyboard([[BACK_BTN("admin:discounts")]]),
          );
        }
        if (sub === "edit") {
          const tier = await db
            .select()
            .from(tierLevelsTable)
            .where(eq(tierLevelsTable.id, parseInt(parts[1]!)))
            .then((r) => r[0]);
          if (!tier) return;
          const kb = inlineKeyboard([[BACK_BTN("disc:tiers")]]);
          return ctx.editMessageText(
            `✏️ <b>${tier.name}</b>\nThreshold: ${tier.threshold}\nDiscount: ${tier.globalDiscountPercent}%`,
            { parse_mode: "HTML", ...kb },
          );
        }
        return;
      }

      if (action === "tools") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "clear_res") return clearAllReservations(ctx);
        if (sub === "payment_recovery") return showPaymentRecoveryMenu(ctx);
        if (sub === "recover_manual") {
          ctx.session.step = "admin:payment_recovery";
          return ctx.editMessageText(
            "Enter the Queue ID to look up:",
            inlineKeyboard([[BACK_BTN("tools:payment_recovery")]]),
          );
        }
        if (sub === "recover")
          return showOrderRecoveryById(ctx, parseInt(parts[1]!));
        if (sub === "refund") return showRecentPurchasesForRefund(ctx);
        if (sub === "do_refund") return showRefundConfirm(ctx, parseInt(parts[1]!));
        if (sub === "confirm_refund")
          return doRefund(ctx, parseInt(parts[1]!));
        if (sub === "confirm_add_balance") {
          const targetId = parseInt(parts[1]!);
          const amount = parseFloat(parts[2]!);
          if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
            await ctx.answerCbQuery("Nothing to confirm.", { show_alert: true });
            return showToolsMenu(ctx);
          }
          const newBal = await applyAddBalance(bot.telegram, targetId, amount);
          if (newBal === null) {
            await ctx.answerCbQuery("User not found.", { show_alert: true });
            return showToolsMenu(ctx);
          }
          await ctx.editMessageText(
            `✅ Added ${formatEur(amount)} to user <code>${targetId}</code>. New balance: <b>${formatEur(newBal)}</b>.`,
            { parse_mode: "HTML", ...inlineKeyboard([[BACK_BTN("admin:tools")]]) },
          );
          return;
        }
        if (sub === "backup_tokens") return showBackupTokens(ctx);
        if (sub === "del_token") return deleteBackupToken(ctx, parseInt(parts[1]!));
        if (sub === "add_token") {
          ctx.session.step = "admin:add_backup_token";
          return ctx.editMessageText(
            "Send the backup bot token:",
            inlineKeyboard([[BACK_BTN("admin:tools")]]),
          );
        }
        if (sub === "add_balance") {
          ctx.session.step = "admin:add_balance";
          return ctx.editMessageText(
            "Enter <telegram_id> <amount> (e.g. 123456789 50.00):",
            inlineKeyboard([[BACK_BTN("admin:tools")]]),
          );
        }
        if (sub === "change_wallet") return showChangeWallet(ctx);
        if (sub === "reset_wallet") return resetWalletToDefault(ctx);
        if (sub === "set_media") {
          ctx.session.step = "admin:set_home_media";
          return ctx.editMessageText(
            "🖼 Send me the <b>GIF, photo, or video</b> you want to show on the home screen.\n\nSend /terminate to cancel.",
            {
              parse_mode: "HTML",
              ...inlineKeyboard([[BACK_BTN("admin:tools")]]),
            },
          );
        }
        if (sub === "remove_media") {
          await setSetting("home_media_file_id", "");
          await ctx.answerCbQuery("✅ Home media removed.", { show_alert: true });
          return showToolsMenu(ctx);
        }
        return;
      }

      if (action === "workers") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "add") {
          ctx.session.step = "admin:add_worker";
          return ctx.editMessageText(
            "Enter the worker's Telegram ID or @username:",
            inlineKeyboard([[BACK_BTN("admin:workers")]]),
          );
        }
        if (sub === "list") return showWorkersList(ctx);
        if (sub === "detail") return showWorkerDetail(ctx, parseInt(parts[1]!));
        if (sub === "enable")
          return toggleWorker(ctx, parseInt(parts[1]!), true);
        if (sub === "disable")
          return toggleWorker(ctx, parseInt(parts[1]!), false);
        if (sub === "remove") return removeWorker(ctx, parseInt(parts[1]!));
        return;
      }

      if (action === "shop") {
        const sub = parts[0];
        if (sub === "home") return showHome(ctx);
        if (sub === "profile") return showProfile(ctx);
        if (sub === "pricelist") return showPriceList(ctx);
        if (sub === "cities") return showShopCities(ctx);
        if (sub === "dist") return showShopDistricts(ctx, parseInt(parts[1]!));
        if (sub === "types")
          return showShopTypes(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "sizes")
          return showShopSizes(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
          );
        if (sub === "detail") {
          const size = decodeURIComponent(parts[4]!);
          return showSizeDetail(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
            size,
          );
        }
        if (sub === "buy") {
          const size = decodeURIComponent(parts[4]!);
          return addToBasket(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
            size,
          );
        }
        if (sub === "paynow") {
          const size = decodeURIComponent(parts[4]!);
          return payNow(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
            size,
          );
        }
        if (sub === "paynow_summary") return showPaymentSummary(ctx);
        if (sub === "do_paynow") return doPayNow(ctx);
        if (sub === "apply_code_paynow") {
          ctx.session.step = "shop:apply_code_paynow";
          return ctx.editMessageText(
            "🎟 Enter your discount code:",
            inlineKeyboard([[BACK_BTN("shop:paynow_summary")]]),
          );
        }
        if (sub === "apply_code_basket") {
          ctx.session.step = "shop:apply_code_basket";
          return ctx.editMessageText(
            "🎟 Enter your discount code:",
            inlineKeyboard([[BACK_BTN("shop:basket")]]),
          );
        }
        if (sub === "basket") return showBasket(ctx);
        if (sub === "checkout") return checkout(ctx);
        if (sub === "clear_basket") {
          await releaseBasket(ctx.from.id);
          await ctx.answerCbQuery("Basket cleared.");
          return showBasket(ctx);
        }
        if (sub === "orders") {
          const page = parseInt(parts[1] ?? "0");
          return showOrders(ctx, page);
        }
        if (sub === "topup") return showTopUpMenu(ctx);
        if (sub === "reviews_menu") return showReviewsMenu(ctx);
        if (sub === "review_prompt") {
          ctx.session.step = "shop:review";
          return ctx.editMessageText("⭐ Write your review:", {
            ...inlineKeyboard([[BACK_BTN("shop:reviews_menu")]]),
          });
        }
        if (sub === "view_reviews") {
          return showCustomerReviews(ctx);
        }
        return;
      }

      if (action === "pay") {
        const sub = parts[0];
        if (sub === "menu") {
          const data = ctx.session.data ?? {};
          const total = Number(
            data["discountedTotal"] ?? data["pendingEur"] ?? 0,
          );
          return showCryptoMenu(ctx, total);
        }
        if (sub === "crypto") {
          if (parts[1] === "sol") return showSolInvoice(ctx);
          return ctx.answerCbQuery("Only SOL is currently available.", {
            show_alert: true,
          });
        }
        if (sub === "check_sol") return checkSolPayment(ctx);
        if (sub === "cancel") {
          cancelPendingInvoice(ctx.from.id);
          await releaseBasket(ctx.from.id);
          ctx.session.step = undefined;
          ctx.session.data = undefined;
          return showHome(ctx);
        }
        return;
      }

      if (action === "topup") {
        const sub = parts[0];
        if (sub === "start") return showTopUpMenu(ctx);
        if (sub === "check") return checkTopUpPayment(ctx);
        if (sub === "cancel") return cancelTopUp(ctx);
        return;
      }

      if (action === "klad") {
        if (!(await isWorker(ctx.from.id)) && !(await isAdmin(ctx.from.id)))
          return ctx.answerCbQuery("Not authorized.", { show_alert: true });
        const sub = parts[0];
        if (sub === "exit") return showHome(ctx);
        if (sub === "upload") return showKladCities(ctx);
        if (sub === "city") return showKladDistricts(ctx, parseInt(parts[1]!));
        if (sub === "dist")
          return showKladTypes(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "type")
          return showKladSizes(
            ctx,
            parseInt(parts[1]!),
            parseInt(parts[2]!),
            parseInt(parts[3]!),
          );
        if (sub === "size") {
          const cityId = parseInt(parts[1]!);
          const districtId = parseInt(parts[2]!);
          const typeId = parseInt(parts[3]!);
          const size = decodeURIComponent(parts[4]!);

          // Price is inherited from the admin-defined catalog slot if present,
          // otherwise from any existing real product for this combination.
          const slot = await db
            .select()
            .from(productSlotsTable)
            .where(
              and(
                eq(productSlotsTable.cityId, cityId),
                eq(productSlotsTable.districtId, districtId),
                eq(productSlotsTable.typeId, typeId),
                eq(productSlotsTable.size, size),
              ),
            )
            .limit(1)
            .then((r) => r[0]);

          const existing = slot
            ? undefined
            : await db
                .select()
                .from(productsTable)
                .where(
                  and(
                    eq(productsTable.cityId, cityId),
                    eq(productsTable.districtId, districtId),
                    eq(productsTable.typeId, typeId),
                    eq(productsTable.size, size),
                  ),
                )
                .limit(1)
                .then((r) => r[0]);

          const price = slot
            ? Number(slot.price)
            : existing
              ? Number(existing.price)
              : undefined;

          if (price === undefined) {
            return ctx.editMessageText(
              "⚠️ Size not found in the system. Ask admin to set it up first.",
              {
                ...inlineKeyboard([
                  [BACK_BTN(`klad:type:${cityId}:${districtId}:${typeId}`)],
                ]),
              },
            );
          }

          ctx.session.step = "admin:add_product:content";
          ctx.session.data = {
            cityId,
            districtId,
            typeId,
            size,
            price,
            addedBy: ctx.from.id,
          };
          return ctx.editMessageText(
            "📤 Send the product content for this lot.\n\n" +
              "You can send <b>photos, videos, documents</b> or type <b>text</b> (e.g. an address or code).\n" +
              "Everything you send goes to ONE buyer.\n" +
              "Press ✅ Done when finished.",
            {
              parse_mode: "HTML",
              ...inlineKeyboard([
                [{ text: "✅ Done", callback_data: "klad:done" }],
                [{ text: "✖ Cancel", callback_data: "klad:exit" }],
              ]),
            },
          );
        }
        if (sub === "my_uploads") return showKladMyUploads(ctx, ctx.from.id);
        if (sub === "del_upload") {
          // Only the worker's own still-available uploads are shown here, so we
          // physically remove the row. Marking it "sold" would make a deleted
          // upload masquerade as a phantom sale (an item that "vanished" with no
          // buyer), which is exactly the disappearing-stock bug we're fixing.
          await db
            .delete(productsTable)
            .where(
              and(
                eq(productsTable.id, parseInt(parts[1]!)),
                eq(productsTable.status, "available"),
              ),
            );
          await ctx.answerCbQuery("Upload deleted.");
          return showKladMyUploads(ctx, ctx.from.id);
        }
        if (sub === "done") {
          const step = ctx.session.step as string | undefined;
          const sessionData = (ctx.session.data ?? {}) as Record<string, any>;
          ctx.session.step = undefined;
          ctx.session.data = undefined;
          if (
            step === "admin:add_product:more_files" ||
            step === "admin:add_product:content"
          ) {
            const fileCount = ((sessionData["fileCount"] as number) ?? 1);
            await ctx.answerCbQuery("Upload complete!");
            await ctx.reply(`✅ Lot complete. ${fileCount} file(s) saved — upload closed.`);
          } else if (step === "admin:add_product:bulk") {
            const count = (sessionData["bulkCount"] as number) ?? 0;
            await ctx.answerCbQuery("Upload complete!");
            await ctx.reply(`✅ Bulk upload complete. ${count} units added — upload closed.`);
          } else {
            await ctx.answerCbQuery("Nothing to finish.");
          }
          if (await isAdmin(ctx.from.id)) {
            return showProductsMenu(ctx);
          } else {
            return showKladMenu(ctx);
          }
        }
        return;
      }
    } catch (err) {
      logger.error({ err }, "Error handling callback query");
      await ctx.reply("An error occurred. Please try again.").catch(() => {});
    }
  });

  bot.catch((err: any) => {
    const description: string = err?.response?.description ?? err?.message ?? "";
    // Benign: re-rendering a menu with identical content. Nothing to do.
    if (/message is not modified/i.test(description)) return;
    logger.error({ err }, "Bot error");
  });

  startInvoiceBackgroundChecker(bot.telegram);
  setAdminTelegram(bot.telegram);

  return bot;
}
