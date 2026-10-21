import { randomUUID } from "node:crypto";
import type { MealBrief, MealResult, MealSearchResponse, PreviewMenuItem, RestaurantSignal } from "../shared/contracts.ts";

type SearchMenu = (query: string, vegOnly: boolean) => Promise<PreviewMenuItem[]>;
type SearchRestaurants = (query: string) => Promise<RestaurantSignal[]>;
type WebSearch = (query: string) => Promise<Array<{ title: string; url: string; snippet: string; imageUrl: string | null }>>;

const mealTerms: Record<MealBrief["goal"], Record<MealBrief["diet"], string[]>> = {
  "high-protein": {
    vegetarian: ["paneer tikka", "chole", "dal tadka", "soya chaap"],
    "egg-friendly": ["egg bhurji", "paneer tikka", "chole", "dal tadka"],
    any: ["grilled chicken", "paneer tikka", "egg bhurji", "dal tadka"]
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

const lowerCalorieSearchThemes: Record<MealBrief["diet"], string[]> = {
  vegetarian: ["grilled paneer", "tofu salad", "sprouts chaat", "dal soup"],
  "egg-friendly": ["egg salad", "grilled paneer", "sprouts chaat", "dal soup"],
  any: ["grilled chicken", "egg salad", "tofu salad", "dal soup"]
};

export function planQueries(brief: MealBrief): string[] {
  const explicit = brief.dish.trim();
  const cuisine = brief.cuisine.trim();
  const themes = brief.maxCaloriesKcal < 500 ? lowerCalorieSearchThemes[brief.diet] : mealTerms[brief.goal][brief.diet];
  const terms = explicit ? [explicit, ...themes] : themes;
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

function ratingsLowerBound(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!match) return null;
  const number = Number(match[1]);
  const multiplier = match[2]?.toLowerCase() === "k" ? 1000 : match[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
  return Number.isFinite(number) ? Math.floor(number * multiplier) : null;
}

function reviewStatus(signal: RestaurantSignal | undefined): "well-reviewed" | "limited-feedback" | "mixed-rating" | "low-rating" | "unknown" {
  if (!signal || signal.rating === null) return "unknown";
  const count = ratingsLowerBound(signal.ratingsText);
  if (signal.rating < 3.7) return "low-rating";
  if (count === null || count < 100) return "limited-feedback";
  return signal.rating >= 4 ? "well-reviewed" : "mixed-rating";
}

function rankLive(item: PreviewMenuItem, brief: MealBrief, queries: string[], signal?: RestaurantSignal): MealResult | null {
  if (item.inStock === false) return null;
  if (signal?.availabilityStatus === "CLOSED" || signal?.availabilityStatus === "UNAVAILABLE") return null;
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
  const review = reviewStatus(signal);
  const reviewBoost = brief.preferWellReviewed ? review === "well-reviewed" ? 6 : review === "low-rating" ? -6 : 0 : 0;
  const score = queryMatch * 5 + matchedDish * 8 + matchedWish * 2 + (underMenuBudget ? 4 : 0) + (item.inStock === true ? 2 : 0) + (item.isVeg === true && brief.diet === "vegetarian" ? 2 : 0) + reviewBoost;
  const reasons = [queryMatch ? "Dish name matches a search theme" : "Found in nearby menu search"];
  if (matchedDish) reasons.push("Matches your requested dish");
  if (underMenuBudget) reasons.push("Menu price is within your budget before fees");
  const cautions = ["Protein and calories are unverified", "Delivery fees and final payable total are unknown"];
  if (item.isVeg === null) cautions.push("Diet classification is unconfirmed");
  if (item.priceInr === null) cautions.push("Menu price is unavailable");
  else if (item.priceInr > brief.budgetInr) cautions.push("Menu price alone exceeds your total budget");
  if (review === "low-rating") cautions.push("Restaurant rating is low; check recent reviews before ordering");
  if (review === "mixed-rating") cautions.push("Restaurant rating is below the well-reviewed threshold; check recent reviews");
  if (review === "limited-feedback") cautions.push("Restaurant review history is limited or the count is unavailable");
  if (review === "unknown") cautions.push("Restaurant rating and review count could not be verified");
  return {
    id: `${item.restaurantId}:${item.menuItemId}`, title: item.name, restaurant: item.restaurantName,
    imageUrl: item.imageUrl, menuPriceInr: item.priceInr,
    diet: item.isVeg === true ? "vegetarian" : item.isVeg === false ? "non-vegetarian" : "unknown",
    availability: item.inStock === true ? "available" : "unknown",
    source: "swiggy-live", sourceUrl: null,
    restaurantReview: signal ? { rating: signal.rating, ratingsText: signal.ratingsText, status: review, source: "swiggy" } : null,
    nutritionSources: [], match: "unverified", reasons, cautions, score
  };
}

export function rankLiveItems(items: PreviewMenuItem[], brief: MealBrief, queries: string[], signals: RestaurantSignal[] = []): MealResult[] {
  const byRestaurant = new Map(signals.map(signal => [signal.id, signal]));
  const deduped = new Map<string, MealResult>();
  for (const item of items) {
    const result = rankLive(item, brief, queries, byRestaurant.get(item.restaurantId));
    if (result && (!deduped.has(result.id) || result.score > deduped.get(result.id)!.score)) deduped.set(result.id, result);
  }
  const ranked = [...deduped.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const selected: MealResult[] = [];
  const perRestaurant = new Map<string, number>();
  for (const result of ranked) {
    const restaurantId = result.id.split(":")[0];
    const count = perRestaurant.get(restaurantId) || 0;
    if (count < 3) { selected.push(result); perRestaurant.set(restaurantId, count + 1); }
    if (selected.length === 15) return selected;
  }
  for (const result of ranked) {
    if (!selected.includes(result)) selected.push(result);
    if (selected.length === 15) break;
  }
  return selected;
}

export async function searchWithSwiggy(brief: MealBrief, searchMenu: SearchMenu, queries = planQueries(brief), searchRestaurants?: SearchRestaurants): Promise<MealSearchResponse> {
  const [settled, reviewResults] = await Promise.all([
    Promise.allSettled(queries.map(query => searchMenu(query, brief.diet === "vegetarian"))),
    searchRestaurants ? Promise.allSettled(queries.slice(0, 2).map(searchRestaurants)) : Promise.resolve([])
  ]);
  const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`Search for “${queries[index]}” failed; other results may still be available.`] : []);
  const items = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const signals = reviewResults.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (searchRestaurants && reviewResults.some(result => result.status === "rejected")) warnings.push("Some restaurant review signals could not be loaded.");
  return { version: 1, jobId: randomUUID(), source: "swiggy-live", queries, results: rankLiveItems(items, brief, queries, signals), warnings, searchedAt: new Date().toISOString() };
}

function validWebUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

const deliveryHosts = ["swiggy.com", "zomato.com", "magicpin.in", "eatclub.in", "freshmenu.com"];

function trustedDeliveryHost(url: string): string | null {
  const host = new URL(url).hostname.toLowerCase();
  return deliveryHosts.find(domain => host === domain || host.endsWith(`.${domain}`)) || null;
}

function cityFitsPage(url: string, city: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  const cityInPath = pathname.match(/\/city\/([^/]+)/)?.[1];
  if (!cityInPath) return true;
  const wanted = city.toLowerCase().trim().replace(/\s+/g, "-");
  const aliases = new Set([wanted]);
  if (wanted === "bengaluru") aliases.add("bangalore");
  if (wanted === "bangalore") aliases.add("bengaluru");
  if (wanted === "mumbai") aliases.add("bombay");
  if (wanted === "kolkata") aliases.add("calcutta");
  if (wanted === "chennai") aliases.add("madras");
  return aliases.has(cityInPath);
}

function swiggyCitySlug(city: string): string {
  const slug = city.toLowerCase().trim().replace(/\s+/g, "-");
  return ({ bengaluru: "bangalore", bombay: "mumbai", calcutta: "kolkata", madras: "chennai" } as Record<string, string>)[slug] || slug;
}

export async function searchWithWeb(brief: MealBrief, searchWeb: WebSearch, plannedQueries = planQueries(brief)): Promise<MealSearchResponse> {
  const queries = plannedQueries.slice(0, 4);
  const city = brief.city.trim();
  if (!city) throw new Error("Enter a city to explore public web results.");
  const webQueries = queries.map(query => `${query} ${city} order online site:swiggy.com/city/${swiggyCitySlug(city)}`);
  const settled = await Promise.allSettled(webQueries.map(searchWeb));
  const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`Web search for “${queries[index]}” failed.`] : []);
  const seen = new Set<string>();
  const results: MealResult[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status !== "fulfilled") continue;
    for (const lead of result.value) {
      if (!validWebUrl(lead.url) || seen.has(lead.url)) continue;
      const domain = trustedDeliveryHost(lead.url);
      if (!domain) continue;
      if (!cityFitsPage(lead.url, city)) continue;
      const dishQuery = brief.cuisine && queries[index].toLowerCase().startsWith(brief.cuisine.toLowerCase())
        ? queries[index].slice(brief.cuisine.length).trim() : queries[index];
      const queryWords = tokens(dishQuery);
      const pageWords = tokens(`${lead.title} ${lead.snippet} ${new URL(lead.url).pathname}`);
      if (queryWords[0] && !pageWords.includes(queryWords[0])) continue;
      const matchCount = queryWords.filter(word => pageWords.includes(word)).length;
      if (matchCount === 0) continue;
      seen.add(lead.url);
      const title = lead.title.trim();
      if (!title || /recipe|homemade|how to make/i.test(`${title} ${lead.snippet}`)) continue;
      if (/^(because you searched|how can i order|best .* delivery restaurants)/i.test(title)) continue;
      if (/-dish-restaurants\/?$/i.test(new URL(lead.url).pathname)) continue;
      if (brief.diet !== "any" && /\b(chicken|mutton|meat|fish|prawn|beef|pork)\b/i.test(`${title} ${lead.snippet}`)) continue;
      if (brief.diet === "vegetarian" && /\begg\b/i.test(`${title} ${lead.snippet}`)) continue;
      if (exclusions(brief.wish).some(term => `${title} ${lead.snippet}`.toLowerCase().includes(term))) continue;
      results.push({
        id: lead.url, title, restaurant: domain, imageUrl: lead.imageUrl,
        menuPriceInr: null, diet: "unknown", availability: "unknown", source: "web-lead", sourceUrl: lead.url, restaurantReview: null,
        nutritionSources: [], match: "unverified", reasons: ["Found on the public web for your city and search theme"],
        cautions: ["This is a search lead, not a verified live menu item", "Price, availability, diet, protein, calories, and delivery fees are unverified"],
        score: matchCount * 5 + (domain === "swiggy.com" ? 2 : 0)
      });
    }
  }
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { version: 1, jobId: randomUUID(), source: "web-leads", queries, results: results.slice(0, 15), warnings, searchedAt: new Date().toISOString() };
}

const webCache = new Map<string, { at: number; results: Array<{ title: string; url: string; snippet: string; imageUrl: string | null }> }>();

export async function serpApiSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string; imageUrl: string | null }>> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SerpApi is not configured yet.");
  const cached = webCache.get(query);
  if (cached && Date.now() - cached.at < 60 * 60_000) return cached.results;
  const params = new URLSearchParams({ engine: "google", q: query, gl: "in", hl: "en", num: "10", api_key: key });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error(`SerpApi search failed (${response.status}).`);
  const payload = await response.json() as { error?: string; organic_results?: Array<{ title?: string; link?: string; snippet?: string; thumbnail?: string }> };
  if (payload.error) throw new Error(payload.error);
  const results = (payload.organic_results || []).flatMap(row => row.title && row.link ? [{ title: row.title, url: row.link, snippet: row.snippet || "", imageUrl: row.thumbnail || null }] : []);
  webCache.set(query, { at: Date.now(), results });
  if (webCache.size > 200) webCache.delete(webCache.keys().next().value!);
  return results;
}
