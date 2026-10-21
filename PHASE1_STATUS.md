# Phase 1 integration record

This is an evidence log, not a claim that the whole milestone's external integrations have passed.

## Verified locally

| Check | Result |
| --- | --- |
| Build | `npm run build` succeeded: Vite frontend plus bundled Node API. |
| Type check | `npm run check` succeeded. |
| Contract and safety tests | `npm test`: 6 passed, including saved-address pagination, a changed-item refusal, and an uncertain cart write verified by read-back. |
| Running app | Production build served `GET /` (HTTP 200), `GET /api/health` (`ok: true`), and a valid `POST /api/briefs/validate`. |
| Browser UI | Hero, meal form, result-preview labels, and form submission were inspected in the local browser. A local-origin validation bug found during the first submit was fixed and retested. |
| CraveCode redesign | Eight supplied illustrations added to a white orbit hero; dark meal form and white results area implemented. Browser checks covered desktop, 390px, and 320px layouts, brief submission, and the honest disconnected-results state. The authenticated local menu now displays live result cards. |
| Render-mode safety | With `RENDER=true` and a simulated `RENDER_EXTERNAL_URL`, `/api/system` reported `swiggyLocalEnabled: false`; `/api/swiggy/connect` returned HTTP 503. |
| Swiggy local discovery | The account holder completed OAuth in their own browser, selected a saved address, and showed 10 live menu items in the local CraveCode UI. This establishes that `get_addresses` and `search_menu` work for the local session. Nutrition and all-in prices remain unverified. |
| Render deployment | `https://cravecode.onrender.com/` served the frontend and images (HTTP 200), `/api/health` returned `ok: true`, and a synthetic meal brief was accepted by `/api/briefs/validate`. `/api/system` correctly reported MongoDB and Gemma unconfigured and public Swiggy OAuth disabled. |
| Gemma reachability | Local Ollama has `gemma3:4b`; three synthetic constraint-extraction probes passed after adding an explicit JSON output schema. Each completed in roughly 5–6 seconds in the successful run. |
| Entire | Official CLI 0.11.5 installed under ignored `.tools/bin`; `entire enable` configured this repository and Codex hooks. The initial Git commit exists. Status reports `trust_review_needed`, so session capture is not yet demonstrated. |

## External gates still open

- **Swiggy cart:** OAuth, saved-address selection, and live menu search worked in the account holder's browser. The account holder reports that the first **Test cart add** attempt did not work; the exact failure is not yet known. Do not claim that `update_food_cart` or `get_food_cart` succeeded. Cart investigation and read-back proof are deferred to Phase 3 while Phase 2 focuses on the recommendation engine. The local probe checks that the live tool exposes `cartItems`; its nested item schema remains unverified.
- **MongoDB Atlas:** no URI was provided, so indexes and persistence were not exercised against Atlas. The initializer is present and runs only when configured.
- **Entire:** the CLI is configured and the first commit exists, but Codex reports the repository hooks need trust review. No captured session is claimed yet.
- **Public Swiggy access:** the OAuth flow is localhost-only and in-memory in this phase. Public redirect allowlisting and durable per-user token storage are later release gates.

## Sources used for the integration

- [Swiggy developer quickstart](https://mcp.swiggy.com/builders/docs/start/developer/) and [OAuth guide](https://mcp.swiggy.com/builders/docs/start/authenticate/).
- [Swiggy search_menu](https://mcp.swiggy.com/builders/docs/reference/food/search_menu/), [update_food_cart](https://mcp.swiggy.com/builders/docs/reference/food/update_food_cart/), and [get_food_cart](https://mcp.swiggy.com/builders/docs/reference/food/get_food_cart/).
- [MCP TypeScript SDK OAuth client guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md).
- [Ollama generate API](https://docs.ollama.com/api/generate).
- [Render environment variables](https://render.com/docs/environment-variables) and [Blueprint reference](https://render.com/docs/blueprint-spec).
- [Entire CLI repository](https://github.com/entireio/cli).
