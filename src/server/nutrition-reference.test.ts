import assert from "node:assert/strict";
import test from "node:test";
import { parseNutritionReference } from "./nutrition-reference.ts";

test("a cited generic serving is preserved without claiming restaurant-specific nutrition", () => {
  const reference = parseNutritionReference("Paneer Tikka", { nutrition_information: {
    description: "Paneer tikka", amount_per: "100 g", calories: "210",
    protein: ["12 g", "24%"], source: "Example database", source_link: "https://example.org/paneer-tikka"
  } });
  assert.equal(reference?.caloriesKcal, 210);
  assert.equal(reference?.serving, "100 g");
  assert.equal(reference?.proteinG, 12);
  assert.equal(reference?.sourceUrl, "https://example.org/paneer-tikka");
});

test("nutrition lookup rejects a different dish or missing serving evidence", () => {
  const payload = { nutrition_information: {
    description: "Paneer tikka", amount_per: "100 g", calories: "210",
    source: "Example database", source_link: "https://example.org/paneer"
  } };
  assert.equal(parseNutritionReference("Chicken Biryani", payload), null);
  assert.equal(parseNutritionReference("Paneer Tikka", { nutrition_information: { ...payload.nutrition_information, amount_per: undefined } }), null);
});
