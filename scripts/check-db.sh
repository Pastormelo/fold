#!/usr/bin/env bash
# Tests whatever DATABASE_URL is currently in .env.local. Reports plainly.
cd "$(dirname "$0")/.."
node --input-type=module -e '
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import postgres from "postgres";
const url = process.env.DATABASE_URL;
if (!url) { console.log("  DATABASE_URL is not set in .env.local"); process.exit(1); }
const m = url.match(/^postgresql:\/\/([^:]+):([^@]*)@([^\/]+)/);
if (!m) { console.log("  DATABASE_URL is not a postgresql:// URI"); process.exit(1); }
console.log("  user:", m[1]);
console.log("  host:", m[3]);
console.log("  password length:", m[2].length);
const sql = postgres(url, { prepare: false, max: 1, ssl: "require", connect_timeout: 15 });
try {
  const [r] = await sql`select current_database() d`;
  const t = await sql`select count(*)::int n from information_schema.tables where table_schema = ${"public"}`;
  console.log("");
  console.log("  ✓ CONNECTED to", r.d, "—", t[0].n, "tables");
} catch (e) {
  console.log("");
  console.log(e.code === "28P01"
    ? "  ✗ Wrong password (everything else about the URL is fine)"
    : "  ✗ " + (e.code || "") + " " + (e.message || ""));
  process.exitCode = 1;
} finally { try { await sql.end({ timeout: 2 }); } catch {} }
' 2>&1 | grep -v "^(node:"
