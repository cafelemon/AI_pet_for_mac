import { app, BrowserWindow, ipcMain, Menu, net, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { CompanionConfig, StatesConfig } from '../shared/types';

const WINDOW_WIDTH = 512;
const WINDOW_HEIGHT = 576;
const ASSET_SCHEME = 'companion-asset';

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const projectRoot = app.getAppPath();

function resolveProjectPath(...segments: string[]): string {
  return join(projectRoot, ...segments);
}

async function readJsonFile<T>(...segments: string[]): Promise<T> {
  const raw = await readFile(resolveProjectPath(...segments), 'utf8');
  return JSON.parse(raw) as T;
}

function registerConfigHandlers(): void {
  ipcMain.handle('config:get-companion', () =>
    readJsonFile<CompanionConfig>('data', 'config', 'companion.config.json')
  );
  ipcMain.handle('config:get-states', () =>
    readJsonFile<StatesConfig>('data', 'config', 'states.config.json')
  );
}

function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    const rawRelativePath = decodeURIComponent(`${requestUrl.hostname}${requestUrl.pathname}`);
    const relativePath = normalize(rawRelativePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^(\/|\\)+/, '');
    const absolutePath = resolve(projectRoot, relativePath);

    if (!absolutePath.startsWith(projectRoot)) {
      return new Response('Invalid asset path', { status: 400 });
    }

    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}

async function createMainWindow(): Promise<BrowserWindow> {
  const companionConfig = await readJsonFile<CompanionConfig>('data', 'config', 'companion.config.json');
  const mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: WINDOW_WIDTH,
    maxHeight: WINDOW_HEIGHT,
    resizable: false,
    frame: false,
    transparent: companionConfig.window.transparent,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    alwaysOnTop: companionConfig.window.alwaysOnTop,
    title: 'Desktop AI Companion',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.setFullScreenable(false);
  mainWindow.setAlwaysOnTop(companionConfig.window.alwaysOnTop, 'floating');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.focus();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  registerConfigHandlers();
  registerAssetProtocol();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
