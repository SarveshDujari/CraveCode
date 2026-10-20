# Phase 1 integration record

This is an evidence log, not a claim that the whole milestone's external integrations have passed.

## Verified locally

| Check | Result |
| --- | --- |
| Build | `npm run build` succeeded: Vite frontend plus bundled Node API. |
| Type check | `npm run check` succeeded. |
| Contract tests | `npm test`: 3 passed. |
| Running app | Production build served `GET /` (HTTP 200), `GET /api/health` (`ok: true`), and a valid `POST /api/briefs/validate`. |
| Browser UI | Hero, meal form, result-preview labels, and form submission were inspected in the local browser. A local-origin validation bug found during the first submit was fixed and retested. |
| Render-mode safety | With `RENDER=true` and a simulated `RENDER_EXTERNAL_URL`, `/api/system` reported `swiggyLocalEnabled: false`; `/api/swiggy/connect` returned HTTP 503. |
| Swiggy OAuth start | `GET /api/swiggy/connect` returned HTTP 302 to `mcp.swiggy.com`. No account authorization was completed. |
| Gemma reachability | Local Ollama has `gemma3:4b`; three synthetic constraint-extraction probes passed after adding an explicit JSON output schema. Each completed in roughly 5–6 seconds in the successful run. |
| Entire | Official CLI 0.11.5 installed under ignored `.tools/bin`; `entire enable` configured this repository and Codex hooks. The initial Git commit exists. Status reports `trust_review_needed`, so session capture is not yet demonstrated. |

## External gates still open

- **Swiggy end-to-end:** no Swiggy account was authorized in this session. `get_addresses`, `search_menu`, `update_food_cart`, and `get_food_cart` have not been exercised against an authenticated account. Their local code paths exist, but the central cart read-back exit gate is **not passed**. The account holder must complete Swiggy's phone/OTP browser flow; then the smoke test can run on an empty cart with an available uncustomized item. We must inspect the live cart-tool schema before trusting the write payload.
- **MongoDB Atlas:** no URI was provided, so indexes and persistence were not exercised against Atlas. The initializer is present and runs only when configured.
- **Render:** `render.yaml` is ready for a Singapore-region free web service. The server now uses Render's supplied external URL and disables the localhost-only Swiggy OAuth path there. A Render account exists, but there is no Git remote or deployed service yet; deployment is not verified.
- **Entire:** the CLI is configured and the first commit exists, but Codex reports the repository hooks need trust review. No captured session is claimed yet.
- **Public Swiggy access:** the OAuth flow is localhost-only and in-memory in this phase. Public redirect allowlisting and durable per-user token storage are later release gates.

## Sources used for the integration

- [Swiggy developer quickstart](https://mcp.swiggy.com/builders/docs/start/developer/) and [OAuth guide](https://mcp.swiggy.com/builders/docs/start/authenticate/).
- [Swiggy search_menu](https://mcp.swiggy.com/builders/docs/reference/food/search_menu/), [update_food_cart](https://mcp.swiggy.com/builders/docs/reference/food/update_food_cart/), and [get_food_cart](https://mcp.swiggy.com/builders/docs/reference/food/get_food_cart/).
- [MCP TypeScript SDK OAuth client guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md).
- [Ollama generate API](https://docs.ollama.com/api/generate).
- [Render environment variables](https://render.com/docs/environment-variables) and [Blueprint reference](https://render.com/docs/blueprint-spec).
- [Entire CLI repository](https://github.com/entireio/cli).
