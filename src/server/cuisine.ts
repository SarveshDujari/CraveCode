import type { MealBrief } from "../shared/contracts.ts";

// A cuisine request needs dish-specific searches. Prefixing a cuisine to an
// unrelated goal theme (for example, "Italian chole") gives poor coverage.
export function requestedCuisine(brief: MealBrief): "italian" | null {
  return /\bitalian\b/i.test(brief.cuisine) ? "italian" : null;
}

export function italianSearchThemes(brief: MealBrief): string[] {
  if (brief.mealSlot === "snack") return ["bruschetta", "garlic bread", "pizza", "pasta"];
  if (brief.goal === "lighter" || brief.maxCaloriesKcal < 500) return ["minestrone", "bruschetta", "pasta", "risotto"];
  if (brief.goal === "high-protein") return brief.diet === "any"
    ? ["pasta", "chicken pasta", "pizza", "lasagna"]
    : ["pasta", "paneer pasta", "pizza", "lasagna"];
  return ["pasta", "pizza", "risotto", "lasagna"];
}

const italianDishPattern = /\b(?:pasta|spaghetti|penne|fusilli|macaroni|fettuccine|linguine|ravioli|gnocchi|lasagn[ae]|risotto|pizza|margherita|minestrone|bruschetta|focaccia|calzone|cannelloni|tiramisu|pesto|arrabbiata|alfredo|caprese|panzanella|garlic\s+bread|aglio\s+olio)\b/i;

// This is dish-name evidence, not proof of a restaurant's cuisine or recipe.
export function looksLikeItalianDish(value: string): boolean {
  return italianDishPattern.test(value);
}

export function italianAdditionalIdeas(brief: MealBrief): string[] {
  if (brief.goal === "lighter" || brief.maxCaloriesKcal < 500) return ["minestrone soup", "bruschetta", "risotto", "pesto pasta", "ravioli"];
  if (brief.diet === "any" && brief.goal === "high-protein") return ["chicken pasta", "ravioli", "risotto", "pesto pasta", "bruschetta"];
  return ["ravioli", "risotto", "pesto pasta", "bruschetta", "minestrone soup", "gnocchi"];
}
