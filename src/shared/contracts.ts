import { z } from "zod";

export const dietSchema = z.enum(["vegetarian", "egg-friendly", "any"]);
export const goalSchema = z.enum(["high-protein", "balanced", "lighter"]);
export const confidenceSchema = z.enum(["documented", "estimated", "unknown"]);

export const mealBriefSchema = z.object({
  addressId: z.string().min(1).optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  diet: dietSchema,
  goal: goalSchema,
  minProteinG: z.number().finite().min(0).max(200),
  maxCaloriesKcal: z.number().finite().min(100).max(3000),
  budgetInr: z.number().finite().min(50).max(10000),
  strictNutrition: z.boolean().default(true),
  cuisine: z.string().trim().max(80).default(""),
  wish: z.string().trim().max(280).default("")
});

export const searchRequestSchema = mealBriefSchema.extend({
  addressId: z.string().min(1)
});

export const nutritionClaimSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  menuItemId: z.string(),
  portion: z.string().nullable(),
  proteinG: z.number().nonnegative().nullable(),
  caloriesKcal: z.number().nonnegative().nullable(),
  confidence: confidenceSchema,
  sourceUrl: z.url().nullable(),
  observedAt: z.iso.datetime()
});

export const candidateSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  platform: z.literal("swiggy"),
  restaurantId: z.string(),
  restaurantName: z.string(),
  menuItemId: z.string(),
  itemName: z.string(),
  imageUrl: z.url().nullable(),
  isVeg: z.boolean().nullable(),
  inStock: z.boolean().nullable(),
  menuPriceInr: z.number().nonnegative().nullable(),
  nutritionClaimIds: z.array(z.string()),
  matchStatus: z.enum(["exact", "closest", "unverified"]),
  reasons: z.array(z.string()),
  observedAt: z.iso.datetime()
});

export const cartAuditSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  candidateId: z.string(),
  consentAt: z.iso.datetime(),
  status: z.enum(["pending", "verified", "needs-review", "failed"]),
  beforeCartHash: z.string().nullable(),
  afterCartHash: z.string().nullable(),
  liveToPayInr: z.number().nonnegative().nullable(),
  auditedAt: z.iso.datetime().nullable()
});

export type MealBrief = z.infer<typeof mealBriefSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type NutritionClaim = z.infer<typeof nutritionClaimSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type CartAudit = z.infer<typeof cartAuditSchema>;

export type PreviewMenuItem = {
  name: string;
  menuItemId: string;
  restaurantId: string;
  restaurantName: string;
  priceInr: number | null;
  imageUrl: string | null;
  isVeg: boolean | null;
  inStock: boolean | null;
  hasCustomizations: boolean;
};
