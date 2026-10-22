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
  preferWellReviewed: z.boolean().default(true),
  dish: z.string().trim().max(80).default(""),
  city: z.string().trim().max(80).default(""),
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

export type RestaurantSignal = {
  id: string;
  rating: number | null;
  ratingsText: string | null;
  availabilityStatus: "OPEN" | "CLOSED" | "UNAVAILABLE" | null;
  areaName?: string | null;
  distanceKm?: number | null;
  deliveryTimeMinutes?: number | null;
};

export const restaurantReviewSchema = z.object({
  rating: z.number().min(0).max(5).nullable(),
  ratingsText: z.string().nullable(),
  ratingsLowerBound: z.number().nonnegative().nullable(),
  status: z.enum(["well-reviewed", "limited-feedback", "mixed-rating", "low-rating", "unknown"]),
  areaName: z.string().nullable(),
  distanceKm: z.number().nonnegative().nullable(),
  deliveryTimeMinutes: z.number().nonnegative().nullable(),
  source: z.literal("swiggy")
});

export const nutritionEstimateSchema = z.object({
  profile: z.string(), serving: z.string(),
  caloriesKcal: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }),
  proteinG: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }),
  fit: z.enum(["possible", "unlikely"]), method: z.string(), sourceUrl: z.url()
});

export const mealResultSchema = z.object({
  id: z.string(), title: z.string(), restaurant: z.string(), imageUrl: z.string().nullable(),
  menuPriceInr: z.number().nonnegative().nullable(),
  diet: z.enum(["vegetarian", "non-vegetarian", "unknown"]),
  availability: z.enum(["available", "unknown"]),
  source: z.enum(["swiggy-live", "web-lead"]), sourceUrl: z.url().nullable(),
  searchTheme: z.string().nullable(),
  restaurantReview: restaurantReviewSchema.nullable(),
  nutritionEstimate: nutritionEstimateSchema.nullable(),
  nutritionSources: z.array(z.object({ title: z.string(), url: z.url() })),
  match: z.enum(["closest", "unverified"]), reasons: z.array(z.string()), cautions: z.array(z.string()), score: z.number()
});

export const mealSearchResponseSchema = z.object({
  version: z.literal(1), jobId: z.string(), source: z.enum(["swiggy-live", "web-leads", "none"]),
  queries: z.array(z.string()), results: z.array(mealResultSchema), warnings: z.array(z.string()), searchedAt: z.iso.datetime()
});

export type MealResult = z.infer<typeof mealResultSchema>;
export type MealSearchResponse = z.infer<typeof mealSearchResponseSchema>;
