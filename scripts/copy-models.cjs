"use strict";

const fs = require("node:fs");
const path = require("node:path");

const name = "msd-musicnn-1.onnx";
const src = path.join(__dirname, "..", "models", name);
const dstDir = path.join(__dirname, "..", "dist", "main", "models");
const dst = path.join(dstDir, name);

if (!fs.existsSync(src)) {
  console.warn("[copy-models] MSD MusiCNN ONNX not found at", src, "(postinstall download may have been skipped)");
  process.exit(0);
}

fs.mkdirSync(dstDir, { recursive: true });
fs.copyFileSync(src, dst);
