# MealPilot frontend design plan

**Status:** Design direction for the Hacktoberfest demo. This extends [ARCHITECTURE.md](./ARCHITECTURE.md), particularly its evidence, budget, and cart rules.

## 1. The experience in one sentence

An editorial food discovery page turns an appetizing set of dishes into a moving ribbon, then lets the user describe the meal they need and inspect a small, trustworthy shortlist before preparing a cart.

The visual reference is [Refero's Steep style](https://styles.refero.design/style/75fdb89f-ca64-41b3-af36-7a78bd09448e): generous white space, expressive serif headlines, warm paper, dark ink, a peach accent, fine dividers, and soft geometric cards. Steep itself avoids photography; our adaptation deliberately adds carefully art-directed food images because food is the product. We are borrowing the design language, not copying its analytics layout.

## 2. Page narrative

| Scene | What the user sees | What it achieves |
| --- | --- | --- |
| 1. Arrival | A calm header, a clear promise, three to five appetizing dishes on a pale background, and a visible **Find my meal** button. | Explain the product immediately; do not require scrolling to discover its purpose. |
| 2. Food ribbon | As the user scrolls, the dishes shrink, align, and become a single horizontal ribbon. The ribbon travels sideways for one short scroll segment. | A memorable transition from inspiration to choice. |
| 3. Meal brief | The ribbon settles above an uncluttered form. One question at a time visually, but all essential controls remain visible. | Make an exact search easy to enter. |
| 4. Search progress | The form stays in place. A compact progress panel reports **Finding available meals → Checking nutrition sources → Comparing prices**. | Make agent work legible without a fake percentage. |
| 5. Shortlist | Three to five large cards arrive as a stable grid, led by the best verified match or a clearly marked closest alternative. | Let the user compare evidence and tradeoffs. |
| 6. Cart review | Selecting a card opens a focused review panel; **Prepare cart** is a distinct action. After preparation, show the actual cart contents and final payable total. | Give the user control at the consequential step. |

The user can jump directly to the form from the hero button or keyboard navigation. The page is useful even if the scroll animation is skipped.

## 3. Layout sketch

```text
DESKTOP  — max content width 1200px
┌──────────────────────────────────────────────────────────────────────┐
│ MealPilot                                      How it works   My meals │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  The right meal, without                 [dish]   [dish]             │
│  the menu marathon.                [dish]      [dish]                │
│                                                                      │
│  Tell us your budget and goals. We find food you can actually order. │
│  [ Find my meal ↗ ]                                                 │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│      [dish] — [dish] — [dish] — [dish] — [dish]  →                   │
├──────────────────────────────────────────────────────────────────────┤
│  What are you in the mood for?                                       │
│  Delivery area/address     [ chosen Swiggy address             ▾ ]   │
│  Diet                      [ Vegetarian ][ Egg-friendly ][ Any ]     │
│  Goal                      [ High protein ][ Balanced ][ Lighter ]   │
│  Protein                   [ 35 ] g minimum   [strict / flexible]    │
│  Calories                  [ 700 ] kcal maximum [strict / flexible]  │
│  Total budget              [ ₹350 ] including fees                  │
│  Cuisine                   [ Any cuisine ▾ ]                         │
│  Optional request          [ e.g. spicy dinner, no mushrooms   ]    │
│                                                      [ Find meals ]  │
├──────────────────────────────────────────────────────────────────────┤
│  3 matches near your goal      [sort / filters]                      │
│  [featured card spans 2 cols]        [card]                          │
│  [card]                               [card]                          │
└──────────────────────────────────────────────────────────────────────┘

MOBILE — one column
Brand → headline → one hero dish → short ribbon/swipe → form → cards.
The primary action remains full-width; card data stacks in reading order.
```

The headline can be tested against a more direct version, “Food that fits your day.” The support sentence must always say what the app actually does: finds *available* options, compares the user's targets, and prepares a chosen cart.

## 4. Visual system

| Token | Direction | Usage |
| --- | --- | --- |
| Canvas | `#FCFBF8` warm white | Page background; feels like uncoated paper. |
| Ink | `#1D1B19` | Headlines, body text, key labels. |
| Cocoa | `#5D2A1A` | Primary button, focus and selected states. |
| Peach | `#FBE1D1` | One large featured surface or highlight per viewport. |
| Mist | `#F2F2F3` | Secondary cards and input surfaces. |
| Muted | `#74736F` | Supporting text, never essential status by color alone. |
| Serif | Signifier if licensed; otherwise Source Serif 4 | Display headline and major section titles only. |
| Sans | Söhne if licensed; otherwise Inter | Controls, cards, captions, data. |
| Width/spacing | 1200px container; 80–112px desktop section space; 24–32px mobile | Generous rhythm with enough room for food images. |
| Shape | 20–24px cards, pill controls, fine 1px warm-gray rules | Soft without looking like a generic dashboard. |

Food art direction: photograph or render real dishes against a shared cream or warm-gray backdrop, 3/4 overhead angle, natural side light, realistic portions, and consistent crop. Use 4–5 strong images, not a dense carousel. Preserve the source's quiet look by keeping backgrounds neutral and saturation in the food itself. Any production imagery needs a usable license or ownership. Avoid labels baked into images; all names and nutrition facts are accessible text.

## 5. Scroll choreography

The animation is a transition, not an endless marquee. It should work like this:

1. **Hero (0–25% of sequence):** food objects sit loosely around the hero copy at different scales. Copy remains readable and the CTA is available.
2. **Gather (25–60%):** each object travels toward an invisible horizontal baseline and scales to the same card height. Background decorations fade out. Use opacity and transforms rather than changing layout dimensions on every scroll tick.
3. **Ribbon (60–90%):** the aligned group translates horizontally as the scroll progresses, revealing different dishes. Keep the journey to roughly one viewport of scroll; no long forced pinning.
4. **Handoff (90–100%):** movement stops. The form heading enters below and the ribbon becomes a stable, optionally swipeable strip of dish images. Scrolling onward behaves normally.

The ribbon is decorative exploration, not the only way to pick a dish. It has no auto-play once settled. If its dish chips become interactive, they must be keyboard-operable and add a cuisine or dish preference to the form rather than silently change hard constraints.

Implementation direction: a small client-side component with one GSAP ScrollTrigger timeline can coordinate the gather, scale, and sideways translation. Its documented `scrub`, `pin`, and refresh behavior suit this exact choreography ([GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)). Scope it to the hero only and recalculate after responsive image layout changes. Prefer `transform` and `opacity` for smooth rendering ([web.dev animation guidance](https://web.dev/articles/animations-guide)). Keep the rest of the page standard document flow.

For `prefers-reduced-motion: reduce`, skip the gathering/sideways travel entirely: show one static hero composition and the settled ribbon, with a simple fade or no transition. On narrow/mobile screens, use a much shorter transformation or static swipe strip. MDN documents reduced-motion as an accessibility preference to minimize nonessential movement ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility)). No scroll hijacking, looping marquee, or animation that must finish before the form is usable.

## 6. Meal brief: precise but inviting

The form should feel like a short conversation, but remain ordinary labeled controls. It is one screen on desktop and a clear vertical sequence on mobile, with a persistent **Find meals** action once the fields are valid.

| Field | UI | Behavior |
| --- | --- | --- |
| Delivery location | Address selector connected to Swiggy | Required to search genuinely deliverable items. Show exact selected area; do not substitute a web-search location. |
| Diet | Single-select radio chips: **Vegetarian**, **Egg-friendly**, **Any**; optional **Vegan** only if filtering can be verified | This gives the user's requested tick-box feel without allowing contradictory choices. Allergens/exclusions are separate explicit fields. |
| Goal | Single-select suggestions: **High protein**, **Balanced**, **Lighter** | Prefills sensible input values but does not override numbers the user changes. |
| Protein | Numeric minimum in grams | Label explicitly says “at least.” A nearby strict/flexible control decides whether unknown nutrition can appear in exact-match results. |
| Calories | Numeric maximum in kcal | Label explicitly says “at most.” If unknown, the app never claims compliance. |
| Budget | Numeric amount in INR, “including taxes and delivery fees” | Required. Before cart preparation, result prices are estimates. |
| Cuisine / food | Optional searchable chips or simple select, e.g. North Indian, South Indian, Chinese, rolls, bowls | “Any” is the default. No false promise of exhaustive categories. |
| Additional wish | Short optional text | Extract taste preferences and exclusions, then show the interpreted constraints for review. |

Sensible default example: “Dinner · Vegetarian · 35 g+ protein · up to 700 kcal · ₹350 total.” Show a concise summary above results so users can edit and rerun. If a strict request has no documented nutrition evidence, say so and show closest alternatives rather than silently loosening it. Preserve form state through loading, back navigation, and refresh.

## 7. Result cards and evidence

Cards should be visually rich but informationally honest. A suggested card hierarchy:

```text
┌─────────────────────────────────────┐
│ dish photograph                     │
│ BEST DOCUMENTED MATCH               │
│ Paneer rice bowl          Restaurant │
│ 38 g protein · 610 kcal              │
│ Documented for this item ↗           │
│ ₹249 menu price · fees pending       │
│ 30–40 min                            │
│ Fits protein  ✓   Fits kcal  ✓       │
│ [ Why this fits ] [ Review & choose ]│
└─────────────────────────────────────┘
```

Desktop: one featured card taking two columns, plus two standard cards in a three-column composition. Mobile: all cards in a single column; do not hide source or price context behind hover. The peach surface belongs to the leading recommendation, while the remaining cards stay warm white or mist. Use still images in results; the scroll movement is already the visual event.

Every card must show: restaurant and exact item/variant, documented/estimated/unknown nutrition status, protein and calories only when supported, menu price as provisional, availability/ETA if provided, and why it matches or misses the entered constraints. **View evidence** opens a small panel with source URL, source date, portion/variant match, and limitations. A web result or snippet alone is not displayed as nutrition proof. A “closest alternative” badge is distinct from “exact match.”

The **Review & choose** panel shows the exact selected item and customizations, evidence, estimated cost, and any uncertainty. **Prepare cart** is enabled only for a selected candidate; the app then refreshes availability and reads back the actual cart. The success state displays the real `to_pay` total and contents. If the total exceeds the user's budget, show the difference and return to alternatives; do not call it a budget match. If an existing cart must be replaced, show its contents and an explicit replace action first. Checkout stays with Swiggy.

## 8. Interaction states that deserve design attention

- **Before search:** sample input or a tiny “Try this: ₹350, vegetarian, 35 g protein” action makes the product immediately understandable.
- **Loading:** stable cards/skeletons plus named steps. Avoid changing claims as partial evidence arrives; only publish candidates after deterministic validation. Provide a cancel action if the workflow supports cancellation.
- **No exact match:** a dedicated block explains the binding constraint, e.g. “No dish with documented 35 g protein under ₹350”; show up to three clearly labeled near matches and one-click edit suggestions.
- **Source missing:** “Nutrition unknown” takes the place of invented numbers. It remains eligible only under flexible goals.
- **Platform unavailable:** preserve the user's form and give a retry. A staged/replay demonstration is visibly labeled as such.
- **Cart changed or item sold out:** stop with a clear reason, refresh choices, and never claim success until the cart read-back confirms it.
- **Return visit:** restore preferences and recent searches as optional shortcuts, while keeping today's address, stock, and price fresh.

## 9. Accessibility and performance acceptance

- Keep a logical heading and tab order. The hero art is decorative where duplicated by text; actionable dish chips have names and visible focus rings.
- Use real radio inputs for diet and goal, real numeric inputs with units, and descriptive error text. Never convey match status with color alone.
- Announce search-stage and final-result changes through a polite live region; avoid announcing every animated frame.
- Respect reduced motion, keyboard navigation, and touch. Test at 320px width and 200% zoom.
- Load only the hero images immediately; responsive sizes and lazy loading cover the rest. Reserve image dimensions to prevent layout shifts.
- Keep at most a handful of animated layers, remove `will-change` after the hero sequence, and test on a mid-range phone. Target a stable 60 fps *where capable*, with no blocked form interaction. Verify Core Web Vitals on the deployed page rather than promising a score in advance.

## 10. Build order for this week's hack

1. **Functional skeleton:** hero, working form, stateful progress, stable result-card and cart-review layouts using typed fixture data. Validate mobile and keyboard use.
2. **Real data hookup:** connect the request, candidate, evidence, and cart states from the architecture. Make source and price labels accurate before polishing motion.
3. **Signature sequence:** implement the hero-to-ribbon timeline with 4–5 optimized images; add reduced-motion and mobile variants.
4. **Polish:** transitions between loading/results, empty/error states, content copy, photography consistency, and focused visual QA at common viewport sizes.
5. **Demo path:** one successful real/staging search and cart review, plus one impossible request. Capture the scroll transition in a brief clip and let judges explore the working interface themselves.

**Cut line if time is tight:** Keep the working form, evidence-rich result cards, and honest cart states. Shorten the ribbon animation before weakening the actual search or introducing misleading nutrition/price claims.
