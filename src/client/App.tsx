import { useEffect, useRef, useState, type FormEvent } from "react";
import { mealBriefSchema, type MealBrief, type PreviewMenuItem } from "../shared/contracts.ts";

type SystemStatus = {
  mongo: string;
  gemma: string;
  swiggy: string;
  swiggyLocalEnabled: boolean;
};

type Address = { id: string; label: string };
type SearchStatus = "idle" | "validating" | "searching" | "live" | "preview" | "error";

const initialBrief: MealBrief = {
  mealSlot: "dinner",
  diet: "vegetarian",
  goal: "high-protein",
  minProteinG: 35,
  maxCaloriesKcal: 700,
  budgetInr: 350,
  strictNutrition: true,
  cuisine: "",
  wish: ""
};

const foods = [
  { name: "biryani", width: 552, height: 661 },
  { name: "pizza", width: 725, height: 725 },
  { name: "tikka", width: 631, height: 630 },
  { name: "burger", width: 602, height: 617 },
  { name: "wrap", width: 741, height: 715 },
  { name: "sandwich", width: 732, height: 732 },
  { name: "dosa", width: 719, height: 719 },
  { name: "salad", width: 654, height: 630 }
] as const;

async function readApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "That request did not work. Please try again.");
  return payload;
}

function ArrowIcon({ down = false }: { down?: boolean }) {
  return <span aria-hidden="true">{down ? "↓" : "↗"}</span>;
}

function Logo() {
  return <a className="brand" href="#top" aria-label="CraveCode home"><span className="brand-glyph" aria-hidden="true">✳</span>CraveCode<span className="brand-period">.</span></a>;
}

function OrbitHero() {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / Math.max(rect.height * 0.75, 1)));
      hero.style.setProperty("--hero-shift", `${-48 * progress}px`);
      hero.style.setProperty("--hero-scale", String(1 - 0.16 * progress));
      hero.style.setProperty("--hero-opacity", String(1 - 0.88 * progress));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <section ref={heroRef} className="hero" aria-labelledby="hero-title">
    <div className="hero-orbit" aria-hidden="true">
      {foods.map(food => <div className={`orbit-item orbit-${food.name}`} key={food.name}>
        <img src={`/food/${food.name}_animated.png`} width={food.width} height={food.height} alt="" fetchPriority="high" />
      </div>)}
    </div>
    <div className="hero-content">
      <p className="hero-eyebrow"><span className="eyebrow-line" /> FOOD THAT GETS YOU</p>
      <h1 id="hero-title">Crave<span>Code</span></h1>
      <p className="hero-headline">Find food that fits your cravings, goals, and budget.</p>
      <p className="hero-description">Tell us what you’re after. Explore real menu choices, see what’s known, and decide what belongs in your cart.</p>
      <a className="button button-primary" href="#meal-brief">Find my meal <ArrowIcon down /></a>
      <span className="hero-caption">EARLY PREVIEW · YOU STAY IN CONTROL</span>
    </div>
    <div className="hero-bottom container" aria-hidden="true"><span>01 / 03</span><span>SCROLL TO EXPLORE <span className="scroll-arrow">↓</span></span></div>
  </section>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="field-hint">{children}</span>;
}

function MenuCard({ item, busy, onCartProbe }: { item: PreviewMenuItem; busy: boolean; onCartProbe: (item: PreviewMenuItem) => void }) {
  const imageUrl = item.imageUrl?.startsWith("https://") ? item.imageUrl : null;
  const canProbe = item.inStock !== false && !item.hasCustomizations;

  return <article className="menu-card">
    <div className="menu-card-image">
      {imageUrl ? <img src={imageUrl} alt={item.name} loading="lazy" /> : <div className="image-placeholder"><span aria-hidden="true">✳</span><small>PHOTO NOT SUPPLIED</small></div>}
      <span className="menu-card-image-tag">LIVE MENU ITEM</span>
    </div>
    <div className="menu-card-body">
      <div className="menu-card-top"><span>{item.isVeg === true ? "VEGETARIAN" : item.isVeg === false ? "NON-VEGETARIAN" : "DIET UNCONFIRMED"}</span><span>{item.inStock === false ? "UNAVAILABLE" : item.inStock === true ? "AVAILABLE" : "STOCK UNCONFIRMED"}</span></div>
      <h3>{item.name}</h3>
      <p className="restaurant-name">{item.restaurantName}</p>
      <div className="menu-card-facts"><div><small>MENU PRICE</small><strong>{item.priceInr === null ? "Unavailable" : `₹${item.priceInr}`}</strong><span>Before delivery and fees</span></div><div><small>NUTRITION</small><strong>Unknown</strong><span>Not a macro match yet</span></div></div>
      <details className="menu-card-details"><summary>What we know <span aria-hidden="true">+</span></summary><p>This item came from the live Swiggy menu. Protein, calories, final payable total, and fit to your goal have not been verified.</p></details>
      <button className="card-action" type="button" disabled={busy || !canProbe} onClick={() => onCartProbe(item)}>{canProbe ? "Test cart add" : item.hasCustomizations ? "Customizations required" : "Unavailable"} <ArrowIcon /></button>
    </div>
  </article>;
}

function resultSummary(brief: MealBrief): string {
  const diet = brief.diet === "any" ? "Any diet" : brief.diet === "egg-friendly" ? "Egg-friendly" : "Vegetarian";
  const meal = brief.mealSlot.charAt(0).toUpperCase() + brief.mealSlot.slice(1);
  return `${diet} ${meal.toLowerCase()} · ${brief.minProteinG}g+ protein · up to ${brief.maxCaloriesKcal} kcal · ₹${brief.budgetInr} total budget`;
}

export function App() {
  const [brief, setBrief] = useState<MealBrief>(initialBrief);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [dishQuery, setDishQuery] = useState("paneer");
  const [submittedBrief, setSubmittedBrief] = useState<MealBrief | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [liveItems, setLiveItems] = useState<PreviewMenuItem[] | null>(null);
  const [cartResult, setCartResult] = useState<Record<string, unknown> | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void readApi<SystemStatus>("/api/system").then(setSystem).catch(() => setSystem(null));
  }, []);

  useEffect(() => {
    if (system?.swiggy !== "connected") return;
    void readApi<{ addresses: Address[] }>("/api/swiggy/addresses")
      .then(result => {
        setAddresses(result.addresses);
        if (result.addresses.length === 1) setSelectedAddress(result.addresses[0].id);
      })
      .catch(error => setFormMessage(error instanceof Error ? error.message : "Could not load addresses."));
  }, [system?.swiggy]);

  const set = <K extends keyof MealBrief>(key: K, value: MealBrief[K]) => {
    setBrief(current => ({ ...current, [key]: value }));
    setFormMessage("");
  };

  function showResults() {
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    }));
  }

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = mealBriefSchema.safeParse({ ...brief, addressId: selectedAddress || undefined });
    if (!checked.success) {
      setFormMessage("Check the budget, protein, and calorie values before searching.");
      return;
    }
    setBusy(true);
    setFormMessage("");
    setResultMessage("");
    setLiveItems(null);
    setCartResult(null);
    setSearchStatus("validating");
    try {
      await readApi("/api/briefs/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.data)
      });
      setSubmittedBrief(checked.data);
      showResults();
      if (system?.swiggy === "connected" && selectedAddress) {
        if (!dishQuery.trim()) {
          setSearchStatus("preview");
          setResultMessage("Enter a dish to look up in the live menu.");
          return;
        }
        setSearchStatus("searching");
        const params = new URLSearchParams({ addressId: selectedAddress, query: dishQuery.trim(), veg: brief.diet === "vegetarian" ? "1" : "0" });
        const result = await readApi<{ items: PreviewMenuItem[] }>(`/api/swiggy/menu?${params}`);
        setLiveItems(result.items);
        setSearchStatus("live");
        setResultMessage(result.items.length ? "Live menu results. These are not ranked against your nutrition goals yet." : "No menu items came back for that dish and address. Try another dish name.");
      } else {
        setSearchStatus("preview");
        setResultMessage("");
      }
    } catch (error) {
      setSearchStatus("error");
      setResultMessage(error instanceof Error ? error.message : "Could not search the menu.");
      showResults();
    } finally {
      setBusy(false);
    }
  }

  async function cartProbe(item: PreviewMenuItem) {
    if (!selectedAddress) return;
    const confirmed = window.confirm(`Add one ${item.name} to your Swiggy cart for an integration check? This changes your cart, but does not place an order.`);
    if (!confirmed) return;
    setBusy(true);
    setResultMessage("");
    try {
      const result = await readApi<Record<string, unknown>>("/api/swiggy/cart-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: selectedAddress, menuItemId: item.menuItemId, confirmed: true })
      });
      setCartResult(result);
      setResultMessage(result.status === "verified" ? "The selected item and payable total were read back from your Swiggy cart." : "The cart needs review; no success is claimed.");
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Cart check failed.");
    } finally {
      setBusy(false);
    }
  }

  const isLoading = searchStatus === "validating" || searchStatus === "searching";

  return <div id="top" className="page-shell">
    <header className="site-header container"><Logo /><nav aria-label="Main navigation"><a href="#process">How it works</a><a href="#results">Explore meals</a></nav><a className="header-link" href="#meal-brief">Find my meal <ArrowIcon /></a></header>

    <main>
      <OrbitHero />

      <section id="meal-brief" className="brief-section" aria-labelledby="brief-title">
        <div className="container">
          <div className="section-topline section-topline-dark"><span>02 / 03</span><span>THE GOOD PART STARTS HERE</span></div>
          <div className="brief-layout">
            <div className="brief-aside"><p className="eyebrow">YOUR NEXT MEAL, YOUR RULES</p><h2 id="brief-title">What are you <em>craving?</em></h2><p className="brief-lede">Set the boundaries. Keep the joy. Tell us what sounds good and what needs to fit.</p><div className="brief-aside-note"><span aria-hidden="true">✳</span><p>A good pick should make sense for your appetite <em>and</em> your day.</p></div></div>
            <form className="brief-form" onSubmit={submitBrief}>
              <div className="form-section-label"><span>01</span> THE BASICS</div>
              <div className="field-grid two-col">
                <label className="field"><span>Meal</span><select value={brief.mealSlot} onChange={e => set("mealSlot", e.target.value as MealBrief["mealSlot"])}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></label>
                <label className="field"><span>Delivery address</span><select value={selectedAddress} onChange={e => setSelectedAddress(e.target.value)} disabled={addresses.length === 0}><option value="">{system?.swiggy === "connected" ? "Choose an address" : "Connect Swiggy to choose"}</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label}</option>)}</select></label>
              </div>
              {system?.swiggyLocalEnabled && system.swiggy !== "connected" && <a className="connect-inline" href="/api/swiggy/connect">Connect Swiggy for live menu search <ArrowIcon /></a>}
              <div className="form-section-label"><span>02</span> YOUR PREFERENCES</div>
              <fieldset className="field radio-field"><legend>How do you eat?</legend><div className="pill-group">{([ ["vegetarian", "Vegetarian"], ["egg-friendly", "Egg-friendly"], ["any", "Anything"] ] as const).map(([value,label]) => <label className="choice-pill" key={value}><input type="radio" name="diet" value={value} checked={brief.diet === value} onChange={() => set("diet", value)} /><span>{label}</span></label>)}</div></fieldset>
              <fieldset className="field radio-field"><legend>What’s the goal?</legend><div className="pill-group">{([ ["high-protein", "High protein"], ["balanced", "Balanced"], ["lighter", "Something lighter"] ] as const).map(([value,label]) => <label className="choice-pill" key={value}><input type="radio" name="goal" value={value} checked={brief.goal === value} onChange={() => set("goal", value)} /><span>{label}</span></label>)}</div></fieldset>
              <div className="form-section-label"><span>03</span> THE NUMBERS</div>
              <div className="field-grid three-col">
                <label className="field"><span>Protein, at least</span><div className="number-input"><input type="number" min="0" max="200" step="1" value={brief.minProteinG} onChange={e => set("minProteinG", Number(e.target.value))} /><span>g</span></div></label>
                <label className="field"><span>Calories, at most</span><div className="number-input"><input type="number" min="100" max="3000" step="10" value={brief.maxCaloriesKcal} onChange={e => set("maxCaloriesKcal", Number(e.target.value))} /><span>kcal</span></div></label>
                <label className="field"><span>Total budget</span><div className="number-input budget"><span>₹</span><input type="number" min="50" max="10000" step="10" value={brief.budgetInr} onChange={e => set("budgetInr", Number(e.target.value))} /></div><FieldHint>Including delivery and fees</FieldHint></label>
              </div>
              <div className="field-grid two-col taste-fields">
                <label className="field"><span>Cuisine, if you have one in mind</span><input type="text" maxLength={80} value={brief.cuisine} onChange={e => set("cuisine", e.target.value)} placeholder="Anything sounds good" /></label>
                <label className="field"><span>Anything else?</span><input type="text" maxLength={280} value={brief.wish} onChange={e => set("wish", e.target.value)} placeholder="Spicy, no mushrooms..." /></label>
              </div>
              {system?.swiggyLocalEnabled && <label className="field live-query"><span>Dish to look up on the live menu</span><input type="text" maxLength={80} value={dishQuery} onChange={e => setDishQuery(e.target.value)} placeholder="e.g. paneer tikka" /><FieldHint>Local integration check only; this does not rank meals against your goals yet.</FieldHint></label>}
              <label className="check-row"><input type="checkbox" checked={brief.strictNutrition} onChange={e => set("strictNutrition", e.target.checked)} /><span>Only call it an exact match when nutrition is documented</span></label>
              <div className="form-footer"><p>Prices and nutrition are labeled by what we can verify.</p><button className="button button-light" disabled={busy} type="submit">{busy ? "Searching…" : "Find food that fits"} <ArrowIcon /></button></div>
              {formMessage && <p className="form-message" role="status">{formMessage}</p>}
            </form>
          </div>
          <div id="process" className="process-row"><div><span>01 / TELL US</span><p>Your craving, your limits.</p></div><div><span>02 / EXPLORE</span><p>Real food with clear caveats.</p></div><div><span>03 / CHOOSE</span><p>Your call before the cart.</p></div></div>
        </div>
      </section>

      <section id="results" className="results-section" aria-labelledby="results-title">
        <div className="container">
          <div className="section-topline"><span>03 / 03</span><span>THE SHORTLIST</span></div>
          <div className="results-heading"><div><p className="eyebrow">LESS GUESSWORK, MORE GOOD FOOD</p><h2 id="results-title">Meals worth a <em>closer look.</em></h2></div><p>Good choices come with context. See what’s available, what it costs so far, and what still needs checking.</p></div>
          {submittedBrief && <div className="brief-summary"><span>YOUR BRIEF</span><strong>{resultSummary(submittedBrief)}</strong><a href="#meal-brief">Edit brief ↗</a></div>}
          {resultMessage && <p className={`result-message ${searchStatus === "error" ? "result-message-error" : ""}`} role="status">{resultMessage}</p>}

          {isLoading && <div className="results-grid" aria-label="Loading menu results"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div>}
          {searchStatus === "live" && liveItems && liveItems.length > 0 && <><div className="live-results-label"><span className="live-dot" /> {liveItems.length} LIVE MENU ITEMS <span>Menu price only · nutrition not verified</span></div><div className="results-grid">{liveItems.slice(0, 12).map(item => <MenuCard key={`${item.restaurantId}:${item.menuItemId}`} item={item} busy={busy} onCartProbe={cartProbe} />)}</div></>}
          {searchStatus === "live" && liveItems?.length === 0 && <div className="results-empty"><span className="empty-symbol" aria-hidden="true">✳</span><h3>No dishes found this time.</h3><p>Try another dish name or change the selected address, then search again.</p><a className="text-link" href="#meal-brief">Edit your brief <ArrowIcon /></a></div>}
          {(searchStatus === "idle" || searchStatus === "preview" || searchStatus === "error") && <div className="results-empty"><span className="empty-symbol" aria-hidden="true">✳</span><h3>{searchStatus === "idle" ? "Your next good find starts above." : searchStatus === "error" ? "We couldn’t fetch that menu." : "Your brief is ready."}</h3><p>{searchStatus === "idle" ? "Set a goal, a budget, and something you’re in the mood for. Your choices will appear here." : searchStatus === "error" ? "Your choices are saved in the form. Check the message above and try again." : "Live menu items appear here after you connect Swiggy and choose an address. Full goal-aware ranking comes in the next phase."}</p><a className="text-link" href="#meal-brief">{searchStatus === "idle" ? "Build my meal" : "Back to my brief"} <ArrowIcon /></a></div>}
          {cartResult && <div className="cart-audit"><span>LOCAL CART CHECK</span><strong>{cartResult.status === "verified" ? "Cart read-back verified" : "Cart needs review"}</strong><p>Final payable: {typeof (cartResult.cart as Record<string, unknown> | undefined)?.toPayInr === "number" ? `₹${(cartResult.cart as Record<string, unknown>).toPayInr}` : "Unavailable"}. No order was placed.</p></div>}
          <div className="results-footnote"><span aria-hidden="true">✳</span><p>CraveCode never places an order for you. A menu price is not the final total, and an unknown macro is never called a match.</p></div>
        </div>
      </section>
    </main>

    <footer className="site-footer"><div className="container footer-inner"><Logo /><p>For cravings with a little more thought.</p><a href="#top">Back to top ↑</a></div></footer>
  </div>;
}
