# MealPilot: four-phase build plan

This roadmap turns the [system architecture](./ARCHITECTURE.md) and [frontend design](./FRONTEND_DESIGN.md) into four reviewable milestones for the Hacktoberfest Week 3 build. The [challenge rules](https://dev.to/page/hacktoberfest-week3-2026-10-19-contest-rules) govern the actual submission deadline.

## Scope we protect throughout

The first release handles one selected Swiggy delivery address, one restaurant per proposed cart, and at most two items per candidate. A user enters an all-in budget, diet, protein and calorie targets, and optional cuisine. The system finds available meals, distinguishes documented nutrition from estimates or unknowns, explains tradeoffs, and prepares **one selected cart** after explicit user action. Checkout remains with Swiggy. Price is provisional until the cart is read back.

## Milestones at a glance

| Phase | Working result | Exit gate |
| --- | --- | --- |
| 1. Prove the path | Running app shell and a verified Swiggy staging/local search → cart → read-back spike | We know whether the essential ordering path and access are real. |
| 2. Find and explain | User can submit a meal brief and see grounded, ranked candidates or a truthful no-match result | No unsupported nutrition or false budget promise in the sample cases. |
| 3. Prepare safely | User can choose one candidate, review it, prepare the cart, and see the verified total; signature page motion is integrated | Cart success and failure paths are recoverable and observable. |
| 4. Prove and submit | Polished deployed demo, reproducible evidence, short video, and DEV submission | Live link, code, article, tests, and partner-category evidence are all checked. |

## Phase 1 — Prove the path

**Question to answer:** Can this project use real menu identifiers and prepare a real staging/local cart through the documented Swiggy Food MCP flow?

Build:

- Create the new repository and app shell: responsive landing page, static hero, meal form, result-card fixture, and cart-review fixture. Set up environment variables without exposing service credentials in the browser.
- Establish the typed request and candidate contracts, the backend API boundary, and the initial MongoDB Atlas collections for jobs, preferences, candidates, evidence, and cart audits.
- Authenticate the available Swiggy staging/local environment. Select an address, search a menu, capture an exact menu item and variant ID, add a chosen item to the staging cart, and read the cart back. Log only redacted evidence of what succeeded.
- Inspect actual responses for nutrition, availability, fee, and price fields. Record gaps; do not design around imagined fields.
- Get Gemma inference reachable and run three representative constraint-parsing probes. Set up Entire at the start so decisions and fixes can be captured as they happen.
- Deploy the basic app/API shell to Render early, even if the data is still a labeled fixture, to expose deployment issues now.

**Deliverable:** A click-through UI skeleton plus a short integration note containing the actual Swiggy operations that worked, sample redacted response shapes, and known blockers.

**Exit gate:** A selected staging/local menu item can be written and read back from the cart. If access is blocked, apply/escalate immediately and keep a clearly labeled replay path for the demo; do not imply that replay is live. The rest of the build can continue, but production-cart claims remain blocked until verified.

## Phase 2 — Find and explain

**Question to answer:** Can the agent produce useful recommendations with evidence, rather than plausible-sounding guesses?

Build:

- Wire the real form to a versioned meal-search job. Required fields: selected delivery address, diet, total budget, protein minimum, calorie maximum; optional goal, cuisine, exclusions, and free text.
- Implement Mastra's bounded workflow: parse request with Gemma → search Swiggy → enrich promising items → evaluate constraints → rank → explain. Keep numeric checks, diet rules, item identity, and ranking deterministic in code.
- Measure nutrition coverage from Swiggy alone. Then add SerpApi as a discovery layer for restaurant-owned nutrition pages or other attributable sources. Fetch permitted source material; verify exact restaurant, item, portion, and variant before attaching a claim. Measure the incremental coverage gain.
- Persist request, job stage, candidates, nutrition claim IDs, and timestamps in MongoDB Atlas so refresh does not erase results. Add Sentry spans for model calls, platform searches, source matching, and validation without sending addresses or tokens.
- Render results as the designed cards: exact match versus closest alternative, documented/estimated/unknown nutrition labels, source links, menu price marked provisional, and a clear explanation of each tradeoff.
- Handle no-match, source conflict, missing macros, timeout, and user-edited constraints. Show the interpreted request for review.

**Deliverable:** A user can submit a real meal brief and inspect three to five ranked candidates with source-backed explanations, or see why no exact match exists.

**Exit gate:** On a small fixed set of representative requests, every displayed macro number has a matched source, unavailable items are excluded, strict targets are not silently relaxed, and no candidate is described as under the *all-in* budget before cart verification. Record failures for the final evaluation.

## Phase 3 — Prepare safely and make the experience memorable

**Question to answer:** Can a user trust the transition from recommendation to cart, and does the visual interaction support that flow?

Build:

- Add explicit candidate selection, a review panel, and a separate **Prepare cart** action. Read the existing cart before writing; if replacement is needed, show contents and require an explicit replace action.
- Revalidate item/variant and stock before mutation. Serialize cart operations per user, use app-level idempotency keys and job versions, and read the live cart after a write or uncertain timeout. Show success only after contents and `to_pay` are verified.
- If the final total exceeds the budget, show the difference and return to alternatives. If stock, variants, or cart state change, stop and explain; do not retry an uncertain mutation blindly.
- Add Sentry tracing for the full search-to-cart path, with one real diagnosed issue or failure case. Complete the MongoDB cart audit and resume states.
- Polish and performance-check the implemented eight-illustration CraveCode orbit and short white → black → white scroll sequence in the [frontend design](./FRONTEND_DESIGN.md). Keep native scrolling and a fully usable static/reduced-motion version; optimize the supplied food illustrations before public launch.
- Tighten keyboard navigation, focus, loading announcements, 320px layout, and error states.

**Deliverable:** An end-to-end demo from request to selected cart, with a verified total, plus the distinctive editorial scroll transition.

**Exit gate:** Demonstrate one successful cart read-back and at least three safety cases: price over budget, existing cart conflict, and uncertain write or item unavailable. The result page remains usable with reduced motion and keyboard-only input.

## Phase 4 — Prove the result and submit

**Question to answer:** Can a judge try it, understand the agentic work, and verify the partner integrations quickly?

Build:

- Stabilize Render deployment, secrets, health checks, logs, and a usable public URL; connect the claimed `.tech` domain if available. Ensure the demo's data source is explicitly labeled live, staging, or replay.
- Run the compact evaluation suite from the architecture: constraint parsing, nutrition-source matching, unsupported claims, budget compliance on prepared carts, cart audit success, latency, and nutrition coverage before/after SerpApi. Include sample sizes and failures.
- Record a concise demo: enter a realistic request → watch the agent stages → inspect source evidence → choose a meal → verify final cart total. Show one deliberate no-match or failure path. Capture the scroll interaction in the same product tour.
- Link selected Entire sessions to a concrete design or debugging decision. Include a Sentry trace that illustrates actual model/tool activity and a fix or useful diagnosis.
- Write and publish the DEV article with the live demo, code link, architecture diagram, screenshots/video, exact partner-category uses, measured results, honest limitations, and setup instructions. Check the official deadline in the challenge's timezone before posting.

**Deliverable:** Public app, repository, demo video, evaluation notes, and completed DEV submission.

**Exit gate:** A fresh visitor can understand the product, run the demo path, inspect evidence, and see the final cart state. Every claimed partner category has a working implementation and specific proof in the article; omit any category that remains only planned.

## Dependency and cut rules

```text
Swiggy access check ─┬─> menu identity ─> grounded search ─> selected cart ─> final demo
                     └─> if blocked: honest replay label, no live-cart claim

Gemma + Mastra ─> bounded search/explanation
SerpApi ─> exact nutrition-source matches ─> measured coverage gain
MongoDB ─> resumable jobs and cart audit
Sentry ─> diagnosis and evidence
Render + .tech + Entire ─> public presentation and build story
```

If schedule compresses, cut in this order: extra cuisine filters, saved-history personalization, elaborate animation details, then extra result-card variants. Preserve the real search path, source honesty, explicit cart consent, final-total verification, deployed demo, and article. The orbit can remain static and the sections can scroll naturally; fake nutritional certainty and fake cart success cannot be used to save time.

## Immediate next actions

1. Confirm the Swiggy staging/local integration steps and production-access path; this is the project’s largest external dependency.
2. Scaffold the app and API with the typed meal request, candidate, and cart-audit models.
3. Build the static version of the frontend from the design plan, so backend work has a real interface to feed.
4. Run the first end-to-end menu-to-cart spike before expanding agent search or scroll polish.
