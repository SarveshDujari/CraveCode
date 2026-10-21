import { createStep, createWorkflow } from "@mastra/core/workflows";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import { mealBriefSchema, mealSearchResponseSchema, type MealBrief, type MealSearchResponse, type PreviewMenuItem, type RestaurantSignal } from "../shared/contracts.ts";
import { searchWithSwiggy, searchWithWeb, serpApiSearch } from "./meal-search.ts";
import { suggestQueries } from "./gemma-planner.ts";

type SearchMode =
  | { source: "swiggy"; searchMenu: (query: string, vegOnly: boolean) => Promise<PreviewMenuItem[]>; searchRestaurants?: (query: string) => Promise<RestaurantSignal[]> }
  | { source: "web"; searchWeb?: typeof serpApiSearch };

// The workflow receives a validated brief; a bounded planner picks queries, discovery
// calls the authorized source, then the evaluator enforces evidence labels.
export async function runMealWorkflow(brief: MealBrief, mode: SearchMode): Promise<MealSearchResponse> {
  const inputSchema = z.object({ brief: mealBriefSchema });
  const plannedSchema = z.object({ brief: mealBriefSchema, queries: z.array(z.string()).max(4) });
  const resultSchema = z.object({ result: mealSearchResponseSchema });

  const plan = createStep({
    id: "plan-bounded-queries", inputSchema, outputSchema: plannedSchema,
    execute: async ({ inputData }) => Sentry.startSpan({ name: "meal.plan", op: "meal.plan" }, async () => ({
      brief: inputData.brief, queries: await suggestQueries(inputData.brief)
    }))
  });
  const discover = createStep({
    id: "discover-food", inputSchema: plannedSchema, outputSchema: resultSchema,
    execute: async ({ inputData }) => Sentry.startSpan({ name: mode.source === "swiggy" ? "meal.search.swiggy" : "meal.search.web", op: "meal.search" }, async () => ({
      result: mode.source === "swiggy"
        ? await searchWithSwiggy(inputData.brief, mode.searchMenu, inputData.queries, mode.searchRestaurants)
        : await searchWithWeb(inputData.brief, mode.searchWeb || serpApiSearch, inputData.queries)
    }))
  });
  const evaluate = createStep({
    id: "verify-evidence-labels", inputSchema: resultSchema, outputSchema: resultSchema,
    execute: async ({ inputData }) => Sentry.startSpan({ name: "meal.verify", op: "meal.verify" }, () => {
      const result = inputData.result;
      for (const item of result.results) {
        if (item.match === "closest" && item.nutritionSources.length === 0) item.match = "unverified";
        if (item.source === "web-lead") {
          item.menuPriceInr = null;
          item.availability = "unknown";
          item.diet = "unknown";
        }
      }
      return { result };
    })
  });
  const workflow = createWorkflow({ id: "meal-discovery-v1", inputSchema, outputSchema: resultSchema })
    .then(plan).then(discover).then(evaluate).commit();
  const run = await workflow.createRun();
  const output = await run.start({ inputData: { brief } });
  if (output.status !== "success") throw new Error("Meal discovery could not finish. Please try again.");
  return output.result.result;
}
