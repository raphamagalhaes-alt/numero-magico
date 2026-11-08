/**
 * Número Mágico — app desktop (Windows, macOS, Linux).
 * Tudo roda localmente, no computador do usuário (uso pessoal). Nenhum dado de mercado é enviado
 * a servidores do app. Cotações: arquivos COTAHIST baixados pelo próprio usuário (importados
 * automaticamente da pasta Downloads) e/ou a chave pessoal gratuita da brapi do usuário.
 */
const { app, BrowserWindow, Menu, Notification, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const nodeCrypto = require('node:crypto');

const B3_PAGE = 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/';
const COTAHIST = /^COTAHIST_(A\d{4}|M\d{6}|D\d{8})\.(ZIP|TXT)$/i;
const userData = app.getPath('userData');
const prefsFile = path.join(userData, 'desktop.json');
const readPrefs = () => { try { return JSON.parse(fs.readFileSync(prefsFile, 'utf8')); } catch { return {}; } };
const writePrefs = (p) => { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(prefsFile, JSON.stringify(p, null, 2), { mode: 0o600 }); };
let prefs = readPrefs();
if (!prefs.accessToken) { prefs.accessToken = nodeCrypto.randomBytes(18).toString('base64url'); writePrefs(prefs); }

const dirs = { data: path.join(userData, 'dados'), import: path.join(userData, 'importar') };
let port = 0;
let win = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(prefs.port || 0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  }).catch(() => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); }));
}

const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

async function startServer() {
  port = await freePort();
  prefs.port = port; writePrefs(prefs);
  Object.assign(process.env, {
    PORT: String(port),
    HOST: prefs.mobileAccess ? '0.0.0.0' : '127.0.0.1',
    ...(prefs.mobileAccess ? { ACCESS_TOKEN: prefs.accessToken } : {}),
    DATA_DIR: dirs.data,
    IMPORT_DIR: dirs.import,
    STATIC_DIR: path.join(__dirname, '..', 'dist'),
    MARKET_STORE_FILE: path.join(dirs.data, 'market-store.json'),
    MARKET_LEARNED_HOLIDAYS_FILE: path.join(dirs.data, 'holidays-learned.json'),
    MARKET_MANUAL_FILE: path.join(dirs.data, 'market-manual.json'),
  });
  await import(require('node:url').pathToFileURL(path.join(__dirname, '..', 'build', 'server.mjs')).href);
}

const api = (p, init = {}) => fetch(`http://127.0.0.1:${port}${p}`, { ...init, headers: { 'X-Requested-With': 'mxrf11', ...(init.headers || {}) } });

/** Copia COTAHIST baixados pelo usuário (pasta Downloads) para a pasta de importação. */
function importFromDownloads(file) {
  const name = path.basename(file);
  if (!COTAHIST.test(name)) return false;
  const dest = path.join(dirs.import, name.toUpperCase().replace(/\.ZIP$/, '.ZIP'));
  try {
    const st = fs.statSync(file);
    if (fs.existsSync(dest) && fs.statSync(dest).size === st.size) return false;
    fs.mkdirSync(dirs.import, { recursive: true });
    fs.copyFileSync(file, dest);
    return true;
  } catch { return false; }
}

function watchDownloads() {
  const dl = app.getPath('downloads');
  const scanAll = () => { let n = 0; for (const f of fs.readdirSync(dl)) if (importFromDownloads(path.join(dl, f))) n++; return n; };
  try { if (scanAll()) api('/api/import/scan', { method: 'POST' }).catch(() => {}); } catch { /* pasta inacessível */ }
  const pending = new Map();
  try {
    fs.watch(dl, (_ev, name) => {
      if (!name || !COTAHIST.test(String(name))) return;
      const full = path.join(dl, String(name));
      clearTimeout(pending.get(full));
      // espera o download terminar (tamanho estável)
      pending.set(full, setTimeout(async () => {
        if (importFromDownloads(full)) {
          await api('/api/import/scan', { method: 'POST' }).catch(() => {});
          new Notification({ title: 'Cotações importadas', body: `${name} foi importado. Os indicadores serão atualizados em instantes.` }).show();
        }
      }, 3000));
    });
  } catch { /* sem permissão para observar */ }
}

/** Lembrete diário (pregões, 20h45 de Brasília): baixar o arquivo do dia no site da B3. */
let lastReminder = prefs.lastReminder || '';
function reminderLoop() {
  const tick = () => {
    if (prefs.reminders === false) return;
    const now = new Date();
    const sp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const g = (t) => sp.find((p) => p.type === t).value;
    const day = `${g('year')}-${g('month')}-${g('day')}`;
    const mins = Number(g('hour')) * 60 + Number(g('minute'));
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6 || mins < 20 * 60 + 45 || lastReminder === day) return;
    lastReminder = day; prefs.lastReminder = day; writePrefs(prefs);
    const n = new Notification({ title: 'Cotações de hoje disponíveis na B3', body: 'Clique para abrir a página da B3 e baixar o arquivo do dia. O app importa sozinho da pasta Downloads.' });
    n.on('click', () => shell.openExternal(B3_PAGE));
    n.show();
  };
  tick();
  setInterval(tick, 10 * 60 * 1000);
}

async function showMobile() {
  if (!prefs.mobileAccess) {
    const r = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Ativar e reiniciar', 'Cancelar'], defaultId: 0,
      title: 'Acessar pelo celular',
      message: 'Permitir acesso pelo celular na sua rede Wi-Fi?',
      detail: 'O app passa a aceitar conexões da rede local, sempre protegidas por uma senha de acesso exclusiva. Use apenas em redes de confiança (casa). O sistema pode pedir permissão no firewall.',
    });
    if (r.response !== 0) return;
    prefs.mobileAccess = true; writePrefs(prefs);
    app.relaunch(); app.exit(0);
    return;
  }
  const QR = require('qrcode');
  const urls = lanIps().map((ip) => `http://${ip}:${port}/?acesso=${encodeURIComponent(prefs.accessToken)}`);
  const qrs = await Promise.all(urls.map((u) => QR.toDataURL(u, { margin: 1, width: 260 })));
  const html = `<!doctype html><meta charset="utf-8"><title>Acessar pelo celular</title><body style="font-family:system-ui;background:#111316;color:#eceef1;padding:20px">
  <h2 style="margin:0 0 8px">Acessar pelo celular</h2><p style="color:#9aa1ab;font-size:13px">Conecte o celular no mesmo Wi-Fi e leia o QR code com a câmera. Depois, no navegador do celular, use "Adicionar à tela inicial" para ter o ícone do app.</p>
  ${urls.map((u, i) => `<div style="margin:14px 0"><img src="${qrs[i]}" alt="QR code"><div style="font-size:11px;word-break:break-all;color:#9aa1ab">${u}</div></div>`).join('') || '<p>Nenhuma rede local encontrada.</p>'}
  <p style="font-size:12px;color:#9aa1ab">O computador precisa estar ligado com o app aberto. Para desativar, use o menu Celular → Desativar acesso.</p></body>`;
  const w = new BrowserWindow({ width: 360, height: 640, parent: win, title: 'Acessar pelo celular', autoHideMenuBar: true, webPreferences: { sandbox: true } });
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function menu() {
  const tpl = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Cotações', submenu: [
      { label: 'Abrir página de cotações da B3 (baixar arquivo)', click: () => shell.openExternal(B3_PAGE) },
      { label: 'Importar arquivo COTAHIST…', click: async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'COTAHIST', extensions: ['zip', 'ZIP', 'txt', 'TXT'] }] });
        let n = 0; for (const f of r.filePaths) if (importFromDownloads(f)) n++;
        if (n) await api('/api/import/scan', { method: 'POST' }).catch(() => {});
      } },
      { label: 'Abrir pasta de importação', click: () => { fs.mkdirSync(dirs.import, { recursive: true }); shell.openPath(dirs.import); } },
      { type: 'checkbox', label: 'Lembrete diário às 20h45', checked: prefs.reminders !== false, click: (i) => { prefs.reminders = i.checked; writePrefs(prefs); } },
    ] },
    { label: 'Celular', submenu: [
      { label: 'Acessar pelo celular (QR code)…', click: showMobile },
      { label: 'Desativar acesso pelo celular', enabled: Boolean(prefs.mobileAccess), click: () => { prefs.mobileAccess = false; writePrefs(prefs); app.relaunch(); app.exit(0); } },
      { label: 'Gerar nova senha de acesso', enabled: Boolean(prefs.mobileAccess), click: () => { prefs.accessToken = nodeCrypto.randomBytes(18).toString('base64url'); writePrefs(prefs); app.relaunch(); app.exit(0); } },
    ] },
    { role: 'viewMenu', label: 'Exibir' },
    { label: 'Ajuda', submenu: [
      { label: 'Termos de uso da B3 e como o app se adequa', click: () => shell.openExternal('https://www.b3.com.br/pt_br/termos-de-uso-e-protecao-de-dados/termos-de-uso') },
      { label: 'Abrir pasta de dados', click: () => shell.openPath(dirs.data) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  await startServer();
  menu();
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 380, backgroundColor: '#0b0c0e', title: 'Número Mágico', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  // links externos (B3, fontes oficiais) abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  watchDownloads();
  reminderLoop();
});
app.on('window-all-closed', () => app.quit());
