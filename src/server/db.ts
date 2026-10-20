import { MongoClient, type Db } from "mongodb";

let client: MongoClient | undefined;
let database: Db | undefined;

export async function initializeDatabase(): Promise<Db | undefined> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return undefined;

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
  await client.connect();
  database = client.db(process.env.MONGODB_DB || "mealpilot");

  await Promise.all([
    database.collection("meal_jobs").createIndex({ userId: 1, createdAt: -1 }),
    database.collection("meal_jobs").createIndex({ requestId: 1 }, { unique: true }),
    database.collection("candidates").createIndex({ jobId: 1 }),
    database.collection("nutrition_claims").createIndex({ restaurantId: 1, menuItemId: 1, observedAt: -1 }),
    database.collection("cart_audits").createIndex({ jobId: 1, consentAt: -1 }),
    database.collection("preferences").createIndex({ userId: 1 }, { unique: true })
  ]);

  return database;
}

export function getDatabase(): Db | undefined {
  return database;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
}
