import { db } from "@workspace/db";
import {
  productDiscountsTable,
  resellerDiscountsTable,
  tierDiscountRulesTable,
  tierLevelsTable,
  discountCodesTable,
} from "@workspace/db";
import { and, or, isNull, eq } from "drizzle-orm";

export interface PriceResult {
  original: number;
  final: number;
  discountBadges: string[];
  fireDiscount: number;
  crownDiscount: number;
  trophyDiscount: number;
  tierGlobalDiscount: number;
  codeDiscount: number;
}

interface ProductInfo {
  typeId: number;
  cityId: number;
  districtId: number;
  size: string;
  price: number;
}

interface UserInfo {
  isReseller: boolean;
  tierName: string;
}

export async function calculatePrice(
  product: ProductInfo,
  user: UserInfo,
  discountCode?: string
): Promise<PriceResult> {
  const original = Number(product.price);
  const badges: string[] = [];

  const scopeMatch = (row: {
    cityId: number | null;
    districtId: number | null;
    typeId: number | null;
    size: string | null;
  }) => {
    if (row.typeId && row.cityId && row.districtId && row.size) {
      return (
        row.typeId === product.typeId &&
        row.cityId === product.cityId &&
        row.districtId === product.districtId &&
        row.size === product.size
      );
    }
    if (row.typeId && row.cityId && row.districtId) {
      return (
        row.typeId === product.typeId &&
        row.cityId === product.cityId &&
        row.districtId === product.districtId
      );
    }
    if (row.typeId && row.cityId) {
      return row.typeId === product.typeId && row.cityId === product.cityId;
    }
    if (row.typeId) {
      return row.typeId === product.typeId;
    }
    if (row.cityId && row.districtId) {
      return (
        row.cityId === product.cityId && row.districtId === product.districtId
      );
    }
    if (row.cityId) {
      return row.cityId === product.cityId;
    }
    return true;
  };

  const allProductDiscounts = await db
    .select()
    .from(productDiscountsTable);
  const matchingFire = allProductDiscounts
    .filter(scopeMatch)
    .sort((a, b) => b.percentOff - a.percentOff)[0];
  const fireDiscount = matchingFire ? matchingFire.percentOff : 0;

  let crownDiscount = 0;
  if (user.isReseller) {
    const allResellerDiscounts = await db.select().from(resellerDiscountsTable);
    const matchingCrown = allResellerDiscounts
      .filter(scopeMatch)
      .sort((a, b) => b.percentOff - a.percentOff)[0];
    crownDiscount = matchingCrown ? matchingCrown.percentOff : 0;
  }

  const tierRules = await db
    .select()
    .from(tierDiscountRulesTable)
    .where(eq(tierDiscountRulesTable.tierName, user.tierName));
  const matchingTrophy = tierRules
    .filter(scopeMatch)
    .sort((a, b) => b.percentOff - a.percentOff)[0];
  const trophyDiscount = matchingTrophy ? matchingTrophy.percentOff : 0;

  const tierLevel = await db
    .select()
    .from(tierLevelsTable)
    .where(eq(tierLevelsTable.name, user.tierName))
    .then((r) => r[0]);
  const tierGlobalDiscount = tierLevel ? tierLevel.globalDiscountPercent : 0;

  let price = original;
  if (fireDiscount > 0) {
    price = price * (1 - fireDiscount / 100);
    badges.push("🔥");
  }
  if (crownDiscount > 0) {
    price = price * (1 - crownDiscount / 100);
    badges.push("👑");
  }
  if (trophyDiscount > 0) {
    price = price * (1 - trophyDiscount / 100);
    badges.push("🏆");
  }
  if (tierGlobalDiscount > 0) {
    price = price * (1 - tierGlobalDiscount / 100);
  }

  let codeDiscount = 0;
  if (discountCode) {
    const code = await db
      .select()
      .from(discountCodesTable)
      .where(eq(discountCodesTable.code, discountCode.toUpperCase()))
      .then((r) => r[0]);
    if (
      code &&
      (code.maxUses == null || code.usesCount < code.maxUses)
    ) {
      const baseForCode = code.stacksWithSale ? price : original;
      const discountedByCode = baseForCode * (1 - code.percentOff / 100);
      const finalWithCode = code.stacksWithSale
        ? discountedByCode
        : Math.min(price, discountedByCode);
      codeDiscount = code.percentOff;
      price = finalWithCode;
    }
  }

  return {
    original,
    final: Math.max(0, Math.round(price * 100) / 100),
    discountBadges: badges,
    fireDiscount,
    crownDiscount,
    trophyDiscount,
    tierGlobalDiscount,
    codeDiscount,
  };
}

export function priceLabel(result: PriceResult): string {
  if (result.final === result.original) {
    return `€${result.final.toFixed(2)}`;
  }
  return `€${result.final.toFixed(2)} ~~€${result.original.toFixed(2)}~~ ${result.discountBadges.join("")}`;
}
