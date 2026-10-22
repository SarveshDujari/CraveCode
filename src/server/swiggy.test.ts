import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "@modelcontextprotocol/client";
import { createSwiggySession, getAddresses, probeSimpleCart, searchMenu, searchRestaurants } from "./swiggy.ts";

const dish = {
  menu_item_id: "dish-1",
  restaurant_id: "restaurant-1",
  restaurant_name: "Test Kitchen",
  name: "Paneer Bowl",
  price: 240,
  isVeg: true,
  inStock: 1
};

function fakeClient(handler: (name: string, args: Record<string, unknown>) => unknown, schema?: unknown): Client {
  return {
    callTool: async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => ({
      structuredContent: { success: true, data: handler(name, args) }
    }),
    listTools: async () => ({ tools: [{ name: "update_food_cart", inputSchema: schema }] })
  } as unknown as Client;
}

test("saved addresses include later pages without exposing address details", async () => {
  const session = createSwiggySession("http://localhost/callback");
  session.client = fakeClient((name, args) => {
    assert.equal(name, "get_addresses");
    if (args.page === 1) return { addresses: [{ id: "a1", addressTag: "Home", phoneNumber: "secret" }], pagination: { hasMore: true } };
    return { addresses: [{ id: "a2", addressCategory: "Office" }], pagination: { hasMore: false } };
  });
  assert.deepEqual(await getAddresses(session), [{ id: "a1", label: "Home" }, { id: "a2", label: "Office" }]);
  assert.deepEqual([...session.addressIds], ["a1", "a2"]);
});

test("restaurant search keeps only documented rating and availability fields", async () => {
  const session = createSwiggySession("http://localhost/callback");
  session.addressIds.add("a1");
  session.client = fakeClient((name, args) => {
    assert.equal(name, "search_restaurants");
    assert.deepEqual(args, { addressId: "a1", query: "paneer" });
    return { restaurants: [
      { id: "r1", name: "Kitchen", avgRating: 4.3, totalRatings: "100+", availabilityStatus: "OPEN" },
      { id: "r2", avgRating: 7, availabilityStatus: "mystery" },
      { name: "Missing ID", avgRating: 4.9 }
    ] };
  });
  assert.deepEqual(await searchRestaurants(session, "a1", "paneer"), [
    { id: "r1", rating: 4.3, ratingsText: "100+", availabilityStatus: "OPEN", areaName: null, distanceKm: null, deliveryTimeMinutes: null },
    { id: "r2", rating: null, ratingsText: null, availabilityStatus: null, areaName: null, distanceKm: null, deliveryTimeMinutes: null }
  ]);
});

test("menu search loads one extra page and keeps items from earlier queries", async () => {
  const session = createSwiggySession("http://localhost/callback");
  session.addressIds.add("a1");
  session.client = fakeClient((name, args) => {
    assert.equal(name, "search_menu");
    if (args.query === "chole") return { items: [{ ...dish, menu_item_id: "chole-1", name: "Chole" }] };
    if (args.offset === 10) return { items: [{ ...dish, menu_item_id: "paneer-2", name: "Paneer Tikka" }] };
    return { items: [dish], hasMore: true, nextOffset: 10 };
  });
  const result = await searchMenu(session, "a1", "paneer", true);
  assert.deepEqual(result.map(item => item.menuItemId), ["dish-1", "paneer-2"]);
  await searchMenu(session, "a1", "chole", true);
  assert.ok(session.menuItems.has("dish-1"));
  assert.ok(session.menuItems.has("chole-1"));
});

test("cart probe refuses an item that gains required customization on scoped recheck", async () => {
  const calls: string[] = [];
  const session = createSwiggySession("http://localhost/callback");
  session.addressIds.add("a1");
  session.client = fakeClient((name, args) => {
    calls.push(name);
    if (name === "search_menu") {
      return { items: [{ ...dish, ...(args.restaurantIdOfAddedItem ? { hasVariants: true } : {}) }] };
    }
    throw new Error(`Unexpected ${name}`);
  });
  await searchMenu(session, "a1", "paneer", true);
  await assert.rejects(() => probeSimpleCart(session, "a1", "dish-1"), /changed or needs customization/);
  assert.deepEqual(calls, ["search_menu", "search_menu"]);
});

test("uncertain cart write is accepted only after item and total are read back", async () => {
  const calls: string[] = [];
  let cartRead = 0;
  const session = createSwiggySession("http://localhost/callback");
  session.addressIds.add("a1");
  session.client = fakeClient((name, args) => {
    calls.push(name);
    if (name === "search_menu") {
      assert.equal(args.restaurantIdOfAddedItem, "restaurant-1");
      return { items: [dish] };
    }
    if (name === "get_food_cart") {
      cartRead++;
      return { data: cartRead === 1
        ? { items: [], pricing: { to_pay: 0 } }
        : { items: [{ menu_item_id: "dish-1", name: "Paneer Bowl", quantity: 1 }], pricing: { to_pay: 287 } } };
    }
    if (name === "update_food_cart") throw new Error("Connection timed out after write");
    throw new Error(`Unexpected ${name}`);
  }, { properties: { cartItems: { type: "array" } } });
  session.menuItems.set("dish-1", {
    name: dish.name, menuItemId: dish.menu_item_id, restaurantId: dish.restaurant_id,
    restaurantName: dish.restaurant_name, priceInr: dish.price, imageUrl: null,
    isVeg: true, inStock: true, hasCustomizations: false
  });
  const result = await probeSimpleCart(session, "a1", "dish-1");
  assert.equal(result.status, "verified");
  assert.match(String(result.updateError), /timed out/);
  assert.equal((result.cart as { toPayInr: number }).toPayInr, 287);
  assert.deepEqual(calls, ["search_menu", "get_food_cart", "update_food_cart", "get_food_cart"]);
});
