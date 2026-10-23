import assert from "node:assert/strict";
import test from "node:test";
import { mealBriefSchema, type PreviewMenuItem } from "../shared/contracts.ts";
import { planQueries, rankLiveItems, searchWithSwiggy, searchWithSwiggyAdaptive, searchWithWeb } from "./meal-search.ts";
import { runMealWorkflow } from "./workflow.ts";
import { filterAdditionalIdeas, suggestAdditionalQueries } from "./gemma-planner.ts";

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

test("Italian preference uses Italian dish themes instead of prefixed Indian dishes", () => {
  const italian = { ...brief, cuisine: "Italian" };
  assert.deepEqual(planQueries(italian), ["pasta", "paneer pasta", "pizza", "lasagna"]);
  assert.deepEqual(planQueries({ ...italian, goal: "lighter", maxCaloriesKcal: 450 }), ["minestrone", "bruschetta", "pasta", "risotto"]);
  assert.deepEqual(planQueries({ ...italian, dish: "ravioli" }), ["ravioli", "pasta", "paneer pasta", "pizza"]);
});

test("Italian live search shows Italian dish names and drops unrelated returned items", async () => {
  const italian = { ...brief, cuisine: "Italian" };
  const result = await searchWithSwiggy(italian, async () => [
    item("Paneer Tikka", "indian"), item("Italian Paneer Tikka", "italian-label-only"),
    item("Pesto Pasta", "pasta"), item("Margherita Pizza", "pizza")
  ]);
  assert.deepEqual(result.results.map(value => value.title).sort(), ["Margherita Pizza", "Pesto Pasta"]);
  assert.ok(result.results.every(value => value.cautions.some(caution => caution.includes("Cuisine is inferred"))));
});

test("Italian public discovery needs an Italian dish signal in the lead", async () => {
  const result = await searchWithWeb({ ...brief, city: "Bengaluru", cuisine: "Italian" }, async () => [
    { title: "Paneer Tikka", url: "https://www.swiggy.com/city/bangalore/paneer-tikka", snippet: "Order online", imageUrl: null },
    { title: "Pesto Pasta", url: "https://www.swiggy.com/city/bangalore/pesto-pasta", snippet: "Order online", imageUrl: null }
  ]);
  assert.deepEqual(result.results.map(value => value.title), ["Pesto Pasta"]);
  assert.ok(result.queries.every(value => !value.includes("chole")));
});

test("adaptive local search fills missing dish families within four menu queries", async () => {
  const calls: string[] = [];
  const result = await searchWithSwiggyAdaptive(brief, async query => {
    calls.push(query);
    return query === "paneer tikka" ? [item("Paneer Tikka", "p1")]
      : query === "chole" ? [item("Chole", "c1")]
      : query === "soya chaap" ? [item("Soya Chaap", "s1")]
      : [item("Dal Tadka", "d1")];
  });
  assert.equal(calls.length, 4);
  assert.equal(result.queries.length, 4);
  assert.deepEqual(new Set(result.results.map(value => value.title)), new Set(["Paneer Tikka", "Chole", "Soya Chaap", "Dal Tadka"]));
});

test("adaptive local search stops early when two queries yield enough variety", async () => {
  const calls: string[] = [];
  const result = await searchWithSwiggyAdaptive(brief, async query => {
    calls.push(query);
    return Array.from({ length: 12 }, (_, index) => item(
      index % 3 === 0 ? `Paneer Tikka ${index}` : index % 3 === 1 ? `Paneer Curry ${index}` : `Chole ${index}`,
      `${query}-${index}`, { restaurantId: `r${index % 4}` }
    ));
  });
  assert.equal(calls.length, 2);
  assert.equal(result.queries.length, 2);
  assert.equal(result.results.length, 12);
});

test("an open diet tries another meat theme when the first two searches return only vegetarian dishes", async () => {
  const anyDiet = { ...brief, diet: "any" as const, minProteinG: 30, maxCaloriesKcal: 800, budgetInr: 300 };
  const calls: string[] = [];
  const result = await searchWithSwiggyAdaptive(anyDiet, async query => {
    calls.push(query);
    if (query === "paneer tikka") return Array.from({ length: 15 }, (_, index) => item(
      index % 3 === 0 ? `Paneer Tikka ${index}` : index % 3 === 1 ? `Paneer Curry ${index}` : `Paneer Salad Bowl ${index}`,
      `veg-${index}`, { restaurantId: `veg-r${index}` }
    ));
    if (query === "grilled chicken") return [
      item("Grilled Chicken", "meat-1", { restaurantId: "meat-r1", isVeg: false }),
      item("Grilled Chicken Tikka", "meat-2", { restaurantId: "meat-r2", isVeg: false })
    ];
    return [];
  });
  assert.deepEqual(calls.slice(0, 2), ["paneer tikka", "chicken tikka"]);
  assert.ok(calls.includes("grilled chicken"));
  assert.ok(calls.length <= 4);
  assert.ok(result.results.some(value => value.diet === "vegetarian"));
  assert.ok(result.results.some(value => value.diet === "non-vegetarian"));
});

test("local ranking rejects unrelated dishes, over-budget items, and unrelated explicit dishes", () => {
  const results = rankLiveItems([
    item("Masala Dosa", "dosa"),
    item("Paneer Tikka", "unrelated"),
    item("Dosa Combo", "expensive", { priceInr: 500 })
  ], { ...brief, dish: "dosa" }, ["dosa"]);
  assert.deepEqual(results.map(value => value.title), ["Masala Dosa"]);
});

test("local ranking accepts a provider category when the dish name is generic", () => {
  const results = rankLiveItems([
    item("Creamy White Sauce", "pasta", { category: "Pasta" }),
    item("Paneer Tikka", "indian", { category: "Italian" })
  ], { ...brief, cuisine: "Italian" }, ["pasta"]);
  assert.deepEqual(results.map(value => value.title), ["Creamy White Sauce"]);
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

test("clear meat names are labeled non-veg when Swiggy omits the diet flag", async () => {
  const anyDiet = { ...brief, diet: "any" as const };
  const result = await searchWithSwiggy(anyDiet, async () => [
    item("Chicken Pasta", "chicken", { isVeg: null }),
    item("House Pasta Special", "unknown", { isVeg: null }),
    item("Vegan Mock Chicken Pasta", "mock", { isVeg: null })
  ], ["pasta"]);
  assert.equal(result.results.find(value => value.title === "Chicken Pasta")?.diet, "non-vegetarian");
  assert.match(result.results.find(value => value.title === "Chicken Pasta")?.cautions.join(" ") || "", /inferred from the dish name/);
  assert.equal(result.results.find(value => value.title === "House Pasta Special")?.diet, "unknown");
  assert.equal(result.results.find(value => value.title === "Vegan Mock Chicken Pasta")?.diet, "unknown");

  const eggFriendly = await searchWithSwiggy({ ...brief, diet: "egg-friendly" }, async () => [
    item("Chicken Pasta", "chicken", { isVeg: null }),
    item("Chicken Egg Pasta", "chicken-egg", { isVeg: null }),
    item("Egg Pasta", "egg", { isVeg: null })
  ], ["pasta"]);
  assert.deepEqual(eggFriendly.results.map(value => value.title), ["Egg Pasta"]);
  assert.equal(eggFriendly.results[0].diet, "non-vegetarian");
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

test("local shortlist spreads early cards across dish families", () => {
  const items = [
    ...Array.from({ length: 12 }, (_, index) => item(`Paneer Tikka ${index}`, `paneer-${index}`, { restaurantId: `paneer-r${index}` })),
    ...Array.from({ length: 4 }, (_, index) => item(`Chole ${index}`, `chole-${index}`, { restaurantId: `chole-r${index}` })),
    ...Array.from({ length: 4 }, (_, index) => item(`Dal Tadka ${index}`, `dal-${index}`, { restaurantId: `dal-r${index}` }))
  ];
  const result = rankLiveItems(items, brief, ["paneer tikka", "chole", "dal tadka"]);
  assert.equal(result.length, 15);
  assert.ok(result.slice(0, 9).some(value => value.title.startsWith("Chole")));
  assert.ok(result.slice(0, 9).some(value => value.title.startsWith("Dal")));
  assert.ok(result.slice(0, 9).some(value => value.title.startsWith("Paneer")));
});

test("an open-diet shortlist shows both eligible diet groups near the top", () => {
  const anyDiet = { ...brief, diet: "any" as const, minProteinG: 30, maxCaloriesKcal: 800, budgetInr: 300 };
  const items = [
    ...Array.from({ length: 18 }, (_, index) => item(`Paneer Tikka ${index}`, `veg-${index}`, { restaurantId: `veg-r${index}` })),
    ...Array.from({ length: 3 }, (_, index) => item(`Chicken Tikka ${index}`, `meat-${index}`, { restaurantId: `meat-r${index}`, isVeg: false }))
  ];
  const result = rankLiveItems(items, anyDiet, ["paneer tikka", "chicken tikka"]);
  assert.equal(result.length, 15);
  assert.equal(result.slice(0, 4).filter(value => value.diet === "vegetarian").length, 2);
  assert.equal(result.slice(0, 4).filter(value => value.diet === "non-vegetarian").length, 2);
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
  assert.deepEqual(filterAdditionalIdeas({ ...brief, cuisine: "Gujarati" }, ["paneer tikka"], ["rajma", "dhokla"]), ["dhokla"]);
  assert.deepEqual(filterAdditionalIdeas({ ...brief, cuisine: "Chinese" }, ["veg noodles"], ["rajma", "veg fried rice"]), ["veg fried rice"]);
  assert.deepEqual(filterAdditionalIdeas({ ...brief, cuisine: "Italian" }, ["pasta"], ["rajma", "ravioli", "risotto"]), ["ravioli", "risotto"]);
});

test("Gemma expansion falls back to safe themes when the model is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GEMMA_API_URL;
  const originalModel = process.env.GEMMA_MODEL;
  const originalRender = process.env.RENDER;
  try {
    delete process.env.RENDER;
    process.env.GEMMA_API_URL = "http://localhost:11436/api/generate";
    process.env.GEMMA_MODEL = "gemma3:270m";
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;
    const plan = await suggestAdditionalQueries(brief, planQueries(brief));
    assert.equal(plan.planner, "fallback");
    assert.deepEqual(plan.queries, ["rajma", "dal makhani", "paneer bhurji"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GEMMA_API_URL; else process.env.GEMMA_API_URL = originalUrl;
    if (originalModel === undefined) delete process.env.GEMMA_MODEL; else process.env.GEMMA_MODEL = originalModel;
    if (originalRender === undefined) delete process.env.RENDER; else process.env.RENDER = originalRender;
  }
});

test("Gemma can select several novel diet-safe dish themes", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GEMMA_API_URL;
  const originalModel = process.env.GEMMA_MODEL;
  const originalRender = process.env.RENDER;
  try {
    delete process.env.RENDER;
    process.env.GEMMA_API_URL = "http://localhost:11436/api/generate";
    process.env.GEMMA_MODEL = "gemma3:270m";
    globalThis.fetch = (async () => new Response(JSON.stringify({ response: JSON.stringify({ queries: ["rajma", "chicken tikka", "paneer bhurji", "dal makhani"] }) }), { status: 200 })) as typeof fetch;
    const plan = await suggestAdditionalQueries(brief, ["paneer tikka"]);
    assert.equal(plan.planner, "gemma");
    assert.deepEqual(plan.queries, ["rajma", "paneer bhurji", "dal makhani"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GEMMA_API_URL; else process.env.GEMMA_API_URL = originalUrl;
    if (originalModel === undefined) delete process.env.GEMMA_MODEL; else process.env.GEMMA_MODEL = originalModel;
    if (originalRender === undefined) delete process.env.RENDER; else process.env.RENDER = originalRender;
  }
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
