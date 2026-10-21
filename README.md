# CraveCode

CraveCode is a meal-discovery agent in progress. Give it a budget, diet, protein and calorie targets, and optional food preferences. The Phase 2 engine searches several goal-aware dish themes, ranks live Swiggy menu items locally, and explains what is and is not verified. It never places an order automatically.

The project is being built in [four phases](./FOUR_PHASE_ROADMAP.md). The [architecture](./ARCHITECTURE.md) and [frontend design](./FRONTEND_DESIGN.md) set the constraints for later work. **Phase 2's search workflow runs locally and on Render. Public search has a configured SerpApi key; public Swiggy OAuth still needs production approval. Nutrition-source matching and cart preparation remain open.**

The implemented frontend has a white hero with eight floating food illustrations, a black meal-brief section, and a white results area. A dish is optional. A signed-in local Swiggy search returns ranked live menu cards. The hosted site uses SerpApi for clearly labeled public web leads by city once configured; these are not verified deliverable menu items.

![CraveCode desktop hero](./docs/cravecode-hero.png)

[Mobile hero](./docs/cravecode-mobile.png) · [Dark meal brief](./docs/cravecode-brief.png)

## Run locally

Requirements: Node.js 24+, npm, and optionally a local Ollama service with `gemma3:4b` pulled.

```powershell
npm ci
Copy-Item .env.example .env
npm run build
npm start
```

Open `http://localhost:8787`. For live frontend changes, run `npm run dev:api` and `npm run dev` in separate terminals, then open `http://localhost:5173`. In that mode set `PUBLIC_ORIGIN=http://localhost:5173` in `.env` for the OAuth callback.

```powershell
npm run check
npm test
npm run gemma:probe
```

The Gemma probe uses the Ollama generate API by default. Set `GEMMA_API_URL` and `GEMMA_MODEL` to another compatible endpoint/model if needed. Its three examples are synthetic checks, not a complete evaluation.

## Phase 2 search

The `/api/meal-search` endpoint validates the brief, runs a Mastra workflow (bounded query planning → discovery → evidence checks), and returns a versioned job result. Local authenticated Swiggy calls cover up to four dish themes with deduplication, stock/diet filtering, and provisional ranking. The shortlist shows up to 15 items and spreads its first picks across restaurants when possible. A review preference can boost restaurants with both a strong Swiggy rating and at least 100 ratings; low ratings, limited history, or unavailable data are labeled. Ratings are customer feedback, not food-safety certification. Public Render calls use up to four SerpApi Google searches for the chosen city and link to source pages. Web leads have no claimed price, diet, stock, restaurant rating, nutrition, or deliverability. All-in budget and macro targets cannot be called exact matches without verified data. Search jobs/candidates are saved to Atlas when connected; a database write failure returns the results with a warning.

Sentry spans are enabled only when `SENTRY_DSN` is configured. Spans use stage names without address IDs, credentials, dish text, or full request bodies. If a compatible `GEMMA_API_URL` and `GEMMA_MODEL` are configured, Gemma uses the calorie and protein goals to suggest bounded dish-search phrases; invalid output, a diet conflict, calorie claims in the phrase, or timeout falls back to the deterministic planner. Gemma never supplies macro, price, stock, or exact-match claims. Hosted Gemma has not been verified yet. A user can request an on-demand SerpApi nutrition reference for any returned card. The value appears only with a source link, comparable food description, and serving size, and is labeled as a general reference. It does not qualify the restaurant item against the user's target. Exact restaurant-item nutrition matching remains open.

## Swiggy integration

Connecting Swiggy locally starts its documented OAuth 2.1/PKCE browser flow, which requires the account holder's phone/OTP. After connection, choose a saved address and search. The dish field is optional; the engine otherwise explores several candidates suggested by the goal and diet. The API returns only a small menu summary: name, restaurant, menu price, stock, and IDs. It does not claim the item meets macro or final-budget goals.

The experimental cart-probe endpoint asks for explicit confirmation, rechecks the item within its restaurant, refuses to overwrite a nonempty cart, and requires a read-back before claiming success. The account holder reports that the first cart test did not work, so the visible cart button is hidden while we build the search engine. We will diagnose the exact failure in Phase 3. No checkout or order tool is exposed. The local SDK can expose the current `update_food_cart` input schema at `/api/swiggy/cart-tool-schema` for debugging because Swiggy's recipe and reference examples use different cart payload shapes.

Swiggy OAuth is deliberately limited to localhost. Sessions and tokens are held in server memory and vanish on restart. Before a public multiuser release, move these into per-user encrypted storage, add proper session management, and complete Swiggy's production-access review. See the [Swiggy developer quickstart](https://mcp.swiggy.com/builders/docs/start/developer/) and [authentication guide](https://mcp.swiggy.com/builders/docs/start/authenticate/).

## Configuration

| Variable | Use |
| --- | --- |
| `PORT` | API and production-build port; default `8787`. |
| `PUBLIC_ORIGIN` | Optional browser origin override. Defaults to Render's `RENDER_EXTERNAL_URL` on Render, or `http://localhost:5173` locally. |
| `MONGODB_URI` | Optional Atlas connection. If absent, `/api/system` reports `not-configured`. |
| `MONGODB_DB` | Database name; default `mealpilot`. |
| `SERPAPI_API_KEY` | Server-side SerpApi key for public city-based web search. Do not put it in the frontend or Git. |
| `SENTRY_DSN` | Optional server-side tracing destination. |
| `GEMMA_API_URL` | Ollama-compatible `/api/generate` URL for the probe. |
| `GEMMA_MODEL` | Model to probe, default `gemma3:4b`. |
| `GEMMA_API_KEY` | Optional bearer token for a hosted compatible endpoint. |

The Atlas initializer creates indexes for `meal_jobs`, `candidates`, `nutrition_claims`, `cart_audits`, and `preferences`. Search jobs and candidates are persisted when Atlas is configured. Server credentials never enter the browser bundle. The `render.yaml` provides a Singapore-region free web-service blueprint. Add `SERPAPI_API_KEY` and `MONGODB_URI` as Render environment secrets. Allow the service's outbound IP ranges in Atlas Network Access. Render supplies its own public origin. Swiggy OAuth remains disabled on Render until public access and per-user session storage are ready.

Each public click uses up to four SerpApi searches, cached by query for one hour; the service limits public searches to 10 per hour and on-demand nutrition lookups to 10 per hour to preserve free-plan throughput. Check your SerpApi plan's monthly quota before sharing the link widely. This path is for discovery leads, not verified menu prices. Do not commit the API key or Atlas URI.

The live preview is [cravecode.onrender.com](https://cravecode.onrender.com/). The free service can sleep when idle, so allow time for its first request to wake it. Public web search will not return leads until `SERPAPI_API_KEY` is set in Render.

## What is real now

- Responsive three-scene CraveCode frontend with all eight user-supplied illustrations floating around the wordmark, a dark meal form, and a white results area.
- Accessible single-select diet/goal controls, optional dish, numeric units, validation, reduced-motion support, and an honest disconnected-results state.
- Typed meal, candidate, evidence, and cart-audit contracts.
- Node API serving the built frontend, validating briefs, running a Mastra search workflow, and providing local Swiggy OAuth/menu/cart integration paths.
- Optional Atlas connection and indexes, plus a local Gemma structured-output probe.
- Authenticated local Swiggy address selection and menu search were observed with 10 real item cards before the Phase 2 changes. The owner signed in again and confirmed ranked live cards with the optional dish field empty. Render revision 3 returned three relevant Bengaluru paneer web leads in one live check. Cart read-back remains unverified. No invented nutrition values or all-in price claims.

See [PHASE1_STATUS.md](./PHASE1_STATUS.md) for the checks completed in this workspace and the external gates still open.
