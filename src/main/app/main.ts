import * as electron from "electron";
import { join } from "node:path";
import { AppDatabase } from "../db/database.js";
import { registerIpcHandlers } from "../ipc/registerIpcHandlers.js";

const { app, BrowserWindow } = electron;

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;

async function createWindow(): Promise<void> {
  const preload = join(__dirname, "../../preload/index.js");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: "DJ Set Architect",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../../../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const db = new AppDatabase();
  registerIpcHandlers(db);
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
