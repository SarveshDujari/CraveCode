import { randomUUID } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientProvider,
  type OAuthClientMetadata,
  type OAuthClientInformationContext,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens
} from "@modelcontextprotocol/client";
import type { PreviewMenuItem, RestaurantSignal } from "../shared/contracts.ts";

const endpoint = new URL("https://mcp.swiggy.com/food");

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

class BrowserOAuthProvider implements OAuthClientProvider {
  private readonly registrations = new Map<string, StoredOAuthClientInformation>();
  private storedTokens?: StoredOAuthTokens;
  private verifier?: string;
  private discovery?: OAuthDiscoveryState;
  authorizationUrl?: URL;
  expectedState?: string;

  constructor(readonly redirectUrl: string) {}

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "MealPilot local developer build",
      redirect_uris: [this.redirectUrl],
      application_type: "web",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    };
  }

  state(): string {
    this.expectedState = randomUUID();
    return this.expectedState;
  }

  clientInformation(ctx?: OAuthClientInformationContext): StoredOAuthClientInformation | undefined {
    return ctx ? this.registrations.get(ctx.issuer) : undefined;
  }

  saveClientInformation(info: StoredOAuthClientInformation, ctx?: OAuthClientInformationContext): void {
    if (ctx) this.registrations.set(ctx.issuer, info);
  }

  tokens(): StoredOAuthTokens | undefined {
    return this.storedTokens;
  }

  saveTokens(tokens: StoredOAuthTokens): void {
    this.storedTokens = tokens;
  }

  redirectToAuthorization(url: URL): void {
    this.authorizationUrl = url;
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier;
  }

  codeVerifier(): string {
    if (!this.verifier) throw new Error("Swiggy authorization flow expired. Connect again.");
    return this.verifier;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.discovery = state;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.discovery;
  }
}

export type SwiggySession = {
  id: string;
  provider: BrowserOAuthProvider;
  pendingTransport?: StreamableHTTPClientTransport;
  client?: Client;
  addressIds: Set<string>;
  menuItems: Map<string, PreviewMenuItem>;
  touchedAt: number;
};

const sessions = new Map<string, SwiggySession>();
const maxIdleMs = 1000 * 60 * 60 * 6;

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > maxIdleMs) {
      void session.client?.close();
      sessions.delete(id);
    }
  }
}

export function createSwiggySession(redirectUrl: string): SwiggySession {
  pruneSessions();
  const session: SwiggySession = {
    id: randomUUID(),
    provider: new BrowserOAuthProvider(redirectUrl),
    addressIds: new Set(),
    menuItems: new Map(),
    touchedAt: Date.now()
  };
  sessions.set(session.id, session);
  return session;
}

export function getSwiggySession(id: string | undefined): SwiggySession | undefined {
  if (!id) return undefined;
  const session = sessions.get(id);
  if (!session || Date.now() - session.touchedAt > maxIdleMs) return undefined;
  session.touchedAt = Date.now();
  return session;
}

function newClient(): Client {
  return new Client({ name: "mealpilot", version: "0.1.0" });
}

export async function beginSwiggyConnection(session: SwiggySession): Promise<URL> {
  const transport = new StreamableHTTPClientTransport(endpoint, { authProvider: session.provider });
  session.pendingTransport = transport;
  const client = newClient();
  try {
    await client.connect(transport);
    session.client = client;
    return new URL(session.provider.redirectUrl);
  } catch (error) {
    if (!(error instanceof UnauthorizedError) || !session.provider.authorizationUrl) throw error;
    return session.provider.authorizationUrl;
  }
}

export async function finishSwiggyConnection(session: SwiggySession, params: URLSearchParams): Promise<void> {
  if (!session.pendingTransport || !session.provider.expectedState) {
    throw new Error("Authorization session expired. Connect again.");
  }
  if (params.get("state") !== session.provider.expectedState) {
    throw new Error("Authorization state mismatch. Connect again.");
  }
  await session.pendingTransport.finishAuth(params);
  session.pendingTransport = undefined;
  session.provider.expectedState = undefined;
  const client = newClient();
  await client.connect(new StreamableHTTPClientTransport(endpoint, { authProvider: session.provider }));
  session.client = client;
}

async function call(session: SwiggySession, name: string, args: JsonObject): Promise<JsonObject> {
  if (!session.client) throw new Error("Connect your Swiggy account first.");
  const result = await session.client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} returned an error.`);

  const structured = object(result.structuredContent);
  let payload = structured;
  if (!payload) {
    const text = result.content?.find(block => block.type === "text");
    if (text?.type === "text") {
      try { payload = object(JSON.parse(text.text)); } catch { /* handled below */ }
    }
  }
  if (!payload) throw new Error(`${name} returned an unexpected response shape.`);
  if (payload.success === false) {
    const message = string(object(payload.error)?.message) || "Swiggy could not complete this request.";
    throw new Error(message);
  }
  return object(payload.data) || payload;
}

export async function getAddresses(session: SwiggySession): Promise<Array<{ id: string; label: string }>> {
  const normalized: Array<{ id: string; label: string }> = [];
  for (let page = 1; page <= 10; page++) {
    const payload = await call(session, "get_addresses", { page });
    const addresses = Array.isArray(payload.addresses) ? payload.addresses : [];
    for (const value of addresses) {
      const record = object(value);
      const id = string(record?.id);
      if (id && !normalized.some(address => address.id === id)) {
        normalized.push({ id, label: string(record?.addressTag) || string(record?.addressCategory) || "Saved address" });
      }
    }
    if (object(payload.pagination)?.hasMore !== true) break;
  }
  session.addressIds = new Set(normalized.map(address => address.id));
  return normalized;
}

export async function searchMenu(session: SwiggySession, addressId: string, query: string, vegOnly: boolean, restaurantId?: string): Promise<PreviewMenuItem[]> {
  if (!session.addressIds.has(addressId)) throw new Error("Choose a saved address first.");
  const payload = await call(session, "search_menu", {
    addressId,
    query,
    ...(vegOnly ? { vegFilter: 1 } : {}),
    ...(restaurantId ? { restaurantIdOfAddedItem: restaurantId } : {})
  });
  const items = Array.isArray(payload.items) ? payload.items : [];
  const normalized = items.flatMap(value => {
    const record = object(value);
    const menuItemId = string(record?.menu_item_id);
    const restaurantId = string(record?.restaurant_id);
    const name = string(record?.name);
    if (!menuItemId || !restaurantId || !name) return [];
    const item: PreviewMenuItem = {
      name,
      menuItemId,
      restaurantId,
      restaurantName: string(record?.restaurant_name) || "Restaurant",
      priceInr: finiteNumber(record?.price),
      imageUrl: string(record?.imageUrl),
      isVeg: boolean(record?.isVeg),
      inStock: typeof record?.inStock === "number" ? record.inStock > 0 : boolean(record?.inStock),
      hasCustomizations: Boolean(record?.hasVariants || record?.hasAddons || record?.variations || record?.variantsV2)
    };
    return [item];
  });
  session.menuItems = new Map(normalized.map(item => [item.menuItemId, item]));
  return normalized;
}

export async function searchRestaurants(session: SwiggySession, addressId: string, query: string): Promise<RestaurantSignal[]> {
  if (!session.addressIds.has(addressId)) throw new Error("Choose a saved address first.");
  const payload = await call(session, "search_restaurants", { addressId, query });
  const restaurants = Array.isArray(payload.restaurants) ? payload.restaurants : [];
  return restaurants.flatMap(value => {
    const record = object(value);
    const id = string(record?.id);
    if (!id) return [];
    const rating = finiteNumber(record?.avgRating);
    const status = string(record?.availabilityStatus);
    return [{
      id,
      rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
      ratingsText: string(record?.totalRatings),
      availabilityStatus: status === "OPEN" || status === "CLOSED" || status === "UNAVAILABLE" ? status : null
    }];
  });
}

export async function getCart(session: SwiggySession, addressId: string): Promise<JsonObject> {
  if (!session.addressIds.has(addressId)) throw new Error("Choose a saved address first.");
  const payload = await call(session, "get_food_cart", { addressId });
  const cart = object(payload.data) || payload;
  return {
    restaurant: object(cart.restaurant) ? {
      id: string(object(cart.restaurant)?.id),
      name: string(object(cart.restaurant)?.name)
    } : null,
    items: Array.isArray(cart.items) ? cart.items.map(value => {
      const item = object(value);
      return { menuItemId: string(item?.menu_item_id), name: string(item?.name), quantity: finiteNumber(item?.quantity) };
    }) : [],
    toPayInr: finiteNumber(object(cart.pricing)?.to_pay),
    cartIdPresent: Boolean(string(cart.cart_id))
  };
}

export async function inspectCartTool(session: SwiggySession): Promise<unknown> {
  if (!session.client) throw new Error("Connect your Swiggy account first.");
  const tools = await session.client.listTools();
  return tools.tools.find(tool => tool.name === "update_food_cart")?.inputSchema || null;
}

export async function probeSimpleCart(session: SwiggySession, addressId: string, menuItemId: string): Promise<JsonObject> {
  const item = session.menuItems.get(menuItemId);
  if (!item || item.hasCustomizations || item.inStock === false) {
    throw new Error("Choose an available menu item without required variants or add-ons for this first integration check.");
  }
  // Cross-restaurant search is for discovery; Swiggy requires a restaurant-scoped
  // lookup for complete item details before a cart mutation.
  const scopedItems = await searchMenu(session, addressId, item.name, false, item.restaurantId);
  const current = scopedItems.find(value => value.menuItemId === menuItemId && value.restaurantId === item.restaurantId);
  if (!current || current.hasCustomizations || current.inStock === false) {
    throw new Error("This dish changed or needs customization. Search again before adding it to the cart.");
  }
  const before = await getCart(session, addressId);
  if (Array.isArray(before.items) && before.items.length > 0) {
    throw new Error("The existing Swiggy cart is not empty. This integration check will not replace it.");
  }

  const schema = object(await inspectCartTool(session));
  const properties = object(schema?.properties);
  if (!properties?.cartItems) {
    throw new Error("The live update_food_cart schema does not expose cartItems. Inspect the schema before enabling a write.");
  }

  let updateError: string | null = null;
  try {
    await call(session, "update_food_cart", {
      restaurantId: current.restaurantId,
      restaurantName: current.restaurantName,
      addressId,
      cartItems: [{ menu_item_id: item.menuItemId, quantity: 1 }]
    });
  } catch (error) {
    updateError = error instanceof Error ? error.message : "Cart update could not be confirmed.";
  }

  // A timed-out mutation may still have succeeded. Read back before returning.
  const after = await getCart(session, addressId);
  const selectedPresent = Array.isArray(after.items) && after.items.some(value => object(value)?.menuItemId === menuItemId);
  const verified = selectedPresent && typeof after.toPayInr === "number";
  return {
    status: verified ? "verified" : "needs-review",
    itemName: current.name,
    cart: after,
    ...(updateError ? { updateError } : {})
  };
}
