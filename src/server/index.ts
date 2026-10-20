import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { mealBriefSchema } from "../shared/contracts.ts";
import { getDatabase, initializeDatabase, closeDatabase } from "./db.ts";
import {
  beginSwiggyConnection,
  createSwiggySession,
  finishSwiggyConnection,
  getAddresses,
  getCart,
  getSwiggySession,
  inspectCartTool,
  probeSimpleCart,
  searchMenu
} from "./swiggy.ts";

const port = Number(process.env.PORT || 8787);
const publicOrigin = new URL(process.env.PUBLIC_ORIGIN || "http://localhost:5173");
const swiggyLocalEnabled = ["localhost", "127.0.0.1"].includes(publicOrigin.hostname);
const distRoot = resolve(process.cwd(), "dist");

function requestOrigin(request: IncomingMessage): URL {
  const host = request.headers.host || "";
  if (swiggyLocalEnabled && /^localhost:(5173|8787)$/.test(host)) return new URL(`http://${host}`);
  if (swiggyLocalEnabled && /^127\.0\.0\.1:(5173|8787)$/.test(host)) return new URL(`http://${host}`);
  return publicOrigin;
}

function allowedOrigin(request: IncomingMessage): boolean {
  if (!request.headers.origin) return true;
  if (request.headers.origin === publicOrigin.origin) return true;
  return swiggyLocalEnabled && [
    "http://localhost:5173", "http://localhost:8787",
    "http://127.0.0.1:5173", "http://127.0.0.1:8787"
  ].includes(request.headers.origin);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function redirect(response: ServerResponse, location: string, cookie?: string): void {
  response.writeHead(302, { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) });
  response.end();
}

function cookie(request: IncomingMessage, name: string): string | undefined {
  const segment = request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return segment?.slice(name.length + 1);
}

function sessionCookie(id: string): string {
  const secure = publicOrigin.protocol === "https:" ? "; Secure" : "";
  return `mealpilot_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=21600${secure}`;
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32_768) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

async function staticFile(pathname: string, response: ServerResponse): Promise<void> {
  const candidate = resolve(distRoot, `.${decodeURIComponent(pathname)}`);
  if (candidate !== distRoot && !candidate.startsWith(distRoot + sep)) {
    json(response, 404, { error: "Not found" });
    return;
  }
  const file = (await stat(candidate).catch(() => null))?.isFile() ? candidate : join(distRoot, "index.html");
  try {
    const contents = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600"
    });
    response.end(contents);
  } catch {
    json(response, 404, { error: "Build the frontend with npm run build first." });
  }
}

const cartProbeSchema = z.object({
  addressId: z.string().min(1),
  menuItemId: z.string().min(1),
  confirmed: z.literal(true)
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || "/", publicOrigin);
  const method = request.method || "GET";
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/health") {
    json(response, 200, { ok: true, service: "mealpilot", phase: 1 });
    return;
  }
  if (method === "GET" && pathname === "/api/system") {
    const session = getSwiggySession(cookie(request, "mealpilot_session"));
    json(response, 200, {
      mongo: getDatabase() ? "connected" : "not-configured",
      gemma: process.env.GEMMA_API_URL && process.env.GEMMA_MODEL ? "configured" : "not-configured",
      swiggy: session?.client ? "connected" : "not-connected",
      swiggyLocalEnabled
    });
    return;
  }
  if (method === "POST" && pathname === "/api/briefs/validate") {
    if (!allowedOrigin(request)) {
      json(response, 403, { error: "Invalid request origin." });
      return;
    }
    const parsed = mealBriefSchema.safeParse(await body(request));
    if (!parsed.success) {
      json(response, 400, { error: "Check the highlighted meal targets.", issues: parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) });
      return;
    }
    json(response, 200, { brief: parsed.data, readyForLiveSearch: Boolean(parsed.data.addressId), source: "validated-brief" });
    return;
  }

  if (pathname.startsWith("/api/swiggy/")) {
    if (!swiggyLocalEnabled) {
      json(response, 503, { error: "Swiggy OAuth is enabled only on localhost in this Phase 1 build." });
      return;
    }
    if (method === "GET" && pathname === "/api/swiggy/connect") {
      const session = createSwiggySession(new URL("/api/swiggy/callback", requestOrigin(request)).toString());
      const authorizationUrl = await beginSwiggyConnection(session);
      redirect(response, authorizationUrl.toString(), sessionCookie(session.id));
      return;
    }
    const session = getSwiggySession(cookie(request, "mealpilot_session"));
    if (!session) {
      json(response, 401, { error: "Connect your Swiggy account first." });
      return;
    }
    if (method === "GET" && pathname === "/api/swiggy/callback") {
      await finishSwiggyConnection(session, url.searchParams);
      redirect(response, new URL("/?connected=1#meal-brief", session.provider.redirectUrl).toString());
      return;
    }
    if (method === "GET" && pathname === "/api/swiggy/addresses") {
      json(response, 200, { addresses: await getAddresses(session), source: "swiggy-live" });
      return;
    }
    if (method === "GET" && pathname === "/api/swiggy/menu") {
      const addressId = url.searchParams.get("addressId") || "";
      const query = (url.searchParams.get("query") || "").trim();
      if (!query || query.length > 80) {
        json(response, 400, { error: "Enter a dish name to search." });
        return;
      }
      json(response, 200, { items: await searchMenu(session, addressId, query, url.searchParams.get("veg") === "1"), source: "swiggy-live", nutrition: "not-verified", price: "menu-only" });
      return;
    }
    if (method === "GET" && pathname === "/api/swiggy/cart") {
      json(response, 200, { cart: await getCart(session, url.searchParams.get("addressId") || ""), source: "swiggy-live" });
      return;
    }
    if (method === "GET" && pathname === "/api/swiggy/cart-tool-schema") {
      json(response, 200, { inputSchema: await inspectCartTool(session) });
      return;
    }
    if (method === "POST" && pathname === "/api/swiggy/cart-probe") {
      if (!allowedOrigin(request)) {
        json(response, 403, { error: "Invalid request origin." });
        return;
      }
      const input = cartProbeSchema.parse(await body(request));
      json(response, 200, await probeSimpleCart(session, input.addressId, input.menuItemId));
      return;
    }
  }

  if (pathname.startsWith("/api/")) {
    json(response, 404, { error: "Not found" });
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }
  await staticFile(pathname, response);
}

await initializeDatabase().catch(error => {
  console.error(`MongoDB unavailable: ${error instanceof Error ? error.message : "connection failed"}`);
});

const server = createServer((request, response) => {
  void handle(request, response).catch(error => {
    const requestId = randomUUID();
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(`[${requestId}] ${message}`);
    if (!response.headersSent) json(response, error instanceof z.ZodError ? 400 : 502, { error: message, requestId });
  });
});

server.listen(port, "0.0.0.0", () => console.log(`MealPilot API listening on ${port}`));

process.on("SIGTERM", () => {
  server.close();
  void closeDatabase();
});
