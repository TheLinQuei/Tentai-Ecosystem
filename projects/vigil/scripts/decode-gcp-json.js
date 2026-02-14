// scripts/decode-gcp-json.js
const fs = require("fs");
const path = "/secrets/GCP_STT_JSON.json";

console.log("[VI] decode script is executing");

const base64 = process.env.GCP_STT_JSON_BASE64;
if (!base64) {
  console.error("[GCP] Missing env var: GCP_STT_JSON_BASE64");
  process.exit(1);
}

try {
  const json = Buffer.from(base64, "base64");
  fs.writeFileSync(path, json);
  console.log("[GCP] JSON restored to", path);
} catch (err) {
  console.error("[GCP] Failed to write credentials:", err);
  process.exit(1);
}
