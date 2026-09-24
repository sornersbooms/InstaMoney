const { app, BrowserWindow, WebContentsView, ipcMain, nativeImage, shell } = require('electron');
const path = require('node:path');
const store = require('./store');
const groq = require('./groq');
const injected = require('./injected');
const license = require('./license');
const brand = require('./active-brand.json');

const HEARTBEAT_MS = 10 * 60 * 1000;

const INSTAGRAM_START_URL = 'https://www.instagram.com/';
// Instagram sirve una versión degradada si detecta el user agent por defecto de Electron.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let mainWindow = null;
let instagramView = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    title: brand.productName,
    backgroundColor: '#05040c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  instagramView = new WebContentsView({
    webPreferences: {
      // Partición persistente: la sesión de Instagram sobrevive al cierre de la app.
      partition: 'persist:instagram',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  instagramView.webContents.setUserAgent(CHROME_UA);
  mainWindow.contentView.addChildView(instagramView);
  instagramView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  instagramView.webContents.loadURL(INSTAGRAM_START_URL);

  instagramView.webContents.setWindowOpenHandler(({ url }) => {
    instagramView.webContents.loadURL(url);
    return { action: 'deny' };
  });

  const notifyNavigation = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('instagram:navigated', instagramView.webContents.getURL());
  };
  instagramView.webContents.on('did-navigate', notifyNavigation);
  instagramView.webContents.on('did-navigate-in-page', notifyNavigation);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    instagramView = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  license.heartbeat();
  setInterval(license.heartbeat, HEARTBEAT_MS);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  store.flush();
  if (process.platform !== 'darwin') app.quit();
});

function runInInstagram(fnName, ...args) {
  if (!instagramView) return Promise.resolve(null);
  return instagramView.webContents.executeJavaScript(injected.call(fnName, ...args), true);
}

/**
 * Las URLs de avatar de Instagram vienen firmadas y caducan en días, así que guardamos la
 * imagen reescalada dentro del propio lead en vez del enlace.
 */
async function toAvatarDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    const image = nativeImage.createFromBuffer(buffer).resize({ width: 48, height: 48 });
    return `data:image/jpeg;base64,${image.toJPEG(70).toString('base64')}`;
  } catch {
    return undefined;
  }
}

function newLead(profile, sourceType, sourceRef) {
  return {
    id: `${profile.username}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: profile.username,
    fullName: profile.fullName,
    profilePicUrl: profile.profilePicUrl,
    sourceType,
    sourceRef,
    capturedAt: Date.now(),
    status: 'new',
    tags: [],
    notes: '',
  };
}

// --- Licencia ------------------------------------------------------------

ipcMain.handle('license:check', () => license.check());
ipcMain.handle('license:activate', (_e, key) => license.verify(String(key ?? '').trim()));
ipcMain.handle('license:trial', (_e, data) => license.registerTrial(data));
ipcMain.handle('license:current', () => license.current());
ipcMain.handle('license:signOut', () => {
  license.signOut();
  if (instagramView) instagramView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
});
ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url));

// --- Datos ---------------------------------------------------------------

ipcMain.handle('data:getAll', () => ({ ...store.getAll(), todayStats: store.getTodayStats() }));
ipcMain.handle('data:setLeads', (_e, leads) => store.set('leads', leads));
ipcMain.handle('data:updateLead', (_e, id, patch) => store.updateLead(id, patch));
ipcMain.handle('data:setTemplates', (_e, templates) => store.set('templates', templates));
ipcMain.handle('data:setSettings', (_e, settings) => store.set('settings', settings));
ipcMain.handle('data:setSendQueue', (_e, queue) => store.set('sendQueue', queue));
ipcMain.handle('data:incrementContacted', () => store.incrementContactedToday());
ipcMain.handle('data:openFolder', () => shell.showItemInFolder(store.FILE));

// --- Vista de Instagram --------------------------------------------------

ipcMain.handle('instagram:setBounds', (_e, bounds) => {
  if (!instagramView) return;
  instagramView.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  });
});

ipcMain.handle('instagram:navigate', (_e, url) => instagramView?.webContents.loadURL(url));
ipcMain.handle('instagram:back', () => instagramView?.webContents.navigationHistory.goBack());
ipcMain.handle('instagram:reload', () => instagramView?.webContents.reload());
ipcMain.handle('instagram:getUrl', () => instagramView?.webContents.getURL() ?? '');
ipcMain.handle('instagram:context', () => runInInstagram('detectContext'));
ipcMain.handle('instagram:insertTemplate', (_e, text) => runInInstagram('insertTemplate', text));

ipcMain.handle('instagram:capture', async () => {
  const result = await runInInstagram('captureVisible');
  if (!result || result.error) return { added: 0, skipped: 0, error: result?.error ?? 'Sin resultado' };
  const { context, profiles } = result;
  if (profiles.length === 0) return { added: 0, skipped: 0, error: 'No se detectaron perfiles visibles.' };

  const withAvatars = await Promise.all(
    profiles.map(async (profile) => ({
      ...profile,
      profilePicUrl: profile.profilePicUrl ? await toAvatarDataUrl(profile.profilePicUrl) : undefined,
    })),
  );
  const leads = withAvatars.map((profile) => newLead(profile, context.kind, context.seed));
  return { ...store.addLeads(leads), context };
});

/**
 * Enriquece el lead con los datos del perfil que está abierto en pantalla. Se dispara cuando
 * la persona visita un perfil, no recorriendo perfiles por su cuenta.
 */
ipcMain.handle('instagram:enrichCurrentProfile', async () => {
  const details = await runInInstagram('extractProfileDetails');
  if (!details || details.error || !details.username) return null;
  return store.updateLeadByUsername(details.username, {
    bio: details.bio,
    followerCount: details.followerCount,
    followingCount: details.followingCount,
    externalLink: details.externalLink,
    isBusiness: details.isBusiness,
    enrichedAt: details.enrichedAt,
  });
});

// --- Groq ----------------------------------------------------------------

ipcMain.handle('groq:models', async (_e, apiKey) => {
  try {
    return { models: await groq.listModels(apiKey) };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('groq:score', async (_e, leads) => {
  try {
    return { results: await groq.scoreLeads(leads, store.get('settings')) };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('groq:personalize', async (_e, lead, baseTemplate) => {
  try {
    return { message: await groq.personalizeMessage(lead, store.get('settings'), baseTemplate) };
  } catch (err) {
    return { error: err.message };
  }
});
