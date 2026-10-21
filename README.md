# CraveCode

CraveCode is a meal-discovery agent in progress. Give it a budget, diet, protein and calorie targets, and optional food preferences; the planned agent will search orderable meals, explain evidence and tradeoffs, and prepare a selected Swiggy cart for review. It never places an order automatically.

The project is being built in [four phases](./FOUR_PHASE_ROADMAP.md). The [architecture](./ARCHITECTURE.md) and [frontend design](./FRONTEND_DESIGN.md) set the constraints for later work. **The discovery foundation is working; Phase 2's recommendation engine is now the focus. Cart preparation remains unverified and is deferred to Phase 3.**

The implemented frontend has a white hero with eight floating food illustrations, a black meal-brief section, and a white results area. A signed-in local Swiggy search can show real menu-item cards there. Without a live connection, the results area displays an honest empty state; full goal-aware ranking is Phase 2 work.

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

## Phase 1 Swiggy check

The local page has a **Check the real menu** area. Connecting Swiggy starts its documented OAuth 2.1/PKCE browser flow, which requires the account holder's phone/OTP. After connection, choose a saved address and search a dish. The API returns only a small menu summary: name, restaurant, menu price, stock, and IDs. It does not claim the item meets macro or final-budget goals.

The experimental cart-probe endpoint asks for explicit confirmation, rechecks the item within its restaurant, refuses to overwrite a nonempty cart, and requires a read-back before claiming success. The account holder reports that the first cart test did not work, so the visible cart button is hidden while we build the search engine. We will diagnose the exact failure in Phase 3. No checkout or order tool is exposed. The local SDK can expose the current `update_food_cart` input schema at `/api/swiggy/cart-tool-schema` for debugging because Swiggy's recipe and reference examples use different cart payload shapes.

Swiggy OAuth is deliberately limited to localhost in Phase 1. Sessions and tokens are held in server memory and vanish on restart. Before a public multiuser release, move these into per-user encrypted storage, add proper session management, and complete Swiggy's production-access review. See the [Swiggy developer quickstart](https://mcp.swiggy.com/builders/docs/start/developer/) and [authentication guide](https://mcp.swiggy.com/builders/docs/start/authenticate/).

## Configuration

| Variable | Use |
| --- | --- |
| `PORT` | API and production-build port; default `8787`. |
| `PUBLIC_ORIGIN` | Optional browser origin override. Defaults to Render's `RENDER_EXTERNAL_URL` on Render, or `http://localhost:5173` locally. |
| `MONGODB_URI` | Optional Atlas connection. If absent, `/api/system` reports `not-configured`. |
| `MONGODB_DB` | Database name; default `mealpilot`. |
| `GEMMA_API_URL` | Ollama-compatible `/api/generate` URL for the probe. |
| `GEMMA_MODEL` | Model to probe, default `gemma3:4b`. |
| `GEMMA_API_KEY` | Optional bearer token for a hosted compatible endpoint. |

The Atlas initializer creates indexes for `meal_jobs`, `candidates`, `nutrition_claims`, `cart_audits`, and `preferences`. The Phase 1 UI does not persist personal briefs yet. Server credentials never enter the browser bundle. The `render.yaml` provides a Singapore-region free web-service blueprint. Add `MONGODB_URI` as a Render secret when the Atlas cluster exists. Render supplies its own public origin. Swiggy OAuth remains disabled on Render until public access and per-user session storage are ready.

The live preview is [cravecode.onrender.com](https://cravecode.onrender.com/). Its page, images, health endpoint, and synthetic brief submission were verified. It currently has no configured Atlas or hosted Gemma connection and cannot perform public Swiggy OAuth. The free service can sleep when idle, so allow time for its first request to wake it.

## What is real now

- Responsive three-scene CraveCode frontend with all eight user-supplied illustrations floating around the wordmark, a dark meal form, and a white results area.
- Accessible single-select diet/goal controls, numeric units, validation, reduced-motion support, and an honest disconnected-results state.
- Typed meal, candidate, evidence, and cart-audit contracts.
- Node API serving the built frontend, validating briefs, and providing local Swiggy OAuth/menu/cart integration paths.
- Optional Atlas connection and indexes, plus a local Gemma structured-output probe.
- Authenticated local Swiggy address selection and menu search were observed with 10 real item cards. Cart read-back remains unverified. No invented nutrition values or all-in price claims.

See [PHASE1_STATUS.md](./PHASE1_STATUS.md) for the checks completed in this workspace and the external gates still open.
