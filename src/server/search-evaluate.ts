import { mealBriefSchema, type PreviewMenuItem } from "../shared/contracts.ts";
import { dishFamily } from "./local-catalog.ts";
import { planQueries, searchWithSwiggy, searchWithSwiggyAdaptive } from "./meal-search.ts";

type Scenario = {
  name: string;
  brief: ReturnType<typeof mealBriefSchema.parse>;
  menus: Record<string, string[]>;
  relevant: string[];
};

// Small, synthetic regression cases. Replace or supplement these with reviewed,
// anonymized Swiggy observations before claiming live relevance improvements.
const scenarios: Scenario[] = [
  {
    name: "Vegetarian protein dinner",
    brief: mealBriefSchema.parse({ diet: "vegetarian", goal: "high-protein", minProteinG: 35, maxCaloriesKcal: 700, budgetInr: 350 }),
    menus: {
      "paneer tikka": ["Paneer Tikka", "Chicken Tikka"],
      chole: ["Chole Masala"],
      "soya chaap": ["Soya Chaap"],
      "dal tadka": ["Dal Tadka"]
    },
    relevant: ["Paneer Tikka", "Chole Masala", "Soya Chaap", "Dal Tadka"]
  },
  {
    name: "Vegetarian Italian dinner",
    brief: mealBriefSchema.parse({ diet: "vegetarian", goal: "balanced", cuisine: "Italian", minProteinG: 15, maxCaloriesKcal: 800, budgetInr: 500 }),
    menus: {
      pasta: ["Pesto Pasta", "Paneer Tikka"],
      pizza: ["Margherita Pizza"],
      risotto: ["Mushroom Risotto"],
      lasagna: ["Veg Lasagna"]
    },
    relevant: ["Pesto Pasta", "Margherita Pizza", "Mushroom Risotto", "Veg Lasagna"]
  },
  {
    name: "Vegetarian Chinese dinner",
    brief: mealBriefSchema.parse({ diet: "vegetarian", goal: "balanced", cuisine: "Chinese", minProteinG: 15, maxCaloriesKcal: 800, budgetInr: 400 }),
    menus: {
      "veg noodles": ["Veg Hakka Noodles", "Chicken Noodles"],
      "veg fried rice": ["Veg Fried Rice"],
      "veg manchurian": ["Veg Manchurian"],
      "tofu stir fry": ["Tofu Stir Fry"]
    },
    relevant: ["Veg Hakka Noodles", "Veg Fried Rice", "Veg Manchurian", "Tofu Stir Fry"]
  }
];

let failed = false;
for (const scenario of scenarios) {
  const calls: string[] = [];
  const menu = async (query: string): Promise<PreviewMenuItem[]> => (scenario.menus[query] || []).map((name, index): PreviewMenuItem => ({
      name, menuItemId: `${query}-${index}`, restaurantId: `restaurant-${query}`, restaurantName: `Kitchen ${query}`,
      priceInr: 250, imageUrl: null, isVeg: !/\bchicken\b/i.test(name), inStock: true, hasCustomizations: false
    }));
  const baseline = await searchWithSwiggy(scenario.brief, menu, planQueries(scenario.brief));
  const result = await searchWithSwiggyAdaptive(scenario.brief, async query => { calls.push(query); return menu(query); });
  const top = result.results.slice(0, 5);
  const precisionAtFive = top.length ? top.filter(item => scenario.relevant.includes(item.title)).length / top.length : 0;
  const familiesAtFifteen = new Set(result.results.slice(0, 15).map(item => dishFamily(item.title)?.id || "other")).size;
  const relevantRetrieved = result.results.filter(item => scenario.relevant.includes(item.title)).length;
  const baselineRetrieved = baseline.results.filter(item => scenario.relevant.includes(item.title)).length;
  const passed = precisionAtFive >= 0.8 && familiesAtFifteen >= 3 && calls.length <= 4 && relevantRetrieved >= baselineRetrieved;
  if (!passed) failed = true;
  process.stdout.write(`${scenario.name}: relevant found ${baselineRetrieved}→${relevantRetrieved}, precision@5=${precisionAtFive.toFixed(2)}, families@15=${familiesAtFifteen}, menu queries=${calls.length}${passed ? "" : " FAIL"}\n`);
}
if (failed) process.exitCode = 1;
