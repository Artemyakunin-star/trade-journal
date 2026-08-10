// CLI import: npx tsx scripts/import-cli.ts <file.csv> [...]
// Same code path as the Import screen (src/lib/import.ts).
import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { importCsvFile } from "../src/lib/import";

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("Usage: npx tsx scripts/import-cli.ts <file.csv> [...]");
    process.exit(1);
  }
  for (const f of files) {
    const res = await importCsvFile(basename(f), readFileSync(f, "utf8"));
    console.log(JSON.stringify(res));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
