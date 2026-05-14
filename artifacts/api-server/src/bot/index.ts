import { Telegraf, session } from "telegraf";
import { message } from "telegraf/filters";
import { db } from "@workspace/db";
import {
  usersTable,
  citiesTable,
  districtsTable,
  productTypesTable,
  productsTable,
  discountCodesTable,
  welcomeTemplatesTable,
  tierLevelsTable,
  tierSettingsTable,
  workersTable,
  basketsTable,
  backupTokensTable,
  productDiscountsTable,
  resellerDiscountsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { BotSession } from "./session";
import { getOrCreateUser, isAdmin, isWorker, releaseBasket, updateUserTier } from "./db";
import { showAdminMenu } from "./handlers/admin";
import {
  showGeographyMenu,
  showCitiesList,
  showCityDetail,
  deleteCity,
  showDistrictsCitySelect,
  showDistrictsList,
  showDistrictDetail,
  deleteDistrict,
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
} from "./handlers/admin-products";
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
  showAnalytics,
  showReportMenu,
  generateReport,
  salesByCity,
  salesByType,
  showPurchases,
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
  doRefund,
  showBackupTokens,
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
  showShopCities,
  showShopDistricts,
  showShopTypes,
  showShopSizes,
  addToBasket,
  showBasket,
  checkout,
  showOrders,
  showTopUp,
} from "./handlers/shop";
import { formatEur } from "./utils";

export function createBot(): Telegraf {
  const token = process.env["BOT_TOKEN"];
  if (!token) throw new Error("BOT_TOKEN environment variable is required");

  const bot = new Telegraf(token);

  bot.use(
    session({
      defaultSession: (): BotSession => ({ step: undefined, data: undefined }),
    })
  );

  bot.use(async (ctx: any, next) => {
    if (!ctx.from) return next();
    const user = await getOrCreateUser(
      ctx.from.id,
      ctx.from.username,
      ctx.from.first_name
    );
    if (user.isBanned && ctx.message) {
      await ctx.reply("🚫 Your account has been suspended.");
      return;
    }
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
      return ctx.reply(
        "❌ You are not registered as a worker or your access has been disabled."
      );
    }
    await showKladMenu(ctx);
  });

  bot.on(message("text"), async (ctx: any) => {
    const step = ctx.session.step;
    const data = ctx.session.data ?? {};
    const text = ctx.message.text;

    if (!step) return;

    if (step === "admin:add_city") {
      const name = text.trim();
      if (!name) return ctx.reply("Please enter a valid city name.");
      await db.insert(citiesTable).values({ name }).onConflictDoNothing();
      ctx.session.step = undefined;
      await ctx.reply(`✅ City "<b>${name}</b>" added.`, { parse_mode: "HTML" });
      await showGeographyMenu(ctx);
      return;
    }

    if (step === "admin:rename_city") {
      const cityId = data["cityId"] as number;
      await db.update(citiesTable).set({ name: text.trim() }).where(eq(citiesTable.id, cityId));
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
      await db.update(districtsTable).set({ name: text.trim() }).where(eq(districtsTable.id, districtId));
      ctx.session.step = undefined;
      await ctx.reply("✅ District renamed.");
      await showDistrictsList(ctx, cityId);
      return;
    }

    if (step === "admin:add_type_name") {
      ctx.session.data = { ...data, typeName: text.trim() };
      ctx.session.step = "admin:add_type_emoji";
      await ctx.reply("Enter an emoji for this type (e.g. ☕):");
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
      await ctx.reply(`✅ Product type <b>${emoji} ${name}</b> added.`, { parse_mode: "HTML" });
      await showProductTypes(ctx);
      return;
    }

    if (step === "admin:rename_type") {
      const typeId = data["typeId"] as number;
      await db.update(productTypesTable).set({ name: text.trim() }).where(eq(productTypesTable.id, typeId));
      ctx.session.step = undefined;
      await ctx.reply("✅ Type renamed.");
      await showProductTypes(ctx);
      return;
    }

    if (step === "admin:add_product:size") {
      ctx.session.data = { ...data, size: text.trim() };
      ctx.session.step = "admin:add_product:price";
      await ctx.reply("Enter the price in EUR (e.g. 12.50):");
      return;
    }

    if (step === "admin:add_product:price") {
      const price = parseFloat(text.trim());
      if (isNaN(price) || price <= 0) {
        return ctx.reply("Invalid price. Please enter a number like 12.50:");
      }
      ctx.session.data = { ...data, price };
      ctx.session.step = "admin:add_product:content";
      await ctx.reply(
        "Now send the product content (text, photo, document, GIF, or video).\n" +
        "For text: just type it.\nFor files: send the file directly."
      );
      return;
    }

    if (step === "admin:add_product:content") {
      const { cityId, districtId, typeId, size, price, addedBy } = data as any;
      const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, addedBy)).then((r) => r[0]);
      const workerData = await db.select().from(workersTable).where(eq(workersTable.telegramId, addedBy)).then((r) => r[0]);
      const workerTag = workerData?.username ?? user?.username ?? String(addedBy);
      await db.insert(productsTable).values({
        cityId,
        districtId,
        typeId,
        size,
        price: price.toFixed(2),
        content: text,
        fileType: "text",
        addedBy,
        workerTag,
        status: "available",
      });
      if (workerData) {
        await db.update(workersTable).set({ totalUploads: (workerData.totalUploads || 0) + 1 }).where(eq(workersTable.id, workerData.id));
      }
      ctx.session.step = undefined;
      await ctx.reply("✅ Product added successfully!");
      if (await isAdmin(ctx.from.id)) {
        await showProductsMenu(ctx);
      } else {
        await showKladMenu(ctx);
      }
      return;
    }

    if (step === "admin:add_product:bulk") {
      return;
    }

    if (step === "admin:search_user") {
      ctx.session.step = undefined;
      await showUserProfile(ctx, text.trim());
      return;
    }

    if (step === "admin:broadcast") {
      const users = await db.select().from(usersTable);
      let sent = 0;
      let failed = 0;
      await ctx.reply("📢 Broadcasting...");
      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.telegramId, text, { parse_mode: "HTML" });
          sent++;
        } catch {
          failed++;
        }
      }
      ctx.session.step = undefined;
      await ctx.reply(`✅ Broadcast complete: ${sent} sent, ${failed} failed.`);
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
      await ctx.reply("Enter discount % (1-100):");
      return;
    }

    if (step === "admin:create_discount_code:percent") {
      const pct = parseInt(text.trim());
      if (isNaN(pct) || pct < 1 || pct > 100) return ctx.reply("Enter a number between 1 and 100:");
      ctx.session.data = { ...data, percentOff: pct };
      ctx.session.step = "admin:create_discount_code:uses";
      await ctx.reply("Max uses? (leave empty for unlimited):");
      return;
    }

    if (step === "admin:create_discount_code:uses") {
      const maxUses = text.trim() === "" ? null : parseInt(text.trim());
      ctx.session.data = { ...data, maxUses };
      ctx.session.step = "admin:create_discount_code:stacks";
      const kb = require("./keyboards").inlineKeyboard([
        [{ text: "✅ Yes — stacks with sales", callback_data: "disc:code_stack:yes" }],
        [{ text: "❌ No — applies to original price", callback_data: "disc:code_stack:no" }],
      ]);
      await ctx.reply("Does this code stack with active sales?", kb);
      return;
    }

    if (step === "admin:add_product_disc:percent") {
      const pct = parseInt(text.trim());
      if (isNaN(pct) || pct < 1 || pct > 100) return ctx.reply("Enter a number between 1 and 100:");
      const { cityId, districtId, typeId, size } = data as any;
      await db.insert(productDiscountsTable).values({
        cityId: cityId ?? null,
        districtId: districtId ?? null,
        typeId: typeId ?? null,
        size: size ?? null,
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

      if (!isNaN(numId)) {
        targetId = numId;
      } else {
        const uname = query.replace("@", "");
        const user = await db.select().from(usersTable).then((users) =>
          users.find((u) => (u.username ?? "").toLowerCase() === uname.toLowerCase())
        );
        if (!user) {
          return ctx.reply("User not found. Make sure they have /start'd the bot first.");
        }
        targetId = user.telegramId;
        username = user.username ?? undefined;
      }

      await db.insert(workersTable).values({ telegramId: targetId!, username }).onConflictDoNothing();
      ctx.session.step = undefined;
      await ctx.reply(`✅ Worker ${username ? `@${username}` : targetId} added.`);
      await showWorkersMenu(ctx);
      return;
    }

    if (step === "admin:add_balance") {
      const [idStr, amtStr] = text.trim().split(" ");
      const targetId = Number(idStr);
      const amount = parseFloat(amtStr ?? "");
      if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
        return ctx.reply("Usage: <telegram_id> <amount>\nExample: 123456789 50.00");
      }
      const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then((r) => r[0]);
      if (!user) return ctx.reply("User not found.");
      const newBal = Number(user.balance) + amount;
      await db.update(usersTable).set({ balance: newBal.toFixed(2) }).where(eq(usersTable.telegramId, targetId));
      ctx.session.step = undefined;
      await ctx.reply(`✅ Added ${formatEur(amount)} to user ${targetId}. New balance: ${formatEur(newBal)}.`);
      try {
        await bot.telegram.sendMessage(targetId, `💰 Your balance has been topped up by ${formatEur(amount)}. New balance: ${formatEur(newBal)}.`);
      } catch {}
      await showToolsMenu(ctx);
      return;
    }

    if (step === "admin:add_balance_for_user") {
      const targetId = data["targetUserId"] as number;
      const amount = parseFloat(text.trim());
      if (isNaN(amount) || amount <= 0) return ctx.reply("Enter a valid amount (e.g. 50.00):");
      const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then((r) => r[0]);
      if (!user) return ctx.reply("User not found.");
      const newBal = Number(user.balance) + amount;
      await db.update(usersTable).set({ balance: newBal.toFixed(2) }).where(eq(usersTable.telegramId, targetId));
      ctx.session.step = undefined;
      await ctx.reply(`✅ Added ${formatEur(amount)} to user ${targetId}. New balance: ${formatEur(newBal)}.`);
      try {
        await bot.telegram.sendMessage(targetId, `💰 Your balance has been topped up by ${formatEur(amount)}. New balance: ${formatEur(newBal)}.`);
      } catch {}
      await showUserProfile(ctx, String(targetId));
      return;
    }

    if (step === "admin:tier_add:name") {
      ctx.session.data = { ...data, tierName: text.trim() };
      ctx.session.step = "admin:tier_add:threshold";
      await ctx.reply("Enter threshold (number of purchases or EUR spent):");
      return;
    }

    if (step === "admin:tier_add:threshold") {
      const threshold = parseInt(text.trim());
      if (isNaN(threshold)) return ctx.reply("Enter a valid number:");
      ctx.session.data = { ...data, threshold };
      ctx.session.step = "admin:tier_add:discount";
      await ctx.reply("Enter global discount % (0 for none):");
      return;
    }

    if (step === "admin:tier_add:discount") {
      const discount = parseInt(text.trim());
      if (isNaN(discount)) return ctx.reply("Enter a valid number:");
      const { tierName, threshold } = data as any;
      await db.insert(tierLevelsTable).values({
        name: tierName,
        threshold,
        globalDiscountPercent: discount,
      });
      ctx.session.step = undefined;
      await ctx.reply(`✅ Tier <b>${tierName}</b> added.`, { parse_mode: "HTML" });
      await showTierSystem(ctx);
      return;
    }

    if (step === "admin:payment_recovery") {
      const queueId = text.trim().toUpperCase();
      const purchase = await db
        .select()
        .from(require("@workspace/db").purchasesTable)
        .where(eq(require("@workspace/db").purchasesTable.queueId, queueId))
        .then((r: any[]) => r[0]);
      ctx.session.step = undefined;
      if (!purchase) {
        return ctx.reply("Order not found.");
      }
      const product = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, purchase.productId))
        .then((r) => r[0]);
      let msg = `📦 Order <code>${purchase.queueId}</code>\nUser: ${purchase.userId}\nPaid: ${formatEur(purchase.pricePaid)}\nStatus: ${purchase.refunded ? "Refunded" : "Completed"}`;
      await ctx.reply(msg, { parse_mode: "HTML" });
      if (product && product.fileType !== "text" && product.fileId) {
        if (product.fileType === "photo") await ctx.replyWithPhoto(product.fileId);
        else if (product.fileType === "document") await ctx.replyWithDocument(product.fileId);
        else if (product.fileType === "video") await ctx.replyWithVideo(product.fileId);
      } else if (product?.content) {
        await ctx.reply(`Content: <code>${product.content}</code>`, { parse_mode: "HTML" });
      }
      await showToolsMenu(ctx);
      return;
    }

    if (step === "admin:add_backup_token") {
      const token = text.trim();
      await db.insert(backupTokensTable).values({ token }).onConflictDoNothing();
      ctx.session.step = undefined;
      await ctx.reply("✅ Backup token saved.");
      await showBackupTokens(ctx);
      return;
    }

    if (step === "shop:review") {
      const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, ctx.from.id)).then((r) => r[0]);
      await db.insert(require("@workspace/db").reviewsTable).values({
        userId: ctx.from.id,
        username: user?.username,
        text,
      });
      ctx.session.step = undefined;
      await ctx.reply("⭐ Thank you for your review!");
      await showHome(ctx);
      return;
    }

    if (step === "klad:size_custom") {
      const { cityId, districtId, typeId, price } = data as any;
      const size = text.trim();
      ctx.session.data = { cityId, districtId, typeId, size, price, addedBy: ctx.from.id };
      ctx.session.step = "admin:add_product:content";
      await ctx.reply("Now send the product content:");
      return;
    }
  });

  bot.on(message("photo", "document", "video", "animation"), async (ctx: any) => {
    const step = ctx.session.step;
    const data = ctx.session.data ?? {};
    if (step !== "admin:add_product:content" && step !== "admin:add_product:bulk") return;

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

    const { cityId, districtId, typeId, size, price, addedBy } = data as any;
    const workerData = await db.select().from(workersTable).where(eq(workersTable.telegramId, addedBy)).then((r) => r[0]);
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, addedBy)).then((r) => r[0]);
    const workerTag = workerData?.username ?? user?.username ?? String(addedBy);

    if (step === "admin:add_product:content") {
      await db.insert(productsTable).values({
        cityId,
        districtId,
        typeId,
        size,
        price: price.toFixed(2),
        fileId,
        fileType: fileType as any,
        addedBy,
        workerTag,
        status: "available",
      });
      if (workerData) {
        await db.update(workersTable).set({ totalUploads: (workerData.totalUploads || 0) + 1 }).where(eq(workersTable.id, workerData.id));
      }
      ctx.session.step = undefined;
      await ctx.reply("✅ Product added!");
      if (await isAdmin(ctx.from.id)) {
        await showProductsMenu(ctx);
      } else {
        await showKladMenu(ctx);
      }
    } else if (step === "admin:add_product:bulk") {
      await db.insert(productsTable).values({
        cityId,
        districtId,
        typeId,
        size,
        price: price.toFixed(2),
        fileId,
        fileType: fileType as any,
        addedBy,
        workerTag,
        status: "available",
      });
      if (workerData) {
        await db.update(workersTable).set({ totalUploads: (workerData.totalUploads || 0) + 1 }).where(eq(workersTable.id, workerData.id));
      }
      const bulkCount = ((data["bulkCount"] as number) ?? 0) + 1;
      ctx.session.data = { ...data, bulkCount };
      await ctx.reply(`✅ Item ${bulkCount} added. Send another file or type /done to finish.`);
    }
  });

  bot.command("done", async (ctx: any) => {
    if (ctx.session.step === "admin:add_product:bulk") {
      const count = ctx.session.data?.["bulkCount"] ?? 0;
      ctx.session.step = undefined;
      await ctx.reply(`✅ Bulk upload complete. ${count} items added.`);
      if (await isAdmin(ctx.from.id)) {
        await showProductsMenu(ctx);
      } else {
        await showKladMenu(ctx);
      }
    }
  });

  bot.on("callback_query", async (ctx: any) => {
    const data: string = ctx.callbackQuery.data ?? "";
    await ctx.answerCbQuery().catch(() => {});
    const [action, ...parts] = data.split(":");

    try {
      if (action === "admin") {
        if (!(await isAdmin(ctx.from.id))) return ctx.answerCbQuery("Not authorized.", { show_alert: true });
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
            "📡 <b>Auto Ads System</b>\n\nAuto Ads allows you to automatically post ads in Telegram groups using separate user accounts.\n\n<i>This feature requires manual Telegram account setup. Contact support for configuration assistance.</i>",
            { parse_mode: "HTML", ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:main")]]) }
          );
        }
        if (sub === "purchases") {
          const page = parseInt(parts[1] ?? "0");
          return showPurchases(ctx, page);
        }
        return;
      }

      if (action === "geo") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "add_city") {
          ctx.session.step = "admin:add_city";
          return ctx.editMessageText("Enter the new city name:");
        }
        if (sub === "cities") return showCitiesList(ctx);
        if (sub === "city_detail") return showCityDetail(ctx, parseInt(parts[1]!));
        if (sub === "rename_city") {
          ctx.session.step = "admin:rename_city";
          ctx.session.data = { cityId: parseInt(parts[1]!) };
          return ctx.editMessageText("Enter new name for this city:");
        }
        if (sub === "del_city") return deleteCity(ctx, parseInt(parts[1]!));
        if (sub === "districts_select") return showDistrictsCitySelect(ctx);
        if (sub === "dist_city") return showDistrictsList(ctx, parseInt(parts[1]!));
        if (sub === "dist_detail") return showDistrictDetail(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "add_dist") {
          ctx.session.step = "admin:add_district";
          ctx.session.data = { cityId: parseInt(parts[1]!) };
          return ctx.editMessageText("Enter the district name:");
        }
        if (sub === "rename_dist") {
          ctx.session.step = "admin:rename_district";
          ctx.session.data = { districtId: parseInt(parts[1]!), cityId: parseInt(parts[2]!) };
          return ctx.editMessageText("Enter new name for this district:");
        }
        if (sub === "del_dist") return deleteDistrict(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        return;
      }

      if (action === "prod") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "types") return showProductTypes(ctx);
        if (sub === "add_type") {
          ctx.session.step = "admin:add_type_name";
          return ctx.editMessageText("Enter the product type name (e.g. Coffee):");
        }
        if (sub === "type_detail") return showTypeDetail(ctx, parseInt(parts[1]!));
        if (sub === "rename_type") {
          ctx.session.step = "admin:rename_type";
          ctx.session.data = { typeId: parseInt(parts[1]!) };
          return ctx.editMessageText("Enter new name:");
        }
        if (sub === "del_type") return deleteProductType(ctx, parseInt(parts[1]!));
        if (sub === "stock") return showStock(ctx);
        if (sub === "manage") return showManageProducts(ctx);
        if (sub === "add" || sub === "bulk_add") {
          const cityId = parts[1] ? parseInt(parts[1]) : undefined;
          const districtId = parts[2] ? parseInt(parts[2]) : undefined;
          const typeId = parts[3] ? parseInt(parts[3]) : undefined;
          if (cityId && districtId && typeId) {
            ctx.session.step = sub === "bulk_add" ? "admin:add_product:bulk_setup" : "admin:add_product:size";
            ctx.session.data = { cityId, districtId, typeId, addedBy: ctx.from.id, isBulk: sub === "bulk_add" };
            return ctx.editMessageText("Enter the size (e.g. 5g, 1 unit):");
          }
          const cities = await require("./db").getCities();
          const kb = require("./keyboards").inlineKeyboard([
            ...cities.map((c: any) => [{ text: c.name, callback_data: `prod_add_flow:city:${c.id}:${sub === "bulk_add" ? "bulk" : "single"}` }]),
            [require("./keyboards").BACK_BTN("admin:products")],
          ]);
          return ctx.editMessageText("Select city:", { ...kb });
        }
        if (sub === "log") {
          const products = await db.select().from(productsTable).orderBy(require("drizzle-orm").desc(productsTable.createdAt)).limit(20);
          let text = "📋 <b>Added Products Log</b>\n\n";
          for (const p of products) {
            text += `• ${p.size} — ${formatEur(p.price)} — ${p.status} — ${p.workerTag ? `@${p.workerTag}` : "admin"}\n`;
          }
          return ctx.editMessageText(text, { parse_mode: "HTML", ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:products")]]) });
        }
        if (sub === "bulk_price") {
          return ctx.editMessageText(
            "💰 <b>Bulk Edit Prices</b>\n\nUse the search user flow and bulk edit commands. This feature adjusts all products of a given type, district, or size.",
            { parse_mode: "HTML", ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:products")]]) }
          );
        }
        if (sub === "reassign") {
          return ctx.editMessageText(
            "🔀 <b>Reassign Product Type</b>\n\nTo move products between types, delete the old ones and re-upload under the new type.",
            { parse_mode: "HTML", ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:products")]]) }
          );
        }
        return;
      }

      if (action === "prod_add_flow") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        const isBulk = parts[parts.length - 1] === "bulk";
        if (sub === "city") {
          const cityId = parseInt(parts[1]!);
          const districts = await require("./db").getDistricts(cityId);
          const kb = require("./keyboards").inlineKeyboard([
            ...districts.map((d: any) => [{ text: d.name, callback_data: `prod_add_flow:dist:${cityId}:${d.id}:${isBulk ? "bulk" : "single"}` }]),
            [require("./keyboards").BACK_BTN("admin:products")],
          ]);
          return ctx.editMessageText("Select district:", { ...kb });
        }
        if (sub === "dist") {
          const cityId = parseInt(parts[1]!);
          const distId = parseInt(parts[2]!);
          const types = await require("./db").getProductTypes();
          const kb = require("./keyboards").inlineKeyboard([
            ...types.map((t: any) => [{ text: `${t.emoji} ${t.name}`, callback_data: `prod_add_flow:type:${cityId}:${distId}:${t.id}:${isBulk ? "bulk" : "single"}` }]),
            [require("./keyboards").BACK_BTN(`prod_add_flow:city:${cityId}:${isBulk ? "bulk" : "single"}`)],
          ]);
          return ctx.editMessageText("Select product type:", { ...kb });
        }
        if (sub === "type") {
          const cityId = parseInt(parts[1]!);
          const distId = parseInt(parts[2]!);
          const typeId = parseInt(parts[3]!);
          ctx.session.step = isBulk ? "admin:add_product:size_bulk" : "admin:add_product:size";
          ctx.session.data = { cityId, districtId: distId, typeId, addedBy: ctx.from.id, isBulk };
          return ctx.editMessageText("Enter size (e.g. 5g, 1 unit):");
        }
        return;
      }

      if (action === "manage_prod") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "city") return showManageProdDistricts(ctx, parseInt(parts[1]!));
        if (sub === "dist") return showManageProdTypes(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "type") {
          const page = parseInt(parts[4] ?? "0");
          return showProductList(ctx, parseInt(parts[1]!), parseInt(parts[2]!), parseInt(parts[3]!), page);
        }
        if (sub === "del") {
          const productId = parseInt(parts[1]!);
          await db.update(productsTable).set({ status: "sold" }).where(eq(productsTable.id, productId));
          await ctx.answerCbQuery("Product deleted.");
          const page = parseInt(parts[5] ?? "0");
          return showProductList(ctx, parseInt(parts[2]!), parseInt(parts[3]!), parseInt(parts[4]!), page);
        }
        if (sub === "delall") return deleteAllProducts(ctx, parseInt(parts[1]!), parseInt(parts[2]!), parseInt(parts[3]!));
        return;
      }

      if (action === "users") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "search") {
          ctx.session.step = "admin:search_user";
          return ctx.editMessageText("Enter @username or Telegram ID:");
        }
        if (sub === "ban") return banUser(ctx, parseInt(parts[1]!));
        if (sub === "unban") return unbanUser(ctx, parseInt(parts[1]!));
        if (sub === "mk_reseller") return makeReseller(ctx, parseInt(parts[1]!));
        if (sub === "rm_reseller") return removeReseller(ctx, parseInt(parts[1]!));
        if (sub === "export") return exportUsersCsv(ctx);
        if (sub === "resellers") {
          const resellers = await db.select().from(usersTable).where(eq(usersTable.isReseller, true));
          let text = "👑 <b>Resellers</b>\n\n";
          if (resellers.length === 0) text += "No resellers.";
          else text += resellers.map((r) => `• ${r.username ? `@${r.username}` : r.telegramId}`).join("\n");
          return ctx.editMessageText(text, { parse_mode: "HTML", ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:users")]]) });
        }
        if (sub === "add_bal") {
          ctx.session.step = "admin:add_balance_for_user";
          ctx.session.data = { targetUserId: parseInt(parts[1]!) };
          return ctx.editMessageText("Enter the amount to add (e.g. 50.00):");
        }
        return;
      }

      if (action === "analytics") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "report") return showReportMenu(ctx);
        if (sub === "rpt") return generateReport(ctx, parts[1]!);
        if (sub === "city") return salesByCity(ctx);
        if (sub === "type") return salesByType(ctx);
        if (sub === "top") {
          const rows = await db.select({
            size: productsTable.size,
            count: require("drizzle-orm").count(),
            total: require("drizzle-orm").sum(require("@workspace/db").purchasesTable.pricePaid),
          })
            .from(require("@workspace/db").purchasesTable)
            .innerJoin(productsTable, eq(require("@workspace/db").purchasesTable.productId, productsTable.id))
            .where(eq(require("@workspace/db").purchasesTable.refunded, false))
            .groupBy(productsTable.size)
            .orderBy(require("drizzle-orm").desc(require("drizzle-orm").count()))
            .limit(10);
          let text = "🏆 <b>Top Products</b>\n\n";
          rows.forEach((r: any, i: number) => { text += `${i + 1}. ${r.size} — ${r.count} sales — ${formatEur(r.total ?? 0)}\n`; });
          return ctx.editMessageText(text, { parse_mode: "HTML", ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:analytics")]]) });
        }
        return;
      }

      if (action === "comms") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "broadcast") {
          ctx.session.step = "admin:broadcast";
          return ctx.editMessageText("Type the message to broadcast to all users (HTML supported):");
        }
        if (sub === "welcome") return showWelcomeMenu(ctx);
        if (sub === "welcome_add") {
          ctx.session.step = "admin:welcome_template";
          return ctx.editMessageText("Write the welcome template text:");
        }
        if (sub === "welcome_activate") return activateWelcomeTemplate(ctx, parseInt(parts[1]!));
        if (sub === "welcome_del") return deleteWelcomeTemplate(ctx, parseInt(parts[1]!));
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
          await db.delete(require("@workspace/db").reviewsTable).where(eq(require("@workspace/db").reviewsTable.id, parseInt(parts[1]!)));
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
          return ctx.editMessageText("Enter the discount code name (will be uppercased):");
        }
        if (sub === "del_code") return deleteDiscountCode(ctx, parseInt(parts[1]!));
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
          await ctx.editMessageText(`✅ Discount code <b>${(d as any)["code"]}</b> created.`, { parse_mode: "HTML" });
          return showDiscountCodes(ctx);
        }
        if (sub === "product") return showProductDiscounts(ctx);
        if (sub === "add_product_disc") {
          ctx.session.step = "admin:add_product_disc:percent";
          ctx.session.data = {};
          const types = await require("./db").getProductTypes();
          const kb = require("./keyboards").inlineKeyboard([
            [{ text: "All products", callback_data: "disc:prod_disc_scope:all" }],
            ...types.map((t: any) => [{ text: `${t.emoji} ${t.name}`, callback_data: `disc:prod_disc_scope:type:${t.id}` }]),
          ]);
          return ctx.editMessageText("Select scope for this discount:", { ...kb });
        }
        if (sub === "prod_disc_scope") {
          const scope = parts[1];
          if (scope === "all") {
            ctx.session.step = "admin:add_product_disc:percent";
            return ctx.editMessageText("Enter discount % (1-100):");
          }
          if (scope === "type") {
            ctx.session.data = { ...(ctx.session.data ?? {}), typeId: parseInt(parts[2]!) };
            ctx.session.step = "admin:add_product_disc:percent";
            return ctx.editMessageText("Enter discount % (1-100):");
          }
          return;
        }
        if (sub === "del_prod_disc") {
          await db.delete(productDiscountsTable).where(eq(productDiscountsTable.id, parseInt(parts[1]!)));
          await ctx.answerCbQuery("Discount removed.");
          return showProductDiscounts(ctx);
        }
        if (sub === "reseller") {
          const discounts = await db.select().from(resellerDiscountsTable);
          let text = "👑 <b>Reseller Discounts</b>\n\n";
          if (discounts.length === 0) text += "No reseller discounts set.";
          else discounts.forEach((d) => { text += `• ${d.percentOff}% off\n`; });
          const kb = require("./keyboards").inlineKeyboard([
            [require("./keyboards").BACK_BTN("admin:discounts")],
          ]);
          return ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
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
          return ctx.editMessageText("Enter tier name (e.g. VIP, Bronze):");
        }
        if (sub === "edit") {
          const tier = await db.select().from(tierLevelsTable).where(eq(tierLevelsTable.id, parseInt(parts[1]!))).then((r) => r[0]);
          if (!tier) return;
          const kb = require("./keyboards").inlineKeyboard([
            [{ text: "Change threshold", callback_data: `tiers:set_threshold:${tier.id}` }],
            [{ text: "Change global discount %", callback_data: `tiers:set_discount:${tier.id}` }],
            [require("./keyboards").BACK_BTN("disc:tiers")],
          ]);
          return ctx.editMessageText(`✏️ <b>${tier.name}</b>\nThreshold: ${tier.threshold}\nDiscount: ${tier.globalDiscountPercent}%`, { parse_mode: "HTML", ...kb });
        }
        return;
      }

      if (action === "tools") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "set_media") return ctx.editMessageText("Send the new bot media (photo, GIF, or video):", { ...require("./keyboards").inlineKeyboard([[require("./keyboards").BACK_BTN("admin:tools")]]) });
        if (sub === "clear_res") return clearAllReservations(ctx);
        if (sub === "payment_recovery") {
          ctx.session.step = "admin:payment_recovery";
          return ctx.editMessageText("Enter the Queue ID to look up:");
        }
        if (sub === "refund") return showRecentPurchasesForRefund(ctx);
        if (sub === "do_refund") return doRefund(ctx, parseInt(parts[1]!));
        if (sub === "backup_tokens") return showBackupTokens(ctx);
        if (sub === "add_token") {
          ctx.session.step = "admin:add_backup_token";
          return ctx.editMessageText("Send the backup bot token:");
        }
        if (sub === "add_balance") {
          ctx.session.step = "admin:add_balance";
          return ctx.editMessageText("Enter <telegram_id> <amount> (e.g. 123456789 50.00):");
        }
        return;
      }

      if (action === "workers") {
        if (!(await isAdmin(ctx.from.id))) return;
        const sub = parts[0];
        if (sub === "add") {
          ctx.session.step = "admin:add_worker";
          return ctx.editMessageText("Enter the worker's Telegram ID or @username:");
        }
        if (sub === "list") return showWorkersList(ctx);
        if (sub === "detail") return showWorkerDetail(ctx, parseInt(parts[1]!));
        if (sub === "enable") return toggleWorker(ctx, parseInt(parts[1]!), true);
        if (sub === "disable") return toggleWorker(ctx, parseInt(parts[1]!), false);
        if (sub === "remove") return removeWorker(ctx, parseInt(parts[1]!));
        return;
      }

      if (action === "shop") {
        const sub = parts[0];
        if (sub === "home") return showHome(ctx);
        if (sub === "cities") return showShopCities(ctx);
        if (sub === "dist") return showShopDistricts(ctx, parseInt(parts[1]!));
        if (sub === "types") return showShopTypes(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "sizes") return showShopSizes(ctx, parseInt(parts[1]!), parseInt(parts[2]!), parseInt(parts[3]!));
        if (sub === "buy") {
          const size = decodeURIComponent(parts[4]!);
          return addToBasket(ctx, parseInt(parts[1]!), parseInt(parts[2]!), parseInt(parts[3]!), size);
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
        if (sub === "topup") return showTopUp(ctx);
        if (sub === "review") {
          ctx.session.step = "shop:review";
          return ctx.editMessageText("⭐ Write your review:");
        }
        return;
      }

      if (action === "klad") {
        if (!(await isWorker(ctx.from.id))) return ctx.answerCbQuery("Not authorized.", { show_alert: true });
        const sub = parts[0];
        if (sub === "exit") return showHome(ctx);
        if (sub === "upload") return showKladCities(ctx);
        if (sub === "city") return showKladDistricts(ctx, parseInt(parts[1]!));
        if (sub === "dist") return showKladTypes(ctx, parseInt(parts[1]!), parseInt(parts[2]!));
        if (sub === "type") return showKladSizes(ctx, parseInt(parts[1]!), parseInt(parts[2]!), parseInt(parts[3]!));
        if (sub === "size") {
          const cityId = parseInt(parts[1]!);
          const districtId = parseInt(parts[2]!);
          const typeId = parseInt(parts[3]!);
          const size = decodeURIComponent(parts[4]!);
          const product = await db.select().from(productsTable).where(
            and(eq(productsTable.cityId, cityId), eq(productsTable.districtId, districtId), eq(productsTable.typeId, typeId), eq(productsTable.size, size))
          ).limit(1).then((r) => r[0]);
          if (!product) return ctx.editMessageText("Size not found.");
          ctx.session.step = "admin:add_product:content";
          ctx.session.data = { cityId, districtId, typeId, size, price: Number(product.price), addedBy: ctx.from.id };
          return ctx.editMessageText("Send the product content (text or file):");
        }
        if (sub === "my_uploads") return showKladMyUploads(ctx, ctx.from.id);
        if (sub === "del_upload") {
          await db.update(productsTable).set({ status: "sold" }).where(eq(productsTable.id, parseInt(parts[1]!)));
          await ctx.answerCbQuery("Upload deleted.");
          return showKladMyUploads(ctx, ctx.from.id);
        }
        return;
      }
    } catch (err) {
      logger.error({ err }, "Error handling callback query");
      await ctx.reply("An error occurred. Please try again.").catch(() => {});
    }
  });

  bot.catch((err: any) => {
    logger.error({ err }, "Bot error");
  });

  return bot;
}
