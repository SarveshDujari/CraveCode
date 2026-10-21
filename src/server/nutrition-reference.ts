export type NutritionReference = {
  description: string;
  serving: string;
  caloriesKcal: number;
  proteinG: number | null;
  source: string;
  sourceUrl: string;
};

type NutritionPayload = {
  error?: string;
  nutrition_information?: {
    description?: string;
    amount_per?: string;
    calories?: string;
    protein?: string | string[];
    source?: string;
    source_link?: string;
  };
};

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter(word => word.length > 2 && !["the", "from", "with", "and", "restaurant", "special"].includes(word)));
}

export function parseNutritionReference(dish: string, payload: NutritionPayload): NutritionReference | null {
  const info = payload.nutrition_information;
  if (!info?.description || !info.amount_per || !info.calories || !info.source_link || !info.source) return null;
  const dishWords = words(dish);
  const descriptionWords = words(info.description);
  const common = [...dishWords].filter(word => descriptionWords.has(word)).length;
  if (common < Math.min(2, dishWords.size) || dishWords.size === 0) return null;
  const calories = Number(info.calories.replace(/,/g, "").trim());
  if (!Number.isFinite(calories) || calories <= 0 || calories > 3000) return null;
  let sourceUrl: URL;
  try { sourceUrl = new URL(info.source_link); } catch { return null; }
  if (sourceUrl.protocol !== "https:") return null;
  const proteinText = Array.isArray(info.protein) ? info.protein[0] : info.protein;
  const proteinMatch = proteinText?.match(/^(\d+(?:\.\d+)?)\s*g\b/i);
  const proteinG = proteinMatch ? Number(proteinMatch[1]) : null;
  return {
    description: info.description.trim(),
    serving: info.amount_per.trim(),
    caloriesKcal: calories,
    proteinG: proteinG !== null && Number.isFinite(proteinG) ? proteinG : null,
    source: info.source.trim(),
    sourceUrl: sourceUrl.toString()
  };
}

const cache = new Map<string, { checkedAt: number; value: NutritionReference | null }>();
const cacheMs = 24 * 60 * 60 * 1000;

export async function lookupNutritionReference(dish: string): Promise<NutritionReference | null> {
  const key = dish.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.checkedAt < cacheMs) return cached.value;
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("Nutrition reference search is unavailable.");
  const params = new URLSearchParams({
    engine: "google", q: `${dish} nutrition calories`, gl: "in", hl: "en", num: "3", api_key: apiKey
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Nutrition reference search could not finish.");
  const payload = await response.json() as NutritionPayload;
  if (payload.error) throw new Error("Nutrition reference search could not finish.");
  const value = parseNutritionReference(dish, payload);
  cache.set(key, { checkedAt: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}
