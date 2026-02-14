// src/modules/database.ts
import path from "node:path";
import fs from "node:fs/promises";
import { CONFIG } from "../config";

/**
 * Lightweight JSON "DB" adapter with a stable default path.
 * No more IS_DEV import and no reliance on CONFIG.JSON_FALLBACK_PATH.
 */

const IS_PROD = (CONFIG.NODE_ENV || "").toLowerCase() === "production";
const JSON_FALLBACK_PATH = path.join(process.cwd(), "data", IS_PROD ? "vi-db.json" : "vi-db.dev.json");

class JsonAdapter {
  private file: string;
  private data: Record<string, any> = {};

  constructor(file: string) {
    this.file = file;
  }

  async init() {
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const raw = await fs.readFile(this.file, "utf8").catch(() => "{}");
      this.data = JSON.parse(raw || "{}");
    } catch {
      this.data = {};
    }
  }

  private async persist() {
    await fs.mkdir(path.dirname(this.file), { recursive: true }).catch(() => {});
    const text = JSON.stringify(this.data, null, 2);
    await fs.writeFile(this.file, text, "utf8");
  }

  get<T = any>(key: string, def?: T): T {
    return (this.data as any)[key] ?? def;
  }

  async set<T = any>(key: string, value: T) {
    (this.data as any)[key] = value;
    await this.persist();
  }

  async delete(key: string) {
    delete (this.data as any)[key];
    await this.persist();
  }

  all(): Record<string, any> {
    return this.data;
  }
}

const db = new JsonAdapter(JSON_FALLBACK_PATH);

export async function dbInit() {
  await db.init();
  console.log(`DB: Using JSON store at: ${JSON_FALLBACK_PATH} (${IS_PROD ? "prod" : "dev"})`);
}

export function dbAll() {
  return db.all();
}

export function dbGet<T = any>(key: string, def?: T) {
  return db.get<T>(key, def);
}

export async function dbSet<T = any>(key: string, value: T) {
  await db.set<T>(key, value);
}

export async function dbDelete(key: string) {
  await db.delete(key);
}

// alias for legacy import in src/index.ts
export const initDB = dbInit;
