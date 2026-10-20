import { useEffect, useState, type FormEvent } from "react";
import { mealBriefSchema, type MealBrief, type PreviewMenuItem } from "../shared/contracts.ts";

type SystemStatus = {
  mongo: string;
  gemma: string;
  swiggy: string;
  swiggyLocalEnabled: boolean;
};

type Address = { id: string; label: string };

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

const preview = [
  { number: "01", name: "Paneer grain bowl", category: "A little hearty", position: "51% 13%" },
  { number: "02", name: "Dal & rice bowl", category: "Comfort, sorted", position: "92% 12%" },
  { number: "03", name: "Chicken tikka bowl", category: "Protein forward", position: "65% 85%" }
];

async function readApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "That request did not work. Please try again.");
  return payload;
}

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

function Logo() {
  return <a className="brand" href="#top" aria-label="MealPilot home"><span className="brand-mark">m.</span><span>mealpilot</span></a>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="field-hint">{children}</span>;
}

export function App() {
  const [brief, setBrief] = useState<MealBrief>(initialBrief);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [dishQuery, setDishQuery] = useState("paneer");
  const [liveItems, setLiveItems] = useState<PreviewMenuItem[] | null>(null);
  const [cartResult, setCartResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [labMessage, setLabMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void readApi<SystemStatus>("/api/system")
      .then(status => setSystem(status))
      .catch(() => setSystem(null));
  }, []);

  useEffect(() => {
    if (system?.swiggy !== "connected") return;
    void readApi<{ addresses: Address[] }>("/api/swiggy/addresses")
      .then(result => {
        setAddresses(result.addresses);
        if (result.addresses.length === 1) setSelectedAddress(result.addresses[0].id);
      })
      .catch(error => setLabMessage(error instanceof Error ? error.message : "Could not load addresses."));
  }, [system?.swiggy]);

  const set = <K extends keyof MealBrief>(key: K, value: MealBrief[K]) => {
    setBrief(current => ({ ...current, [key]: value }));
    setMessage("");
  };

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = mealBriefSchema.safeParse({ ...brief, addressId: selectedAddress || undefined });
    if (!checked.success) {
      setMessage("Please check the budget, protein, and calorie values.");
      return;
    }
    setBusy(true);
    try {
      await readApi("/api/briefs/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.data)
      });
      setMessage("Your meal brief is ready. The live recommendation workflow is the next build phase; the cards below are a design preview.");
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not validate the brief.");
    } finally {
      setBusy(false);
    }
  }

  async function searchLive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAddress) {
      setLabMessage("Choose a saved address first.");
      return;
    }
    setBusy(true);
    setLabMessage("");
    setCartResult(null);
    try {
      const params = new URLSearchParams({
        addressId: selectedAddress,
        query: dishQuery,
        veg: brief.diet === "vegetarian" ? "1" : "0"
      });
      const result = await readApi<{ items: PreviewMenuItem[] }>(`/api/swiggy/menu?${params}`);
      setLiveItems(result.items);
      if (result.items.length === 0) setLabMessage("No menu items came back for that dish and address. Try another dish name.");
    } catch (error) {
      setLabMessage(error instanceof Error ? error.message : "Menu search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cartProbe(item: PreviewMenuItem) {
    if (!selectedAddress) return;
    const confirmed = window.confirm(`Add one ${item.name} to your Swiggy cart for an integration check? This changes your cart, but does not place an order.`);
    if (!confirmed) return;
    setBusy(true);
    setLabMessage("");
    try {
      const result = await readApi<Record<string, unknown>>("/api/swiggy/cart-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: selectedAddress, menuItemId: item.menuItemId, confirmed: true })
      });
      setCartResult(result);
      setLabMessage(result.status === "verified" ? "Cart contents and payable total were read back from Swiggy." : "The cart needs review; no success is claimed.");
    } catch (error) {
      setLabMessage(error instanceof Error ? error.message : "Cart check failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div id="top" className="page-shell">
    <header className="site-header container">
      <Logo />
      <nav aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#meal-brief">Build my meal</a>
      </nav>
      <a className="header-link" href="#meal-brief">Find my meal <ArrowIcon /></a>
    </header>

    <main>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR DAY, YOUR PLATE</div>
          <h1 id="hero-title">Good food.<br /><em>Better fit.</em></h1>
          <p>Give us your budget and goals. We’ll help you find food that fits the day you’re having.</p>
          <a href="#meal-brief" className="button button-primary">Find my meal <ArrowIcon /></a>
          <span className="hero-caption">For the meals you can actually order.</span>
        </div>
        <div className="hero-visual">
          <img src="/hero-food.png" alt="Bowls of paneer, dal and rice, chicken tikka, and fresh salad" fetchPriority="high" />
          <div className="hero-note"><span className="note-symbol">✳</span><span>made for<br /><strong>your goals</strong></span></div>
        </div>
      </section>

      <section className="ribbon-section" aria-label="Food inspiration">
        <div className="ribbon-intro container"><span>THE POSSIBILITIES</span><span>Scroll to explore <span aria-hidden="true">→</span></span></div>
        <div className="food-ribbon">
          {preview.map(item => <div className="ribbon-tile" key={item.number}>
            <span className="ribbon-number">{item.number}</span>
            <span className="ribbon-photo" style={{ backgroundPosition: item.position }} aria-hidden="true" />
            <span className="ribbon-name">{item.name}</span>
          </div>)}
          <div className="ribbon-message">A meal that makes sense<br /><em>for you.</em></div>
        </div>
      </section>

      <section id="how-it-works" className="how-section container">
        <div className="section-kicker">A BETTER WAY TO DECIDE</div>
        <div className="how-heading"><h2>Less scrolling menus.<br /><em>More getting it right.</em></h2><p>One brief brings your tastes, targets, and budget together. You stay in control of what goes in the cart.</p></div>
        <div className="steps-grid">
          <article><span>01 / TELL US</span><h3>Your kind of meal</h3><p>Set a budget, a goal, and anything you want to avoid.</p></article>
          <article><span>02 / COMPARE</span><h3>See the tradeoffs</h3><p>Browse choices with clear sources and honest uncertainty.</p></article>
          <article><span>03 / CHOOSE</span><h3>Make it yours</h3><p>Review one choice before a cart is ever prepared.</p></article>
        </div>
      </section>

      <section id="meal-brief" className="brief-section">
        <div className="container brief-layout">
          <div className="brief-aside">
            <div className="section-kicker">YOUR MEAL BRIEF</div>
            <h2>Let’s find<br /><em>your fit.</em></h2>
            <p>A few details help narrow the menu. You can change them whenever you like.</p>
            <div className="aside-line"><span>01</span><span>Tell us what matters today</span></div>
            <div className="aside-line"><span>02</span><span>Explore the best possibilities</span></div>
            <div className="aside-line"><span>03</span><span>Choose before we prep a cart</span></div>
          </div>
          <form className="brief-card" onSubmit={submitBrief}>
            <div className="card-top"><span>THE ESSENTIALS</span><span>~ 30 seconds</span></div>
            <div className="field-grid two-col">
              <label className="field"><span>Meal</span><select value={brief.mealSlot} onChange={e => set("mealSlot", e.target.value as MealBrief["mealSlot"])}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></label>
              <label className="field"><span>Delivery address</span><select value={selectedAddress} onChange={e => setSelectedAddress(e.target.value)} disabled={addresses.length === 0}><option value="">{system?.swiggy === "connected" ? "Choose an address" : "Connect Swiggy to choose"}</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label}</option>)}</select></label>
            </div>
            {system?.swiggyLocalEnabled && system.swiggy !== "connected" && <a className="connect-inline" href="/api/swiggy/connect">Connect Swiggy for a local menu check <ArrowIcon /></a>}

            <fieldset className="field radio-field"><legend>How do you eat?</legend><div className="pill-group">{([ ["vegetarian", "Vegetarian"], ["egg-friendly", "Egg-friendly"], ["any", "Anything"] ] as const).map(([value,label]) => <label className="choice-pill" key={value}><input type="radio" name="diet" value={value} checked={brief.diet === value} onChange={() => set("diet", value)} /><span>{label}</span></label>)}</div></fieldset>
            <fieldset className="field radio-field"><legend>What’s the goal?</legend><div className="pill-group">{([ ["high-protein", "High protein"], ["balanced", "Balanced"], ["lighter", "Something lighter"] ] as const).map(([value,label]) => <label className="choice-pill" key={value}><input type="radio" name="goal" value={value} checked={brief.goal === value} onChange={() => set("goal", value)} /><span>{label}</span></label>)}</div></fieldset>

            <div className="field-grid three-col">
              <label className="field"><span>Protein, at least</span><div className="number-input"><input type="number" min="0" max="200" step="1" value={brief.minProteinG} onChange={e => set("minProteinG", Number(e.target.value))} /><span>g</span></div></label>
              <label className="field"><span>Calories, at most</span><div className="number-input"><input type="number" min="100" max="3000" step="10" value={brief.maxCaloriesKcal} onChange={e => set("maxCaloriesKcal", Number(e.target.value))} /><span>kcal</span></div></label>
              <label className="field"><span>Total budget</span><div className="number-input budget"><span>₹</span><input type="number" min="50" max="10000" step="10" value={brief.budgetInr} onChange={e => set("budgetInr", Number(e.target.value))} /></div><FieldHint>Including delivery and fees</FieldHint></label>
            </div>
            <div className="field-grid two-col">
              <label className="field"><span>Cuisine, if you have one in mind</span><input type="text" maxLength={80} value={brief.cuisine} onChange={e => set("cuisine", e.target.value)} placeholder="Anything sounds good" /></label>
              <label className="field"><span>Anything else?</span><input type="text" maxLength={280} value={brief.wish} onChange={e => set("wish", e.target.value)} placeholder="Spicy, no mushrooms..." /></label>
            </div>
            <label className="check-row"><input type="checkbox" checked={brief.strictNutrition} onChange={e => set("strictNutrition", e.target.checked)} /><span>Only call it an exact match when nutrition is documented</span></label>
            <div className="form-footer"><p>We’ll show uncertain nutrition and prices clearly.</p><button className="button button-primary" disabled={busy} type="submit">{busy ? "Checking…" : "Build my brief"} <ArrowIcon /></button></div>
            {message && <p className="form-message" role="status">{message}</p>}
          </form>
        </div>
      </section>

      <section id="results" className="results-section container">
        <div className="section-kicker">A GLIMPSE OF WHAT’S NEXT</div>
        <div className="results-heading"><h2>Find something<br /><em>worth choosing.</em></h2><p>These cards show the planned result experience. They are examples, not live recommendations or nutrition estimates.</p></div>
        <div className="preview-banner"><span className="status-dot" /> DESIGN PREVIEW <span>Live matching and source checks arrive in the next phase.</span></div>
        <div className="preview-grid">{preview.map((item,index) => <article className={`preview-card preview-card-${index}`} key={item.number}><div className="preview-image" style={{ backgroundPosition: item.position }} role="img" aria-label={item.name} /><div className="preview-card-body"><div className="preview-card-top"><span>EXAMPLE DISH</span><span>{item.number} / 03</span></div><h3>{item.name}</h3><p>{item.category}</p><div className="preview-divider" /><div className="preview-meta"><span>Nutrition source <strong>pending</strong></span><span>Live price <strong>pending</strong></span></div></div></article>)}</div>
      </section>

      {system?.swiggyLocalEnabled && <section className="integration-section container" aria-labelledby="integration-heading">
        <div className="integration-copy"><div className="section-kicker">LOCAL INTEGRATION CHECK</div><h2 id="integration-heading">Check the real menu.</h2><p>This small test area reads Swiggy’s menu for your selected address. It does not assess nutrition or rank meals yet.</p></div>
        <div className="integration-card">
          {system.swiggy !== "connected" ? <div className="integration-connect"><p>Connect your Swiggy account to test a real menu on localhost.</p><a href="/api/swiggy/connect" className="button button-dark">Connect Swiggy <ArrowIcon /></a></div> : <>
            <form onSubmit={searchLive} className="live-search-form"><label className="field"><span>Saved address</span><select value={selectedAddress} onChange={e => setSelectedAddress(e.target.value)}><option value="">Choose an address</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label}</option>)}</select></label><label className="field"><span>Dish to look up</span><input value={dishQuery} maxLength={80} onChange={e => setDishQuery(e.target.value)} placeholder="e.g. paneer tikka" /></label><button className="button button-dark" disabled={busy || !selectedAddress} type="submit">Search live menu <ArrowIcon /></button></form>
            {labMessage && <p className="lab-message" role="status">{labMessage}</p>}
            {liveItems && <div className="live-items"><div className="live-items-header"><strong>{liveItems.length} menu items</strong><span>Menu prices only · nutrition unknown</span></div>{liveItems.slice(0, 8).map(item => <div className="live-item" key={`${item.restaurantId}:${item.menuItemId}`}><div><strong>{item.name}</strong><span>{item.restaurantName} · {item.priceInr === null ? "Price unavailable" : `₹${item.priceInr} before fees`}</span></div><button type="button" disabled={busy || item.hasCustomizations || item.inStock === false} onClick={() => void cartProbe(item)}>Test cart ↗</button></div>)}</div>}
            {cartResult && <div className="cart-audit"><strong>{cartResult.status === "verified" ? "Cart read-back verified" : "Cart needs review"}</strong><p>Final payable: {typeof (cartResult.cart as Record<string, unknown> | undefined)?.toPayInr === "number" ? `₹${(cartResult.cart as Record<string, unknown>).toPayInr}` : "Unavailable"}. No order was placed.</p></div>}
          </>}
        </div>
      </section>}
    </main>

    <footer className="site-footer"><div className="container footer-inner"><Logo /><p>Made for meals that make sense.</p><a href="#top">Back to top ↑</a></div></footer>
  </div>;
}
