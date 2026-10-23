import assert from "node:assert/strict";
import test from "node:test";
import { mealBriefSchema, type PreviewMenuItem } from "../shared/contracts.ts";
import { dishFamily, isCuisineRelevant, planLocalCandidates } from "./local-catalog.ts";

const brief = mealBriefSchema.parse({ diet: "vegetarian", goal: "high-protein", minProteinG: 30, maxCaloriesKcal: 700, budgetInr: 350 });
const item = (name: string, category?: string): PreviewMenuItem => ({
  name, category, menuItemId: name, restaurantId: "r1", restaurantName: "Kitchen",
  priceInr: 250, imageUrl: null, isVeg: true, inStock: true, hasCustomizations: false
});

test("local catalogue uses cuisine dishes and familiar keyword aliases", () => {
  const queries = planLocalCandidates({ ...brief, cuisine: "Italian" });
  assert.ok(queries.includes("pasta"));
  assert.ok(queries.includes("ravioli"));
  assert.ok(!queries.some(query => /chole|dal tadka|italian paneer/i.test(query)));
  assert.equal(dishFamily("Anda Bhurji")?.id, "egg-bhurji");
  assert.equal(dishFamily("Chana Masala")?.id, "chole");
});

test("local cuisine matching uses named dishes or supplied menu categories", () => {
  const italian = { ...brief, cuisine: "Italian" };
  assert.equal(isCuisineRelevant(item("Pesto Pasta"), italian), true);
  assert.equal(isCuisineRelevant(item("Creamy White Sauce", "Pasta"), italian), true);
  assert.equal(isCuisineRelevant(item("Italian Paneer Tikka"), italian), false);
  assert.equal(isCuisineRelevant(item("Paneer Tikka", "Italian"), italian), false);
});

test("an explicit dish uses its own aliases instead of exploring other families", () => {
  assert.deepEqual(planLocalCandidates({ ...brief, dish: "dosa" }), ["dosa", "dosai"]);
});

test("tight calorie limits move lighter dish searches ahead of heavier themes", () => {
  const queries = planLocalCandidates({ ...brief, maxCaloriesKcal: 400 });
  assert.deepEqual(queries.slice(0, 2), ["tofu salad", "sprouts chaat"]);
  assert.ok(queries.indexOf("tofu salad") < queries.indexOf("paneer curry"));
});
