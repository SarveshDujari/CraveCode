import "dotenv/config";
import { mealBriefSchema, type MealBrief } from "../shared/contracts.ts";
import { planQueries } from "./meal-search.ts";
import { suggestAdditionalQueries } from "./gemma-planner.ts";

if (!process.env.GEMMA_API_URL || !process.env.GEMMA_MODEL) {
  throw new Error("Set GEMMA_API_URL and GEMMA_MODEL in your local .env before running this evaluation.");
}

const cases: Array<{ name: string; brief: MealBrief; plausibleMenuNames: string[] }> = [
  { name: "vegetarian protein dinner", brief: mealBriefSchema.parse({ diet: "vegetarian", goal: "high-protein", minProteinG: 30, maxCaloriesKcal: 700, budgetInr: 350 }), plausibleMenuNames: ["Paneer Tikka", "Chole Bowl", "Dal Tadka", "Soya Chaap", "Rajma", "Paneer Bhurji"] },
  { name: "lighter vegetarian dinner", brief: mealBriefSchema.parse({ diet: "vegetarian", goal: "lighter", minProteinG: 15, maxCaloriesKcal: 450, budgetInr: 300 }), plausibleMenuNames: ["Tofu Salad", "Sprouts Chaat", "Grilled Paneer", "Vegetable Soup", "Tofu Bowl"] },
  { name: "egg-friendly breakfast", brief: mealBriefSchema.parse({ diet: "egg-friendly", goal: "high-protein", mealSlot: "breakfast", minProteinG: 20, maxCaloriesKcal: 550, budgetInr: 250 }), plausibleMenuNames: ["Egg Bhurji", "Egg Salad", "Idli Sambar", "Paneer Sandwich", "Egg Wrap"] },
  { name: "chicken lunch", brief: mealBriefSchema.parse({ diet: "any", goal: "high-protein", mealSlot: "lunch", minProteinG: 35, maxCaloriesKcal: 800, budgetInr: 400 }), plausibleMenuNames: ["Grilled Chicken", "Chicken Rice Bowl", "Paneer Tikka", "Egg Bhurji", "Chicken Tikka"] },
  { name: "specific dish", brief: mealBriefSchema.parse({ diet: "vegetarian", goal: "balanced", dish: "dosa", minProteinG: 10, maxCaloriesKcal: 700, budgetInr: 250 }), plausibleMenuNames: ["Masala Dosa", "Plain Dosa", "Paneer Dosa", "Idli Sambar", "Rajma"] }
];

function normalized(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(word => word.length > 2);
}

function proxyHits(queries: string[], menuNames: string[]): number {
  return menuNames.filter(name => {
    const words = normalized(name);
    return queries.some(query => {
      const queryWords = normalized(query);
      return queryWords.length > 0 && queryWords.every(word => words.includes(word));
    });
  }).length;
}

let baselineHits = 0;
let gemmaHits = 0;
let totalLatencyMs = 0;
for (const item of cases) {
  const baseline = planQueries(item.brief);
  const start = performance.now();
  const plan = await suggestAdditionalQueries(item.brief, baseline);
  const extra = plan.queries;
  const suggested = [...baseline, ...extra];
  const latencyMs = Math.round(performance.now() - start);
  const baseScore = proxyHits(baseline, item.plausibleMenuNames);
  const gemmaScore = proxyHits(suggested, item.plausibleMenuNames);
  baselineHits += baseScore;
  gemmaHits += gemmaScore;
  totalLatencyMs += latencyMs;
  console.log(JSON.stringify({ case: item.name, baseline, extra, planner: plan.planner, baselineHits: baseScore, expandedHits: gemmaScore, latencyMs }));
}
console.log(JSON.stringify({ sampleCases: cases.length, baselineHits, expandedHits: gemmaHits, additionalProxyHits: gemmaHits - baselineHits, averagePlannerLatencyMs: Math.round(totalLatencyMs / cases.length), note: "Offline menu-name proxy only; confirm actual Swiggy relevance in the signed-in local demo before claiming a gain." }));
