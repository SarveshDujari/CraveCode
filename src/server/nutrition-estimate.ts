import type { MealBrief } from "../shared/contracts.ts";

export type NutritionEstimate = {
  profile: string;
  serving: string;
  caloriesKcal: { min: number; max: number };
  proteinG: { min: number; max: number };
  fit: "possible" | "unlikely";
  method: string;
  sourceUrl: string;
};

type DishProfile = Omit<NutritionEstimate, "fit" | "method" | "sourceUrl"> & { pattern: RegExp };

// These intentionally broad ranges describe a typical single serving, not a
// restaurant recipe. Ingredient composition is informed by the ICMR-NIN Indian
// Food Composition Tables; serving and cooking-fat variation are assumptions.
// The method is documented in NUTRITION_METHOD.md and must never be labeled as
// verified menu nutrition.
const profiles: DishProfile[] = [
  { profile: "Paneer roll or wrap", pattern: /\bpaneer\b.*\b(roll|wrap)\b/i, serving: "one typical roll", caloriesKcal: { min: 350, max: 950 }, proteinG: { min: 12, max: 38 } },
  { profile: "Dal rice", pattern: /\b(dal|daal)\b.*\brice\b/i, serving: "one typical meal portion", caloriesKcal: { min: 320, max: 850 }, proteinG: { min: 10, max: 28 } },
  { profile: "Chole bhature", pattern: /\b(chole|chana)\b.*\bbhature?\b/i, serving: "one typical meal portion", caloriesKcal: { min: 500, max: 1200 }, proteinG: { min: 10, max: 30 } },
  { profile: "Paneer tikka", pattern: /\bpaneer\s+tikka\b/i, serving: "one typical starter portion", caloriesKcal: { min: 250, max: 650 }, proteinG: { min: 15, max: 38 } },
  { profile: "Grilled paneer", pattern: /\bgrilled\s+paneer\b/i, serving: "one typical portion", caloriesKcal: { min: 250, max: 650 }, proteinG: { min: 15, max: 38 } },
  { profile: "Paneer curry or bowl", pattern: /\bpaneer\b/i, serving: "one typical main portion", caloriesKcal: { min: 350, max: 950 }, proteinG: { min: 14, max: 40 } },
  { profile: "Chole or chickpea dish", pattern: /\b(chole|chana|chickpea)\b/i, serving: "one typical main portion", caloriesKcal: { min: 220, max: 650 }, proteinG: { min: 8, max: 24 } },
  { profile: "Dal or lentil dish", pattern: /\b(dal|daal|lentil)\b/i, serving: "one typical main portion", caloriesKcal: { min: 160, max: 550 }, proteinG: { min: 7, max: 24 } },
  { profile: "Soya chaap", pattern: /\b(soya|soy)\s+chaap\b/i, serving: "one typical main portion", caloriesKcal: { min: 260, max: 750 }, proteinG: { min: 15, max: 38 } },
  { profile: "Egg bhurji", pattern: /\begg\s+bhurji\b/i, serving: "one typical main portion", caloriesKcal: { min: 180, max: 500 }, proteinG: { min: 11, max: 28 } },
  { profile: "Egg salad", pattern: /\begg\s+salad\b/i, serving: "one typical bowl", caloriesKcal: { min: 180, max: 550 }, proteinG: { min: 10, max: 30 } },
  { profile: "Egg rice or wrap", pattern: /\begg\s+(rice|wrap|roll)\b/i, serving: "one typical main portion", caloriesKcal: { min: 300, max: 850 }, proteinG: { min: 10, max: 32 } },
  { profile: "Grilled chicken", pattern: /\bgrilled\s+chicken\b/i, serving: "one typical main portion", caloriesKcal: { min: 220, max: 650 }, proteinG: { min: 24, max: 58 } },
  { profile: "Chicken rice or bowl", pattern: /\bchicken\s+(rice|bowl)\b/i, serving: "one typical main portion", caloriesKcal: { min: 380, max: 1000 }, proteinG: { min: 20, max: 55 } },
  { profile: "Tofu salad", pattern: /\btofu\s+salad\b/i, serving: "one typical bowl", caloriesKcal: { min: 180, max: 550 }, proteinG: { min: 10, max: 30 } },
  { profile: "Sprouts chaat", pattern: /\bsprouts?\s+chaat\b/i, serving: "one typical bowl", caloriesKcal: { min: 140, max: 450 }, proteinG: { min: 6, max: 20 } },
  { profile: "Idli", pattern: /\bidli\b/i, serving: "one typical plate", caloriesKcal: { min: 140, max: 400 }, proteinG: { min: 3, max: 13 } },
  { profile: "Vegetable soup", pattern: /\b(veg(?:etable)?|tomato)\s+soup\b/i, serving: "one typical bowl", caloriesKcal: { min: 70, max: 350 }, proteinG: { min: 2, max: 14 } },
  { profile: "Salad bowl", pattern: /\bsalad\b/i, serving: "one typical bowl", caloriesKcal: { min: 120, max: 650 }, proteinG: { min: 3, max: 25 } }
];

const sourceUrl = "https://www.nin.res.in/ebooks/IFCT2017.pdf";

export function estimateNutrition(name: string, brief: MealBrief): NutritionEstimate | null {
  const profile = profiles.find(entry => entry.pattern.test(name));
  if (!profile) return null;
  if (/\b(pizza|burger|biryani|thali|sandwich|roll|wrap|rice|bhature?)\b/i.test(name)
    && !/roll|wrap|rice|bhature?/i.test(profile.profile)) return null;
  const possible = profile.caloriesKcal.min <= brief.maxCaloriesKcal && profile.proteinG.max >= brief.minProteinG;
  return {
    profile: profile.profile,
    serving: profile.serving,
    caloriesKcal: profile.caloriesKcal,
    proteinG: profile.proteinG,
    fit: possible ? "possible" : "unlikely",
    method: "Illustrative range from a dish profile and broad serving assumptions. The linked table is background ingredient data, not this restaurant's recipe.",
    sourceUrl
  };
}
