import assert from "node:assert/strict";
import test from "node:test";
import { mealBriefSchema, type PreviewMenuItem } from "../shared/contracts.ts";
import { planQueries, searchWithSwiggy, searchWithWeb } from "./meal-search.ts";
import { runMealWorkflow } from "./workflow.ts";

const brief = mealBriefSchema.parse({ diet: "vegetarian", goal: "high-protein", minProteinG: 35, maxCaloriesKcal: 700, budgetInr: 350 });
const item = (name: string, id: string, overrides: Partial<PreviewMenuItem> = {}): PreviewMenuItem => ({
  name, menuItemId: id, restaurantId: "r1", restaurantName: "Kitchen", priceInr: 250,
  imageUrl: null, isVeg: true, inStock: true, hasCustomizations: false, ...overrides
});

test("an empty dish produces bounded goal-aware searches", () => {
  assert.deepEqual(planQueries(brief), ["paneer tikka", "dal bowl", "tofu bowl", "chole"]);
  assert.equal(planQueries({ ...brief, dish: "dosa" })[0], "dosa");
});

test("live search deduplicates, excludes unavailable/nonveg, and never claims an exact macro match", async () => {
  const calls: string[] = [];
  const result = await searchWithSwiggy(brief, async query => {
    calls.push(query);
    if (query === "paneer tikka") return [item("Paneer Tikka", "p1"), item("Chicken Tikka", "c1", { isVeg: false })];
    if (query === "dal bowl") return [item("Paneer Tikka", "p1"), item("Dal Bowl", "d1", { inStock: false })];
    return [];
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(result.results.map(value => value.title), ["Paneer Tikka"]);
  assert.equal(result.results[0].match, "unverified");
  assert.match(result.results[0].cautions.join(" "), /final payable total are unknown/);
});

test("egg-friendly and explicit exclusions reject unsuitable dishes", async () => {
  const result = await searchWithSwiggy({ ...brief, diet: "egg-friendly", wish: "no mushrooms" }, async () => [
    item("Egg Bowl", "e1", { isVeg: false }),
    item("Chicken Bowl", "c1", { isVeg: false }),
    item("Mushroom Paneer", "m1")
  ]);
  assert.deepEqual(result.results.map(value => value.title), ["Egg Bowl"]);
});

test("public results are labeled as leads with no fabricated price or availability", async () => {
  const result = await searchWithWeb({ ...brief, city: "Bengaluru" }, async () => [
    { title: "Paneer bowls nearby", url: "https://example.com/menu", snippet: "Order paneer bowls", imageUrl: null }
  ]);
  assert.equal(result.source, "web-leads");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].menuPriceInr, null);
  assert.equal(result.results[0].availability, "unknown");
  assert.equal(result.results[0].sourceUrl, "https://example.com/menu");
});

test("Mastra workflow returns an evidence-labeled candidate", async () => {
  const result = await runMealWorkflow(brief, { source: "swiggy", searchMenu: async () => [item("Paneer Tikka", "p1")] });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].match, "unverified");
  assert.equal(result.queries.length, 4);
});

test("Mastra public workflow preserves unverified web labeling", async () => {
  const result = await runMealWorkflow({ ...brief, city: "Bengaluru" }, { source: "web", searchWeb: async () => [
    { title: "Paneer near me", url: "https://example.com/food", snippet: "Order food", imageUrl: null }
  ] });
  assert.equal(result.source, "web-leads");
  assert.equal(result.results[0].diet, "unknown");
  assert.equal(result.results[0].menuPriceInr, null);
});
