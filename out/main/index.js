"use strict";
const electron = require("electron");
const promises = require("node:fs/promises");
const node_path = require("node:path");
const node_url = require("node:url");
const WINDOW_WIDTH = 512;
const WINDOW_HEIGHT = 576;
const ASSET_SCHEME = "companion-asset";
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);
const projectRoot = electron.app.getAppPath();
function resolveProjectPath(...segments) {
  return node_path.join(projectRoot, ...segments);
}
async function readJsonFile(...segments) {
  const raw = await promises.readFile(resolveProjectPath(...segments), "utf8");
  return JSON.parse(raw);
}
function registerConfigHandlers() {
  electron.ipcMain.handle(
    "config:get-companion",
    () => readJsonFile("data", "config", "companion.config.json")
  );
  electron.ipcMain.handle(
    "config:get-states",
    () => readJsonFile("data", "config", "states.config.json")
  );
}
function registerAssetProtocol() {
  electron.protocol.handle(ASSET_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    const rawRelativePath = decodeURIComponent(`${requestUrl.hostname}${requestUrl.pathname}`);
    const relativePath = node_path.normalize(rawRelativePath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^(\/|\\)+/, "");
    const absolutePath = node_path.resolve(projectRoot, relativePath);
    if (!absolutePath.startsWith(projectRoot)) {
      return new Response("Invalid asset path", { status: 400 });
    }
    return electron.net.fetch(node_url.pathToFileURL(absolutePath).toString());
  });
}
async function createMainWindow() {
  const companionConfig = await readJsonFile("data", "config", "companion.config.json");
  const mainWindow = new electron.BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: WINDOW_WIDTH,
    maxHeight: WINDOW_HEIGHT,
    resizable: false,
    frame: false,
    transparent: companionConfig.window.transparent,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false,
    alwaysOnTop: companionConfig.window.alwaysOnTop,
    title: "Desktop AI Companion",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  electron.Menu.setApplicationMenu(null);
  mainWindow.setFullScreenable(false);
  mainWindow.setAlwaysOnTop(companionConfig.window.alwaysOnTop, "floating");
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.focus();
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
  return mainWindow;
}
electron.app.whenReady().then(async () => {
  registerConfigHandlers();
  registerAssetProtocol();
  await createMainWindow();
  electron.app.on("activate", async () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
