import { randomUUID } from "node:crypto";
import type { MealBrief, MealResult, MealSearchResponse, PreviewMenuItem, RestaurantSignal } from "../shared/contracts.ts";
import { estimateNutrition } from "./nutrition-estimate.ts";
import { italianSearchThemes, looksLikeItalianDish, requestedCuisine } from "./cuisine.ts";
import { reserveSerpApiCall } from "./search-budget.ts";
import { dishFamily, isCuisineRelevant, localCuisine, menuDishFamily, planLocalCandidates, queryFamily } from "./local-catalog.ts";

type SearchMenu = (query: string, vegOnly: boolean) => Promise<PreviewMenuItem[]>;
type SearchRestaurants = (query: string) => Promise<RestaurantSignal[]>;
type WebSearch = (query: string) => Promise<Array<{ title: string; url: string; snippet: string; imageUrl: string | null }>>;

function withDeadline<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Search source timed out.")), ms); })
  ]).finally(() => clearTimeout(timer));
}

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
  if (requestedCuisine(brief) === "italian") {
    return [...new Set([...(explicit ? [explicit] : []), ...italianSearchThemes(brief)])].slice(0, 4);
  }
  const themes = brief.maxCaloriesKcal < 500 ? lowerCalorieSearchThemes[brief.diet] : mealTerms[brief.goal][brief.diet];
  const slotThemes = brief.mealSlot === "breakfast"
    ? brief.diet === "vegetarian" ? ["idli sambar", "sprouts chaat"] : ["egg bhurji", "idli sambar"]
    : brief.mealSlot === "snack" ? brief.diet === "vegetarian" ? ["paneer tikka", "sprouts chaat"] : ["egg wrap", "paneer tikka"]
    : [];
  const terms = explicit ? [explicit, ...themes] : [...slotThemes, ...themes];
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

function inferredNonVeg(name: string): boolean {
  // Names are a fallback only when the menu's diet flag is missing. Avoid
  // classifying plant-based substitutes as meat from a single keyword.
  if (/\b(?:vegan|plant[- ]based|mock|meatless|soya|soy|imitation)\b/i.test(name)) return false;
  return /\b(?:chicken|mutton|lamb|goat|fish|prawn|shrimp|seafood|crab|beef|pork|bacon|ham|sausage|egg|pepperoni|salami|tuna|salmon|anchov(?:y|ies)|keema)\b/i.test(name);
}

function hasNonEggMeat(name: string): boolean {
  if (/\b(?:vegan|plant[- ]based|mock|meatless|soya|soy|imitation)\b/i.test(name)) return false;
  return /\b(?:chicken|mutton|lamb|goat|fish|prawn|shrimp|seafood|crab|beef|pork|bacon|ham|sausage|pepperoni|salami|tuna|salmon|anchov(?:y|ies)|keema)\b/i.test(name);
}

function matchesRequestedDish(item: PreviewMenuItem, dish: string): boolean {
  if (!dish.trim()) return true;
  const requestedFamily = dishFamily(dish);
  const foundFamily = menuDishFamily(item);
  if (requestedFamily && foundFamily?.id === requestedFamily.id) return true;
  const words = tokens(dish);
  const itemWords = new Set(tokens(`${item.name} ${item.description || ""}`));
  return words.length > 0 && words.every(word => itemWords.has(word));
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
  const dietFromName = item.isVeg === null && inferredNonVeg(item.name);
  const isVeg = dietFromName ? false : item.isVeg;
  if (item.inStock === false) return null;
  if (signal?.availabilityStatus === "CLOSED" || signal?.availabilityStatus === "UNAVAILABLE") return null;
  if (brief.diet === "vegetarian" && isVeg !== true) return null;
  if (brief.diet === "egg-friendly" && isVeg === false && (!/\begg\b/i.test(item.name) || hasNonEggMeat(item.name))) return null;
  if (exclusions(brief.wish).some(term => item.name.toLowerCase().includes(term))) return null;
  if (!matchesRequestedDish(item, brief.dish)) return null;
  if (!isCuisineRelevant(item, brief)) return null;
  if (item.priceInr !== null && item.priceInr > brief.budgetInr) return null;
  const itemWords = new Set(tokens(item.name));
  const dishWords = tokens(brief.dish);
  const wishWords = tokens(brief.wish.replace(/\b(?:no|without|exclude)\s+[a-z][a-z -]{1,25}?(?=,|\.|;|$|\band\b)/gi, ""));
  const matchedDish = dishWords.filter(word => itemWords.has(word)).length;
  const matchedWish = wishWords.filter(word => itemWords.has(word)).length;
  const queryMatch = Math.max(...queries.map(query => tokens(query).filter(word => itemWords.has(word)).length), 0);
  const family = menuDishFamily(item);
  const sameFamily = Boolean(family && queries.some(query => queryFamily(query) === family.id));
  const normalizedName = item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fullPhrase = queries.some(query => {
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return Boolean(normalizedQuery) && ` ${normalizedName} `.includes(` ${normalizedQuery} `);
  });
  if (!queryMatch && !sameFamily && !matchedDish) return null;
  const underMenuBudget = item.priceInr !== null && item.priceInr <= brief.budgetInr;
  const nutritionEstimate = estimateNutrition(item.name, brief);
  const review = reviewStatus(signal);
  const ratingCount = ratingsLowerBound(signal?.ratingsText || null);
  const supportedRating = signal?.rating !== null && signal?.rating !== undefined && ratingCount !== null
    ? (signal.rating * ratingCount + 4 * 100) / (ratingCount + 100) : null;
  const reviewBoost = brief.preferWellReviewed
    ? review === "low-rating" ? -6 : supportedRating === null ? 0 : Math.round((supportedRating - 4) * 10)
    : 0;
  const estimateBoost = nutritionEstimate?.fit === "possible" ? 3 : nutritionEstimate?.fit === "unlikely" ? -5 : 0;
  const score = (fullPhrase ? 14 : sameFamily ? 10 : queryMatch * 2)
    + (brief.dish ? 18 : 0)
    + matchedWish * 2 + (underMenuBudget ? 4 : 0) + (item.inStock === true ? 2 : 0)
    + (isVeg === true && brief.diet === "vegetarian" ? 2 : 0)
    + (localCuisine(brief.cuisine) && signal?.cuisines?.some(cuisine => localCuisine(cuisine) === localCuisine(brief.cuisine)) ? 2 : 0)
    + reviewBoost + estimateBoost;
  const reasons = [fullPhrase ? "Dish name contains the full search phrase" : sameFamily ? "Dish belongs to a searched food family" : "Dish name partially matches a search theme"];
  if (dietFromName) reasons.push("Dish name indicates non-vegetarian ingredients");
  if (localCuisine(brief.cuisine)) reasons.push("Dish name or menu category suggests your cuisine");
  if (matchedDish) reasons.push("Matches your requested dish");
  if (underMenuBudget) reasons.push("Menu price is within your budget before fees");
  if (nutritionEstimate?.fit === "possible") reasons.push("A broad dish estimate overlaps your nutrition targets; the restaurant portion is unverified");
  const cautions = ["Restaurant-specific protein and calories are unverified", "Delivery fees and final payable total are unknown"];
  if (dietFromName) cautions.push("Non-vegetarian label is inferred from the dish name; verify ingredients with the restaurant");
  if (localCuisine(brief.cuisine)) cautions.push("Cuisine is inferred from menu text; restaurant cuisine may be unverified");
  if (nutritionEstimate?.fit === "unlikely") cautions.push("Even a broad dish estimate suggests this may miss a nutrition target");
  if (isVeg === null) cautions.push("Diet classification is unconfirmed");
  if (item.priceInr === null) cautions.push("Menu price is unavailable");
  if (review === "low-rating") cautions.push("Restaurant rating is low; check recent reviews before ordering");
  if (review === "mixed-rating") cautions.push("Restaurant rating is below the well-reviewed threshold; check recent reviews");
  if (review === "limited-feedback") cautions.push("Restaurant review history is limited or the count is unavailable");
  if (review === "unknown") cautions.push("Restaurant rating and review count could not be verified");
  return {
    id: `${item.restaurantId}:${item.menuItemId}`, title: item.name, restaurant: item.restaurantName,
    imageUrl: item.imageUrl, menuPriceInr: item.priceInr,
    diet: isVeg === true ? "vegetarian" : isVeg === false ? "non-vegetarian" : "unknown",
    availability: item.inStock === true ? "available" : "unknown",
    source: "swiggy-live", sourceUrl: null, searchTheme: null,
    restaurantReview: signal ? {
      rating: signal.rating, ratingsText: signal.ratingsText, ratingsLowerBound: ratingCount, status: review,
      areaName: signal.areaName || null, distanceKm: signal.distanceKm ?? null,
      deliveryTimeMinutes: signal.deliveryTimeMinutes ?? null, source: "swiggy"
    } : null,
    nutritionEstimate,
    nutritionSources: [], match: "unverified", reasons, cautions, score
  };
}

export function rankLiveItems(items: PreviewMenuItem[], brief: MealBrief, queries: string[], signals: RestaurantSignal[] = []): MealResult[] {
  const byRestaurant = new Map(signals.map(signal => [signal.id, signal]));
  const deduped = new Map<string, { result: MealResult; restaurantId: string; family: string; priceBand: string }>();
  for (const item of items) {
    const result = rankLive(item, brief, queries, byRestaurant.get(item.restaurantId));
    if (!result) continue;
    const key = `${item.restaurantId}:${item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    const current = deduped.get(key)?.result;
    if (!current || result.score > current.score || (result.score === current.score && (result.menuPriceInr ?? Infinity) < (current.menuPriceInr ?? Infinity))) {
      deduped.set(key, {
        result, restaurantId: item.restaurantId,
        family: menuDishFamily(item)?.id || "other",
        priceBand: result.menuPriceInr === null ? "unknown" : result.menuPriceInr <= 150 ? "under-150" : result.menuPriceInr <= 300 ? "150-300" : "over-300"
      });
    }
  }
  const ranked = [...deduped.values()].sort((a, b) => b.result.score - a.result.score || a.result.title.localeCompare(b.result.title));
  const selected: MealResult[] = [];
  const selectedIds = new Set<string>();
  const perRestaurant = new Map<string, number>();
  const perFamily = new Map<string, number>();
  const perPriceBand = new Map<string, number>();
  const fill = (restaurantCap: number, familyCap: number) => {
    while (selected.length < 15) {
      let best: typeof ranked[number] | null = null;
      let bestValue = -Infinity;
      for (const candidate of ranked) {
        if (selectedIds.has(candidate.result.id)) continue;
        const restaurantCount = perRestaurant.get(candidate.restaurantId) || 0;
        const familyCount = perFamily.get(candidate.family) || 0;
        if (restaurantCount >= restaurantCap || familyCount >= familyCap) continue;
        const value = candidate.result.score - restaurantCount * 5 - familyCount * 6 - (perPriceBand.get(candidate.priceBand) || 0);
        if (value > bestValue) { best = candidate; bestValue = value; }
      }
      if (!best) break;
      selected.push(best.result);
      selectedIds.add(best.result.id);
      perRestaurant.set(best.restaurantId, (perRestaurant.get(best.restaurantId) || 0) + 1);
      perFamily.set(best.family, (perFamily.get(best.family) || 0) + 1);
      perPriceBand.set(best.priceBand, (perPriceBand.get(best.priceBand) || 0) + 1);
    }
  };
  fill(3, 5);
  fill(Infinity, Infinity);
  return selected;
}

async function fetchMenuBatch(brief: MealBrief, searchMenu: SearchMenu, queries: string[]): Promise<{ items: PreviewMenuItem[]; warnings: string[] }> {
  const settled = await Promise.allSettled(queries.map(query => withDeadline(searchMenu(query, brief.diet === "vegetarian"), 12_000)));
  return {
    items: settled.flatMap(result => result.status === "fulfilled" ? result.value : []),
    warnings: settled.flatMap((result, index) => result.status === "rejected" ? [`Search for “${queries[index]}” failed; other results may still be available.`] : [])
  };
}

// Only the signed-in localhost workflow calls this adaptive search. Public
// SerpApi discovery keeps its existing single-request plan and credit limits.
export async function searchWithSwiggyAdaptive(brief: MealBrief, searchMenu: SearchMenu, candidates = planLocalCandidates(brief), searchRestaurants?: SearchRestaurants): Promise<MealSearchResponse> {
  const pool = [...new Set(candidates.map(value => value.trim()).filter(Boolean))].slice(0, 12);
  const firstQueries = pool.slice(0, 2);
  const first = await fetchMenuBatch(brief, searchMenu, firstQueries);
  const queries = [...firstQueries];
  const items = [...first.items];
  const warnings = [...first.warnings];
  if (brief.cuisine.trim() && !localCuisine(brief.cuisine)) warnings.push("This cuisine is outside the local dish catalogue, so we searched its name directly and kept only menu items that mention it.");
  const preliminary = rankLiveItems(items, brief, queries);
  const familiesSeen = new Set(preliminary.map(item => dishFamily(item.title)?.id || "other"));
  const restaurantNames = [...new Set(preliminary.map(item => item.restaurant).filter(value => value !== "Restaurant"))];
  const reviewQueries = searchRestaurants ? [...new Set([queries[0], restaurantNames[0]].filter((value): value is string => Boolean(value)))].slice(0, 2) : [];
  const reviewPromise = searchRestaurants ? Promise.allSettled(reviewQueries.map(query => withDeadline(searchRestaurants(query), 10_000))) : Promise.resolve([]);
  if (preliminary.length < 12 || familiesSeen.size < 3) {
    const remaining = pool.filter(value => !queries.includes(value));
    const notSeen = remaining.filter(value => !familiesSeen.has(queryFamily(value) || "other"));
    const moreQueries = [...notSeen, ...remaining.filter(value => !notSeen.includes(value))].slice(0, 4 - queries.length);
    if (moreQueries.length) {
      const more = await fetchMenuBatch(brief, searchMenu, moreQueries);
      queries.push(...moreQueries);
      items.push(...more.items);
      warnings.push(...more.warnings);
    }
  }
  const reviews = await reviewPromise;
  const signals = reviews.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (reviews.some(result => result.status === "rejected")) warnings.push("Some restaurant review signals could not be loaded.");
  return { version: 1, jobId: randomUUID(), source: "swiggy-live", queries, results: rankLiveItems(items, brief, queries, signals), warnings, searchedAt: new Date().toISOString() };
}

export async function searchWithSwiggy(brief: MealBrief, searchMenu: SearchMenu, queries = planQueries(brief), searchRestaurants?: SearchRestaurants): Promise<MealSearchResponse> {
  const [settled, reviewResults] = await Promise.all([
    Promise.allSettled(queries.map(query => withDeadline(searchMenu(query, brief.diet === "vegetarian"), 12_000))),
    searchRestaurants ? Promise.allSettled(queries.slice(0, 2).map(query => withDeadline(searchRestaurants(query), 10_000))) : Promise.resolve([])
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
  // One SerpApi request per public click. Returned result count does not spend
  // extra credits, whereas four independent Google requests would.
  const alternatives = queries.map(query => `"${query}"`).join(" OR ");
  const webQueries = [`(${alternatives}) ${city} order online site:swiggy.com/city/${swiggyCitySlug(city)}`];
  const settled = await Promise.allSettled(webQueries.map(searchWeb));
  if (settled.every(result => result.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
  const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`Web search for “${queries[index]}” failed.`] : []);
  const seen = new Set<string>();
  const results: MealResult[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const lead of result.value) {
      if (!validWebUrl(lead.url) || seen.has(lead.url)) continue;
      const domain = trustedDeliveryHost(lead.url);
      if (!domain) continue;
      if (!cityFitsPage(lead.url, city)) continue;
      const pathname = new URL(lead.url).pathname;
      if (domain === "zomato.com" && /\/restaurants\/|\/delivery\/|\/delivery-in-|\/order\/verify|\/dish-/i.test(pathname)) continue;
      const pageWords = tokens(`${lead.title} ${lead.snippet} ${new URL(lead.url).pathname}`);
      const matches = queries.map(query => {
        const dishQuery = brief.cuisine && query.toLowerCase().startsWith(brief.cuisine.toLowerCase())
          ? query.slice(brief.cuisine.length).trim() : query;
        const queryWords = tokens(dishQuery);
        const matchCount = queryWords.filter(word => pageWords.includes(word)).length;
        return { dishQuery, matchCount, firstWordPresent: !queryWords[0] || pageWords.includes(queryWords[0]) };
      }).filter(match => match.firstWordPresent).sort((a, b) => b.matchCount - a.matchCount);
      const bestMatch = matches[0];
      const matchCount = bestMatch?.matchCount || 0;
      if (matchCount === 0) continue;
      if (requestedCuisine(brief) === "italian" && !looksLikeItalianDish(`${lead.title} ${lead.snippet} ${pathname}`)) continue;
      seen.add(lead.url);
      const title = lead.title.trim();
      if (!title || /recipe|homemade|how to make/i.test(`${title} ${lead.snippet}`)) continue;
      if (/^(because you searched|how can i order|best .* delivery restaurants)/i.test(title)) continue;
      if (/-dish-restaurants\/?$/i.test(pathname)) continue;
      if (/\brestaurants?\b.*\b(delivery|in)\b|\bdelivery restaurants?\b/i.test(title)) continue;
      if (brief.diet !== "any" && /\b(chicken|mutton|meat|fish|prawn|beef|pork)\b/i.test(`${title} ${lead.snippet}`)) continue;
      if (brief.diet === "vegetarian" && /\begg\b/i.test(`${title} ${lead.snippet}`)) continue;
      if (exclusions(brief.wish).some(term => `${title} ${lead.snippet}`.toLowerCase().includes(term))) continue;
      results.push({
        id: lead.url, title, restaurant: domain, imageUrl: lead.imageUrl,
        menuPriceInr: null, diet: "unknown", availability: "unknown", source: "web-lead", sourceUrl: lead.url, searchTheme: bestMatch.dishQuery, restaurantReview: null, nutritionEstimate: null,
        nutritionSources: [], match: "unverified", reasons: ["Found on the public web for your city and search theme", ...(requestedCuisine(brief) === "italian" ? ["Page text mentions an Italian dish"] : [])],
        cautions: ["This is a search lead, not a verified live menu item", "Price, availability, diet, protein, calories, and delivery fees are unverified", ...(requestedCuisine(brief) === "italian" ? ["Restaurant cuisine is unverified"] : [])],
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
  await reserveSerpApiCall();
  const params = new URLSearchParams({ engine: "google", q: query, gl: "in", hl: "en", num: "20", api_key: key });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`SerpApi search failed (${response.status}).`);
  const payload = await response.json() as { error?: string; organic_results?: Array<{ title?: string; link?: string; snippet?: string; thumbnail?: string }> };
  if (payload.error) throw new Error(payload.error);
  const results = (payload.organic_results || []).flatMap(row => row.title && row.link ? [{ title: row.title, url: row.link, snippet: row.snippet || "", imageUrl: row.thumbnail || null }] : []);
  webCache.set(query, { at: Date.now(), results });
  if (webCache.size > 200) webCache.delete(webCache.keys().next().value!);
  return results;
}
