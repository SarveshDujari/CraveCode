import test from "node:test";
import assert from "node:assert/strict";
import { mealBriefSchema, searchRequestSchema } from "./contracts.ts";

const draft = {
  diet: "vegetarian",
  goal: "high-protein",
  minProteinG: 35,
  maxCaloriesKcal: 700,
  budgetInr: 350
};

test("a meal brief keeps units and useful defaults", () => {
  const parsed = mealBriefSchema.parse(draft);
  assert.equal(parsed.minProteinG, 35);
  assert.equal(parsed.budgetInr, 350);
  assert.equal(parsed.strictNutrition, true);
  assert.equal(parsed.mealSlot, "dinner");
});

test("a live search requires a selected address", () => {
  assert.equal(searchRequestSchema.safeParse(draft).success, false);
  assert.equal(searchRequestSchema.safeParse({ ...draft, addressId: "addr_1" }).success, true);
});

test("invalid diet and impossible calories are rejected", () => {
  assert.equal(mealBriefSchema.safeParse({ ...draft, diet: "vegetarian,non-veg" }).success, false);
  assert.equal(mealBriefSchema.safeParse({ ...draft, maxCaloriesKcal: -5 }).success, false);
});
