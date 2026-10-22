import assert from "node:assert/strict";
import test from "node:test";
import { mealBriefSchema, type PreviewMenuItem } from "../shared/contracts.ts";
import { planQueries, searchWithSwiggy, searchWithWeb } from "./meal-search.ts";
import { runMealWorkflow } from "./workflow.ts";
import { filterAdditionalIdeas } from "./gemma-planner.ts";

const brief = mealBriefSchema.parse({ diet: "vegetarian", goal: "high-protein", minProteinG: 35, maxCaloriesKcal: 700, budgetInr: 350 });
const item = (name: string, id: string, overrides: Partial<PreviewMenuItem> = {}): PreviewMenuItem => ({
  name, menuItemId: id, restaurantId: "r1", restaurantName: "Kitchen", priceInr: 250,
  imageUrl: null, isVeg: true, inStock: true, hasCustomizations: false, ...overrides
});

test("an empty dish produces bounded goal-aware searches", () => {
  assert.deepEqual(planQueries(brief), ["paneer tikka", "chole", "dal tadka", "soya chaap"]);
  assert.equal(planQueries({ ...brief, dish: "dosa" })[0], "dosa");
  assert.deepEqual(planQueries({ ...brief, maxCaloriesKcal: 400 }), ["grilled paneer", "tofu salad", "sprouts chaat", "dal soup"]);
});

test("live search deduplicates, excludes unavailable/nonveg, and never claims an exact macro match", async () => {
  const calls: string[] = [];
  const result = await searchWithSwiggy(brief, async query => {
    calls.push(query);
    if (query === "paneer tikka") return [item("Paneer Tikka", "p1"), item("Chicken Tikka", "c1", { isVeg: false })];
    if (query === "chole") return [item("Paneer Tikka", "p1"), item("Dal Bowl", "d1", { inStock: false })];
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
  const queries: string[] = [];
  const result = await searchWithWeb({ ...brief, city: "Bengaluru" }, async query => {
    queries.push(query);
    return [
    { title: "Paneer bowls nearby", url: "https://www.swiggy.com/city/bangalore/paneer-bowls", snippet: "Order paneer bowls", imageUrl: null }
    ];
  });
  assert.equal(result.source, "web-leads");
  assert.equal(queries.length, 1);
  assert.ok(queries.every(query => query.includes("site:swiggy.com/city/bangalore")));
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].menuPriceInr, null);
  assert.equal(result.results[0].availability, "unknown");
  assert.equal(result.results[0].sourceUrl, "https://www.swiggy.com/city/bangalore/paneer-bowls");
  assert.equal(result.results[0].searchTheme, "paneer tikka");
});

test("public restaurant pages can match a dish named in the snippet without admitting generic category pages", async () => {
  const result = await searchWithWeb({ ...brief, city: "Bengaluru", dish: "paneer tikka" }, async () => [
    { title: "Order from Sukh Sagar", url: "https://www.swiggy.com/city/bangalore/sukh-sagar-rest30458", snippet: "Paneer tikka on the menu", imageUrl: null },
    { title: "Best Paneer Tikka Delivery Restaurants", url: "https://www.swiggy.com/city/bangalore/paneer-tikka-dish-restaurants", snippet: "50 dishes", imageUrl: null },
    { title: "Paneer Tikka Delivery in Bangalore", url: "https://www.zomato.com/bangalore/delivery/dish-paneer-tikka", snippet: "Explore dishes", imageUrl: null }
  ]);
  assert.deepEqual(result.results.map(value => value.title), ["Order from Sukh Sagar"]);
});

test("Mastra workflow returns an evidence-labeled candidate", async () => {
  const result = await runMealWorkflow(brief, { source: "swiggy", searchMenu: async () => [item("Paneer Tikka", "p1")] });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].match, "unverified");
  assert.equal(result.queries.length, 4);
});

test("Mastra public workflow preserves unverified web labeling", async () => {
  const result = await runMealWorkflow({ ...brief, city: "Bengaluru" }, { source: "web", searchWeb: async () => [
    { title: "Paneer near me", url: "https://www.swiggy.com/paneer-near-me", snippet: "Order food", imageUrl: null }
  ] });
  assert.equal(result.source, "web-leads");
  assert.equal(result.results[0].diet, "unknown");
  assert.equal(result.results[0].menuPriceInr, null);
});

test("public discovery drops unrelated menu pages and caps output", async () => {
  const result = await searchWithWeb({ ...brief, city: "Bengaluru", dish: "paneer" }, async () => [
    { title: "Menu", url: "https://en.wikipedia.org/wiki/Menu", snippet: "Menu definition", imageUrl: null },
    { title: "The Good Bowl", url: "https://www.swiggy.com/the-good-bowl", snippet: "Order online", imageUrl: null },
    { title: "Paneer in Mumbai", url: "https://www.swiggy.com/city/mumbai/paneer-restaurants", snippet: "Order online", imageUrl: null },
    ...Array.from({ length: 20 }, (_, index) => ({ title: `Paneer restaurant ${index}`, url: `https://www.swiggy.com/paneer-${index}`, snippet: "Order online", imageUrl: null }))
  ]);
  assert.equal(result.results.length, 15);
  assert.ok(result.results.every(item => item.sourceUrl?.includes("swiggy.com")));
  assert.ok(result.results.every(item => item.title.includes("Paneer")));
  assert.ok(result.results.every(item => !item.sourceUrl?.includes("/city/mumbai/")));
});

test("live shortlist favors well-reviewed restaurants without treating ratings as safety proof", async () => {
  const result = await searchWithSwiggy(
    brief,
    async () => [
      item("Paneer Bowl", "low", { restaurantId: "low" }),
      item("Paneer Bowl", "high", { restaurantId: "high" }),
      item("Paneer Bowl", "closed", { restaurantId: "closed" })
    ],
    ["paneer"],
    async () => [
      { id: "low", rating: 3.2, ratingsText: "5 ratings", availabilityStatus: "OPEN" },
      { id: "high", rating: 4.5, ratingsText: "1K+ ratings", availabilityStatus: "OPEN" },
      { id: "closed", rating: 4.9, ratingsText: "2K+ ratings", availabilityStatus: "CLOSED" }
    ]
  );
  assert.deepEqual(result.results.map(value => value.id), ["high:high", "low:low"]);
  assert.equal(result.results[0].restaurantReview?.status, "well-reviewed");
  assert.equal(result.results[1].restaurantReview?.status, "low-rating");
  assert.match(result.results[1].cautions.join(" "), /recent reviews/);
});

test("live shortlist shows up to 15 items across restaurants", async () => {
  const result = await searchWithSwiggy(brief, async () => Array.from({ length: 20 }, (_, index) =>
    item(`Paneer Bowl ${index}`, String(index), { restaurantId: `restaurant-${index % 5}` })
  ), ["paneer"]);
  assert.equal(result.results.length, 15);
  assert.equal(new Set(result.results.map(value => value.id.split(":")[0])).size, 5);
});

test("a broad dish estimate can lower a nutrition-unlikely item without claiming a verified match", async () => {
  const result = await searchWithSwiggy({ ...brief, minProteinG: 40, maxCaloriesKcal: 200 }, async () => [
    item("Paneer Tikka", "p1"), item("Unknown Special", "u1")
  ], ["paneer"]);
  const paneer = result.results.find(value => value.title === "Paneer Tikka");
  assert.equal(paneer?.nutritionEstimate?.fit, "unlikely");
  assert.equal(paneer?.match, "unverified");
  assert.match(paneer?.cautions.join(" ") || "", /broad dish estimate/);
});

test("a simple dish estimate does not apply to a composite food without its own profile", async () => {
  const result = await searchWithSwiggy(brief, async () => [item("Paneer Pizza", "pizza")], ["paneer"]);
  assert.equal(result.results[0].nutritionEstimate, null);
});

test("Gemma expansion accepts only a new permitted dish matching the brief", () => {
  assert.deepEqual(filterAdditionalIdeas(brief, ["paneer tikka"], ["Indian food delivery", "rajma", "chicken tikka"]), ["rajma"]);
  assert.deepEqual(filterAdditionalIdeas({ ...brief, dish: "dosa" }, ["dosa"], ["rajma"]), []);
  assert.deepEqual(filterAdditionalIdeas({ ...brief, goal: "lighter", wish: "no tofu" }, ["salad"], ["tofu bowl", "sprouts chaat"]), ["sprouts chaat"]);
});

test("restaurant quality favors a substantiated rating over a slightly higher thin rating", async () => {
  const result = await searchWithSwiggy(brief, async () => [
    item("Paneer Tikka", "thin", { restaurantId: "thin" }),
    item("Paneer Tikka", "established", { restaurantId: "established" })
  ], ["paneer"], async () => [
    { id: "thin", rating: 4.6, ratingsText: "8 ratings", availabilityStatus: "OPEN", distanceKm: 9 },
    { id: "established", rating: 4.3, ratingsText: "2K+ ratings", availabilityStatus: "OPEN", distanceKm: 2 }
  ]);
  assert.equal(result.results[0].id, "established:established");
  assert.equal(result.results[0].restaurantReview?.ratingsLowerBound, 2000);
  assert.equal(result.results[1].restaurantReview?.status, "limited-feedback");
});
