const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const outDir = join(__dirname, "..", "dist", "main");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2));
