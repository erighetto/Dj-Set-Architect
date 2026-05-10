"use strict";

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const MODEL_URL = "https://essentia.upf.edu/models/autotagging/msd/msd-musicnn-1.onnx";
const dest = path.join(__dirname, "..", "models", "msd-musicnn-1.onnx");

function download() {
  if (fs.existsSync(dest)) {
    const { size } = fs.statSync(dest);
    if (size > 1_000_000) {
      return Promise.resolve();
    }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmp);
    https
      .get(MODEL_URL, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${MODEL_URL}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            fs.renameSync(tmp, dest);
            resolve();
          });
        });
      })
      .on("error", reject);
    file.on("error", reject);
  });
}

download().catch((error) => {
  console.warn("[postinstall] MSD MusiCNN ONNX download skipped:", error.message);
});
