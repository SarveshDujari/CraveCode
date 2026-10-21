import { randomUUID } from "node:crypto";
import type { MealBrief, MealResult, MealSearchResponse, PreviewMenuItem } from "../shared/contracts.ts";

type SearchMenu = (query: string, vegOnly: boolean) => Promise<PreviewMenuItem[]>;
type WebSearch = (query: string) => Promise<Array<{ title: string; url: string; snippet: string; imageUrl: string | null }>>;

const mealTerms: Record<MealBrief["goal"], Record<MealBrief["diet"], string[]>> = {
  "high-protein": {
    vegetarian: ["paneer tikka", "dal bowl", "tofu bowl", "chole"],
    "egg-friendly": ["egg bowl", "paneer tikka", "egg sandwich", "dal bowl"],
    any: ["chicken bowl", "paneer tikka", "egg bowl", "dal bowl"]
  },
  balanced: {
    vegetarian: ["veg thali", "paneer bowl", "dal rice", "vegetable wrap"],
    "egg-friendly": ["egg rice", "veg thali", "paneer bowl", "egg wrap"],
    any: ["chicken rice", "veg thali", "egg rice", "paneer bowl"]
  },
  lighter: {
    vegetarian: ["salad bowl", "grilled paneer", "vegetable soup", "idli"],
    "egg-friendly": ["egg salad", "grilled paneer", "vegetable soup", "idli"],
    any: ["grilled chicken", "egg salad", "vegetable soup", "idli"]
  }
};

export function planQueries(brief: MealBrief): string[] {
  const explicit = brief.dish.trim();
  const cuisine = brief.cuisine.trim();
  const terms = explicit ? [explicit, ...mealTerms[brief.goal][brief.diet]] : mealTerms[brief.goal][brief.diet];
  return [...new Set(terms.map(term => cuisine && !term.toLowerCase().includes(cuisine.toLowerCase()) ? `${cuisine} ${term}` : term))].slice(0, 4);
}

function tokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(word => word.length > 2);
}

function exclusions(value: string): string[] {
  return [...value.toLowerCase().matchAll(/\b(?:no|without|exclude)\s+([a-z][a-z -]{1,25}?)(?=,|\.|;|$|\band\b)/g)]
    .map(match => match[1].trim().replace(/s$/, ""))
    .filter(Boolean);
}

function rankLive(item: PreviewMenuItem, brief: MealBrief, queries: string[]): MealResult | null {
  if (item.inStock === false) return null;
  if (brief.diet === "vegetarian" && item.isVeg !== true) return null;
  if (brief.diet === "egg-friendly" && item.isVeg === false && !/\begg\b/i.test(item.name)) return null;
  if (exclusions(brief.wish).some(term => item.name.toLowerCase().includes(term))) return null;
  const itemWords = new Set(tokens(item.name));
  const dishWords = tokens(brief.dish);
  const wishWords = tokens(brief.wish);
  const matchedDish = dishWords.filter(word => itemWords.has(word)).length;
  const matchedWish = wishWords.filter(word => itemWords.has(word)).length;
  const queryMatch = Math.max(...queries.map(query => tokens(query).filter(word => itemWords.has(word)).length), 0);
  const underMenuBudget = item.priceInr !== null && item.priceInr <= brief.budgetInr;
  const score = queryMatch * 5 + matchedDish * 8 + matchedWish * 2 + (underMenuBudget ? 4 : 0) + (item.inStock === true ? 2 : 0) + (item.isVeg === true && brief.diet === "vegetarian" ? 2 : 0);
  const reasons = [queryMatch ? "Dish name matches a search theme" : "Found in nearby menu search"];
  if (matchedDish) reasons.push("Matches your requested dish");
  if (underMenuBudget) reasons.push("Menu price is within your budget before fees");
  const cautions = ["Protein and calories are unverified", "Delivery fees and final payable total are unknown"];
  if (item.isVeg === null) cautions.push("Diet classification is unconfirmed");
  if (item.priceInr === null) cautions.push("Menu price is unavailable");
  else if (item.priceInr > brief.budgetInr) cautions.push("Menu price alone exceeds your total budget");
  return {
    id: `${item.restaurantId}:${item.menuItemId}`, title: item.name, restaurant: item.restaurantName,
    imageUrl: item.imageUrl, menuPriceInr: item.priceInr,
    diet: item.isVeg === true ? "vegetarian" : item.isVeg === false ? "non-vegetarian" : "unknown",
    availability: item.inStock === true ? "available" : "unknown",
    source: "swiggy-live", sourceUrl: null, nutritionSources: [], match: "unverified", reasons, cautions, score
  };
}

export function rankLiveItems(items: PreviewMenuItem[], brief: MealBrief, queries: string[]): MealResult[] {
  const deduped = new Map<string, MealResult>();
  for (const item of items) {
    const result = rankLive(item, brief, queries);
    if (result && (!deduped.has(result.id) || result.score > deduped.get(result.id)!.score)) deduped.set(result.id, result);
  }
  return [...deduped.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 12);
}

export async function searchWithSwiggy(brief: MealBrief, searchMenu: SearchMenu, queries = planQueries(brief)): Promise<MealSearchResponse> {
  const settled = await Promise.allSettled(queries.map(query => searchMenu(query, brief.diet === "vegetarian")));
  const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`Search for “${queries[index]}” failed; other results may still be available.`] : []);
  const items = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  return { version: 1, jobId: randomUUID(), source: "swiggy-live", queries, results: rankLiveItems(items, brief, queries), warnings, searchedAt: new Date().toISOString() };
}

function validWebUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function searchWithWeb(brief: MealBrief, searchWeb: WebSearch, plannedQueries = planQueries(brief)): Promise<MealSearchResponse> {
  const queries = plannedQueries.slice(0, 3);
  const city = brief.city.trim();
  if (!city) throw new Error("Enter a city to explore public web results.");
  const webQueries = queries.map(query => `${query} ${city} food delivery menu`);
  const settled = await Promise.allSettled(webQueries.map(searchWeb));
  const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`Web search for “${queries[index]}” failed.`] : []);
  const seen = new Set<string>();
  const results: MealResult[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const lead of result.value) {
      if (!validWebUrl(lead.url) || seen.has(lead.url)) continue;
      seen.add(lead.url);
      const title = lead.title.trim();
      if (!title || /recipe|homemade|how to make/i.test(`${title} ${lead.snippet}`)) continue;
      if (brief.diet !== "any" && /\b(chicken|mutton|meat|fish|prawn|beef|pork)\b/i.test(`${title} ${lead.snippet}`)) continue;
      if (brief.diet === "vegetarian" && /\begg\b/i.test(`${title} ${lead.snippet}`)) continue;
      if (exclusions(brief.wish).some(term => `${title} ${lead.snippet}`.toLowerCase().includes(term))) continue;
      results.push({
        id: lead.url, title, restaurant: new URL(lead.url).hostname.replace(/^www\./, ""), imageUrl: lead.imageUrl,
        menuPriceInr: null, diet: "unknown", availability: "unknown", source: "web-lead", sourceUrl: lead.url,
        nutritionSources: [], match: "unverified", reasons: ["Found on the public web for your city and search theme"],
        cautions: ["This is a search lead, not a verified live menu item", "Price, availability, diet, protein, calories, and delivery fees are unverified"],
        score: Math.max(0, 10 - results.length)
      });
      if (results.length >= 12) break;
    }
  }
  return { version: 1, jobId: randomUUID(), source: "web-leads", queries: webQueries, results, warnings, searchedAt: new Date().toISOString() };
}

export async function serpApiSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string; imageUrl: string | null }>> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SerpApi is not configured yet.");
  const params = new URLSearchParams({ engine: "google", q: query, gl: "in", hl: "en", num: "6", api_key: key });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`SerpApi search failed (${response.status}).`);
  const payload = await response.json() as { error?: string; organic_results?: Array<{ title?: string; link?: string; snippet?: string; thumbnail?: string }> };
  if (payload.error) throw new Error(payload.error);
  return (payload.organic_results || []).flatMap(row => row.title && row.link ? [{ title: row.title, url: row.link, snippet: row.snippet || "", imageUrl: row.thumbnail || null }] : []);
}
