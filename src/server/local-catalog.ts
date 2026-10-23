import type { MealBrief, PreviewMenuItem } from "../shared/contracts.ts";

type DietGroup = "vegetarian" | "egg-friendly" | "any";
type Goal = MealBrief["goal"];
type Slot = MealBrief["mealSlot"];
type Cuisine = "north-indian" | "south-indian" | "italian" | "chinese" | "mexican" | "thai" | "gujarati" | "general";
type Family = {
  id: string; cuisine: Cuisine; query: string; aliases: string[];
  diet: DietGroup; goals: Goal[]; slots?: Slot[]; alternatives?: string[];
};

// Search phrases are menu words people actually use. Aliases are for matching
// provider results, not extra calls or nutrition claims.
const families: Family[] = [
  { id: "paneer-tikka", cuisine: "north-indian", query: "paneer tikka", aliases: ["paneer tikka", "grilled paneer"], diet: "vegetarian", goals: ["high-protein", "balanced"], slots: ["lunch", "dinner", "snack"] },
  { id: "chole", cuisine: "north-indian", query: "chole", aliases: ["chole", "chana masala", "chickpea curry"], diet: "vegetarian", goals: ["high-protein", "balanced"], alternatives: ["chana masala"] },
  { id: "soya-chaap", cuisine: "north-indian", query: "soya chaap", aliases: ["soya chaap", "soy chaap"], diet: "vegetarian", goals: ["high-protein"] },
  { id: "dal", cuisine: "north-indian", query: "dal tadka", aliases: ["dal tadka", "daal tadka", "dal fry", "dal makhani", "lentil curry"], diet: "vegetarian", goals: ["high-protein", "balanced"], alternatives: ["dal fry"] },
  { id: "rajma", cuisine: "north-indian", query: "rajma", aliases: ["rajma", "kidney bean curry"], diet: "vegetarian", goals: ["high-protein", "balanced"] },
  { id: "paneer-curry", cuisine: "north-indian", query: "paneer curry", aliases: ["paneer curry", "kadai paneer", "shahi paneer", "paneer butter masala", "paneer masala"], diet: "vegetarian", goals: ["balanced", "high-protein"] },
  { id: "veg-thali", cuisine: "north-indian", query: "veg thali", aliases: ["veg thali", "vegetarian thali"], diet: "vegetarian", goals: ["balanced"] },
  { id: "chicken-tikka", cuisine: "north-indian", query: "chicken tikka", aliases: ["chicken tikka", "grilled chicken tikka"], diet: "any", goals: ["high-protein", "balanced"] },
  { id: "egg-bhurji", cuisine: "north-indian", query: "egg bhurji", aliases: ["egg bhurji", "anda bhurji"], diet: "egg-friendly", goals: ["high-protein", "balanced"], slots: ["breakfast", "snack"] },
  { id: "dosa", cuisine: "south-indian", query: "dosa", aliases: ["dosa", "dosai"], diet: "vegetarian", goals: ["balanced"], slots: ["breakfast", "lunch", "dinner"] },
  { id: "idli", cuisine: "south-indian", query: "idli", aliases: ["idli", "idly"], diet: "vegetarian", goals: ["lighter", "balanced"], slots: ["breakfast", "snack"] },
  { id: "uttapam", cuisine: "south-indian", query: "uttapam", aliases: ["uttapam", "uthappam"], diet: "vegetarian", goals: ["balanced"], slots: ["breakfast"] },
  { id: "sambar", cuisine: "south-indian", query: "sambar", aliases: ["sambar", "sambhar"], diet: "vegetarian", goals: ["lighter", "balanced"] },
  { id: "pasta", cuisine: "italian", query: "pasta", aliases: ["pasta", "penne", "spaghetti", "fusilli", "fettuccine", "macaroni", "alfredo", "arrabbiata", "aglio olio", "pesto"], diet: "vegetarian", goals: ["balanced", "high-protein"], alternatives: ["penne pasta"] },
  { id: "pizza", cuisine: "italian", query: "pizza", aliases: ["pizza", "margherita", "calzone"], diet: "vegetarian", goals: ["balanced"] },
  { id: "risotto", cuisine: "italian", query: "risotto", aliases: ["risotto"], diet: "vegetarian", goals: ["balanced"] },
  { id: "lasagna", cuisine: "italian", query: "lasagna", aliases: ["lasagna", "lasagne"], diet: "vegetarian", goals: ["balanced"] },
  { id: "ravioli", cuisine: "italian", query: "ravioli", aliases: ["ravioli"], diet: "vegetarian", goals: ["balanced", "high-protein"] },
  { id: "gnocchi", cuisine: "italian", query: "gnocchi", aliases: ["gnocchi"], diet: "vegetarian", goals: ["balanced"] },
  { id: "minestrone", cuisine: "italian", query: "minestrone", aliases: ["minestrone"], diet: "vegetarian", goals: ["lighter"], slots: ["lunch", "dinner"] },
  { id: "bruschetta", cuisine: "italian", query: "bruschetta", aliases: ["bruschetta", "focaccia"], diet: "vegetarian", goals: ["lighter", "balanced"], slots: ["snack"] },
  { id: "garlic-bread", cuisine: "italian", query: "garlic bread", aliases: ["garlic bread"], diet: "vegetarian", goals: ["balanced"], slots: ["snack"] },
  { id: "chicken-pasta", cuisine: "italian", query: "chicken pasta", aliases: ["chicken pasta"], diet: "any", goals: ["high-protein"] },
  { id: "noodles", cuisine: "chinese", query: "veg noodles", aliases: ["noodles", "hakka noodles"], diet: "vegetarian", goals: ["balanced"] },
  { id: "fried-rice", cuisine: "chinese", query: "veg fried rice", aliases: ["fried rice"], diet: "vegetarian", goals: ["balanced"] },
  { id: "tofu-stir-fry", cuisine: "chinese", query: "tofu stir fry", aliases: ["tofu stir fry", "tofu stir-fry"], diet: "vegetarian", goals: ["high-protein", "lighter"] },
  { id: "manchurian", cuisine: "chinese", query: "veg manchurian", aliases: ["manchurian"], diet: "vegetarian", goals: ["balanced"] },
  { id: "chicken-noodles", cuisine: "chinese", query: "chicken noodles", aliases: ["chicken noodles"], diet: "any", goals: ["high-protein", "balanced"] },
  { id: "burrito-bowl", cuisine: "mexican", query: "burrito bowl", aliases: ["burrito bowl"], diet: "vegetarian", goals: ["high-protein", "balanced"] },
  { id: "burrito", cuisine: "mexican", query: "burrito", aliases: ["burrito"], diet: "vegetarian", goals: ["balanced"] },
  { id: "taco", cuisine: "mexican", query: "taco", aliases: ["taco", "tacos"], diet: "vegetarian", goals: ["balanced"] },
  { id: "quesadilla", cuisine: "mexican", query: "quesadilla", aliases: ["quesadilla"], diet: "vegetarian", goals: ["balanced"] },
  { id: "pad-thai", cuisine: "thai", query: "pad thai", aliases: ["pad thai"], diet: "vegetarian", goals: ["balanced"] },
  { id: "thai-curry", cuisine: "thai", query: "thai curry", aliases: ["thai curry", "green curry", "red curry"], diet: "vegetarian", goals: ["balanced"] },
  { id: "basil-tofu", cuisine: "thai", query: "basil tofu", aliases: ["basil tofu", "thai tofu"], diet: "vegetarian", goals: ["high-protein", "lighter"] },
  { id: "dhokla", cuisine: "gujarati", query: "dhokla", aliases: ["dhokla", "khaman"], diet: "vegetarian", goals: ["lighter", "balanced"], slots: ["breakfast", "snack"] },
  { id: "thepla", cuisine: "gujarati", query: "thepla", aliases: ["thepla"], diet: "vegetarian", goals: ["balanced"], slots: ["breakfast"] },
  { id: "khichdi", cuisine: "gujarati", query: "khichdi", aliases: ["khichdi", "khichri"], diet: "vegetarian", goals: ["lighter", "balanced"] },
  { id: "gujarati-thali", cuisine: "gujarati", query: "gujarati thali", aliases: ["gujarati thali"], diet: "vegetarian", goals: ["balanced"] },
  { id: "tofu-salad", cuisine: "general", query: "tofu salad", aliases: ["tofu salad", "tofu bowl"], diet: "vegetarian", goals: ["high-protein", "lighter"] },
  { id: "sprouts", cuisine: "general", query: "sprouts chaat", aliases: ["sprouts chaat", "sprout salad"], diet: "vegetarian", goals: ["high-protein", "lighter"], slots: ["breakfast", "snack"] },
  { id: "salad", cuisine: "general", query: "salad bowl", aliases: ["salad bowl", "vegetable salad"], diet: "vegetarian", goals: ["lighter"] },
  { id: "soup", cuisine: "general", query: "vegetable soup", aliases: ["vegetable soup", "tomato soup"], diet: "vegetarian", goals: ["lighter"] },
  { id: "grilled-chicken", cuisine: "general", query: "grilled chicken", aliases: ["grilled chicken"], diet: "any", goals: ["high-protein", "lighter"] },
  { id: "egg-salad", cuisine: "general", query: "egg salad", aliases: ["egg salad"], diet: "egg-friendly", goals: ["high-protein", "lighter"] }
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function localCuisine(value: string): Cuisine | null {
  const key = normalize(value);
  if (!key) return null;
  if (/\bitalian\b/.test(key)) return "italian";
  if (/\b(?:south indian|andhra|tamil|kerala)\b/.test(key)) return "south-indian";
  if (/\b(?:north indian|punjabi)\b/.test(key)) return "north-indian";
  if (/\bchinese\b/.test(key)) return "chinese";
  if (/\bmexican\b/.test(key)) return "mexican";
  if (/\bthai\b/.test(key)) return "thai";
  if (/\bgujarati\b/.test(key)) return "gujarati";
  return null;
}

export function dishFamily(value: string): Family | null {
  const padded = ` ${normalize(value)} `;
  let best: { family: Family; length: number } | null = null;
  for (const family of families) for (const alias of family.aliases) {
    const normalized = normalize(alias);
    if (padded.includes(` ${normalized} `) && normalized.length > (best?.length || 0)) best = { family, length: normalized.length };
  }
  return best?.family || null;
}

export function menuDishFamily(item: PreviewMenuItem): Family | null {
  return dishFamily(item.name) || dishFamily(item.category || "") || dishFamily(item.description || "");
}

export function isCuisineRelevant(item: PreviewMenuItem, brief: MealBrief): boolean {
  const desired = localCuisine(brief.cuisine);
  if (!desired) {
    const requested = normalize(brief.cuisine);
    return !requested || normalize(`${item.name} ${item.category || ""} ${item.description || ""}`).includes(requested);
  }
  const named = dishFamily(item.name);
  if (named) return named.cuisine === desired;
  const category = dishFamily(item.category || "");
  if (category) return category.cuisine === desired;
  if (localCuisine(item.category || "") === desired) return true;
  const description = dishFamily(item.description || "");
  return description?.cuisine === desired;
}

export function planLocalCandidates(brief: MealBrief): string[] {
  const desired = localCuisine(brief.cuisine);
  if (brief.cuisine.trim() && !desired && !brief.dish.trim()) return [brief.cuisine.trim().toLowerCase()];
  const allowed = (family: Family) => (brief.diet === "any" || family.diet === "vegetarian" || (brief.diet === "egg-friendly" && family.diet === "egg-friendly"))
    && (desired ? family.cuisine === desired : ["north-indian", "south-indian", "general"].includes(family.cuisine));
  const scored = families.filter(allowed).map((family, index) => ({
    family, index,
    score: (family.goals.includes(brief.goal) ? 6 : 0)
      + (brief.minProteinG >= 30 && family.goals.includes("high-protein") ? 4 : 0)
      + (brief.maxCaloriesKcal < 500 && family.goals.includes("lighter") ? 9 : 0)
      + (family.slots?.includes(brief.mealSlot) ? 3 : 0)
      + (brief.mealSlot === "breakfast" && family.slots && !family.slots.includes("breakfast") ? -2 : 0)
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const explicit = brief.dish.trim();
  if (explicit) {
    const family = dishFamily(explicit);
    const variants = family ? [family.query, ...family.aliases, ...(family.alternatives || [])] : [];
    return [...new Set([explicit, ...variants].map(value => value.toLowerCase().trim()).filter(Boolean))].slice(0, 12);
  }
  // An open diet should actually explore both vegetarian and meat dishes.
  // Otherwise the catalogue's original order can fill all four search slots
  // with vegetarian themes before the first chicken query is ever attempted.
  const ordered = brief.diet === "any" ? (() => {
    const vegetarian = scored.filter(value => value.family.diet === "vegetarian");
    const nonVegetarian = scored.filter(value => value.family.diet === "any");
    if (!vegetarian.length || !nonVegetarian.length) return scored;
    const alternated: typeof scored = [];
    for (let index = 0; index < Math.max(vegetarian.length, nonVegetarian.length); index++) {
      if (vegetarian[index]) alternated.push(vegetarian[index]);
      if (nonVegetarian[index]) alternated.push(nonVegetarian[index]);
    }
    const included = new Set(alternated.map(value => value.family.id));
    return [...alternated, ...scored.filter(value => !included.has(value.family.id))];
  })() : scored;
  const queries = [
    ...(desired ? [] : brief.cuisine.trim() ? [brief.cuisine.trim()] : []),
    ...ordered.map(value => value.family.query),
    ...ordered.flatMap(value => value.family.alternatives || [])
  ];
  return [...new Set(queries.map(value => value.toLowerCase().trim()).filter(Boolean))].slice(0, 12);
}

export function queryFamily(query: string): string | null {
  return dishFamily(query)?.id || null;
}
