import "dotenv/config";
import { z } from "zod";

const url = process.env.GEMMA_API_URL || "http://127.0.0.1:11434/api/generate";
const model = process.env.GEMMA_MODEL || "gemma3:4b";
const key = process.env.GEMMA_API_KEY;

const resultSchema = z.object({
  diet: z.enum(["vegetarian", "egg-friendly", "any"]),
  budgetInr: z.number().nullable(),
  minProteinG: z.number().nullable(),
  maxCaloriesKcal: z.number().nullable(),
  cuisine: z.string().nullable(),
  exclusions: z.array(z.string())
});

const outputFormat = {
  type: "object",
  properties: {
    diet: { type: "string", enum: ["vegetarian", "egg-friendly", "any"] },
    budgetInr: { type: ["number", "null"] },
    minProteinG: { type: ["number", "null"] },
    maxCaloriesKcal: { type: ["number", "null"] },
    cuisine: { type: ["string", "null"] },
    exclusions: { type: "array", items: { type: "string" } }
  },
  required: ["diet", "budgetInr", "minProteinG", "maxCaloriesKcal", "cuisine", "exclusions"],
  additionalProperties: false
};

const cases = [
  {
    request: "Vegetarian dinner under ₹350 including fees. At least 35 g protein and at most 700 kcal.",
    expected: { diet: "vegetarian", budgetInr: 350, minProteinG: 35, maxCaloriesKcal: 700 }
  },
  {
    request: "Eggs are fine, but no meat or mushrooms. Lunch below ₹300, under 500 calories, 25 grams of protein.",
    expected: { diet: "egg-friendly", budgetInr: 300, minProteinG: 25, maxCaloriesKcal: 500 }
  },
  {
    request: "I have ₹120 total. Find 80g protein and no more than 300 kcal, preferably South Indian.",
    expected: { diet: "any", budgetInr: 120, minProteinG: 80, maxCaloriesKcal: 300, cuisine: "South Indian" }
  }
] as const;

async function probe(request: string): Promise<z.infer<typeof resultSchema>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: outputFormat,
      system: "Extract the user's stated meal constraints. Reply with one JSON object only. Do not invent missing numbers or nutrition facts. Use null for absent scalar values and [] when there are no exclusions. diet must be vegetarian, egg-friendly, or any.",
      prompt: request,
      options: { temperature: 0 }
    }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`Gemma endpoint returned HTTP ${response.status}`);
  const body = await response.json() as { response?: string };
  if (!body.response) throw new Error("Gemma endpoint returned no response text.");
  return resultSchema.parse(JSON.parse(body.response));
}

let passed = 0;
for (const [index, sample] of cases.entries()) {
  try {
    const started = performance.now();
    const actual = await probe(sample.request);
    const expected = sample.expected as Record<string, unknown>;
    const failures = Object.entries(expected).filter(([key, value]) => actual[key as keyof typeof actual] !== value).map(([key]) => key);
    if (index === 1 && !actual.exclusions.some(x => x.toLowerCase().includes("mushroom"))) failures.push("exclusions");
    const ok = failures.length === 0;
    if (ok) passed += 1;
    console.log(JSON.stringify({ case: index + 1, ok, latencyMs: Math.round(performance.now() - started), failures, parsed: actual }));
  } catch (error) {
    console.log(JSON.stringify({ case: index + 1, ok: false, error: error instanceof Error ? error.message : "unknown error" }));
  }
}
console.log(JSON.stringify({ model, endpoint: new URL(url).host, passed, total: cases.length }));
if (passed !== cases.length) process.exitCode = 1;
