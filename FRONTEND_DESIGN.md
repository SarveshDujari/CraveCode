# CraveCode frontend redesign plan

**Status:** The three-scene layout, eight-image orbit, responsive form, results states, and scroll motion are implemented in the Phase 1 frontend. Live goal-aware ranking and image optimization remain future work. The product and data rules remain in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Experience and page map

One uninterrupted page has three scenes:

1. **White welcome:** a large centered CraveCode wordmark, a one-sentence promise, and the eight supplied food illustrations floating in a loose circle. A visible **Find my meal** CTA leads to the form.
2. **Black meal brief:** a full-width near-black section arrives naturally as the visitor scrolls. A compact form collects location, diet, goals, limits, and tastes. Search progress stays in this section.
3. **White results:** fetched dishes appear as evidence-aware cards. Selecting one opens a review step before any cart change.

Suggested hero copy: **CraveCode** / “Find food that fits your cravings, goals, and budget.” / “Compare real menu options before you choose what goes in your cart.” The second line should remain honest until live search is available; if the demo is running on fixture data, say so visibly.

```text
WHITE / ARRIVAL
┌───────────────────────────────────────────────────────────────┐
│ CraveCode                                 How it works  Find  │
│       [pizza]       [biryani]        [tikka]                  │
│ [salad]                CraveCode                 [burger]      │
│ [dosa]     Food that fits your day.             [wrap]        │
│                   [ Find my meal ↓ ]                          │
│                       [sandwich]                              │
└───────────────────────────────────────────────────────────────┘
                         natural scroll ↓
BLACK / MEAL BRIEF
┌───────────────────────────────────────────────────────────────┐
│ What are you craving?          [address / connect]            │
│ Cravings meet real limits.     [diet] [goal]                   │
│                               [protein] [calories] [budget]   │
│                               [cuisine] [avoid / notes]       │
│                               [ Find food that fits → ]       │
│                  search / evidence / comparison status        │
└───────────────────────────────────────────────────────────────┘
                         natural scroll ↓
WHITE / RESULTS
┌───────────────────────────────────────────────────────────────┐
│ Meals worth a closer look             [edit brief] [sort]      │
│ Search summary and source / price caveat                      │
│ [featured card] [card] [card]                                 │
│ [card]          [card] [card]                                  │
│ [why it fits] → [review exact item] → [prepare cart]           │
└───────────────────────────────────────────────────────────────┘
```

The header stays quiet and changes text color when the dark section occupies the viewport. The main CTA always reaches the form. No separate long “how it works” section interrupts this three-scene story; a short explanation can live below the form or in the footer.

## Visual system and supplied art

| Element | Direction |
| --- | --- |
| Backgrounds | `#FFFFFF` for welcome and results; near-black `#111113` for the form. Remove the current beige overall background. |
| Type | Strong sans-serif wordmark; highly readable sans-serif controls and cards. One expressive display face is optional, never at the expense of clarity. |
| Contrast | Near-black `#171719` on white; soft white `#F7F7F5` on black. Secondary text remains readable. |
| Accent | One restrained warm orange/coral sampled from the illustrations for selected states, focus, and the CTA. |
| Surfaces | Generous space, fine borders, 12–20px radii, crisp cards. Avoid nested boxes and heavy shadows. |
| Result imagery | Use an exact fetched menu photo when available. Otherwise show a neutral labeled placeholder; hero art is decorative, not a photo of a real menu item. |

The eight source files sit one directory above this app: `biryani_animated.png`, `burger_animated.png`, `dosa_animated.png`, `pizza_animated.png`, `salad_animated.png`, `sandwich_animated.png`, `tikka_animated.png`, and `wrap_animated.png`. They are transparent still PNG illustrations despite their names. CSS will supply their floating motion. Keep the originals intact and place optimized derivatives in `public/food/` when implementing. Together the PNGs are about 1.9 MB, so serve appropriately sized WebP/AVIF variants and reserve each image's dimensions to prevent layout shifts.

## Hero layout and scrolling

Place the eight dishes at roughly 45-degree intervals on an invisible circular track around the centered wordmark. Vary size and rotation a little so the layout feels art directed rather than perfectly mechanical. Keep a protected center zone for the headline and button; no food image may cover readable text. The ring has no visible outline.

At rest, each image drifts vertically only 4–8px and rotates at most 2 degrees on offset 7–11 second cycles. Hover/pointer parallax can be a tiny desktop enhancement, but the effect must work without a pointer. Mark these duplicated decorative illustrations with empty alt text and hide them from assistive technology.

Use a short scroll story without hijacking the browser:

| Segment | Change |
| --- | --- |
| Arrival | Wordmark, promise, CTA, and all eight images are visible. CTA skips to the form. |
| First downward movement | Images move outward slightly, scale down, and fade; the wordmark rises subtly. The black section enters in normal document flow. |
| Dark section enters | Heading and form reveal with a restrained translation/opacity change, then stay still for interaction. |
| Results enter | Cards reveal once with a small stagger; nothing moves while being read. |

Keep any sticky hero segment shorter than roughly one viewport and remove it if testing exposes a blank scroll track. Drive `transform` and `opacity` from one bounded scroll-progress value, batch DOM writes with `requestAnimationFrame`, and avoid React rerenders on every scroll frame. Use native scrolling, with no forced snap or synthetic scroll speed. The full-width dark section itself creates the white-to-black transition; avoid an expensive animated mask.

On narrow screens, retain all eight cutouts at smaller sizes in two loose arcs above and below the central copy. At 320px width, legibility takes precedence over a mathematically exact circle. Disable pointer parallax on touch. Under `prefers-reduced-motion: reduce`, show a static composition and remove bobbing, stagger, sticky choreography, and smooth auto-scroll.

## Black meal-brief section

The form should sit directly on the dark surface, rather than inside a bright card. Use charcoal inputs, fine gray borders, white labels, and a warm selected state. Desktop uses a 35/65 split: concise copy left, form right. Mobile stacks heading then form. Keep the primary button at the bottom of the form, never overlaid on fields.

Group the existing parameters by purpose:

1. **Where and when:** saved delivery address and meal occasion. If disconnected, show the Swiggy connection requirement plainly. Do not imply live availability without an address.
2. **How you eat:** vegetarian, egg-friendly, or anything; high-protein, balanced, or lighter goal. Use native radio inputs styled as segmented controls.
3. **Your limits:** protein minimum in g, calorie maximum in kcal, and all-in budget in ₹. Show strict/flexible meaning clearly.
4. **Your taste:** optional cuisine, exclusions, and a short free-text request.

The action reads **Find food that fits**. Validate inline and preserve values on errors or reruns. After submit, report real workflow stages—**Finding available food → Checking nutrition evidence → Comparing price and fit**—without inventing a percentage. The user can edit a previous brief and rerun it.

## White results section

Before a real search, show a purposeful empty state instead of fabricated deals. During search, reserve the card area with stable skeletons so the page does not jump. On completion, scroll the result heading into view only if the user has not already moved elsewhere; respect reduced motion. Repeat the entered brief in a compact summary such as “Vegetarian dinner · 35g+ protein · under ₹350.”

Desktop starts with one larger lead card and two standard cards, then a consistent grid. Mobile uses one column. Each fetched card shows the exact item and restaurant, an actual menu image if supplied, availability, **menu price before fees**, and nutrition status as **documented / estimated / unknown**. Show protein and calories only with a suitable source and portion match. Distinguish a true match from a closest alternative. **Why this fits** reveals constraints, source, and uncertainty; **Review meal** opens the exact-item selection panel.

The review panel shows the item/variant and required customizations. **Prepare cart** is a separate explicit action. Afterward, show the cart read-back and real payable total; if it exceeds budget, say so. Checkout remains with Swiggy. Fixture/replay data remains visibly labeled. Never substitute the eight hero illustrations for a fetched dish photo without an explicit illustration label.

Design all result states together: initial, loading, exact match, closest alternative, no match, unknown nutrition, platform error, sold-out item, existing-cart conflict, and verified cart. The grid should accommodate these without major layout jumps.

## Components and implementation order

```text
App
├─ SiteHeader (theme-aware)
├─ OrbitHero (wordmark, copy, CTA, eight decorative food cutouts)
├─ MealBriefSection (form, validation, progress)
├─ ResultsSection (summary, state banner, candidate cards)
│  ├─ CandidateCard
│  └─ EvidencePanel
├─ CartReviewPanel (explicit preparation and read-back)
└─ Footer
```

1. Optimize and move the eight assets; replace the current photo hero and ribbon with a static orbit. Check desktop, tablet, 320px mobile, and 200% zoom before animation.
2. Re-theme the existing working form as the black section without changing its API contract. Add disconnected, validation, and loading states.
3. Build a reusable white results shell. Keep fixtures clearly labeled until Phase 2 supplies real recommendations.
4. Add gentle floating and scroll choreography. Verify native scroll, anchors, keyboard focus, reduced motion, and touch behavior.
5. Wire grounded search and evidence in Phase 2, then cart review/read-back in Phase 3. Card labels must follow actual data status.

## Acceptance checks and cut line

- The first viewport explains the product and shows a CTA. All eight dishes are visible on desktop without covering text; mobile stays readable.
- White → black → white scrolling feels continuous with no forced snap, blank pinning, focus loss, or content jump.
- Form and results work with keyboard, touch, and screen reader; units and error messages are explicit. Reduced-motion users get the full flow.
- Search, no-match, error, and cart states truthfully report source and price. A fetched item uses its own photo or a marked placeholder.
- Check the page on a mid-range phone and desktop. If scroll stutters, reduce moving layers before sacrificing search accuracy, evidence, or cart safety.

**Cut line:** keep the static eight-dish hero, black working form, and honest fetched-result cards. Shorten the scroll choreography first if time is tight.
