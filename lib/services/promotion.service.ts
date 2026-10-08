import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';

export interface ActivePromotion {
  id: string;
  name: string;
  discountPercentage: number;
  startDate: string;
  endDate?: string | null;
  activeWeekdays: number[];
  timezone: string;
}

export interface PromotionPrice {
  originalPrice: number;
  effectivePrice: number;
  discountPercentage: number;
  discountAmount: number;
  promotionId: string;
  promotionName: string;
  promotionStartDate: string;
  promotionEndDate?: string | null;
  promotionWeekdays: number[];
}

export function calculatePromotionalPrice(basePrice: number, promotion: ActivePromotion): PromotionPrice {
  const originalPrice = Number(basePrice) || 0;
  const discountPercentage = Number(promotion.discountPercentage) || 0;
  const effectivePrice = Number((originalPrice * (1 - discountPercentage / 100)).toFixed(2));
  return {
    originalPrice,
    effectivePrice,
    discountPercentage,
    discountAmount: Number((originalPrice - effectivePrice).toFixed(2)),
    promotionId: promotion.id,
    promotionName: promotion.name,
    promotionStartDate: promotion.startDate,
    promotionEndDate: promotion.endDate ?? null,
    promotionWeekdays: promotion.activeWeekdays,
  };
}

/**
 * Returns currently-active promotions keyed by product id.
 *
 * Promotion activation is evaluated in the promotion's configured timezone
 * on the server. This keeps POS pricing authoritative even if a cashier
 * workstation has an incorrect clock.
 */
export async function getActivePromotionsByProduct(
  ctx: TenantContext,
  branchId?: string,
): Promise<Map<string, ActivePromotion>> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const rows = branchId
    ? await sql`
        SELECT
          pp.product_id,
          p.id,
          p.name,
          p.discount_percentage,
          p.start_date,
          p.end_date,
          p.active_weekdays,
          p.timezone
        FROM promotions p
        JOIN promotion_products pp
          ON pp.promotion_id = p.id
         AND pp.organization_id = p.organization_id
         AND pp.branch_id = p.branch_id
        WHERE p.organization_id = ${ctx.organizationId}
          AND p.branch_id = ${branchId}
          AND p.status = 'active'
          AND (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date >= p.start_date
          AND (p.end_date IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date <= p.end_date)
          AND EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE p.timezone))::int = ANY(p.active_weekdays)
        ORDER BY p.discount_percentage DESC, p.created_at ASC
      `
    : await sql`
        SELECT
          pp.product_id,
          p.id,
          p.name,
          p.discount_percentage,
          p.start_date,
          p.end_date,
          p.active_weekdays,
          p.timezone
        FROM promotions p
        JOIN promotion_products pp
          ON pp.promotion_id = p.id
         AND pp.organization_id = p.organization_id
         AND pp.branch_id = p.branch_id
        WHERE p.organization_id = ${ctx.organizationId}
          AND p.status = 'active'
          AND (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date >= p.start_date
          AND (p.end_date IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date <= p.end_date)
          AND EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE p.timezone))::int = ANY(p.active_weekdays)
        ORDER BY p.discount_percentage DESC, p.created_at ASC
      `;

  const byProduct = new Map<string, ActivePromotion>();
  for (const row of rows as any[]) {
    const productId = String(row.product_id);
    if (byProduct.has(productId)) continue;
    byProduct.set(productId, {
      id: String(row.id),
      name: String(row.name),
      discountPercentage: Number(row.discount_percentage),
      startDate: String(row.start_date),
      endDate: row.end_date ? String(row.end_date) : null,
      activeWeekdays: Array.isArray(row.active_weekdays) ? row.active_weekdays.map(Number) : [],
      timezone: String(row.timezone || 'Africa/Kampala'),
    });
  }
  return byProduct;
}

export async function getActivePromotionForProduct(
  ctx: TenantContext,
  branchId: string,
  productId: string,
): Promise<ActivePromotion | null> {
  const map = await getActivePromotionsByProduct(ctx, branchId);
  return map.get(productId) || null;
}
