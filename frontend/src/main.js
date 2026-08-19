import './style.css';
import {
  Connect,
  Disconnect,
  Send,
  RequestHTTP,
  GetProfiles,
  GetStatus,
  GetMessages,
  ClearMessages,
  GetPaths,
  FormatJSON,
  SaveProfile,
  SelectProfile,
  DeleteProfile,
  DeleteRequest,
  ExportCatalog,
  ExportAllCatalogs,
  ImportCatalog,
  ListSessions,
  SearchSessions,
  LoadSession,
  LoadSessionMessage,
  PickAndLoadSession,
  OpenLogDir,
  ClearCookies,
} from '../wailsjs/go/main/App';
import { EventsOn, ClipboardSetText } from '../wailsjs/runtime/runtime';
import { escapeHtml, highlightJson, renderDetailHtml, renderHTTPExchange, renderWSRecord, toggleJsonNode } from './highlight.js';
import {
  emptyRow,
  cloneRows,
  ensureHostVarRows,
  rowsFromMap,
  parseQuery,
  applyQuery,
  formEncode,
  parseForm,
  mergeRequestHeaders,
  parseAuthorization,
  guessBodyType,
  editorHeadersFromRequest,
  parseHTTPOutPreview,
  renderKV,
  varsFromRows,
  expandVars,
  expandMap,
  keepTemplate,
  keepTemplatesInRows,
  toCurl,
  httpExchangeFailed,
} from './http-ui.js';

const $ = (id) => document.getElementById(id);
const THEME_KEY = 'ws-desk-theme';
const CATALOG_KEY = 'ws-desk-catalog';
const SEL_KEY = 'ws-desk-sel';
const MODE_KEY = 'ws-desk-work-mode';
const HOVER_KEY = 'ws-desk-catalog-hover';
const DOC_EDIT_KEY = 'ws-desk-doc-edit';
const DEFAULT_ENV = '默认';

const HTTP_SCHEMES = new Set(['http', 'https']);
const ALL_SCHEMES = new Set(['ws', 'wss', 'http', 'https']);

const el = {
  app: $('app'),
  project: $('project'),
  barEnv: $('barEnv'),
  btnAddProfile: $('btnAddProfile'),
  btnDelProfile: $('btnDelProfile'),
  urlBox: $('urlBox'),
  urlWrap: $('urlWrap'),
  urlPrefix: $('urlPrefix'),
  url: $('url'),

  urlModal: $('urlModal'),
  urlModalTitle: $('urlModalTitle'),
  urlModalInput: $('urlModalInput'),
  urlModalErr: $('urlModalErr'),
  btnUrlModalClose: $('btnUrlModalClose'),
  btnUrlModalCancel: $('btnUrlModalCancel'),
  btnUrlModalOk: $('btnUrlModalOk'),
  confirmModal: $('confirmModal'),
  confirmTitle: $('confirmTitle'),
  confirmMsg: $('confirmMsg'),
  btnConfirmCancel: $('btnConfirmCancel'),
  btnConfirmOk: $('btnConfirmOk'),
  protocol: $('protocol'),
  method: $('method'),
  reconnect: $('reconnect'),
  reconnectWrap: $('reconnectWrap'),
  followRedirects: $('followRedirects'),
  redirectWrap: $('redirectWrap'),
  btnCurl: $('btnCurl'),
  btnCurlDetail: $('btnCurlDetail'),
  btnClearCookies: $('btnClearCookies'),
  btnToggle: $('btnToggle'),
  btnSendTop: $('btnSendTop'),
  btnRecord: $('btnRecord'),
  modeSwitch: $('modeSwitch'),
  btnModeDoc: $('btnModeDoc'),
  btnModeDebug: $('btnModeDebug'),
  btnDocEdit: $('btnDocEdit'),
  docPane: $('docPane'),
  docEmpty: $('docEmpty'),
  docBody: $('docBody'),
  docMeta: $('docMeta'),
  docExtra: $('docExtra'),
  docReqView: $('docReqView'),
  docResView: $('docResView'),
  docReq: $('docReq'),
  docRes: $('docRes'),
  btnCopyDocReq: $('btnCopyDocReq'),
  btnCopyDocRes: $('btnCopyDocRes'),
  state: $('state'),
  reqBuilder: $('reqBuilder'),
  reqMeta: $('reqMeta'),
  reqTitle: $('reqTitle'),
  reqModule: $('reqModule'),
  reqDesc: $('reqDesc'),
  envWrap: $('envWrap'),
  btnEnvMore: $('btnEnvMore'),
  envEdit: $('envEdit'),
  envEditName: $('envEditName'),
  moduleWrap: $('moduleWrap'),
  moduleMenu: $('moduleMenu'),
  catalogPane: $('catalogPane'),
  catalogTitle: $('catalogTitle'),
  catalogList: $('catalogList'),
  catalogFilter: $('catalogFilter'),
  groupMenu: $('groupMenu'),
  catalogTip: $('catalogTip'),
  btnCatalogToggle: $('btnCatalogToggle'),
  btnCatalogAdd: $('btnCatalogAdd'),
  btnCatalogExport: $('btnCatalogExport'),
  btnCatalogImport: $('btnCatalogImport'),
  btnSaveReq: $('btnSaveReq'),
  btnSaveWS: $('btnSaveWS'),
  promptModal: $('promptModal'),
  promptTitle: $('promptTitle'),
  promptHint: $('promptHint'),
  promptInput: $('promptInput'),
  promptErr: $('promptErr'),
  btnPromptCancel: $('btnPromptCancel'),
  btnPromptOk: $('btnPromptOk'),
  reqTabs: $('reqTabs'),
  tabParams: $('tabParams'),
  tabHeaders: $('tabHeaders'),
  tabAuth: $('tabAuth'),
  tabBody: $('tabBody'),
  paramRows: $('paramRows'),
  headerRows: $('headerRows'),
  varRows: $('varRows'),
  formRows: $('formRows'),
  authType: $('authType'),
  authToken: $('authToken'),
  authUser: $('authUser'),
  authPass: $('authPass'),
  list: $('list'),
  listTitle: $('listTitle'),
  detail: $('detail'),
  btnFill: $('btnFill'),
  btnCopyDetail: $('btnCopyDetail'),
  payloadWrap: $('payloadWrap'),
  payloadOutCol: $('payloadOutCol'),
  payloadInCol: $('payloadInCol'),
  payload: $('payload'),
  payloadIn: $('payloadIn'),

  btnSend: $('btnSend'),
  btnFormat: $('btnFormat'),
  btnFormatHttp: $('btnFormatHttp'),
  reqPane: $('reqPane'),
  detailTitle: $('detailTitle'),
  composer: document.querySelector('.composer'),
  btnResend: $('btnResend'),
  btnClear: $('btnClear'),
  footer: $('footer'),
  btnTheme: $('btnTheme'),
  btnSettings: $('btnSettings'),
  settingsModal: $('settingsModal'),
  settingsNav: $('settingsNav'),
  settingsMain: $('settingsMain'),
  btnSettingsClose: $('btnSettingsClose'),
  btnHistory: $('btnHistory'),
  histBanner: $('histBanner'),
  histLabel: $('histLabel'),
  btnLive: $('btnLive'),
  histModal: $('histModal'),
  histList: $('histList'),
  histEmpty: $('histEmpty'),
  histSearch: $('histSearch'),
  msgFilter: $('msgFilter'),
  btnHistClose: $('btnHistClose'),
  btnHistRefresh: $('btnHistRefresh'),
  btnPickSession: $('btnPickSession'),
  btnOpenLogDir: $('btnOpenLogDir'),
  recordModal: $('recordModal'),
  recordTitle: $('recordTitle'),
  recordHint: $('recordHint'),
  recordMeta: $('recordMeta'),
  recordWS: $('recordWS'),
  recordHTTP: $('recordHTTP'),
  recordErr: $('recordErr'),
  recOut: $('recOut'),
  recIn: $('recIn'),
  recReqBody: $('recReqBody'),
  recResBody: $('recResBody'),
  btnRecordClose: $('btnRecordClose'),
  btnRecordCancel: $('btnRecordCancel'),
  btnRecordSave: $('btnRecordSave'),
  btnFmtRecOut: $('btnFmtRecOut'),
  btnFmtRecIn: $('btnFmtRecIn'),
  btnFmtRecReq: $('btnFmtRecReq'),
  btnFmtRecRes: $('btnFmtRecRes'),
};

const LIVE_LIST_CAP = 2000;

/** @type {Map<number, any>} */
const store = new Map();
/** @type {any[]} */
let allHistoryMsgs = [];
/** @type {any[]} */
let allLiveMsgs = [];
let selectedId = 0;
let lastSent = '';
let historyMode = false;
let workMode = 'doc';
let activeHistKeyword = '';
let historySessionURL = '';
let historySessionProtocol = '';
let fillFlashTimer = 0;
/** @type {any[]} */
let profiles = [];
let histSearchTimer = 0;
let histSearchSeq = 0;
/** @type {{key:string,value:string,enabled:boolean}[]} */
let paramRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let headerRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let varRows = ensureHostVarRows([]);
/** @type {{name:string,variables:{key:string,value:string,enabled:boolean}[]}[]} */
let environments = [{ name: DEFAULT_ENV, variables: ensureHostVarRows([]) }];
let activeEnv = DEFAULT_ENV;
/** @type {{key:string,value:string,enabled:boolean}[]} */
let formRows = [emptyRow()];
const recordDraft = {
  in: '',
  resBody: '',
};
let authState = { type: 'none', token: '', user: '', pass: '' };
let bodyType = 'json';
let reqTab = 'body';
let syncingQuery = false;
let sending = false;
let moduleRun = null;
let persistTimer = 0;
let suppressSessionReset = false;
let activeProfileName = '';
let urlPrefix = '';
let lastHostVarURL = '';

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistProfile(), 400);
}

function dirLabel(dir) {
  if (dir === 'out') return '→';
  if (dir === 'in') return '←';
  return '·';
}

function preview(text) {
  if (!text) return '';
  const s = String(text);
  const head = s.length > 400 ? s.slice(0, 400) : s;
  return head.replace(/\s+/g, ' ').slice(0, 160);
}

function timeOnly(t) {
  if (!t) return '';
  const m = t.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : t;
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function msgMatches(m, kw) {
  if (!kw) return true;
  const q = kw.toLowerCase();
  const bag = `${m.text || ''} ${m.pretty || ''} ${m.dir || ''} ${m.time || ''}`.toLowerCase();
  return bag.includes(q);
}

/* —— theme —— */
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  el.btnTheme.textContent = t === 'dark' ? '浅色' : '深色';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function catalogHoverMode() {
  return localStorage.getItem(HOVER_KEY) === 'detail' ? 'detail' : 'title';
}

function setCatalogHoverMode(mode) {
  const next = mode === 'title' ? 'title' : 'detail';
  localStorage.setItem(HOVER_KEY, next);
  syncCatalogHoverRadios();
  hideCatalogTip();
}

function syncCatalogHoverRadios() {
  const mode = catalogHoverMode();
  for (const input of document.querySelectorAll('input[name="catalogHover"]')) {
    input.checked = input.value === mode;
  }
}

function settingsOpen() {
  return Boolean(el.settingsModal && !el.settingsModal.classList.contains('hidden'));
}

function showSettingsSection(name) {
  const id = name || 'catalog';
  for (const btn of el.settingsNav?.querySelectorAll('.settings-nav-item') || []) {
    btn.classList.toggle('on', btn.dataset.section === id);
  }
  for (const sec of el.settingsMain?.querySelectorAll('.settings-section') || []) {
    sec.classList.toggle('hidden', sec.dataset.section !== id);
  }
}

function closeSettings() {
  el.settingsModal?.classList.add('hidden');
  el.settingsModal?.setAttribute('aria-hidden', 'true');
}

function openSettings() {
  closeEnvEdit();
  closeGroupMenu();
  syncCatalogHoverRadios();
  showSettingsSection(el.settingsNav?.querySelector('.settings-nav-item.on')?.dataset.section || 'catalog');
  el.settingsModal?.classList.remove('hidden');
  el.settingsModal?.setAttribute('aria-hidden', 'false');
}

function toggleSettings() {
  if (settingsOpen()) closeSettings();
  else openSettings();
}

/* —— messages —— */
function clearListUI() {
  store.clear();
  el.list.innerHTML = '';
  selectedId = 0;
  setDetailEmpty('选择一条消息');
  setFillButton(false);
}

function setState(status) {
  const s = (status?.state || 'idle').toLowerCase();
  const kind = (status?.kind || '').toLowerCase();
  let label = s;
  if (s === 'open' && kind === 'http') {
    const sch = urlScheme(status?.url);
    label = sch === 'https' ? 'https' : 'http';
  }
  el.state.textContent = label;
  el.state.className = 'state ' + s;
  const http = kind === 'http' || HTTP_SCHEMES.has(urlScheme(status?.url)) || isHTTPMode();
  el.state.classList.toggle('hidden', http);
  el.btnToggle.textContent = s === 'open' || s === 'connecting' || s === 'reconnecting' ? '断开' : '连接';
  el.btnToggle.classList.toggle('on', s === 'open' || s === 'connecting' || s === 'reconnecting');
}

function isHTTPStatusNote(m) {
  if (!m || m.dir !== 'sys') return false;
  const t = String(m.text || m.pretty || '').trim();
  if (/^recorded\s+http\b/i.test(t)) return true;
  return /^http\s+\d{3}\b/i.test(t) && /\d+\s*ms/i.test(t);
}

function currentFilterKw() {
  return (el.msgFilter?.value || '').trim();
}

function currentMsgPool() {
  return historyMode ? allHistoryMsgs : allLiveMsgs;
}

function liveListTitleBase() {
  return isHTTPMode() ? '记录' : '消息';
}

function setLiveListTitle(shown, total, kw) {
  if (historyMode || !el.listTitle) return;
  const base = liveListTitleBase();
  el.listTitle.textContent = kw ? `${base} · ${shown}/${total}` : base;
}

function refreshFilterTitle() {
  if (historyMode) return;
  const pool = allLiveMsgs;
  const kw = currentFilterKw();
  setLiveListTitle(kw ? el.list.children.length : pool.length, pool.length, kw);
}

function removeListRow(id) {
  if (!id) return;
  store.delete(id);
  const row = el.list.querySelector(`[data-id="${id}"]`);
  row?.remove();
  if (selectedId === id) {
    selectedId = 0;
    setDetailEmpty('选择一条消息');
    setFillButton(false);
  }
}

function rememberLiveMsg(m) {
  if (!m || isHTTPStatusNote(m)) return false;
  if (allLiveMsgs.some((x) => x.id === m.id)) return false;
  allLiveMsgs.push(m);
  while (allLiveMsgs.length > LIVE_LIST_CAP) {
    const old = allLiveMsgs.shift();
    if (old) removeListRow(old.id);
  }
  return true;
}

function appendMsg(m, scroll = true) {
  if (!m || store.has(m.id) || isHTTPStatusNote(m)) return;
  store.set(m.id, m);

  const kw = currentFilterKw();
  if (kw && !msgMatches(m, kw)) {
    refreshFilterTitle();
    return;
  }

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = String(m.id);
  row.innerHTML = `
    <span class="t">${timeOnly(m.time)}</span>
    <span class="d ${m.dir}">${dirLabel(m.dir)}</span>
    <span class="p"></span>
    <span class="b">${m.bytes || 0}b</span>
  `;
  row.querySelector('.p').textContent = preview(m.pretty || m.text);
  row.title = '点击查看详情';
  row.addEventListener('click', () => selectMsg(m.id));
  el.list.appendChild(row);

  while (el.list.children.length > LIVE_LIST_CAP) {
    const first = el.list.firstElementChild;
    const id = Number(first?.dataset.id);
    if (id) store.delete(id);
    first?.remove();
  }

  refreshFilterTitle();
  if (scroll && !kw) {
    const nearBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 80;
    if (nearBottom) el.list.scrollTop = el.list.scrollHeight;
  }
}

function renderMessageList(messages, { scrollTop = 0, selectFirst = false } = {}) {
  clearListUI();
  for (const m of messages || []) appendMsg(m, false);
  el.list.scrollTop = scrollTop;
  if (selectFirst && messages?.length) {
    selectMsg(messages[0].id);
  }
}

function setDetailEmpty(text) {
  el.detail.classList.add('empty');
  el.detail.textContent = text;
  setFillButton(false);
  setCopyDetailButton(false);
}

function setDetailHtml(html) {
  el.detail.classList.remove('empty');
  el.detail.innerHTML = html;
}

function paintMsgDetail(m) {
  if (!m) {
    setDetailEmpty('选择一条消息');
    return;
  }
  if (m.exchange) {
    setDetailHtml(renderHTTPExchange(m.exchange));
  } else if (m.ws) {
    setDetailHtml(renderWSRecord(m.ws));
  } else {
    setDetailHtml(renderDetailHtml(m.dir, m.time, m.pretty || m.text));
  }
  setFillButton(canFillFromMessage(m));
  setCopyDetailButton(true);
}

let selectSeq = 0;

async function selectMsg(id) {
  selectedId = id;
  const seq = ++selectSeq;
  for (const node of el.list.children) {
    node.classList.toggle('active', Number(node.dataset.id) === id);
  }
  let m = store.get(id);
  if (!m) {
    setDetailEmpty('选择一条消息');
    setFillButton(false);
    return;
  }
  if (historyMode && m.slim) {
    setDetailEmpty('加载详情…');
    try {
      const full = await LoadSessionMessage(id);
      if (seq !== selectSeq || selectedId !== id) return;
      if (full) {
        store.set(id, full);
        m = full;
        const i = allHistoryMsgs.findIndex((x) => x.id === id);
        if (i >= 0) allHistoryMsgs[i] = full;
      }
    } catch (e) {
      if (seq !== selectSeq) return;
      setDetailEmpty('加载失败: ' + e);
      setFillButton(false);
      return;
    }
  }
  paintMsgDetail(m);
}

function setHistoryMode(on, label = '') {
  historyMode = on;
  el.app?.classList.toggle('history', on);
  el.histBanner.classList.toggle('hidden', !on);
  applyWorkMode();
  if (on) {
    el.listTitle.textContent = '历史消息';
    el.histLabel.textContent = label || '历史模式';
  } else {
    el.msgFilter.value = '';
    allHistoryMsgs = [];
    activeHistKeyword = '';
    setLiveListTitle(allLiveMsgs.length, allLiveMsgs.length, '');
  }
}

async function loadLiveMessages() {
  const arrived = [];
  allLiveMsgs = arrived;
  clearListUI();
  try {
    const msgs = await GetMessages(0, 500);
    const seen = new Set();
    const next = [];
    for (const m of msgs || []) {
      if (!m || isHTTPStatusNote(m) || seen.has(m.id)) continue;
      seen.add(m.id);
      next.push(m);
    }
    for (const m of arrived) {
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      next.push(m);
    }
    allLiveMsgs = next;
    applyMsgFilter({ selectFirst: false });
    if (!currentFilterKw()) el.list.scrollTop = el.list.scrollHeight;
  } catch (_) {
    allLiveMsgs = arrived.slice();
    applyMsgFilter({ selectFirst: false });
  }
}

async function exitHistoryMode() {
  historySessionURL = '';
  historySessionProtocol = '';
  setHistoryMode(false);
  await loadLiveMessages();
}

function applyMsgFilter({ selectFirst = false } = {}) {
  const pool = currentMsgPool();
  const kw = currentFilterKw();
  const filtered = kw ? pool.filter((m) => msgMatches(m, kw)) : pool;
  if (historyMode) {
    const namePart = el.histLabel.textContent || '历史';
    const base = namePart.replace(/\s*·\s*显示\s+\d+.*/, '');
    el.histLabel.textContent = kw
      ? `${base} · 显示 ${filtered.length}/${pool.length}`
      : base.includes('条')
        ? base
        : `${base} · ${pool.length} 条`;
    if (el.listTitle) el.listTitle.textContent = '历史消息';
  } else {
    setLiveListTitle(filtered.length, pool.length, kw);
  }
  const keepId = selectedId;
  renderMessageList(filtered, {
    scrollTop: kw || historyMode ? 0 : el.list.scrollHeight,
    selectFirst: selectFirst && filtered.length > 0,
  });
  if (!selectFirst && keepId && store.has(keepId)) {
    selectMsg(keepId);
  } else if (!selectFirst && !kw && !historyMode) {
    el.list.scrollTop = el.list.scrollHeight;
  }
}

function showSession(detail, keyword = '') {
  if (!detail) return;
  allHistoryMsgs = detail.messages || [];
  const url = detail.url || detail.info?.url || '';
  const name = historyItemTitle({ ...detail.info, url }) || 'log';
  historySessionURL = url;
  historySessionProtocol = detail.protocol || '';
  const n = allHistoryMsgs.length;
  const kw = (keyword || '').trim();
  activeHistKeyword = kw;
  setHistoryMode(true, `历史 · ${name}${url ? ' · ' + url : ''} · ${n} 条`);
  if (kw) {
    el.msgFilter.value = kw;
  } else {
    el.msgFilter.value = '';
  }
  applyMsgFilter({ selectFirst: false });
  closeHistoryModal();
}

/* —— scheme / http —— */
function urlScheme(url) {
  const m = String(url || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return m ? m[1].toLowerCase() : '';
}

function currentScheme() {
  const s = urlScheme(currentURL());
  return ALL_SCHEMES.has(s) ? s : '';
}

function isHTTPMode() {
  return HTTP_SCHEMES.has(currentScheme());
}

function eventProfileName(v) {
  return String(v || '').trim();
}

function connectionProfileName() {
  return profileNameFromURL(currentURL()) || '';
}

function isCurrentProfileEvent(name) {
  const cur = connectionProfileName() || activeProfileName;
  const got = eventProfileName(name);
  if (!got) return true;
  if (!cur) return false;
  return got === cur;
}

async function activateCurrent() {
  const name = connectionProfileName();
  if (!name) return '';
  await SelectProfile(name);
  return name;
}

async function reloadLiveSession() {
  if (historyMode) {
    historySessionURL = '';
    historySessionProtocol = '';
    setHistoryMode(false);
  }
  try {
    setState(await GetStatus());
  } catch (_) {}
  await loadLiveMessages();
}

function withoutSessionReset(fn) {
  suppressSessionReset = true;
  try {
    return fn();
  } finally {
    suppressSessionReset = false;
  }
}

function applyTransportFromURL() {
  applyTransportUI(currentScheme());
}

function placePayload(http) {
  if (!el.payload) return;
  if (http && el.tabBody && el.payload.parentElement !== el.tabBody) {
    el.tabBody.appendChild(el.payload);
  } else if (!http && el.payloadOutCol && el.payload.parentElement !== el.payloadOutCol) {
    el.payloadOutCol.appendChild(el.payload);
  } else if (!http && !el.payloadOutCol && el.payloadWrap && el.payload.parentElement !== el.payloadWrap) {
    el.payloadWrap.appendChild(el.payload);
  }
}

function placeReqMeta(http) {
  if (!el.reqMeta) return;
  if (isDocMode() && el.docMeta && el.reqMeta.parentElement !== el.docMeta) {
    el.docMeta.appendChild(el.reqMeta);
  } else if (!isDocMode() && http && el.reqBuilder && el.reqMeta.parentElement !== el.reqBuilder) {
    el.reqBuilder.insertBefore(el.reqMeta, el.reqBuilder.firstChild);
  } else if (!isDocMode() && !http && el.composer && el.reqMeta.parentElement !== el.composer) {
    el.composer.insertBefore(el.reqMeta, el.composer.firstChild);
  }
  placeVarRows();
}

function placeVarRows() {
  if (!el.varRows || !el.envEdit) return;
  if (el.varRows.parentElement !== el.envEdit) el.envEdit.appendChild(el.varRows);
}

function isDocMode() {
  return workMode === 'doc' && !historyMode;
}

function docEditing() {
  return localStorage.getItem(DOC_EDIT_KEY) === 'on';
}

function setDocEditing(on) {
  const next = Boolean(on);
  if (!next) {
    flushDocEditors();
    flushReqMeta();
    if (activeSavedId) persistProfile();
  }
  localStorage.setItem(DOC_EDIT_KEY, next ? 'on' : 'off');
  applyDocEditing();
  if (next && isDocMode()) el.reqTitle?.focus();
}

function applyDocEditing() {
  const editing = isDocMode() && docEditing();
  const locked = isDocMode() && !docEditing();
  el.app?.classList.toggle('doc-editing', editing);
  if (el.btnDocEdit) {
    el.btnDocEdit.setAttribute('aria-checked', editing ? 'true' : 'false');
    el.btnDocEdit.title = editing ? '关闭后名称、描述、请求和返回示例不可改' : '打开后可改名称、描述、请求和返回示例';
  }
  const fields = [el.reqTitle, el.reqModule, el.reqDesc, el.docReq, el.docRes];
  for (const node of fields) {
    if (node) node.readOnly = locked;
  }
  if (el.reqTitle) el.reqTitle.placeholder = locked ? '' : '标题，例如 登录';
  if (el.reqModule) el.reqModule.placeholder = locked ? '' : '模块';
  if (el.reqDesc) el.reqDesc.placeholder = locked ? '' : '描述（可选）';
  if (el.docReq) el.docReq.placeholder = locked ? '' : '请求体，可直接改';
  if (el.docRes) el.docRes.placeholder = locked ? '' : '返回示例，可直接改';
  el.docReqView?.classList.toggle('hidden', editing);
  el.docResView?.classList.toggle('hidden', editing);
  el.docReq?.classList.toggle('hidden', !editing);
  el.docRes?.classList.toggle('hidden', !editing);
  syncDocMetaEmpty();
  if (locked) {
    closeModuleMenu();
    paintDocViews(currentSavedRequest());
  }
}

function syncDocMetaEmpty() {
  const hideEmpty = isDocMode() && !docEditing();
  if (el.moduleWrap) {
    el.moduleWrap.classList.toggle('is-empty', hideEmpty && !currentReqModule());
  }
  if (el.reqDesc) {
    el.reqDesc.classList.toggle('is-empty', hideEmpty && !currentReqDesc());
  }
}

function readWorkMode() {
  return localStorage.getItem(MODE_KEY) === 'debug' ? 'debug' : 'doc';
}

function setWorkMode(mode) {
  const next = mode === 'debug' ? 'debug' : 'doc';
  if (next === 'doc' && workMode === 'debug' && activeSavedId) {
    syncActiveRequestSnapshot();
  } else if (next === 'debug' && workMode === 'doc' && activeSavedId) {
    flushDocEditors();
  }
  workMode = next;
  localStorage.setItem(MODE_KEY, workMode);
  if (historyMode) {
    exitHistoryMode().then(() => applyWorkMode());
    return;
  }
  applyWorkMode();
}

function applyWorkMode() {
  const doc = isDocMode();
  const http = isHTTPMode();
  el.app?.classList.toggle('doc-mode', doc);
  el.btnModeDoc?.classList.toggle('on', workMode === 'doc');
  el.btnModeDebug?.classList.toggle('on', workMode === 'debug');
  el.btnModeDoc?.setAttribute('aria-selected', workMode === 'doc' ? 'true' : 'false');
  el.btnModeDebug?.setAttribute('aria-selected', workMode === 'debug' ? 'true' : 'false');
  if (historyMode) {
    el.docPane?.classList.add('hidden');
    el.reqPane?.classList.add('hidden');
    el.composer?.classList.add('hidden');
    return;
  }
  if (doc) {
    closeEnvEdit();
    el.docPane?.classList.remove('hidden');
    el.reqPane?.classList.add('hidden');
    el.composer?.classList.add('hidden');
    placeReqMeta(http);
    applyDocEditing();
    renderDocPane({ reloadEditors: true });
    return;
  }
  el.app?.classList.remove('doc-editing');
  applyDocEditing();
  el.docPane?.classList.add('hidden');
  el.reqPane?.classList.toggle('hidden', !http);
  el.composer?.classList.remove('hidden');
  placePayload(http);
  placeReqMeta(http);
  activateCurrent().then(() => reloadLiveSession()).catch(() => {});
}

function prettyDocText(text) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return raw;
  }
}

function renderDocCode(text) {
  const shown = prettyDocText(text);
  if (!shown) return '<div class="doc-muted">无</div>';
  return `<pre class="doc-code">${highlightJson(shown)}</pre>`;
}

function renderDocTable(label, rows) {
  const items = (rows || []).filter((r) => String(r?.key || '').trim());
  if (!items.length) return '';
  const body = items.map((r) => {
    const off = r.enabled === false ? ' off' : '';
    return `<div class="doc-kv${off}"><span class="doc-k">${escapeHtml(r.key)}</span><span class="doc-v">${escapeHtml(r.value || '')}</span></div>`;
  }).join('');
  return `<div class="doc-sec"><div class="doc-sec-head">${escapeHtml(label)}</div><div class="doc-kvs">${body}</div></div>`;
}

function renderDocAuth(req) {
  const t = String(req?.authType || 'none');
  if (!t || t === 'none') return '';
  let extra = '';
  if (t === 'bearer' && req.authToken) extra = ` · ${req.authToken}`;
  else if (t === 'basic' && req.authUser) extra = ` · ${req.authUser}`;
  return `<div class="doc-sec"><div class="doc-sec-head">鉴权</div><div class="doc-auth">${escapeHtml(t)}${escapeHtml(extra)}</div></div>`;
}

function renderDocPane({ reloadEditors = false } = {}) {
  if (!el.docBody || !el.docEmpty) return;
  const req = currentSavedRequest();
  if (!req) {
    el.docEmpty.classList.remove('hidden');
    el.docBody.classList.add('hidden');
    fillDocEditors(null);
    return;
  }
  el.docEmpty.classList.add('hidden');
  el.docBody.classList.remove('hidden');
  syncDocMetaEmpty();
  const http = isHTTPSaved(req);
  if (el.docExtra) {
    if (http) {
      el.docExtra.innerHTML = [
        renderDocTable('Query', parseQuery(req.url || '')),
        renderDocTable('请求头', req.headerList),
        renderDocAuth(req),
      ].join('');
    } else {
      el.docExtra.innerHTML = '';
    }
  }
  if (reloadEditors || req.id !== docEditorReqId) fillDocEditors(req);
}

let docEditorReqId = '';

function docRequestText(req) {
  if (!req) return '';
  if (isHTTPSaved(req)) {
    if (req.bodyType === 'none') return '';
    if (req.bodyType === 'form') return formEncode(req.formList || []);
    return req.body || '';
  }
  return req.body || '';
}

function fillDocEditors(req) {
  if (el.docReq) el.docReq.value = req ? prettyDocText(docRequestText(req)) : '';
  if (el.docRes) el.docRes.value = req ? prettyDocText(req.example || '') : '';
  paintDocViews(req);
  docEditorReqId = req?.id || '';
}

function paintDocViews(req) {
  if (el.docReqView) {
    const text = req ? prettyDocText(docRequestText(req)) : '';
    el.docReqView.innerHTML = text ? renderDocCode(text) : '<div class="doc-muted">无</div>';
  }
  if (el.docResView) {
    const text = req ? prettyDocText(req.example || '') : '';
    el.docResView.innerHTML = text ? renderDocCode(text) : '<div class="doc-muted">无</div>';
  }
}

function applyDocRequestText(req, text) {
  const raw = String(text || '');
  if (!isHTTPSaved(req)) {
    req.body = raw;
    if (el.payload) el.payload.value = raw;
    return;
  }
  if (req.bodyType === 'form') {
    formRows = parseForm(raw);
    req.formList = cloneRows(formRows);
    req.body = formEncode(formRows);
    if (el.formRows) renderKV(el.formRows, formRows, schedulePersist);
    return;
  }
  if (req.bodyType === 'none' && raw.trim()) {
    setBodyType('json');
    req.bodyType = 'json';
  }
  req.body = raw;
  if (el.payload) el.payload.value = raw;
}

function applyDocExampleText(req, text) {
  const raw = String(text || '');
  req.example = raw;
  recordDraft.in = raw;
  if (isHTTPSaved(req)) recordDraft.resBody = raw;
  if (el.payloadIn) el.payloadIn.value = raw;
}

function flushDocEditors() {
  if (!isDocMode()) return;
  const req = currentSavedRequest();
  if (!req) return;
  if (el.docReq) applyDocRequestText(req, el.docReq.value);
  if (el.docRes) applyDocExampleText(req, el.docRes.value);
}

function onDocReqInput() {
  if (isDocMode() && !docEditing()) return;
  const req = currentSavedRequest();
  if (!req) return;
  applyDocRequestText(req, el.docReq.value);
  schedulePersist();
}

function onDocResInput() {
  if (isDocMode() && !docEditing()) return;
  const req = currentSavedRequest();
  if (!req) return;
  applyDocExampleText(req, el.docRes.value);
  schedulePersist();
}

function applyTransportUI(scheme) {
  if (!ALL_SCHEMES.has(scheme)) return;
  const http = HTTP_SCHEMES.has(scheme);
  const modeChanged = Boolean(el.app?.classList.contains('http')) !== http;
  el.app?.classList.toggle('http', http);
  el.protocol.classList.toggle('hidden', http);
  el.method.classList.toggle('hidden', !http);
  el.reconnectWrap?.classList.toggle('hidden', http);
  el.redirectWrap?.classList.toggle('hidden', !http);
  el.btnCurlDetail?.classList.toggle('hidden', !http);
  el.btnToggle?.classList.toggle('hidden', http);
  el.btnSendTop?.classList.toggle('hidden', !http);
  el.btnRecord?.classList.remove('hidden');
  if (el.btnRecord) {
    el.btnRecord.title = http
      ? '保存到左侧接口：用当前请求配一条响应，不发送'
      : '保存到左侧接口：一对发送/返回，不发送';
  }
  el.state?.classList.toggle('hidden', http);
  applyWorkMode();
  if (el.detailTitle) el.detailTitle.textContent = http ? '响应' : '详情';
  if (!historyMode) refreshFilterTitle();
  if (http && modeChanged) {
    syncParamsFromURL();
    renderRequestEditor();
    applyBodyTypeUI();
    setReqTab(reqTab || 'body');
  }
  if (modeChanged) renderCatalog();
  if (el.payload) {
    el.payload.placeholder = http
      ? '请求体  ·  Ctrl+Enter 发送'
      : '{"cmd":"ping"}  ·  Ctrl+Enter 发送';
  }
}

function originFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    const u = new URL(withScheme);
    const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!ALL_SCHEMES.has(scheme) || !u.host) return '';
    return `${scheme}://${u.host}`;
  } catch {
    return '';
  }
}

function splitLockedURL(url, lockName) {
  const raw = String(url || '').trim();
  if (!raw) {
    const name = String(lockName || '').trim();
    return { prefix: name, rest: '' };
  }
  let prefix = originFromURL(raw);
  if (!prefix) {
    const name = String(lockName || currentProfile()?.name || profileNameFromURL(raw) || '').trim();
    if (name && raw.slice(0, name.length).toLowerCase() === name.toLowerCase()) prefix = name;
  }
  if (!prefix) return { prefix: '', rest: raw };
  let rest = raw;
  if (rest.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    rest = rest.slice(prefix.length);
  } else {
    try {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
      const u = new URL(withScheme);
      rest = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
    } catch {
      rest = '';
    }
  }
  if (rest === '/') rest = '';
  return { prefix, rest };
}

function setURL(url, lockName) {
  const { prefix, rest } = splitLockedURL(url, lockName);
  urlPrefix = prefix;
  if (el.urlPrefix) {
    el.urlPrefix.textContent = prefix;
    el.urlPrefix.title = prefix ? `${prefix}（前缀不可改，点 + 换地址）` : '';
    el.urlPrefix.classList.toggle('hidden', !prefix);
    el.urlPrefix.setAttribute('aria-hidden', prefix ? 'false' : 'true');
  }
  if (el.url) {
    el.url.value = rest;
    el.url.readOnly = !prefix;
    el.url.placeholder = prefix ? '/path' : '点击 + 填写地址';
  }
}

function currentURL() {
  const rest = (el.url?.value || '').trim();
  if (!urlPrefix) return rest;
  if (!rest) return urlPrefix;
  if (rest.slice(0, urlPrefix.length).toLowerCase() === urlPrefix.toLowerCase()) return rest;
  if (rest.startsWith('/') || rest.startsWith('?') || rest.startsWith('#')) return urlPrefix + rest;
  return `${urlPrefix}/${rest.replace(/^\/+/, '')}`;
}

function normalizeURLPathInput() {
  if (!urlPrefix || !el.url) return;
  const raw = el.url.value;
  const t = raw.trim();
  if (!t) {
    el.url.value = '';
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    const origin = originFromURL(t);
    if (origin && origin.toLowerCase() === urlPrefix.toLowerCase()) {
      el.url.value = splitLockedURL(t).rest;
      return;
    }
    try {
      const u = new URL(t);
      const path = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
      el.url.value = path === '/' ? '' : path;
    } catch {
      el.url.value = '';
    }
  }
}

function isHTTPURL(url) {
  return HTTP_SCHEMES.has(urlScheme(url));
}

function currentBodyType() {
  const picked = document.querySelector('input[name="bodyType"]:checked');
  return picked?.value || bodyType || 'json';
}

function applyBodyTypeUI() {
  bodyType = currentBodyType();
  el.app?.classList.toggle('body-none', bodyType === 'none');
  el.app?.classList.toggle('body-form', bodyType === 'form');
  el.formRows?.classList.toggle('hidden', bodyType !== 'form');
}

function syncAuthFields() {
  const t = el.authType?.value || 'none';
  authState.type = t;
  el.authToken?.classList.toggle('hidden', t !== 'bearer');
  el.authUser?.classList.toggle('hidden', t !== 'basic');
  el.authPass?.classList.toggle('hidden', t !== 'basic');
}

function setReqTab(tab) {
  reqTab = tab === 'response' || tab === 'vars' ? 'body' : (tab || 'body');
  for (const btn of el.reqTabs?.querySelectorAll('.req-tab') || []) {
    btn.classList.toggle('on', btn.dataset.tab === reqTab);
  }
  el.tabParams?.classList.toggle('hidden', reqTab !== 'params');
  el.tabHeaders?.classList.toggle('hidden', reqTab !== 'headers');
  el.tabAuth?.classList.toggle('hidden', reqTab !== 'auth');
  el.tabBody?.classList.toggle('hidden', reqTab !== 'body');
}

function syncParamsFromURL() {
  if (syncingQuery) return;
  paramRows = parseQuery(currentURL());
  if (el.paramRows) renderKV(el.paramRows, paramRows, onParamsChange);
}

function onParamsChange() {
  const url = currentURL();
  if (!urlScheme(url)) return;
  syncingQuery = true;
  const next = applyQuery(url, paramRows);
  if (next) setURL(next);
  syncingQuery = false;
  schedulePersist();
}

function renderRequestEditor() {
  if (el.paramRows) renderKV(el.paramRows, paramRows, onParamsChange);
  if (el.headerRows) renderKV(el.headerRows, headerRows, schedulePersist);
  if (el.varRows) renderKV(el.varRows, varRows, onVarRowsChange, { lockHost: true });
  if (el.formRows) renderKV(el.formRows, formRows, schedulePersist);
}

function onVarRowsChange() {
  flushActiveEnv();
  const hostURL = envConnectionURL({ variables: varRows });
  if (hostURL) applyConnectionURL(hostURL);
  else if (lastHostVarURL) clearConnectionURL();
  schedulePersist();
}

function currentVarMap() {
  return varsFromRows(varRows);
}

function resolvedOpts() {
  const vars = currentVarMap();
  const opts = currentOpts();
  opts.url = expandVars(opts.url, vars);
  opts.protocol = expandVars(opts.protocol, vars);
  opts.headers = expandMap(opts.headers, vars);
  return opts;
}

function resolvedBody() {
  return expandVars(currentBody(), currentVarMap());
}

function currentRecordedExchange() {
  const vars = currentVarMap();
  const opts = resolvedOpts();
  const reqBodyRaw = el.recReqBody?.value || '';
  const reqBody = expandVars(reqBodyRaw, vars);
  const resBody = expandVars(el.recResBody?.value || '', vars);
  const t = currentBodyType();
  const reqHeaders = mergeRequestHeaders(
    headerRows,
    {
      type: el.authType?.value || authState.type,
      token: el.authToken?.value || authState.token,
      user: el.authUser?.value || authState.user,
      pass: el.authPass?.value || authState.pass,
    },
    t,
    Boolean(reqBodyRaw) && t !== 'none',
  );
  return {
    method: opts.method,
    url: opts.url,
    status: '200 OK',
    statusCode: 200,
    timeMs: 0,
    bytes: resBody.length,
    truncated: false,
    reqHeaders: expandMap(reqHeaders, vars),
    resHeaders: {},
    reqBody,
    resBody,
    manual: true,
  };
}

function currentBody() {
  const t = currentBodyType();
  if (t === 'none') return '';
  if (t === 'form') return formEncode(formRows);
  return el.payload.value;
}

function loadAuthFromProfile(p) {
  authState = {
    type: p?.authType || 'none',
    token: p?.authToken || '',
    user: p?.authUser || '',
    pass: p?.authPass || '',
  };
  if (el.authType) el.authType.value = authState.type;
  if (el.authToken) el.authToken.value = authState.token;
  if (el.authUser) el.authUser.value = authState.user;
  if (el.authPass) el.authPass.value = authState.pass;
  syncAuthFields();
}

function loadHeadersFromProfile(p) {
  if (Array.isArray(p?.headerList) && p.headerList.length) {
    headerRows = cloneRows(p.headerList);
  } else {
    headerRows = rowsFromMap(p?.headers);
  }
}

function clipEnvName(name) {
  return clipText(name, 80);
}

function envNames() {
  return environments.map((e) => e.name);
}

function findEnv(name) {
  return environments.find((e) => e.name === name) || null;
}

function envRowsOf(env, fallbackURL) {
  return ensureHostVarRows(env?.variables, fallbackURL ?? currentURL());
}

function envsFromProfile(p) {
  const raw = Array.isArray(p?.environments) ? p.environments : [];
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    const name = clipEnvName(e?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, variables: ensureHostVarRows(e.variables, p?.url) });
  }
  if (!out.length) {
    const vars = Array.isArray(p?.variableList) && p.variableList.length
      ? p.variableList
      : [];
    out.push({ name: DEFAULT_ENV, variables: ensureHostVarRows(vars, p?.url) });
  }
  let active = clipEnvName(p?.activeEnv);
  if (!out.some((e) => e.name === active)) active = out[0].name;
  return { envs: out, active };
}

function flushActiveEnv() {
  const name = clipEnvName(activeEnv) || DEFAULT_ENV;
  activeEnv = name;
  let env = findEnv(name);
  if (!env) {
    env = { name, variables: [] };
    environments.push(env);
  }
  env.variables = ensureHostVarRows(varRows, currentURL());
}

function snapshotEnvironments() {
  flushActiveEnv();
  return environments.map((e) => ({
    name: e.name,
    variables: cloneRows(e.variables),
  }));
}

function renderEnvSelect() {
  const names = environments.map((e) => e.name).filter(Boolean);
  if (names.length && !names.includes(activeEnv)) activeEnv = names[0];
  renderBarEnvSelect();
  if (el.envEditName) el.envEditName.textContent = activeEnv || '';
}

function applyEnv(name) {
  flushActiveEnv();
  const env = findEnv(name);
  if (!env) return;
  activeEnv = env.name;
  varRows = envRowsOf(env);
  renderEnvSelect();
  renderRequestEditor();
  const hostURL = envConnectionURL(env);
  lastHostVarURL = hostURL;
  applyConnectionURL(hostURL);
}

async function onEnvSelectChange() {
  const name = el.barEnv?.value || '';
  if (!name) return;
  await selectEnvironment(name);
}

function uniqueEnvName(base) {
  const used = new Set(envNames());
  const stem = clipEnvName(base) || DEFAULT_ENV;
  if (!used.has(stem)) return stem;
  const short = clipText(stem, 76) || '环境';
  for (let n = 2; n < 200; n++) {
    const cand = clipText(`${short} ${n}`, 80);
    if (cand && !used.has(cand)) return cand;
  }
  return clipText(`${short} ${Date.now()}`, 80);
}

function envNameFromURL(url) {
  const host = hostFromURL(url) || profileNameFromURL(url) || String(url || '').trim();
  return uniqueEnvName(host || '环境');
}

function findEnvByHostURL(url) {
  const want = profileNameFromURL(url);
  if (!want) return null;
  return environments.find((e) => profileNameFromURL(envConnectionURL(e)) === want) || null;
}

function addEnvFromURL(url) {
  const hit = findEnvByHostURL(url);
  if (hit) {
    applyEnv(hit.name);
    return hit.name;
  }
  flushActiveEnv();
  const name = envNameFromURL(url);
  environments.push({ name, variables: ensureHostVarRows([], url) });
  applyEnv(name);
  return name;
}

async function addEnvironment() {
  if (!requireURL()) return;
  const raw = await askPrompt({
    title: '新建环境',
    placeholder: '例如 测试',
    hint: '同一套变量名，换一套值。发送时用当前环境替换 {{Token}}。',
    okText: '创建',
    validate: (s) => {
      const name = clipEnvName(s);
      if (!name) return '请输入环境名';
      if (envNames().includes(name)) return '已有同名环境';
      return '';
    },
  });
  if (raw == null) return;
  const name = clipEnvName(raw);
  if (!name) return;
  flushActiveEnv();
  environments.push({ name, variables: ensureHostVarRows([], currentURL()) });
  applyEnv(name);
  await persistProfile();
  openEnvEdit();
}

async function duplicateEnvironment() {
  if (!requireURL()) return;
  flushActiveEnv();
  const src = findEnv(activeEnv);
  const name = uniqueEnvName(`${src?.name || DEFAULT_ENV} 副本`);
  environments.push({ name, variables: ensureHostVarRows(src?.variables, currentURL()) });
  applyEnv(name);
  await persistProfile();
  openEnvEdit();
}

async function renameEnvironment() {
  const from = activeEnv;
  const raw = await askPrompt({
    title: '重命名环境',
    value: from,
    placeholder: '环境名',
    okText: '保存',
    validate: (s) => {
      const name = clipEnvName(s);
      if (!name) return '请输入环境名';
      if (name !== from && envNames().includes(name)) return '已有同名环境';
      return '';
    },
  });
  if (raw == null) return;
  const to = clipEnvName(raw);
  if (!to || to === from) return;
  const env = findEnv(from);
  if (env) env.name = to;
  if (activeEnv === from) activeEnv = to;
  renderEnvSelect();
  await persistProfile();
}

async function deleteEnvironment() {
  if (environments.length <= 1) {
    setDetailEmpty('至少保留一个环境');
    return;
  }
  const name = activeEnv;
  const ok = await askConfirm({
    title: '删除环境',
    message: `确定删除环境「${name}」？其中的变量会一起删掉。`,
    okText: '删除',
  });
  if (!ok) return;
  environments = environments.filter((e) => e.name !== name);
  const next = environments[0];
  activeEnv = next.name;
  varRows = envRowsOf(next);
  renderEnvSelect();
  renderRequestEditor();
  await persistProfile();
}

function envEditOpen() {
  return Boolean(el.envEdit && !el.envEdit.classList.contains('hidden'));
}

function closeEnvEdit() {
  el.envEdit?.classList.add('hidden');
}

function openEnvEdit() {
  if (!el.envEdit) return;
  if (el.envEditName) el.envEditName.textContent = activeEnv || '';
  el.envEdit.classList.remove('hidden');
  renderRequestEditor();
}

function toggleEnvEdit() {
  if (envEditOpen()) closeEnvEdit();
  else openEnvEdit();
}

function openEnvMenu() {
  if (!el.btnEnvMore) return;
  closeEnvEdit();
  openCatalogMenu(el.btnEnvMore, 'env', [
    { act: 'vars', label: '编辑变量' },
    { act: 'add', label: '新建环境' },
    { act: 'duplicate', label: '复制环境' },
    { act: 'rename', label: '重命名' },
    { act: 'delete', label: '删除环境', danger: true },
  ]);
  el.btnEnvMore.setAttribute('aria-expanded', groupMenuOpen() ? 'true' : 'false');
}

function loadVariablesFromProfile(p) {
  const { envs, active } = envsFromProfile(p);
  environments = envs;
  activeEnv = active;
  varRows = envRowsOf(findEnv(active));
  renderEnvSelect();
}

function loadBodyTypeFromProfile(p) {
  bodyType = p?.bodyType || 'json';
  const radio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`);
  if (radio) radio.checked = true;
  applyBodyTypeUI();
}

function loadBodyFromProfile(p) {
  const savedBody = p?.body || '';
  if (Array.isArray(p?.formList) && p.formList.length) {
    formRows = cloneRows(p.formList);
  } else if (p?.bodyType === 'form' && savedBody) {
    formRows = parseForm(savedBody);
  } else {
    formRows = [emptyRow()];
  }
  if (bodyType === 'form') {
    if (el.payload) el.payload.value = '';
  } else {
    if (el.payload) el.payload.value = savedBody;
  }
  lastSent = currentBody();
}

function hostFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    return new URL(withScheme).hostname || '';
  } catch {
    return '';
  }
}

function defaultPort(scheme) {
  if (scheme === 'http' || scheme === 'ws') return '80';
  if (scheme === 'https' || scheme === 'wss') return '443';
  return '';
}

function hostPortFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    const u = new URL(withScheme);
    const host = u.hostname || '';
    if (!host) return '';
    const port = u.port || '';
    const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!port || port === defaultPort(scheme)) return host;
    return u.host || `${host}:${port}`;
  } catch {
    return '';
  }
}

function profileNameFromURL(url) {
  const host = hostPortFromURL(url);
  if (!host) return '';
  const s = urlScheme(url);
  return `${ALL_SCHEMES.has(s) ? s : 'ws'}://${host}`;
}

function setFillButton(on) {
  if (!el.btnFill) return;
  el.btnFill.classList.toggle('hidden', !on);
  if (!on) {
    el.btnFill.textContent = '填回';
    clearTimeout(fillFlashTimer);
  }
}

function setCopyDetailButton(on) {
  if (!el.btnCopyDetail) return;
  el.btnCopyDetail.classList.toggle('hidden', !on);
  if (!on) el.btnCopyDetail.textContent = '复制';
}

function detailCopyText(m) {
  if (!m) return '';
  let raw = '';
  if (m.dir === 'out') {
    raw = m.exchange?.reqBody || m.ws?.out || m.text || m.pretty || '';
  } else if (m.dir === 'in') {
    raw = m.exchange?.resBody || m.ws?.in || m.pretty || m.text || '';
  } else {
    raw = m.pretty || m.text || '';
  }
  return prettyDocText(raw) || raw;
}

async function copySelectedDetail() {
  const m = store.get(selectedId);
  const ok = await copyText(detailCopyText(m));
  flashButton(el.btnCopyDetail, ok ? '已复制' : '复制失败');
}

function flashFilled() {
  if (!el.btnFill || el.btnFill.classList.contains('hidden')) return;
  el.btnFill.textContent = '已填回';
  clearTimeout(fillFlashTimer);
  fillFlashTimer = setTimeout(() => {
    if (el.btnFill) el.btnFill.textContent = '填回';
  }, 900);
}

function siblingFillSource(m) {
  if (!m) return null;
  const ids = [...el.list.children].map((n) => Number(n.dataset.id));
  const idx = ids.indexOf(m.id);
  if (idx < 0) return null;
  const at = (i) => store.get(ids[i]);
  const tagged = (n) => (n?.exchange || n?.ws ? n : null);
  if (m.dir === 'out') {
    for (let i = idx + 1; i < ids.length && i <= idx + 4; i++) {
      const n = at(i);
      if (!n || n.dir === 'sys') continue;
      return tagged(n);
    }
  } else if (m.dir === 'in') {
    for (let i = idx - 1; i >= 0 && i >= idx - 4; i--) {
      const n = at(i);
      if (!n || n.dir === 'sys') continue;
      return tagged(n);
    }
  } else {
    for (let i = idx - 1; i >= 0 && i >= idx - 4; i--) {
      const n = at(i);
      if (tagged(n)) return n;
      if (n && n.dir !== 'sys') break;
    }
    for (let i = idx + 1; i < ids.length && i <= idx + 4; i++) {
      const n = at(i);
      if (tagged(n)) return n;
      if (n && n.dir !== 'sys') break;
    }
  }
  return null;
}

function applyAuthState(auth) {
  authState = {
    type: auth?.type || 'none',
    token: auth?.token || '',
    user: auth?.user || '',
    pass: auth?.pass || '',
  };
  if (el.authType) el.authType.value = authState.type;
  if (el.authToken) el.authToken.value = authState.token;
  if (el.authUser) el.authUser.value = authState.user;
  if (el.authPass) el.authPass.value = authState.pass;
  syncAuthFields();
}

function setBodyType(type) {
  bodyType = type || 'json';
  const radio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`);
  if (radio) radio.checked = true;
  applyBodyTypeUI();
}

function fillRecordResponse(ex) {
  recordDraft.resBody = ex?.resBody || '';
  if (recordModalOpen()) {
    applyRecordDraftToForm();
  }
}

function selectProfileHost(url) {
  renderProjectSelect();
}

function applyHTTPExchange(ex) {
  if (!ex?.url) return false;
  const vars = currentVarMap();
  setURL(keepTemplate(currentURL(), ex.url, vars));
  const method = (ex.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  const auth = parseAuthorization(ex.reqHeaders);
  const curAuth = {
    type: el.authType?.value || authState.type,
    token: el.authToken?.value || authState.token,
    user: el.authUser?.value || authState.user,
    pass: el.authPass?.value || authState.pass,
  };
  if (curAuth.type === auth.type || auth.type === 'none') {
    auth.token = keepTemplate(curAuth.token, auth.token, vars);
    auth.user = keepTemplate(curAuth.user, auth.user, vars);
    auth.pass = keepTemplate(curAuth.pass, auth.pass, vars);
    if (auth.type === 'none' && (looksLikeVarRef(curAuth.token) || looksLikeVarRef(curAuth.user))) {
      auth.type = curAuth.type;
      auth.token = curAuth.token;
      auth.user = curAuth.user;
      auth.pass = curAuth.pass;
    }
  }
  applyAuthState(auth);
  const bodyTypeGuess = guessBodyType(ex.reqHeaders, ex.reqBody, ex.method);
  setBodyType(bodyTypeGuess);
  const incomingHeaders = editorHeadersFromRequest(ex.reqHeaders, {
    stripAuth: auth.type !== 'none',
    stripContentType: bodyTypeGuess !== 'none',
  });
  headerRows = keepTemplatesInRows(incomingHeaders, headerRows, vars);
  if (bodyTypeGuess === 'form') {
    formRows = keepTemplatesInRows(parseForm(ex.reqBody), formRows, vars);
    if (el.payload) el.payload.value = '';
  } else {
    formRows = [emptyRow()];
    if (el.payload) {
      el.payload.value = bodyTypeGuess === 'none'
        ? ''
        : keepTemplate(el.payload.value, ex.reqBody || '', vars);
    }
  }
  fillRecordResponse(ex);
  lastSent = currentBody();
  withoutSessionReset(() => applyTransportFromURL());
  syncParamsFromURL();
  renderRequestEditor();
  selectProfileHost(currentURL());
  setReqTab(String(ex.reqBody || '').trim() ? 'body' : 'params');
  return true;
}

function looksLikeVarRef(s) {
  return String(s || '').includes('{{');
}

function applyWSRecord(rec) {
  if (!rec) return false;
  const vars = currentVarMap();
  if (rec.url) setURL(keepTemplate(currentURL(), rec.url, vars));
  if (el.protocol) el.protocol.value = keepTemplate(el.protocol.value, rec.protocol || '', vars);
  if (el.payload) el.payload.value = keepTemplate(el.payload.value, rec.out || '', vars);
  recordDraft.in = keepTemplate(recordDraft.in, rec.in || '', vars);
  lastSent = rec.out || lastSent;
  if (recordModalOpen()) applyRecordDraftToForm();
  withoutSessionReset(() => applyTransportFromURL());
  selectProfileHost(rec.url);
  return Boolean(rec.url || rec.out || rec.in);
}

function fillPlainMessage(m) {
  if (!m || (m.dir !== 'out' && m.dir !== 'in')) return false;
  const hint = parseHTTPOutPreview(m.text);
  const url = historySessionURL || currentURL();
  const sch = urlScheme(hint?.url || url || currentURL());
  if (hint) {
    return applyHTTPExchange({
      method: hint.method,
      url: hint.url,
      reqHeaders: {},
      reqBody: '',
      resHeaders: {},
      resBody: '',
    });
  }
  if (HTTP_SCHEMES.has(sch) || isHTTPMode()) {
    if (historySessionURL) {
      setURL(historySessionURL);
      withoutSessionReset(() => applyTransportFromURL());
    }
    if (m.dir === 'out') {
      if (el.payload) el.payload.value = m.text || '';
      setBodyType(guessBodyType({}, m.text, el.method?.value));
      lastSent = currentBody();
      setReqTab('body');
    } else {
      recordDraft.resBody = m.text || '';
      if (recordModalOpen() && el.recResBody) el.recResBody.value = recordDraft.resBody;
    }
    return true;
  }
  if (historySessionURL) {
    setURL(historySessionURL);
    const proto = historySessionProtocol;
    if (el.protocol && proto && proto !== 'ws' && proto !== 'wss' && !HTTP_SCHEMES.has(proto.toLowerCase())) {
      el.protocol.value = proto;
    }
    withoutSessionReset(() => applyTransportFromURL());
  }
  if (m.dir === 'out' && el.payload) {
    el.payload.value = m.text || '';
    lastSent = el.payload.value;
  }
  if (m.dir === 'in') {
    recordDraft.in = m.text || '';
    if (recordModalOpen() && el.recIn) el.recIn.value = recordDraft.in;
  }
  return true;
}

function canFillFromMessage(m) {
  if (!m || m.dir !== 'out') return false;
  if (m.exchange || m.ws) return true;
  const near = siblingFillSource(m);
  if (near?.exchange || near?.ws) return true;
  return true;
}

function fillFromMessage(m) {
  if (!m) return false;
  if (m.exchange) return applyHTTPExchange(m.exchange);
  if (m.ws) return applyWSRecord(m.ws);
  const near = siblingFillSource(m);
  if (near?.exchange) return applyHTTPExchange(near.exchange);
  if (near?.ws) return applyWSRecord(near.ws);
  return fillPlainMessage(m);
}

/* —— profiles / project + env —— */
function readSel() {
  try {
    return JSON.parse(localStorage.getItem(SEL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function rememberSelection() {
  try {
    const prev = readSel();
    const project = projectNameOf(currentProfile());
    const envs = { ...(prev.envs || {}) };
    if (project && activeEnv) envs[project] = activeEnv;
    localStorage.setItem(SEL_KEY, JSON.stringify({
      project,
      env: activeEnv,
      host: currentProfile()?.name || '',
      envs,
    }));
  } catch {
    /* ignore */
  }
}

function lastEnvForProject(project) {
  const sel = readSel();
  const named = sel.envs?.[project];
  if (named) return named;
  if (sel.project === project && sel.env) return sel.env;
  return firstEnvOfProject(project);
}

function projectNameOf(p) {
  const named = String(p?.project || '').trim();
  if (named) return named;
  return String(p?.name || profileNameFromURL(p?.url) || '').trim();
}

function currentProjectName() {
  return projectNameOf(currentProfile()) || String(el.project?.value || '').trim();
}

function isExplicitProject(name) {
  const n = String(name || '').trim();
  return Boolean(n) && !n.includes('://');
}

function profilesInProject(project) {
  const name = String(project || '').trim();
  if (!name) return [];
  return (profiles || []).filter((p) => projectNameOf(p) === name);
}

function projectCatalogProfile(project) {
  const members = profilesInProject(project);
  if (!members.length) return null;
  if (!isExplicitProject(project) || members.length === 1) return members[0];
  let best = members[0];
  for (const p of members) {
    if ((p.requests || []).length > (best.requests || []).length) best = p;
  }
  return best;
}

function uniqueProjectNames() {
  const out = [];
  const seen = new Set();
  for (const p of profiles || []) {
    const name = projectNameOf(p);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function envConnectionURL(env) {
  const rows = Array.isArray(env?.variables) ? env.variables : [];
  for (const key of ['host', 'baseUrl', 'base_url', 'baseURL', 'url', 'Host']) {
    const row = rows.find((r) => String(r?.key || '').trim() === key && r?.enabled !== false && String(r?.value || '').trim());
    if (row) return String(row.value).trim();
  }
  return '';
}

function connectionURLReady(url) {
  const raw = String(url || '').trim();
  const name = profileNameFromURL(raw);
  if (!raw || !name) return false;
  const host = hostFromURL(raw);
  if (!host) return false;
  if (host === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (/^[a-f0-9:]+$/i.test(host) && host.includes(':')) return true;
  if (/[a-z]/i.test(host) && host.includes('.')) return true;
  return false;
}

function applyConnectionURL(url) {
  const raw = String(url || '').trim();
  if (!connectionURLReady(raw)) return false;
  const nextHost = profileNameFromURL(raw);
  lastHostVarURL = raw;
  if (currentURL() === raw && (profileNameFromURL(currentURL()) || activeProfileName) === nextHost) return false;
  setURL(raw, nextHost);
  applyTransportFromURL();
  syncParamsFromURL();
  return true;
}

function clearConnectionURL() {
  lastHostVarURL = '';
  if (!urlPrefix && !currentURL()) return false;
  setURL('');
  applyTransportFromURL();
  syncParamsFromURL();
  return true;
}

function findProjectEnvDef(project, envName) {
  const want = String(envName || '').trim();
  if (!want) return null;
  let fallback = null;
  for (const p of profilesInProject(project)) {
    const hit = (p.environments || []).find((e) => String(e?.name || '').trim() === want);
    if (!hit) continue;
    if (connectionURLReady(envConnectionURL(hit))) return hit;
    if (!fallback) fallback = hit;
  }
  return fallback || environments.find((e) => e.name === want) || null;
}

function projectEnvNames(project) {
  const names = [];
  const seen = new Set();
  const add = (raw) => {
    const n = String(raw || '').trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    names.push(n);
  };
  for (const p of profilesInProject(project)) {
    for (const e of p.environments || []) add(e?.name);
  }
  for (const e of environments) add(e?.name);
  return names;
}

function profileForProjectEnv(project, envName) {
  if (isExplicitProject(project)) {
    const owner = projectCatalogProfile(project);
    if (owner) return owner;
  }
  const members = profilesInProject(project);
  if (!members.length) return null;
  const envDef = findProjectEnvDef(project, envName);
  const hostURL = envConnectionURL(envDef);
  const hostName = profileNameFromURL(hostURL);
  if (hostName) {
    const hit = members.find((p) => p.name === hostName || profileNameFromURL(p.url) === hostName);
    if (hit) return hit;
  }
  const usable = members.filter((p) => {
    const e = (p.environments || []).find((x) => String(x?.name || '').trim() === envName);
    return connectionURLReady(envConnectionURL(e)) || connectionURLReady(p.url);
  });
  if (envName) {
    const byActive = usable.find((p) => String(p.activeEnv || '').trim() === envName);
    if (byActive) return byActive;
    if (usable.length) return usable[0];
  }
  return members[0];
}

function firstEnvOfProject(project) {
  const names = projectEnvNames(project);
  return names[0] || DEFAULT_ENV;
}

function fillSelect(node, items, selected) {
  if (!node) return;
  node.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    node.appendChild(opt);
  }
  if (selected && items.includes(selected)) node.value = selected;
  else if (items.length) node.value = items[0];
}

function renderBarEnvSelect() {
  if (!el.barEnv) return;
  const project = currentProjectName();
  const names = projectEnvNames(project);
  const cur = names.includes(activeEnv) ? activeEnv : (names[0] || '');
  fillSelect(el.barEnv, names, cur);
  el.barEnv.disabled = names.length === 0;
}

function renderProjectSelect() {
  const projects = uniqueProjectNames();
  const curProject = currentProjectName() || projects[0] || '';
  fillSelect(el.project, projects, curProject);
  if (el.project) el.project.disabled = projects.length === 0;
  renderBarEnvSelect();
  if (el.btnDelProfile) el.btnDelProfile.disabled = profiles.length === 0;
}

async function selectProject(name) {
  closeEnvEdit();
  const project = String(name || '').trim();
  if (!project || project === currentProjectName()) {
    renderProjectSelect();
    return;
  }
  const hint = currentRequestHint();
  const env = lastEnvForProject(project);
  const target = profileForProjectEnv(project, env);
  if (!target) {
    renderProjectSelect();
    return;
  }
  clearTimeout(persistTimer);
  await persistProfile();
  await applyProfile(target, hint);
  if (env && activeEnv !== env) applyEnv(env);
  if (hint) restoreRequestFromHint(hint);
  rememberSelection();
}

async function selectEnvironment(name) {
  const envName = String(name || '').trim();
  if (!envName) return;
  const project = currentProjectName();
  if (envName !== activeEnv) applyEnv(envName);
  const hostURL = envConnectionURL(findEnv(envName) || findProjectEnvDef(project, envName));
  if (hostURL) applyConnectionURL(hostURL);
  await persistProfile();
  await activateCurrent();
  await reloadLiveSession();
  rememberSelection();
  renderProjectSelect();
}

async function applyProfile(p, keepHint) {
  if (!p) return;
  if (!Array.isArray(p.modules)) p.modules = [];
  if (!Array.isArray(p.requests)) p.requests = [];
  if (!Array.isArray(p.environments)) p.environments = [];
  activeProfileName = p.name || profileNameFromURL(p.url || p.name) || '';
  setURL(p.url || p.name || '', p.name);
  el.protocol.value = p.protocol || '';
  const method = (p.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  el.reconnect.checked = p.reconnect !== false;
  if (el.followRedirects) el.followRedirects.checked = !p.noFollowRedirects;
  loadHeadersFromProfile(p);
  loadVariablesFromProfile(p);
  loadAuthFromProfile(p);
  loadBodyTypeFromProfile(p);
  loadBodyFromProfile(p);
  lastHostVarURL = envConnectionURL(findEnv(activeEnv));
  applyConnectionURL(lastHostVarURL);
  applyTransportFromURL();
  syncParamsFromURL();
  renderRequestEditor();
  renderProjectSelect();
  rememberSelection();
  if (keepHint) restoreRequestFromHint(keepHint);
  else {
    setActiveSavedId(isHTTPMode() ? matchSavedId() : matchSavedWSId());
    loadReqMeta(currentSavedRequest());
  }
  renderCatalog();
  await activateCurrent();
}

function clearEditor() {
  lastHostVarURL = '';
  setURL('');
  if (el.protocol) el.protocol.value = '';
  if (el.method) el.method.value = 'GET';
  el.reconnect.checked = true;
  if (el.payload) el.payload.value = '';
  if (el.payloadIn) el.payloadIn.value = '';
  paramRows = [emptyRow()];
  headerRows = [emptyRow()];
  varRows = ensureHostVarRows([]);
  environments = [{ name: DEFAULT_ENV, variables: ensureHostVarRows([]) }];
  activeEnv = DEFAULT_ENV;
  formRows = [emptyRow()];
  lastSent = '';
  resetRecordDraft();
  activeProfileName = '';
  if (el.followRedirects) el.followRedirects.checked = true;
  loadAuthFromProfile(null);
  loadBodyTypeFromProfile(null);
  applyTransportFromURL();
  applyWorkMode();
  renderEnvSelect();
  renderRequestEditor();
  setActiveSavedId('');
  loadReqMeta(null);
  renderCatalog();
}

let confirmResolver = null;
let promptResolver = null;
let promptValidate = null;
let activeSavedId = '';
const catalogOpenGroups = new Set();

function confirmModalOpen() {
  return Boolean(el.confirmModal && !el.confirmModal.classList.contains('hidden'));
}

function closeConfirmModal(ok) {
  if (!confirmModalOpen()) return;
  el.confirmModal.classList.add('hidden');
  el.confirmModal.setAttribute('aria-hidden', 'true');
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(Boolean(ok));
}

function promptModalOpen() {
  return Boolean(el.promptModal && !el.promptModal.classList.contains('hidden'));
}

function setPromptError(text) {
  if (el.promptErr) el.promptErr.textContent = text || '';
}

function closePromptModal(value) {
  if (!promptModalOpen()) return;
  el.promptModal.classList.add('hidden');
  el.promptModal.setAttribute('aria-hidden', 'true');
  setPromptError('');
  const resolve = promptResolver;
  promptResolver = null;
  promptValidate = null;
  if (resolve) resolve(value);
}

function submitPromptModal() {
  const raw = el.promptInput?.value || '';
  const err = promptValidate ? promptValidate(raw) : '';
  if (err) {
    setPromptError(err);
    el.promptInput?.focus();
    return;
  }
  closePromptModal(raw);
}

function askPrompt({ title, value, placeholder, hint, okText, validate }) {
  closePromptModal(null);
  if (el.promptTitle) el.promptTitle.textContent = title || '输入';
  if (el.promptHint) {
    el.promptHint.textContent = hint || '';
    el.promptHint.classList.toggle('hidden', !hint);
  }
  if (el.promptInput) {
    el.promptInput.value = value || '';
    el.promptInput.placeholder = placeholder || '';
  }
  if (el.btnPromptOk) el.btnPromptOk.textContent = okText || '确定';
  setPromptError('');
  promptValidate = validate || null;
  el.promptModal?.classList.remove('hidden');
  el.promptModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    el.promptInput?.focus();
    el.promptInput?.select();
  }, 30);
  return new Promise((resolve) => {
    promptResolver = resolve;
  });
}

function askConfirm({ title, message, okText }) {
  closeConfirmModal(false);
  if (el.confirmTitle) el.confirmTitle.textContent = title || '确认';
  if (el.confirmMsg) el.confirmMsg.textContent = message || '';
  if (el.btnConfirmOk) el.btnConfirmOk.textContent = okText || '确定';
  el.confirmModal?.classList.remove('hidden');
  el.confirmModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.btnConfirmCancel?.focus(), 30);
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

async function deleteCurrentProfile() {
  const name = currentProfile()?.name || profileNameFromURL(currentURL());
  if (!name) return;
  const project = currentProjectName();
  const ok = await askConfirm({
    title: '删除地址',
    message: `确定删除 ${name} ？此操作不可恢复。`,
    okText: '删除',
  });
  if (!ok) return;
  clearTimeout(persistTimer);
  try {
    await DeleteProfile(name);
  } catch (e) {
    setDetailEmpty('删除失败: ' + e);
    return;
  }
  if (activeProfileName === name) activeProfileName = '';
  profiles = profiles.filter((p) => p.name !== name);
  if (profiles.length) {
    const next = profilesInProject(project)[0] || profiles[0];
    await applyProfile(next);
  } else {
    renderProjectSelect();
    clearEditor();
    openUrlModal();
  }
}

async function loadProfiles() {
  profiles = (await GetProfiles()) || [];
  if (profiles.length) {
    const sel = readSel();
    let cur = null;
    if (sel.project) cur = profileForProjectEnv(sel.project, lastEnvForProject(sel.project));
    if (!cur && sel.host) {
      cur = profiles.find((p) => p.name === sel.host)
        || profiles.find((p) => (p.environments || []).some((e) => profileNameFromURL(envConnectionURL(e)) === sel.host))
        || null;
    }
    await applyProfile(cur || profiles[0]);
    const env = lastEnvForProject(currentProjectName());
    if (env && activeEnv !== env) applyEnv(env);
  } else {
    renderProjectSelect();
    clearEditor();
    openUrlModal();
  }
}

function urlModalOpen() {
  return Boolean(el.urlModal && !el.urlModal.classList.contains('hidden'));
}

function setUrlModalError(text) {
  if (el.urlModalErr) el.urlModalErr.textContent = text || '';
}

function normalizeDialURL(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (urlScheme(t)) return t;
  return `ws://${t.replace(/^\/\//, '')}`;
}

function validateNewURL(raw) {
  const t = String(raw || '').trim();
  if (!t) return '请输入 URL';
  const scheme = urlScheme(t);
  if (scheme && !ALL_SCHEMES.has(scheme)) return '仅支持 ws、wss、http、https';
  const url = normalizeDialURL(t);
  if (!hostFromURL(url) || !profileNameFromURL(url)) return '请输入有效的主机（IP 或域名）';
  return '';
}

function openUrlModal() {
  if (el.urlModalTitle) el.urlModalTitle.textContent = profiles.length ? '增加地址' : '输入地址';
  if (el.urlModalInput) el.urlModalInput.value = '';
  setUrlModalError('');
  el.urlModal?.classList.remove('hidden');
  el.urlModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.urlModalInput?.focus(), 30);
}

function closeUrlModal() {
  if (!urlModalOpen()) return;
  el.urlModal.classList.add('hidden');
  el.urlModal.setAttribute('aria-hidden', 'true');
  setUrlModalError('');
}

function urlModalHasDraft() {
  return Boolean(String(el.urlModalInput?.value || '').trim());
}

async function submitUrlModal() {
  const raw = el.urlModalInput?.value || '';
  const err = validateNewURL(raw);
  if (err) {
    setUrlModalError(err);
    el.urlModalInput?.focus();
    return;
  }
  const url = normalizeDialURL(raw);
  const name = profileNameFromURL(url);
  const existing = name ? profiles.find((p) => p.name === name) : null;
  const inheritProject = isExplicitProject(currentProjectName()) ? currentProjectName() : '';
  closeUrlModal();
  if (inheritProject && !existing) {
    const owner = projectCatalogProfile(inheritProject) || currentProfile();
    if (owner) {
      if (currentProfile()?.name !== owner.name) {
        await persistProfile();
        await applyProfile(owner);
      }
      addEnvFromURL(url);
      await persistProfile();
      return;
    }
  }
  const prevName = profileNameFromURL(currentURL());
  if (prevName && prevName !== name) {
    await persistProfile();
  }
  if (existing) {
    await applyProfile({ ...existing, url });
    await persistProfile();
    return;
  }
  clearTimeout(persistTimer);
  clearEditor();
  setURL(url, name);
  ensureCurrentProfile();
  applyTransportFromURL();
  syncParamsFromURL();
  renderRequestEditor();
  await persistProfile();
  await activateCurrent();
}

function currentHeaders() {
  const body = currentBody();
  const t = currentBodyType();
  return mergeRequestHeaders(headerRows, {
    type: el.authType?.value || authState.type,
    token: el.authToken?.value || authState.token,
    user: el.authUser?.value || authState.user,
    pass: el.authPass?.value || authState.pass,
  }, t, Boolean(body) && t !== 'none');
}

function currentOpts() {
  return {
    url: currentURL(),
    protocol: el.protocol.value.trim(),
    method: el.method?.value || 'GET',
    headers: currentHeaders(),
    reconnect: el.reconnect.checked,
    pingSec: 20,
    noFollowRedirects: el.followRedirects ? !el.followRedirects.checked : false,
  };
}

function curlFollowRedirects() {
  return el.followRedirects ? el.followRedirects.checked : true;
}

function currentCurlSpec() {
  const opts = resolvedOpts();
  return {
    method: opts.method,
    url: opts.url,
    headers: opts.headers,
    body: isHTTPMode() ? resolvedBody() : '',
    followRedirects: curlFollowRedirects(),
  };
}

function exchangeCurlSpec(ex) {
  return {
    method: ex.method,
    url: ex.url,
    headers: ex.reqHeaders || {},
    body: ex.reqBody || '',
    followRedirects: curlFollowRedirects(),
  };
}

async function copyText(text) {
  const s = String(text || '');
  if (!s) return false;
  try {
    if (await ClipboardSetText(s)) return true;
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch (_) {}
  return false;
}

function flashButton(btn, label, ms = 900) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = label;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    btn.textContent = prev;
  }, ms);
}

function catalogTitleText() {
  if (moduleRun) return `跑 ${moduleRun.index}/${moduleRun.total}`;
  const kw = catalogFilterKeyword();
  const n = kw ? catalogSearchHits(kw).length : catalogRequests().length;
  return n ? `接口 ${n}` : '接口';
}

function refreshCatalogTitle() {
  if (el.catalogTitle) el.catalogTitle.textContent = catalogTitleText();
}

function flashCatalogTitle(text, ms = 1200) {
  if (!el.catalogTitle) return;
  el.catalogTitle.textContent = text;
  clearTimeout(el.catalogTitle._flashTimer);
  el.catalogTitle._flashTimer = setTimeout(() => {
    if (!moduleRun) refreshCatalogTitle();
  }, ms);
}

async function copyCurl(fromDetail) {
  const m = fromDetail ? store.get(selectedId) : null;
  const spec = m?.exchange ? exchangeCurlSpec(m.exchange) : currentCurlSpec();
  if (!spec.url) {
    setDetailEmpty('请先填写 URL');
    return;
  }
  const ok = await copyText(toCurl(spec));
  const btn = fromDetail ? el.btnCurlDetail : el.btnCurl;
  flashButton(btn, ok ? '已复制' : '复制失败');
}

function currentProfile() {
  const name = activeProfileName || profileNameFromURL(currentURL()) || '';
  if (!name) return null;
  return profiles.find((p) => p.name === name) || null;
}

function currentProfileRequests() {
  const p = currentProfile();
  return Array.isArray(p?.requests) ? p.requests : [];
}

function isHTTPSaved(r) {
  if (!r) return false;
  if (r.kind === 'ws') return false;
  if (r.kind === 'http') return true;
  return HTTP_SCHEMES.has(urlScheme(r.url));
}

function isWSSaved(r) {
  if (!r) return false;
  if (r.kind === 'http') return false;
  if (r.kind === 'ws') return true;
  return !HTTP_SCHEMES.has(urlScheme(r.url));
}

function currentHTTPRequests() {
  return currentProfileRequests().filter(isHTTPSaved);
}

function currentWSMessages() {
  return currentProfileRequests().filter(isWSSaved);
}

function scalarMessageName(v) {
  if (v == null) return '';
  const t = typeof v;
  if (t === 'string') return v.trim();
  if (t === 'number' && Number.isFinite(v)) return String(v);
  if (t === 'boolean') return String(v);
  return '';
}

function firstNamedField(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  for (const k of keys) {
    const name = scalarMessageName(obj[k]);
    if (name) return name;
  }
  return '';
}

function wsMessageKey(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const top = firstNamedField(v, ['cmd', 'type', 'action', 'op', 'event', 'venus', 'janus', 'request']);
      const nested = firstNamedField(v.body, ['request', 'cmd', 'type', 'action', 'op', 'event']);
      if (top && nested && top !== nested) return `${top}/${nested}`;
      if (nested) return nested;
      if (top) return top;
    }
  } catch (_) {}
  return raw.replace(/\s+/g, '');
}

function wsShortName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 40) return false;
  if (/^[{[\/]/.test(n)) return false;
  if (/\s/.test(n)) return false;
  return true;
}

function oneLinePreview(text, max = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function wsMessageStoreName(key, text) {
  if (wsShortName(key)) return key.slice(0, 80);
  const preview = oneLinePreview(text, 80);
  return preview.replace(/…$/, '') || key.slice(0, 80);
}

function wsCmdLabel(r) {
  const key = wsMessageKey(r?.body || '');
  return wsShortName(key) ? key : '';
}

function looksLikeHTTPKey(name) {
  return /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S/i.test(String(name || ''));
}

function requestDisplayTitle(r) {
  const t = String(r?.title || '').trim();
  if (t) return t;
  const n = String(r?.name || '').trim();
  if (!n) return '';
  if (isHTTPSaved(r) && looksLikeHTTPKey(n)) return '';
  if (isWSSaved(r)) {
    if (!wsShortName(n)) return '';
    if (n === wsMessageKey(r.body || '')) return '';
  }
  return n;
}

function requestDescription(r) {
  return String(r?.description || '').trim();
}

function currentReqTitle() {
  return String(el.reqTitle?.value || '').trim();
}

function currentReqDesc() {
  return String(el.reqDesc?.value || '').trim();
}

function currentReqModule() {
  return String(el.reqModule?.value || '').trim();
}

function loadReqMeta(req) {
  if (el.reqTitle) el.reqTitle.value = req?.title || '';
  if (el.reqModule) el.reqModule.value = req?.module || '';
  if (el.reqDesc) el.reqDesc.value = req?.description || '';
}

function flushReqMeta() {
  const req = currentSavedRequest();
  if (!req) return;
  req.title = currentReqTitle();
  req.module = currentReqModule();
  req.description = currentReqDesc();
}

function rematchSavedFromEditor() {
  if (activeSavedId && currentSavedRequest()) return;
  const id = isHTTPMode() ? matchSavedId() : matchSavedWSId();
  if (id === activeSavedId) return;
  flushReqMeta();
  activeSavedId = id || '';
  loadReqMeta(currentSavedRequest());
  renderCatalog();
}

function onReqMetaInput() {
  if (isDocMode() && !docEditing()) return;
  const req = currentSavedRequest();
  if (req) {
    req.title = currentReqTitle();
    req.module = currentReqModule();
    req.description = currentReqDesc();
    renderCatalog();
    if (isDocMode()) renderDocPane();
  }
  schedulePersist();
}

function catalogOpen() {
  return localStorage.getItem(CATALOG_KEY) !== 'off';
}

function setCatalogOpen(on) {
  localStorage.setItem(CATALOG_KEY, on ? 'on' : 'off');
  el.app?.classList.toggle('catalog-off', !on);
  if (el.btnCatalogToggle) {
    el.btnCatalogToggle.title = on ? '收起接口目录' : '展开接口目录';
    el.btnCatalogToggle.setAttribute('aria-label', el.btnCatalogToggle.title);
  }
}

function catalogRequests() {
  return isHTTPMode() ? currentHTTPRequests() : currentWSMessages();
}

function requestModuleName(r) {
  return String(r?.module || '').trim();
}

function clipText(s, max) {
  const t = String(s || '').trim();
  const chars = Array.from(t);
  if (max > 0 && chars.length > max) return chars.slice(0, max).join('');
  return t;
}

function profileModules() {
  const p = currentProfile();
  return Array.isArray(p?.modules) ? p.modules.map((m) => String(m || '').trim()).filter(Boolean) : [];
}

function currentModules() {
  const names = [];
  const seen = new Set();
  for (const raw of profileModules()) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    names.push(raw);
  }
  for (const r of currentProfileRequests()) {
    const m = requestModuleName(r);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    names.push(m);
  }
  return names;
}

function ensureCurrentProfile() {
  let p = currentProfile();
  if (p) {
    if (!Array.isArray(p.requests)) p.requests = [];
    if (!Array.isArray(p.modules)) p.modules = [];
    return p;
  }
  const host = profileNameFromURL(currentURL());
  if (!host) return null;
  p = { name: host, url: currentURL(), project: '', requests: [], modules: [], environments: [], activeEnv: '' };
  profiles.push(p);
  profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!Array.isArray(p.requests)) p.requests = [];
  if (!Array.isArray(p.modules)) p.modules = [];
  return p;
}

function rememberModule(name) {
  name = clipText(name, 80);
  const p = ensureCurrentProfile();
  if (!p || !name) return '';
  if (!p.modules.includes(name)) p.modules = [...p.modules, name];
  return name;
}

function renameModule(from, to) {
  from = clipText(from, 80);
  to = clipText(to, 80);
  if (!from || !to || from === to) return false;
  const p = ensureCurrentProfile();
  if (!p) return false;
  for (const r of p.requests) {
    if (requestModuleName(r) === from) r.module = to;
  }
  const next = [];
  const seen = new Set();
  for (const raw of [...p.modules, to]) {
    const name = raw === from ? to : raw;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    next.push(name);
  }
  p.modules = next;
  if (el.reqModule && currentReqModule() === from) el.reqModule.value = to;
  const req = currentSavedRequest();
  if (req && requestModuleName(req) === from) req.module = to;
  return true;
}

function clearModule(name) {
  name = clipText(name, 80);
  const p = currentProfile();
  if (!p || !name) return;
  for (const r of p.requests || []) {
    if (requestModuleName(r) === name) r.module = '';
  }
  p.modules = (p.modules || []).filter((m) => m !== name);
  if (el.reqModule && currentReqModule() === name) el.reqModule.value = '';
  const req = currentSavedRequest();
  if (req && requestModuleName(req) === name) req.module = '';
}

let moduleFilterArmed = false;

function moduleMenuOpen() {
  return Boolean(el.moduleMenu && !el.moduleMenu.classList.contains('hidden'));
}

function closeModuleMenu() {
  el.moduleMenu?.classList.add('hidden');
  el.moduleMenu?.setAttribute('aria-hidden', 'true');
  el.reqModule?.setAttribute('aria-expanded', 'false');
  el.moduleWrap?.classList.remove('open');
}

function renderModuleMenu() {
  if (!el.moduleMenu) return;
  const all = currentModules();
  const cur = currentReqModule();
  const kw = moduleFilterArmed ? cur.toLowerCase() : '';
  const shown = kw ? all.filter((name) => name.toLowerCase().includes(kw)) : all;
  el.moduleMenu.innerHTML = '';
  const items = [{ name: '', label: '未分组' }, ...shown.map((name) => ({ name, label: name }))];
  if (kw && cur && !all.some((name) => name.toLowerCase() === kw)) {
    items.push({ name: cur, label: `新建「${cur}」` });
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'saved-item' + (item.name === cur ? ' on' : '');
    row.dataset.module = item.name;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', item.name === cur ? 'true' : 'false');
    const main = document.createElement('div');
    main.className = 'saved-item-main';
    const line = document.createElement('div');
    line.className = 'saved-item-line';
    const head = document.createElement('span');
    head.className = item.name ? 'saved-item-title' : 'saved-item-sub';
    head.textContent = item.label;
    line.appendChild(head);
    main.appendChild(line);
    row.appendChild(main);
    el.moduleMenu.appendChild(row);
  }
}

function openModuleMenu() {
  if (!el.moduleMenu || historyMode) return;
  if (isDocMode() && !docEditing()) return;
  if (confirmModalOpen() || urlModalOpen() || recordModalOpen() || promptModalOpen()) return;
  renderModuleMenu();
  el.moduleMenu.classList.remove('hidden');
  el.moduleMenu.setAttribute('aria-hidden', 'false');
  el.reqModule?.setAttribute('aria-expanded', 'true');
  el.moduleWrap?.classList.add('open');
}

function pickModule(name) {
  if (el.reqModule) el.reqModule.value = name || '';
  onReqMetaInput();
  closeModuleMenu();
}

function onModuleMenuClick(e) {
  const item = e.target?.closest?.('.saved-item');
  if (!item || !el.moduleMenu?.contains(item)) return;
  pickModule(item.dataset.module || '');
}

function fillModuleList() {
  if (moduleMenuOpen()) renderModuleMenu();
}

function catalogFilterKeyword() {
  return String(el.catalogFilter?.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function catalogMatches(r, kw, host) {
  if (!kw) return true;
  return requestSearchHaystack(r, host).includes(kw);
}

function requestSearchHaystack(r, host) {
  const base = isHTTPSaved(r) ? savedRequestHaystack(r) : savedWSHaystack(r);
  return `${base} ${host || ''}`.replace(/\s+/g, ' ').trim();
}

function catalogHostName(p) {
  return String(p?.name || profileNameFromURL(p?.url) || '').trim();
}

function currentCatalogHost() {
  return profileNameFromURL(currentURL()) || activeProfileName || currentProfile()?.name || '';
}

function catalogSearchHits(kw) {
  const hits = [];
  for (const p of profiles || []) {
    const host = catalogHostName(p);
    if (!host) continue;
    for (const r of p.requests || []) {
      if (!r?.id) continue;
      if (kw && !catalogMatches(r, kw, host)) continue;
      hits.push({ host, req: r });
    }
  }
  return hits;
}

function groupCatalogHits(hits) {
  const map = new Map();
  for (const hit of hits) {
    if (!map.has(hit.host)) map.set(hit.host, []);
    map.get(hit.host).push(hit.req);
  }
  return [...map.entries()].map(([host, items]) => ({ host, items }));
}

function catalogItemLabel(r) {
  const title = requestDisplayTitle(r);
  if (title) return title;
  if (isHTTPSaved(r)) return requestItemPath(r) || r?.name || '未命名接口';
  return wsCmdLabel(r) || '未命名接口';
}

function groupCatalogRequests(reqs) {
  const map = new Map();
  for (const name of currentModules()) map.set(name, []);
  map.set('', []);
  for (const r of reqs) {
    const key = requestModuleName(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.keys()].map((module) => ({ module, items: map.get(module) }));
}

function appendCatalogAddModule() {
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'catalog-add-module';
  add.textContent = '+ 新建模块';
  el.catalogList.appendChild(add);
}

function catalogIcon(cls, svgInner) {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${svgInner}</svg>`;
  return span;
}

const ICO_FOLDER = '<path d="M2.4 4.5c0-.6.5-1.1 1.1-1.1h2.15l1.2 1.35h5.65c.6 0 1.1.5 1.1 1.1v6.15c0 .6-.5 1.1-1.1 1.1H3.5c-.6 0-1.1-.5-1.1-1.1V4.5z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>';
const ICO_HOST = '<path d="M3 4.2h10v6.3H3zM5.6 12.4h4.8M8 10.5v1.9" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>';
const ICO_API = '<path d="M4.4 2.6h5L11.6 5v8.4H4.4zM9.4 2.6V5h2.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>';

function makeCatalogGroupHead(group, kw) {
  const head = document.createElement('div');
  head.className = 'catalog-group';
  head.dataset.module = group.module;
  head.dataset.closeKey = group.module || '';
  if (!kw && group.module) head.draggable = true;
  const closed = !kw && !catalogOpenGroups.has(group.module || '');
  const caret = document.createElement('span');
  caret.className = 'catalog-caret';
  caret.textContent = closed ? '▸' : '▾';
  const name = document.createElement('span');
  name.className = 'catalog-group-name';
  name.textContent = group.module || '未分组';
  const count = document.createElement('span');
  count.className = 'catalog-group-count';
  count.textContent = String(group.items.length);
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'catalog-more catalog-group-more';
  more.title = '模块菜单';
  more.setAttribute('aria-label', group.module ? `「${group.module}」菜单` : '未分组菜单');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.draggable = false;
  more.textContent = '⋯';
  head.appendChild(caret);
  head.appendChild(catalogIcon('catalog-kind catalog-kind-folder', ICO_FOLDER));
  head.appendChild(name);
  head.appendChild(count);
  head.appendChild(more);
  return { head, closed };
}

function makeCatalogHostHead(group, currentHost) {
  const head = document.createElement('div');
  head.className = 'catalog-group host' + (group.host === currentHost ? ' current' : '');
  head.dataset.host = group.host;
  head.dataset.closeKey = `host:${group.host}`;
  const closed = false;
  const caret = document.createElement('span');
  caret.className = 'catalog-caret';
  caret.textContent = closed ? '▸' : '▾';
  const name = document.createElement('span');
  name.className = 'catalog-group-name';
  name.textContent = group.host;
  name.title = group.host;
  const count = document.createElement('span');
  count.className = 'catalog-group-count';
  count.textContent = String(group.items.length);
  head.appendChild(caret);
  head.appendChild(catalogIcon('catalog-kind catalog-kind-host', ICO_HOST));
  head.appendChild(name);
  head.appendChild(count);
  return { head, closed };
}

let catalogMenuKey = '';
let catalogDrag = null;
let catalogDidDrag = false;

function groupMenuOpen() {
  return Boolean(el.groupMenu && !el.groupMenu.classList.contains('hidden'));
}

function closeGroupMenu() {
  el.groupMenu?.classList.add('hidden');
  el.groupMenu?.setAttribute('aria-hidden', 'true');
  catalogMenuKey = '';
  for (const btn of el.catalogList?.querySelectorAll('.catalog-more[aria-expanded="true"]') || []) {
    btn.setAttribute('aria-expanded', 'false');
  }
  el.btnEnvMore?.setAttribute('aria-expanded', 'false');
}

function appendGroupMenuItem(act, label, danger) {
  const row = document.createElement('div');
  row.className = 'saved-item group-menu-item' + (danger ? ' danger' : '');
  row.dataset.act = act;
  row.setAttribute('role', 'menuitem');
  const main = document.createElement('div');
  main.className = 'saved-item-main';
  const line = document.createElement('div');
  line.className = 'saved-item-line';
  const head = document.createElement('span');
  head.className = 'saved-item-title';
  head.textContent = label;
  line.appendChild(head);
  main.appendChild(line);
  row.appendChild(main);
  el.groupMenu.appendChild(row);
}

function placeGroupMenu(anchor) {
  const menu = el.groupMenu;
  if (!menu || !anchor) return;
  const pad = 8;
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth || 140;
  const mh = menu.offsetHeight || 88;
  let top = r.bottom + 4;
  let left = r.right - mw;
  if (left < pad) left = pad;
  if (left + mw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - mw);
  if (top + mh > window.innerHeight - pad) top = Math.max(pad, r.top - 4 - mh);
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

function openCatalogMenu(anchor, key, items) {
  hideCatalogTip();
  if (!el.groupMenu || !anchor) return;
  if (groupMenuOpen() && catalogMenuKey === key) {
    closeGroupMenu();
    return;
  }
  catalogMenuKey = key;
  el.groupMenu.innerHTML = '';
  for (const item of items) appendGroupMenuItem(item.act, item.label, item.danger);
  el.groupMenu.classList.remove('hidden');
  el.groupMenu.setAttribute('aria-hidden', 'false');
  for (const btn of el.catalogList?.querySelectorAll('.catalog-more') || []) {
    btn.setAttribute('aria-expanded', btn === anchor ? 'true' : 'false');
  }
  placeGroupMenu(anchor);
}

function openGroupMenu(anchor, module) {
  const items = [{ act: 'add', label: '新建接口' }];
  if (isHTTPMode()) items.push({ act: 'run', label: '跑一遍' });
  if (module) {
    items.push({ act: 'rename', label: '重命名' });
    items.push({ act: 'delete', label: '删除模块', danger: true });
  }
  openCatalogMenu(anchor, `group\t${module}`, items);
}

function openItemMenu(anchor, id) {
  if (!id) return;
  openCatalogMenu(anchor, `item\t${id}`, [
    { act: 'duplicate', label: '复制' },
    { act: 'delete-item', label: '删除', danger: true },
  ]);
}

function onGroupMenuClick(e) {
  const item = e.target?.closest?.('[data-act]');
  if (!item || !el.groupMenu?.contains(item)) return;
  const act = item.dataset.act;
  const key = catalogMenuKey;
  closeGroupMenu();
  if (key === 'env') {
    if (act === 'vars') openEnvEdit();
    else if (act === 'add') addEnvironment();
    else if (act === 'duplicate') duplicateEnvironment();
    else if (act === 'rename') renameEnvironment();
    else if (act === 'delete') deleteEnvironment();
    return;
  }
  if (key === 'export') {
    if (act === 'export-one') exportCatalog();
    else if (act === 'export-all') exportAllCatalogs();
    return;
  }
  if (key.startsWith('item\t')) {
    const id = key.slice(5);
    if (act === 'duplicate') duplicateCatalogRequest(id);
    else if (act === 'delete-item') deleteNamedRequest(id);
    return;
  }
  const module = key.startsWith('group\t') ? key.slice(6) : '';
  if (act === 'add') addCatalogRequest(module);
  else if (act === 'run') runCatalogModule(module);
  else if (act === 'rename' && module) renameCatalogModule(module);
  else if (act === 'delete' && module) deleteCatalogModule(module);
}

function renderCatalog() {
  hideCatalogTip();
  closeGroupMenu();
  fillModuleList();
  if (!el.catalogList) return;
  const kw = catalogFilterKeyword();
  if (kw) {
    renderCatalogSearch(kw);
    return;
  }
  const all = catalogRequests();
  refreshCatalogTitle();
  el.catalogList.innerHTML = '';
  if (!currentProfile() && !profileNameFromURL(currentURL())) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = '先增加地址，再点 + 新建接口。';
    el.catalogList.appendChild(empty);
    return;
  }
  const groups = groupCatalogRequests(all);
  if (!all.length && !groups.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = isHTTPMode()
      ? '点 + 新建接口，或发送后自动收录。可按模块分组。'
      : '点 + 新建发送，或发送后按 cmd 收录。可按模块分组。';
    el.catalogList.appendChild(empty);
    appendCatalogAddModule();
    return;
  }
  for (const group of groups) {
    const wrap = document.createElement('div');
    wrap.className = 'catalog-group-wrap';
    wrap.dataset.module = group.module;
    const { head, closed } = makeCatalogGroupHead(group, '');
    wrap.appendChild(head);
    const box = document.createElement('div');
    box.className = 'catalog-items' + (closed ? ' hidden' : '');
    for (const r of group.items) {
      box.appendChild(makeCatalogItem(r, '', currentCatalogHost()));
    }
    wrap.appendChild(box);
    el.catalogList.appendChild(wrap);
  }
  appendCatalogAddModule();
}

function renderCatalogSearch(kw) {
  const hits = catalogSearchHits(kw);
  refreshCatalogTitle();
  el.catalogList.innerHTML = '';
  if (!hits.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = `没有匹配 “${el.catalogFilter?.value?.trim() || kw}”`;
    el.catalogList.appendChild(empty);
    return;
  }
  const current = currentCatalogHost();
  for (const group of groupCatalogHits(hits)) {
    const wrap = document.createElement('div');
    wrap.className = 'catalog-group-wrap';
    wrap.dataset.host = group.host;
    const { head, closed } = makeCatalogHostHead(group, current);
    wrap.appendChild(head);
    const box = document.createElement('div');
    box.className = 'catalog-items' + (closed ? ' hidden' : '');
    for (const r of group.items) {
      box.appendChild(makeCatalogItem(r, kw, group.host));
    }
    wrap.appendChild(box);
    el.catalogList.appendChild(wrap);
  }
}

function makeCatalogItem(r, kw, host) {
  const item = document.createElement('div');
  const here = !host || host === currentCatalogHost();
  item.className = 'catalog-item'
    + (here && r.id === activeSavedId ? ' on' : '')
    + (moduleRun?.id === r.id ? ' running' : '');
  item.dataset.id = r.id;
  if (host) item.dataset.host = host;
  if (!kw && r.id) item.draggable = true;
  item.appendChild(catalogIcon('catalog-kind catalog-kind-api', ICO_API));
  const main = document.createElement('div');
  main.className = 'catalog-item-main';
  const line = document.createElement('div');
  line.className = 'catalog-item-line';
  const head = document.createElement('span');
  head.className = 'catalog-item-title';
  fillHighlighted(head, catalogItemLabel(r), kw);
  line.appendChild(head);
  main.appendChild(line);
  item.appendChild(main);
  catalogTipStore.set(item, { title: catalogItemLabel(r), html: catalogTipHTML(r, host) });
  if (!kw) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'catalog-more catalog-item-more';
    more.title = '接口菜单';
    more.setAttribute('aria-label', `${catalogItemLabel(r)} 菜单`);
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.draggable = false;
    more.textContent = '⋯';
    item.appendChild(more);
  }
  return item;
}

const catalogTipStore = new WeakMap();
let catalogTipItem = null;

function catalogRequestBody(r) {
  if (!r) return '';
  if (isHTTPSaved(r)) {
    if (r.bodyType === 'none') return '';
    if (r.bodyType === 'form') return formEncode(r.formList || []);
    return r.body || '';
  }
  return r.body || '';
}

function catalogTipHTML(r, host) {
  const http = isHTTPSaved(r);
  const title = catalogItemLabel(r);
  const method = http ? String(r.method || 'GET').toUpperCase() : 'WS';
  const path = http ? (requestItemPath(r) || '/') : (wsCmdLabel(r) || '');
  const url = String(r.url || '').trim();
  const desc = requestDescription(r);
  const hid = String(host || '').trim();
  const body = catalogRequestBody(r);
  const parts = [
    `<div class="catalog-tip-title">${escapeHtml(title)}</div>`,
    `<div class="catalog-tip-sum">` +
      `<span class="saved-item-method ${http ? method.toLowerCase() : 'ws'}">${escapeHtml(method)}</span>` +
      (path ? `<span class="catalog-tip-path">${escapeHtml(path)}</span>` : '') +
    `</div>`,
  ];
  if (hid && hid !== currentCatalogHost()) {
    parts.push(`<div class="catalog-tip-meta">${escapeHtml(hid)}</div>`);
  }
  if (url) parts.push(`<div class="catalog-tip-meta">${escapeHtml(url)}</div>`);
  if (desc) parts.push(`<div class="catalog-tip-desc">${escapeHtml(desc)}</div>`);
  if (http) {
    const headers = renderDocTable('请求头', r.headerList);
    const params = renderDocTable('Query', parseQuery(r.url || ''));
    const auth = renderDocAuth(r);
    if (params) parts.push(params);
    if (headers) parts.push(headers);
    if (auth) parts.push(auth);
  }
  parts.push(`<div class="catalog-tip-sec">请求</div>`);
  if (http && r.bodyType === 'form') {
    parts.push(renderDocTable('表单', r.formList) || '<div class="doc-muted">无</div>');
  } else {
    parts.push(renderDocCode(body));
  }
  return parts.join('');
}

function ensureCatalogTip() {
  if (el.catalogTip && el.catalogTip.isConnected) return el.catalogTip;
  let tip = document.getElementById('catalogTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'catalogTip';
    tip.className = 'catalog-tip';
    tip.hidden = true;
    (el.app || document.body).appendChild(tip);
  }
  el.catalogTip = tip;
  return tip;
}

function hideCatalogTip() {
  catalogTipItem = null;
  const tip = el.catalogTip || document.getElementById('catalogTip');
  if (!tip) return;
  tip.hidden = true;
  tip.classList.remove('is-on', 'title-only');
  tip.innerHTML = '';
}

function catalogTitleOverflow(item) {
  const title = item?.querySelector?.('.catalog-item-title');
  if (!title) return false;
  return title.scrollWidth - title.clientWidth > 1;
}

function placeCatalogTip(item) {
  const tip = ensureCatalogTip();
  if (tip.classList.contains('title-only') && item) {
    const r = item.getBoundingClientRect();
    const pane = el.catalogPane?.getBoundingClientRect();
    const left = Math.round((pane?.right || r.right) + 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.round(r.top)}px`;
    tip.style.width = 'auto';
    tip.style.maxWidth = `${Math.max(120, Math.min(420, window.innerWidth - left - 12))}px`;
    tip.style.maxHeight = 'none';
    const th = tip.offsetHeight || 0;
    if (r.top + th > window.innerHeight - 8) {
      tip.style.top = `${Math.max(8, window.innerHeight - th - 8)}px`;
    }
    return;
  }
  const pane = el.catalogPane?.getBoundingClientRect();
  const bar = document.querySelector('.bar')?.getBoundingClientRect();
  const left = Math.round((pane?.right || 220) + 8);
  const top = Math.round((bar?.bottom || 48) + 8);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.width = `${Math.max(280, Math.min(520, window.innerWidth - left - 16))}px`;
  tip.style.maxHeight = `${Math.max(160, window.innerHeight - top - 16)}px`;
}

function fillCatalogTip(item) {
  if (!item || catalogDrag) return;
  const rec = catalogTipStore.get(item);
  const title = rec?.title || item.querySelector('.catalog-item-title')?.textContent || '';
  const html = typeof rec === 'string' ? rec : rec?.html;
  const tip = ensureCatalogTip();
  if (catalogHoverMode() === 'title') {
    if (!catalogTitleOverflow(item) || !title) {
      hideCatalogTip();
      return;
    }
    catalogTipItem = item;
    tip.innerHTML = `<div class="catalog-tip-title">${escapeHtml(title)}</div>`;
    tip.classList.add('is-on', 'title-only');
    tip.hidden = false;
    placeCatalogTip(item);
    return;
  }
  if (!html) return;
  catalogTipItem = item;
  tip.innerHTML = html;
  tip.classList.remove('title-only');
  tip.classList.add('is-on');
  tip.hidden = false;
  placeCatalogTip(item);
}

function onCatalogHover(e) {
  const item = e.target?.closest?.('.catalog-item');
  if (!item || !el.catalogList?.contains(item) || e.target.closest('.catalog-more')) {
    if (!e.target?.closest?.('.catalog-item')) hideCatalogTip();
    return;
  }
  if (item !== catalogTipItem) fillCatalogTip(item);
}

function clearCatalogDropMarks() {
  for (const node of el.catalogList?.querySelectorAll('.drop-before, .drop-after, .drop-end, .drop-into') || []) {
    node.classList.remove('drop-before', 'drop-after', 'drop-end', 'drop-into');
  }
}

function clearCatalogDragState() {
  clearCatalogDropMarks();
  for (const node of el.catalogList?.querySelectorAll('.dragging') || []) {
    node.classList.remove('dragging');
  }
}

function catalogDropTarget() {
  const into = el.catalogList?.querySelector('.drop-into');
  if (into) return { node: into, where: 'into' };
  const before = el.catalogList?.querySelector('.drop-before');
  if (before) return { node: before, where: 'before' };
  const after = el.catalogList?.querySelector('.drop-after');
  if (after) return { node: after, where: 'after' };
  const end = el.catalogList?.querySelector('.drop-end');
  if (end) return { node: end, where: 'end' };
  return null;
}

function moveModule(from, to, before) {
  if (!from || !to || from === to) return false;
  const p = ensureCurrentProfile();
  if (!p) return false;
  const list = currentModules().slice();
  const fi = list.indexOf(from);
  if (fi < 0 || list.indexOf(to) < 0) return false;
  list.splice(fi, 1);
  let ti = list.indexOf(to);
  if (ti < 0) return false;
  if (!before) ti += 1;
  list.splice(ti, 0, from);
  p.modules = list;
  return true;
}

function moveRequestInModule(id, targetId, before) {
  const p = ensureCurrentProfile();
  if (!p || !id) return false;
  const src = p.requests.find((r) => r.id === id);
  if (!src) return false;
  const module = requestModuleName(src);
  const group = p.requests.filter((r) => requestModuleName(r) === module);
  const ids = group.map((r) => r.id).filter((x) => x !== id);
  let at = targetId ? ids.indexOf(targetId) : ids.length;
  if (targetId && at < 0) return false;
  if (targetId && !before) at += 1;
  if (at < 0) at = ids.length;
  ids.splice(at, 0, id);
  if (ids.join('\0') === group.map((r) => r.id).join('\0')) return false;
  const byId = new Map(group.map((r) => [r.id, r]));
  const nextGroup = ids.map((x) => byId.get(x)).filter(Boolean);
  let i = 0;
  p.requests = p.requests.map((r) => (requestModuleName(r) === module ? nextGroup[i++] : r));
  return true;
}

function moveRequestToModule(id, destModule, targetId, before) {
  const p = ensureCurrentProfile();
  if (!p || !id) return false;
  destModule = clipText(destModule || '', 80);
  const src = p.requests.find((r) => r.id === id);
  if (!src) return false;
  if (requestModuleName(src) === destModule) {
    return moveRequestInModule(id, targetId, before);
  }
  src.module = destModule;
  if (id === activeSavedId && el.reqModule) el.reqModule.value = destModule;
  const others = p.requests.filter((r) => r.id !== id);
  const destIds = others.filter((r) => requestModuleName(r) === destModule).map((r) => r.id);
  let at = targetId ? destIds.indexOf(targetId) : destIds.length;
  if (targetId && at < 0) at = destIds.length;
  if (targetId && !before) at += 1;
  if (at < 0 || at > destIds.length) at = destIds.length;
  destIds.splice(at, 0, id);
  const byId = new Map(p.requests.map((r) => [r.id, r]));
  let emitted = false;
  const next = [];
  for (const r of others) {
    if (requestModuleName(r) === destModule) {
      if (!emitted) {
        for (const did of destIds) {
          const row = byId.get(did);
          if (row) next.push(row);
        }
        emitted = true;
      }
      continue;
    }
    next.push(r);
  }
  if (!emitted) {
    const row = byId.get(id);
    if (row) next.push(row);
  }
  p.requests = next;
  return true;
}

function onCatalogDragStart(e) {
  hideCatalogTip();
  if (moduleRun || catalogFilterKeyword() || e.target?.closest?.('.catalog-more, .catalog-add-module')) {
    e.preventDefault();
    return;
  }
  const item = e.target?.closest?.('.catalog-item');
  const group = e.target?.closest?.('.catalog-group');
  if (item?.dataset?.id && item.draggable) {
    catalogDrag = {
      type: 'item',
      id: item.dataset.id,
      module: item.closest('.catalog-group-wrap')?.dataset?.module || '',
    };
    item.classList.add('dragging');
  } else if (group?.draggable && group.dataset.module) {
    catalogDrag = { type: 'group', module: group.dataset.module };
    group.classList.add('dragging');
    group.closest('.catalog-group-wrap')?.classList.add('dragging');
  } else {
    e.preventDefault();
    return;
  }
  catalogDidDrag = true;
  closeGroupMenu();
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', catalogDrag.type);
}

function onCatalogDragOver(e) {
  if (!catalogDrag || catalogFilterKeyword()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearCatalogDropMarks();
  const wrap = e.target?.closest?.('.catalog-group-wrap');
  if (catalogDrag.type === 'group') {
    const to = wrap?.dataset?.module || '';
    if (!to || to === catalogDrag.module) return;
    const rect = wrap.getBoundingClientRect();
    wrap.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    return;
  }
  if (!wrap) return;
  const item = e.target?.closest?.('.catalog-item');
  if (item?.dataset?.id === catalogDrag.id) return;
  if (item?.dataset?.id) {
    const rect = item.getBoundingClientRect();
    item.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    return;
  }
  const destModule = wrap.dataset.module || '';
  if (destModule !== catalogDrag.module || e.target?.closest?.('.catalog-group')) {
    wrap.classList.add('drop-into');
    return;
  }
  wrap.querySelector('.catalog-items')?.classList.add('drop-end');
}

function onCatalogDrop(e) {
  if (!catalogDrag || catalogFilterKeyword()) return;
  e.preventDefault();
  const dest = catalogDropTarget();
  let changed = false;
  if (catalogDrag.type === 'group') {
    const wrap = dest?.node?.closest?.('.catalog-group-wrap');
    const to = wrap?.dataset?.module || '';
    if (to) changed = moveModule(catalogDrag.module, to, dest.where === 'before');
  } else {
    const wrap = dest?.node?.closest?.('.catalog-group-wrap');
    const destModule = wrap ? wrap.dataset.module || '' : '';
    if (dest?.where === 'into' || dest?.where === 'end') {
      changed = moveRequestToModule(catalogDrag.id, destModule, '', true);
    } else {
      const item = dest?.node?.closest?.('.catalog-item');
      const targetId = item?.dataset?.id || '';
      if (targetId) changed = moveRequestToModule(catalogDrag.id, destModule, targetId, dest.where === 'before');
    }
    if (changed) catalogOpenGroups.add(destModule);
  }
  clearCatalogDragState();
  catalogDrag = null;
  if (!changed) return;
  renderCatalog();
  persistProfile();
}

function onCatalogDragEnd() {
  clearCatalogDragState();
  catalogDrag = null;
  setTimeout(() => { catalogDidDrag = false; }, 0);
}

function onCatalogClick(e) {
  if (catalogDidDrag) {
    e.preventDefault();
    catalogDidDrag = false;
    return;
  }
  if (moduleRun && e.target?.closest?.('.catalog-item, .catalog-more, .catalog-add-module')) {
    return;
  }
  const addMod = e.target?.closest?.('.catalog-add-module');
  if (addMod) {
    e.preventDefault();
    addCatalogModule();
    return;
  }
  const itemMore = e.target?.closest?.('.catalog-item-more');
  if (itemMore) {
    e.preventDefault();
    e.stopPropagation();
    const id = itemMore.closest('.catalog-item')?.dataset?.id || '';
    openItemMenu(itemMore, id);
    return;
  }
  const more = e.target?.closest?.('.catalog-group-more');
  if (more) {
    e.preventDefault();
    e.stopPropagation();
    const module = more.closest('.catalog-group')?.dataset?.module || '';
    openGroupMenu(more, module);
    return;
  }
  const group = e.target?.closest?.('.catalog-group');
  if (group && el.catalogList?.contains(group)) {
    const key = group.dataset.closeKey || group.dataset.module || '';
    if (catalogOpenGroups.has(key)) catalogOpenGroups.delete(key);
    else catalogOpenGroups.add(key);
    renderCatalog();
    return;
  }
  const item = e.target?.closest?.('.catalog-item');
  if (item?.dataset?.id) pickCatalogRequest(item.dataset.id, item.dataset.host || '');
}

async function pickCatalogRequest(id, host) {
  if (moduleRun) return;
  const target = String(host || currentCatalogHost() || '').trim();
  const current = currentCatalogHost();
  if (target && target !== current) {
    await persistProfile();
    const p = profiles.find((x) => x.name === target);
    if (!p) return;
    await applyProfile(p);
  }
  const req = (currentProfileRequests() || []).find((r) => r.id === id);
  if (!req) return;
  if (isHTTPSaved(req)) await pickSavedRequest(id);
  else await pickSavedWSMessage(id);
  renderCatalog();
}

function blankHTTPRequest(id, moduleName) {
  const origin = urlPrefix || originFromURL(currentURL()) || currentURL();
  return {
    id,
    name: 'GET /',
    title: '',
    description: '',
    module: clipText(moduleName, 80),
    updatedAt: Date.now(),
    kind: 'http',
    url: origin,
    method: 'GET',
    protocol: '',
    headerList: [emptyRow()],
    authType: 'none',
    authToken: '',
    authUser: '',
    authPass: '',
    bodyType: 'json',
    body: '',
    formList: [emptyRow()],
  };
}

function blankWSRequest(id, moduleName) {
  return {
    id,
    name: '新消息',
    title: '',
    description: '',
    module: clipText(moduleName, 80),
    updatedAt: Date.now(),
    kind: 'ws',
    url: currentURL(),
    protocol: el.protocol?.value?.trim() || '',
    body: '',
  };
}

function wsNameFromEditor(prev) {
  const text = el.payload?.value || '';
  const key = wsMessageKey(text);
  if (key) return wsMessageStoreName(key, text);
  return prev?.name || '新消息';
}

function syncActiveRequestSnapshot() {
  const req = currentSavedRequest();
  if (!req) return;
  const next = isHTTPMode()
    ? snapshotCurrentRequest(currentRequestKey() || req.name || 'GET /', req.id)
    : snapshotWSMessage(wsNameFromEditor(req), req.id);
  Object.assign(req, next);
}

async function addCatalogRequest(moduleName) {
  if (!requireURL()) return;
  if (activeSavedId) syncActiveRequestSnapshot();
  const p = ensureCurrentProfile();
  if (!p) return;
  const module = clipText(moduleName, 80);
  if (module) rememberModule(module);
  const id = newRequestId();
  const req = isHTTPMode() ? blankHTTPRequest(id, module) : blankWSRequest(id, module);
  p.requests = (p.requests || []).concat(req);
  if (isHTTPMode()) applySavedRequest(req);
  else applySavedWSMessage(req);
  setActiveSavedId(id);
  renderCatalog();
  await persistProfile();
  if (isDocMode() && !docEditing()) setDocEditing(true);
  else el.reqTitle?.focus();
}

function cloneSavedRequest(src) {
  const copy = JSON.parse(JSON.stringify(src || {}));
  copy.id = newRequestId();
  copy.updatedAt = Date.now();
  const base = String(src?.title || requestDisplayTitle(src) || src?.name || (isHTTPMode() ? '接口' : '消息')).trim();
  copy.title = clipText(`${base} 副本`, 80);
  return copy;
}

async function duplicateCatalogRequest(id) {
  if (!requireURL()) return;
  if (activeSavedId) syncActiveRequestSnapshot();
  const p = ensureCurrentProfile();
  if (!p) return;
  const i = (p.requests || []).findIndex((r) => r.id === id);
  if (i < 0) return;
  const copy = cloneSavedRequest(p.requests[i]);
  p.requests.splice(i + 1, 0, copy);
  if (isHTTPMode()) applySavedRequest(copy);
  else applySavedWSMessage(copy);
  setActiveSavedId(copy.id);
  renderCatalog();
  await persistProfile();
  if (isDocMode() && !docEditing()) setDocEditing(true);
  else el.reqTitle?.focus();
}

async function addCatalogModule() {
  if (!requireURL()) return;
  const raw = await askPrompt({
    title: '新建模块',
    placeholder: '例如 登录',
    hint: '模块相当于文件夹，可把接口归到一组。',
    okText: '创建',
    validate: (s) => {
      if (!String(s || '').trim()) return '请输入模块名';
      if (Array.from(String(s || '').trim()).length > 80) return '最多 80 字';
      return '';
    },
  });
  if (raw == null) return;
  const name = rememberModule(raw);
  if (!name) return;
  catalogOpenGroups.add(name);
  renderCatalog();
  await persistProfile();
}

async function renameCatalogModule(from) {
  const raw = await askPrompt({
    title: '重命名模块',
    value: from,
    placeholder: '模块名',
    okText: '保存',
    validate: (s) => {
      if (!String(s || '').trim()) return '请输入模块名';
      if (Array.from(String(s || '').trim()).length > 80) return '最多 80 字';
      return '';
    },
  });
  if (raw == null) return;
  const to = clipText(raw, 80);
  if (!to || to === from) return;
  if (!renameModule(from, to)) return;
  if (catalogOpenGroups.has(from)) {
    catalogOpenGroups.delete(from);
    catalogOpenGroups.add(to);
  }
  renderCatalog();
  await persistProfile();
}

async function deleteCatalogModule(name) {
  const n = currentProfileRequests().filter((r) => requestModuleName(r) === name).length;
  const ok = await askConfirm({
    title: '删除模块',
    message: n
      ? `删除「${name}」后，其中 ${n} 个接口会移到「未分组」。`
      : `确定删除空模块「${name}」？`,
    okText: '删除',
  });
  if (!ok) return;
  clearModule(name);
  catalogOpenGroups.delete(name);
  renderCatalog();
  await persistProfile();
}

async function saveCurrentRequest() {
  if (!requireURL()) return;
  flushDocEditors();
  const p = ensureCurrentProfile();
  if (!p) return;
  if (activeSavedId && currentSavedRequest()) {
    syncActiveRequestSnapshot();
  } else {
    const id = upsertCurrentSavedRequest();
    if (id) activeSavedId = id;
  }
  const module = currentReqModule();
  if (module) rememberModule(module);
  await persistProfile();
  if (!isDocMode()) flashButton(isHTTPMode() ? el.btnSaveReq : el.btnSaveWS, '已保存');
  setActiveSavedId(activeSavedId);
  loadReqMeta(currentSavedRequest());
  renderCatalog();
}

function currentSavedRequest() {
  if (!activeSavedId) return null;
  return currentProfileRequests().find((r) => r.id === activeSavedId) || null;
}

function currentRequestHint() {
  return requestHintFrom(currentSavedRequest());
}

function requestHintFrom(r) {
  if (!r) return null;
  const http = isHTTPSaved(r);
  return {
    id: String(r.id || ''),
    title: String(r.title || '').trim(),
    label: catalogItemLabel(r),
    module: requestModuleName(r),
    http,
    method: http ? String(r.method || 'GET').toUpperCase() : '',
    path: http ? (requestItemPath(r) || '') : '',
    cmd: http ? '' : wsMessageKey(r.body || ''),
  };
}

function findEquivalentRequest(hint) {
  if (!hint) return null;
  const reqs = currentProfileRequests();
  if (!reqs.length) return null;
  if (hint.id) {
    const byId = reqs.find((r) => r.id === hint.id);
    if (byId) return byId;
  }
  const pool = reqs.filter((r) => isHTTPSaved(r) === Boolean(hint.http));
  const list = pool.length ? pool : reqs;
  const titled = hint.title
    ? list.filter((r) => String(r.title || '').trim() === hint.title)
    : [];
  if (titled.length) {
    if (hint.module) {
      const inMod = titled.find((r) => requestModuleName(r) === hint.module);
      if (inMod) return inMod;
    }
    if (titled.length === 1) return titled[0];
    if (hint.path) {
      const byPath = titled.find((r) => requestItemPath(r) === hint.path);
      if (byPath) return byPath;
    }
    if (hint.cmd) {
      const byCmd = titled.find((r) => wsMessageKey(r.body || '') === hint.cmd);
      if (byCmd) return byCmd;
    }
    return titled[0];
  }
  if (hint.http && hint.path) {
    const key = `${hint.method || 'GET'} ${hint.path}`;
    const byKey = list.find((r) => requestKeyFrom(r) === key);
    if (byKey) return byKey;
    const byPath = list.find((r) => requestItemPath(r) === hint.path);
    if (byPath) return byPath;
  }
  if (!hint.http && hint.cmd) {
    const byCmd = list.find((r) => wsMessageKey(r.body || '') === hint.cmd);
    if (byCmd) return byCmd;
  }
  if (hint.label) {
    const labeled = list.filter((r) => catalogItemLabel(r) === hint.label);
    if (hint.module) {
      const inMod = labeled.find((r) => requestModuleName(r) === hint.module);
      if (inMod) return inMod;
    }
    if (labeled.length === 1) return labeled[0];
  }
  return null;
}

function restoreRequestFromHint(hint) {
  const req = findEquivalentRequest(hint);
  if (!req) {
    setActiveSavedId('');
    loadReqMeta(null);
    if (isDocMode()) renderDocPane();
    return false;
  }
  if (isHTTPSaved(req)) applySavedRequest(req);
  else applySavedWSMessage(req);
  const mod = requestModuleName(req);
  catalogOpenGroups.add(mod);
  setActiveSavedId(req.id);
  loadReqMeta(req);
  if (isDocMode()) renderDocPane();
  renderCatalog();
  return true;
}

function setActiveSavedId(id) {
  if (id !== undefined) activeSavedId = id || '';
  const reqs = isHTTPMode() ? currentHTTPRequests() : currentWSMessages();
  if (activeSavedId && !reqs.some((r) => r.id === activeSavedId)) activeSavedId = '';
  if (isDocMode()) renderDocPane();
  return activeSavedId;
}

function urlPathname(url) {
  let path = splitLockedURL(url).rest || '';
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h >= 0) path = path.slice(0, h);
  path = path.trim();
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function requestKeyFrom(req) {
  const url = req?.url || '';
  const path = urlPathname(url);
  if (HTTP_SCHEMES.has(urlScheme(url))) {
    return `${String(req?.method || 'GET').toUpperCase()} ${path}`;
  }
  return path;
}

function currentRequestKey() {
  const path = urlPathname(currentURL());
  if (isHTTPMode()) return `${(el.method?.value || 'GET').toUpperCase()} ${path}`;
  return path;
}

function matchSavedId() {
  const key = currentRequestKey();
  return currentHTTPRequests().find((r) => requestKeyFrom(r) === key)?.id || '';
}

function matchSavedWSId() {
  const key = wsMessageKey(el.payload?.value || '');
  if (!key) return '';
  return currentWSMessages().find((r) => wsMessageKey(r.body || '') === key)?.id || '';
}

function newRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

function snapshotCurrentRequest(name, id, extra) {
  const prev = id ? currentProfileRequests().find((r) => r.id === id) : null;
  return {
    id: id || '',
    name,
    title: currentReqTitle() || prev?.title || '',
    description: currentReqDesc() || prev?.description || '',
    module: currentReqModule() || prev?.module || '',
    updatedAt: Date.now(),
    kind: 'http',
    url: currentURL(),
    method: el.method?.value || 'GET',
    protocol: el.protocol?.value?.trim() || '',
    headerList: cloneRows(headerRows),
    authType: el.authType?.value || authState.type || 'none',
    authToken: el.authToken?.value || authState.token || '',
    authUser: el.authUser?.value || authState.user || '',
    authPass: el.authPass?.value || authState.pass || '',
    bodyType: currentBodyType(),
    body: extra?.body !== undefined ? extra.body : currentBody(),
    formList: cloneRows(formRows),
    example: extra?.example !== undefined ? extra.example : (prev?.example || ''),
  };
}

function snapshotWSMessage(name, id, extra) {
  const prev = id ? currentProfileRequests().find((r) => r.id === id) : null;
  return {
    id: id || '',
    name,
    title: currentReqTitle() || prev?.title || '',
    description: currentReqDesc() || prev?.description || '',
    module: currentReqModule() || prev?.module || '',
    updatedAt: Date.now(),
    kind: 'ws',
    url: currentURL(),
    protocol: el.protocol?.value?.trim() || '',
    body: extra?.body !== undefined ? extra.body : (el.payload?.value || ''),
    example: extra?.example !== undefined ? extra.example : currentExample(prev),
  };
}

function currentExample(prev) {
  if (el.payloadIn) return el.payloadIn.value || '';
  return prev?.example || recordDraft.in || '';
}

function applySavedRequest(req) {
  if (!req) return false;
  recordDraft.resBody = req.example || '';
  const lock = profileNameFromURL(currentURL()) || activeProfileName || '';
  const raw = String(req.url || '').trim();
  if (raw.includes('{{')) {
    const rest = splitLockedURL(expandVars(raw, varsFromRows(varRows)) || '').rest;
    if (lock && rest) setURL(lock + rest, lock);
  } else {
    const reqHost = profileNameFromURL(raw);
    if (lock && reqHost && reqHost !== lock) {
      const rest = splitLockedURL(raw).rest;
      setURL(rest ? lock + rest : lock, lock);
    } else if (raw) {
      setURL(raw, lock || reqHost);
    }
  }
  if (el.protocol) el.protocol.value = req.protocol || '';
  const method = (req.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  loadHeadersFromProfile(req);
  loadAuthFromProfile(req);
  loadBodyTypeFromProfile(req);
  loadBodyFromProfile(req);
  withoutSessionReset(() => applyTransportFromURL());
  syncParamsFromURL();
  renderRequestEditor();
  loadReqMeta(req);
  return true;
}

function applySavedWSMessage(req) {
  if (!req || !el.payload) return false;
  el.payload.value = req.body || '';
  lastSent = el.payload.value;
  recordDraft.in = req.example || '';
  if (el.payloadIn) el.payloadIn.value = req.example || '';
  loadReqMeta(req);
  return true;
}

function requestItemPath(r) {
  const rest = splitLockedURL(r?.url || '').rest;
  return rest || urlPathname(r?.url) || '/';
}

function savedRequestHaystack(r) {
  const http = HTTP_SCHEMES.has(urlScheme(r?.url));
  const method = http ? String(r?.method || 'GET').toUpperCase() : '';
  const path = requestItemPath(r);
  return `${method} ${path} ${r?.name || ''} ${r?.title || ''} ${r?.description || ''} ${r?.module || ''} ${r?.url || ''} ${r?.example || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function savedRequestMatches(r, kw) {
  if (!kw) return true;
  return savedRequestHaystack(r).includes(kw);
}

function fillHighlighted(node, text, kw) {
  node.textContent = '';
  const raw = String(text || '');
  const needle = String(kw || '').trim();
  if (!needle) {
    node.textContent = raw;
    return;
  }
  const lower = raw.toLowerCase();
  const q = needle.toLowerCase();
  let from = 0;
  let i = lower.indexOf(q, from);
  if (i < 0) {
    node.textContent = raw;
    return;
  }
  while (i >= 0) {
    if (i > from) node.appendChild(document.createTextNode(raw.slice(from, i)));
    const mark = document.createElement('span');
    mark.className = 'saved-hit';
    mark.textContent = raw.slice(i, i + q.length);
    node.appendChild(mark);
    from = i + q.length;
    i = lower.indexOf(q, from);
  }
  if (from < raw.length) node.appendChild(document.createTextNode(raw.slice(from)));
}

function savedWSHaystack(r) {
  return `${r?.name || ''} ${r?.title || ''} ${r?.description || ''} ${r?.module || ''} ${r?.body || ''} ${r?.example || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function savedWSMatches(r, kw) {
  if (!kw) return true;
  return savedWSHaystack(r).includes(kw);
}

function upsertCurrentSavedRequest() {
  const p = ensureCurrentProfile();
  if (!p) return '';
  const list = Array.isArray(p.requests) ? p.requests.slice() : [];
  if (activeSavedId) {
    const i = list.findIndex((r) => r.id === activeSavedId);
    if (i >= 0) {
      const req = isHTTPMode()
        ? snapshotCurrentRequest(currentRequestKey() || list[i].name || 'GET /', list[i].id)
        : snapshotWSMessage(wsNameFromEditor(list[i]), list[i].id);
      list[i] = req;
      p.requests = list;
      return req.id;
    }
  }
  if (isHTTPMode()) {
    const key = currentRequestKey();
    let i = list.findIndex((r) => isHTTPSaved(r) && requestKeyFrom(r) === key);
    if (i < 0) i = list.findIndex((r) => isHTTPSaved(r) && r.name === key);
    const req = snapshotCurrentRequest(key, i >= 0 ? list[i].id : newRequestId());
    if (i >= 0) list[i] = req;
    else list.push(req);
    p.requests = list;
    return req.id;
  }
  const text = el.payload?.value || '';
  const key = wsMessageKey(text);
  if (!key) return '';
  let i = list.findIndex((r) => isWSSaved(r) && wsMessageKey(r.body || '') === key);
  const req = snapshotWSMessage(wsMessageStoreName(key, text), i >= 0 ? list[i].id : newRequestId());
  if (i >= 0) list[i] = req;
  else list.push(req);
  p.requests = list;
  return req.id;
}

async function deleteNamedRequest(id) {
  const req = currentProfileRequests().find((r) => r.id === id);
  if (!req?.id) return;
  const ws = isWSSaved(req);
  const label = requestDisplayTitle(req) || req.name;
  const ok = await askConfirm({
    title: ws ? '删除发送' : '删除请求',
    message: `确定删除「${label}」？此操作不可恢复。`,
    okText: '删除',
  });
  if (!ok) return;
  const name = activeProfileName || currentProfile()?.name || profileNameFromURL(currentURL());
  if (!name) return;
  try {
    await DeleteRequest(name, req.id);
  } catch (e) {
    setDetailEmpty('删除失败: ' + e);
    return;
  }
  const p = currentProfile();
  if (p) p.requests = currentProfileRequests().filter((r) => r.id !== req.id);
  if (activeSavedId === req.id) {
    setActiveSavedId('');
    loadReqMeta(null);
  }
  renderCatalog();
}

async function pickSavedRequest(id) {
  const req = currentHTTPRequests().find((r) => r.id === id);
  if (!req) return;
  applySavedRequest(req);
  setActiveSavedId(req.id);
  renderCatalog();
  await persistProfile();
}

async function pickSavedWSMessage(id) {
  const req = currentWSMessages().find((r) => r.id === id);
  if (!req) return;
  applySavedWSMessage(req);
  setActiveSavedId(req.id);
  renderCatalog();
  await persistProfile();
}

async function persistProfile(selectName) {
  if (typeof selectName !== 'string') selectName = '';
  flushReqMeta();
  flushDocEditors();
  if (activeSavedId) syncActiveRequestSnapshot();
  const name = activeProfileName || profileNameFromURL(currentURL());
  if (!name) return;
  const prev = profiles.find((x) => x.name === name);
  const url = prev?.url || currentURL() || name;
  const module = currentReqModule();
  if (module && activeSavedId) rememberModule(module);
  authState = {
    type: el.authType?.value || 'none',
    token: el.authToken?.value || '',
    user: el.authUser?.value || '',
    pass: el.authPass?.value || '',
  };
  const cur = profiles.find((x) => x.name === name) || currentProfile();
  const src = cur || prev;
  const p = {
    name,
    url,
    project: src?.project || (isExplicitProject(el.project?.value) ? String(el.project.value).trim() : ''),
    protocol: el.protocol.value.trim(),
    method: el.method?.value || 'GET',
    headers: currentHeaders(),
    headerList: cloneRows(headerRows),
    variableList: cloneRows(varRows),
    activeEnv,
    environments: snapshotEnvironments(),
    authType: authState.type,
    authToken: authState.token,
    authUser: authState.user,
    authPass: authState.pass,
    bodyType: currentBodyType(),
    body: currentBody(),
    formList: cloneRows(formRows),
    reconnect: el.reconnect.checked,
    pingSec: 20,
    noFollowRedirects: el.followRedirects ? !el.followRedirects.checked : false,
    requests: Array.isArray(src?.requests) ? src.requests : [],
    modules: [...(src?.modules || [])],
  };
  try {
    await SaveProfile(p);
    const idx = profiles.findIndex((x) => x.name === name);
    if (idx >= 0) profiles[idx] = p;
    else {
      profiles.push(p);
      profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    renderProjectSelect();
    rememberSelection();
    renderCatalog();
  } catch (_) {}
}

async function applyImportedCatalog(merged) {
  const name = merged?.name || '';
  profiles = (await GetProfiles()) || [];
  if (name && !profiles.some((p) => p.name === name)) {
    profiles.push(merged);
    profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const p = (name && profiles.find((x) => x.name === name)) || merged;
  if (!p) return;
  await applyProfile(p);
}

function openExportMenu(anchor) {
  openCatalogMenu(anchor || el.btnCatalogExport, 'export', [
    { act: 'export-one', label: '导出当前项目' },
    { act: 'export-all', label: '导出全部' },
  ]);
}

async function exportCatalog() {
  if (!requireURL()) return;
  await persistProfile();
  const p = currentProfile();
  if (!p) return;
  try {
    const ok = await ExportCatalog(p);
    if (ok) flashCatalogTitle('已导出');
  } catch (e) {
    setDetailEmpty('导出失败: ' + e);
  }
}

async function exportAllCatalogs() {
  if (currentProfile()) await persistProfile();
  try {
    const ok = await ExportAllCatalogs();
    if (ok) flashCatalogTitle('已导出全部');
  } catch (e) {
    setDetailEmpty('导出失败: ' + e);
  }
}

async function importCatalog() {
  const ok = await askConfirm({
    title: '导入接口',
    message: '按文件里的主机写入，没有就会新建；多个主机会拆开。当前打开的地址不会被改，除非文件就是它。本机目录或全部导出包按 id 覆盖，Postman Collection / ApiZza 项目全部作为新接口追加。',
    okText: '选择文件',
  });
  if (!ok) return;
  await persistProfile();
  try {
    const merged = await ImportCatalog();
    if (!merged) return;
    await applyImportedCatalog(merged);
    flashCatalogTitle(merged.name ? `已导入 ${merged.name}` : '已导入');
  } catch (e) {
    setDetailEmpty('导入失败: ' + e);
  }
}

function requireURL() {
  if (currentURL() && profileNameFromURL(currentURL())) return true;
  openUrlModal();
  return false;
}

async function toggleConn() {
  if (isHTTPMode()) return;
  if (!requireURL()) return;
  await activateCurrent();
  const st = await GetStatus();
  if (st.state === 'open' || st.state === 'connecting' || st.state === 'reconnecting') {
    await Disconnect();
    return;
  }
  try {
    if (historyMode) await exitHistoryMode();
    await persistProfile();
    await Connect(resolvedOpts());
  } catch (e) {
    setDetailEmpty(String(e));
  }
}

async function ensureWSConnected() {
  if (!currentURL()) {
    throw new Error('请先填写 URL');
  }
  const st = await GetStatus();
  const s = (st?.state || '').toLowerCase();
  if (s === 'open') return;
  if (s !== 'connecting' && s !== 'reconnecting') {
    await Connect(resolvedOpts());
  }
}

function moduleHTTPRequests(module) {
  const key = clipText(module || '', 80);
  return currentHTTPRequests().filter((r) => requestModuleName(r) === key);
}

async function runCatalogModule(module) {
  if (moduleRun || sending) return;
  if (!isHTTPMode()) {
    flashCatalogTitle('WebSocket 不能跑');
    return;
  }
  if (!requireURL()) return;
  const list = moduleHTTPRequests(module);
  if (!list.length) {
    flashCatalogTitle('没有可跑的接口');
    return;
  }
  await persistProfile();
  if (historyMode) await exitHistoryMode();
  moduleRun = { module, index: 0, total: list.length, id: '' };
  setBusy(true);
  refreshCatalogTitle();
  let stopped = false;
  try {
    for (let i = 0; i < list.length; i++) {
      const req = currentHTTPRequests().find((r) => r.id === list[i].id) || list[i];
      moduleRun.index = i + 1;
      moduleRun.id = req.id || '';
      applySavedRequest(req);
      setActiveSavedId(req.id);
      renderCatalog();
      await activateCurrent();
      const ex = await RequestHTTP(resolvedOpts(), resolvedBody());
      if (ex) setDetailHtml(renderHTTPExchange(ex));
      if (httpExchangeFailed(ex)) {
        stopped = true;
        break;
      }
    }
    const n = moduleRun.index;
    const total = moduleRun.total;
    await persistProfile();
    moduleRun = null;
    renderCatalog();
    flashCatalogTitle(stopped ? `停在 ${n}/${total}` : `跑完 ${total}/${total}`, 2200);
  } catch (e) {
    moduleRun = null;
    renderCatalog();
    setDetailEmpty(String(e));
    flashCatalogTitle('跑失败', 2200);
  } finally {
    moduleRun = null;
    setBusy(false);
    if (!el.catalogTitle?._flashTimer) refreshCatalogTitle();
  }
}

async function sendMsg() {
  if (sending || moduleRun) return;
  if (!requireURL()) return;
  await activateCurrent();
  const rawURL = currentURL();
  const http = isHTTPURL(rawURL);
  const opts = resolvedOpts();
  const text = http ? resolvedBody() : expandVars(el.payload.value.trim(), currentVarMap());
  if (!http && !text) return;
  setBusy(true);
  try {
    if (historyMode) await exitHistoryMode();
    const savedId = upsertCurrentSavedRequest();
    await persistProfile();
    setActiveSavedId(savedId);
    if (savedId) loadReqMeta(currentSavedRequest());
    if (http) {
      const ex = await RequestHTTP(opts, text);
      if (ex) {
        setDetailHtml(renderHTTPExchange(ex));
      }
    } else {
      await ensureWSConnected();
      await Send(text);
    }
    lastSent = text;
    await persistProfile();
  } catch (e) {
    setDetailEmpty(String(e));
  } finally {
    setBusy(false);
  }
}

async function formatPayload() {
  const text = el.payload?.value || '';
  if (text.trim()) el.payload.value = await FormatJSON(text);
  const ret = el.payloadIn?.value || '';
  if (ret.trim()) el.payloadIn.value = await FormatJSON(ret);
  if (text.trim() || ret.trim()) schedulePersist();
}

async function formatRecordField(target) {
  const text = target?.value || '';
  if (!text.trim()) return;
  target.value = await FormatJSON(text);
}

function setBusy(on) {
  sending = on;
  const method = on ? 'setAttribute' : 'removeAttribute';
  el.btnSend?.[method]('disabled', 'true');
  el.btnSendTop?.[method]('disabled', 'true');
  el.btnRecordSave?.[method]('disabled', 'true');
}

function recordModalOpen() {
  return Boolean(el.recordModal && !el.recordModal.classList.contains('hidden'));
}

function resetRecordDraft() {
  recordDraft.in = '';
  recordDraft.resBody = '';
}

function setRecordError(text) {
  if (el.recordErr) el.recordErr.textContent = text || '';
}

function readRecordForm() {
  recordDraft.in = el.recIn?.value || '';
  recordDraft.resBody = el.recResBody?.value || '';
}

function applyRecordDraftToForm() {
  if (el.recIn) el.recIn.value = recordDraft.in;
  if (el.recResBody) el.recResBody.value = recordDraft.resBody || '';
}

function openRecordModal() {
  const http = isHTTPMode();
  if (el.recordTitle) el.recordTitle.textContent = http ? '保存到接口 · HTTP' : '保存到接口 · WebSocket';
  if (el.recordHint) {
    el.recordHint.textContent = http
      ? '不会发送。方法、地址、请求头用当前编辑器；这里补请求体和响应体，保存到左侧接口。'
      : '不会发送。发送内容作为接口，返回记在这条接口上，保存到左侧。';
  }
  if (el.recordMeta) {
    const method = (el.method?.value || 'GET').toUpperCase();
    const url = currentURL();
    el.recordMeta.textContent = http
      ? `${method} ${url || '(未填写 URL)'}`
      : (url || '(未填写 URL)');
  }
  el.recordHTTP?.classList.toggle('hidden', !http);
  el.recordWS?.classList.toggle('hidden', http);
  setRecordError('');
  if (http) {
    if (el.recReqBody) el.recReqBody.value = currentBody();
    applyRecordDraftToForm();
  } else if (el.recOut) {
    el.recOut.value = el.payload?.value || '';
    recordDraft.in = el.payloadIn?.value || recordDraft.in || '';
    applyRecordDraftToForm();
  }
  el.recordModal?.classList.remove('hidden');
  el.recordModal?.setAttribute('aria-hidden', 'false');
  const focusEl = http
    ? (el.recResBody || el.recReqBody)
    : (recordDraft.in ? el.recIn : el.recOut);
  setTimeout(() => focusEl?.focus(), 30);
}

function closeRecordModal() {
  if (!recordModalOpen()) return;
  readRecordForm();
  el.recordModal.classList.add('hidden');
  el.recordModal.setAttribute('aria-hidden', 'true');
  setRecordError('');
}

async function saveRecord() {
  if (sending) return;
  if (isHTTPMode()) {
    return recordHTTP();
  }
  return recordWS();
}

function putSavedRequest(req, match) {
  const p = ensureCurrentProfile();
  if (!p || !req) return '';
  const list = Array.isArray(p.requests) ? p.requests.slice() : [];
  let i = -1;
  if (typeof match === 'function') i = list.findIndex(match);
  if (i < 0 && req.id) i = list.findIndex((r) => r.id === req.id);
  if (i >= 0) {
    req.id = list[i].id;
    list[i] = req;
  } else {
    if (!req.id) req.id = newRequestId();
    list.push(req);
  }
  p.requests = list;
  return req.id;
}

async function saveRecordToCatalog(req, match) {
  const id = putSavedRequest(req, match);
  if (!id) {
    setRecordError('请先填写地址');
    return false;
  }
  setActiveSavedId(id);
  loadReqMeta(req);
  catalogOpenGroups.add(requestModuleName(req) || '');
  await persistProfile();
  renderCatalog();
  flashCatalogTitle('已保存到接口');
  return true;
}

async function recordHTTP() {
  if (sending) return;
  if (!isHTTPMode()) return;
  if (!currentURL() || !profileNameFromURL(currentURL())) {
    setRecordError('请先填写 URL');
    return;
  }
  const reqBody = el.recReqBody?.value || '';
  const resBody = el.recResBody?.value || '';
  if (el.payload) el.payload.value = reqBody;
  lastSent = reqBody;
  const key = currentRequestKey();
  const req = snapshotCurrentRequest(key || 'GET /', '', { body: reqBody, example: resBody });
  readRecordForm();
  const ok = await saveRecordToCatalog(req, (r) => isHTTPSaved(r) && requestKeyFrom(r) === key);
  if (ok) closeRecordModal();
}

async function recordWS() {
  if (sending) return;
  if (!currentURL() || !profileNameFromURL(currentURL())) {
    setRecordError('请先填写地址');
    return;
  }
  const outText = el.recOut?.value || '';
  const inText = el.recIn?.value || '';
  if (!outText.trim()) {
    setRecordError('请填写发送内容');
    return;
  }
  if (el.payload) el.payload.value = outText;
  if (el.payloadIn) el.payloadIn.value = inText;
  lastSent = outText;
  const key = wsMessageKey(outText);
  const name = wsMessageStoreName(key, outText) || '新消息';
  const req = snapshotWSMessage(name, '', { body: outText, example: inText });
  readRecordForm();
  const ok = await saveRecordToCatalog(req, (r) => isWSSaved(r) && key && wsMessageKey(r.body || '') === key);
  if (ok) closeRecordModal();
}

/* —— history modal —— */
function openHistoryModal() {
  el.histModal.classList.remove('hidden');
  el.histModal.setAttribute('aria-hidden', 'false');
  refreshHistoryList();
  setTimeout(() => el.histSearch?.focus(), 30);
}

function closeHistoryModal() {
  el.histModal.classList.add('hidden');
  el.histModal.setAttribute('aria-hidden', 'true');
}

function historyItemTitle(s) {
  const named = profileNameFromURL(s?.url);
  if (named) return [s?.day, named].filter(Boolean).join('  ·  ');
  const scheme = urlScheme(s?.url);
  const host = s?.host || hostFromURL(s?.url);
  const hostPart = host ? (scheme ? `${scheme}://${host}` : host) : '';
  return [s?.day, hostPart].filter(Boolean).join('  ·  ') || s?.name || '';
}

function renderHistoryItems(list, keyword) {
  el.histList.innerHTML = '';
  const kw = (keyword || '').trim();
  el.histEmpty.classList.toggle('hidden', list.length > 0);
  el.histEmpty.textContent = kw
    ? `没有匹配 “${kw}” 的日志`
    : '暂无日志，发送或连接后会按日期和 IP/域名分开保存';

  for (const s of list) {
    const item = document.createElement('div');
    item.className = 'hist-item';
    item.innerHTML = `
      <div class="name"></div>
      <div class="size"></div>
      <div class="meta"></div>
      <div class="hint hidden"></div>
    `;
    item.querySelector('.name').textContent = historyItemTitle(s);
    const right = item.querySelector('.size');
    if (kw && (s.matchCount > 0 || s.matchHint)) {
      right.className = 'hits';
      right.textContent = s.matchCount > 0 ? `${s.matchCount} 命中` : '匹配';
    } else {
      right.textContent = formatSize(s.size || 0);
    }
    const metaBits = [];
    if (s.host) metaBits.push(s.host);
    if (s.name) metaBits.push(s.name);
    if (s.modTime) metaBits.push(s.modTime);
    if (s.url) metaBits.push(s.url);
    item.querySelector('.meta').textContent = metaBits.join('  ·  ');
    if (s.matchHint) {
      const hint = item.querySelector('.hint');
      hint.classList.remove('hidden');
      hint.textContent = s.matchHint;
    }
    item.addEventListener('click', async () => {
      try {
        const detail = await LoadSession(s.name);
        showSession(detail, kw);
      } catch (e) {
        setDetailEmpty('加载失败: ' + e);
      }
    });
    el.histList.appendChild(item);
  }
}

async function refreshHistoryList() {
  const kw = (el.histSearch?.value || '').trim();
  const seq = ++histSearchSeq;
  el.histList.innerHTML = '';
  let list = [];
  try {
    list = kw ? ((await SearchSessions(kw)) || []) : ((await ListSessions()) || []);
  } catch (e) {
    if (seq !== histSearchSeq) return;
    el.histEmpty.classList.remove('hidden');
    el.histEmpty.textContent = '读取失败: ' + e;
    return;
  }
  if (seq !== histSearchSeq) return;
  renderHistoryItems(list, kw);
}

function scheduleHistorySearch() {
  clearTimeout(histSearchTimer);
  histSearchTimer = setTimeout(() => refreshHistoryList(), 220);
}

async function pickSession() {
  try {
    const detail = await PickAndLoadSession();
    if (detail) showSession(detail, (el.histSearch?.value || '').trim());
  } catch (e) {
    setDetailEmpty('打开失败: ' + e);
  }
}

async function init() {
  initTheme();
  syncCatalogHoverRadios();
  setCatalogOpen(catalogOpen());
  workMode = readWorkMode();
  applyWorkMode();
  ensureCatalogTip();
  el.btnAddProfile?.addEventListener('click', () => openUrlModal());
  el.btnUrlModalClose?.addEventListener('click', closeUrlModal);
  el.btnUrlModalCancel?.addEventListener('click', closeUrlModal);
  el.btnUrlModalOk?.addEventListener('click', submitUrlModal);
  el.urlModalInput?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submitUrlModal();
    }
  });
  el.btnConfirmCancel?.addEventListener('click', () => closeConfirmModal(false));
  el.btnConfirmOk?.addEventListener('click', () => closeConfirmModal(true));
  el.btnPromptCancel?.addEventListener('click', () => closePromptModal(null));
  el.btnPromptOk?.addEventListener('click', submitPromptModal);
  el.promptInput?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submitPromptModal();
    }
  });
  suppressSessionReset = true;
  try {
    applyTransportFromURL();
    await loadProfiles();
  } finally {
    suppressSessionReset = false;
  }

  el.project?.addEventListener('change', async () => {
    await selectProject(el.project.value);
  });
  el.barEnv?.addEventListener('change', async () => {
    await selectEnvironment(el.barEnv.value);
  });
  el.btnDelProfile?.addEventListener('click', deleteCurrentProfile);
  document.addEventListener('mousedown', (e) => {
    if (moduleMenuOpen() && !el.moduleWrap?.contains(e.target)) {
      closeModuleMenu();
    }
    if (groupMenuOpen() && !el.groupMenu?.contains(e.target) && !e.target?.closest?.('.catalog-more, .env-more, #btnCatalogExport')) {
      closeGroupMenu();
    }
    if (envEditOpen() && !el.envWrap?.contains(e.target)) {
      closeEnvEdit();
    }
  });

  el.modeSwitch?.addEventListener('click', (e) => {
    const mode = e.target?.closest?.('.mode-btn')?.dataset?.mode;
    if (mode) setWorkMode(mode);
  });
  el.btnToggle.addEventListener('click', toggleConn);
  el.btnSend.addEventListener('click', sendMsg);
  el.btnSendTop?.addEventListener('click', sendMsg);
  el.btnRecord?.addEventListener('click', openRecordModal);
  el.btnFill?.addEventListener('click', () => {
    const m = store.get(selectedId);
    if (fillFromMessage(m)) {
      setFillButton(true);
      flashFilled();
      schedulePersist();
    }
  });
  el.btnCopyDetail?.addEventListener('click', () => copySelectedDetail());
  el.btnCopyDocReq?.addEventListener('click', async () => {
    const ok = await copyText(el.docReq?.value || '');
    flashButton(el.btnCopyDocReq, ok ? '已复制' : '复制失败');
  });
  el.btnCopyDocRes?.addEventListener('click', async () => {
    const ok = await copyText(el.docRes?.value || '');
    flashButton(el.btnCopyDocRes, ok ? '已复制' : '复制失败');
  });
  el.docReq?.addEventListener('input', onDocReqInput);
  el.docRes?.addEventListener('input', onDocResInput);
  el.btnDocEdit?.addEventListener('click', () => setDocEditing(!docEditing()));
  el.btnCurl?.addEventListener('click', () => copyCurl(false));
  el.btnCurlDetail?.addEventListener('click', () => copyCurl(true));
  el.btnClearCookies?.addEventListener('click', async () => {
    try {
      await ClearCookies();
      flashButton(el.btnClearCookies, '已清除');
    } catch (e) {
      setDetailEmpty(String(e));
    }
  });
  el.followRedirects?.addEventListener('change', persistProfile);
  el.reqTabs?.addEventListener('click', (e) => {
    const tab = e.target?.closest?.('.req-tab')?.dataset?.tab;
    if (tab) setReqTab(tab);
  });
  el.authType?.addEventListener('change', () => {
    syncAuthFields();
    persistProfile();
  });
  el.authToken?.addEventListener('change', persistProfile);
  el.authUser?.addEventListener('change', persistProfile);
  el.authPass?.addEventListener('change', persistProfile);
  for (const radio of document.querySelectorAll('input[name="bodyType"]')) {
    radio.addEventListener('change', () => {
      applyBodyTypeUI();
      persistProfile();
    });
  }
  setReqTab('body');
  renderRequestEditor();
  el.btnFormat.addEventListener('click', formatPayload);
  el.btnFormatHttp?.addEventListener('click', formatPayload);
  el.btnResend.addEventListener('click', () => {
    if (lastSent) {
      el.payload.value = lastSent;
      sendMsg();
    }
  });
  el.btnClear.addEventListener('click', async () => {
    if (historyMode) {
      clearListUI();
      return;
    }
    await ClearMessages();
    allLiveMsgs = [];
    clearListUI();
    refreshFilterTitle();
  });
  el.btnTheme.addEventListener('click', toggleTheme);
  el.btnSettings?.addEventListener('click', openSettings);
  el.btnSettingsClose?.addEventListener('click', closeSettings);
  el.settingsNav?.addEventListener('click', (e) => {
    const item = e.target?.closest?.('.settings-nav-item');
    if (item?.dataset?.section) showSettingsSection(item.dataset.section);
  });
  el.settingsMain?.addEventListener('change', (e) => {
    const input = e.target?.closest?.('input[name="catalogHover"]');
    if (input) setCatalogHoverMode(input.value);
  });
  // JSON tree node expand/collapse
  el.detail?.addEventListener('click', (e) => {
    if (toggleJsonNode(e.target)) {
      e.preventDefault();
    }
  });
  el.detail?.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && toggleJsonNode(e.target)) {
      e.preventDefault();
    }
  });
  el.btnHistory.addEventListener('click', openHistoryModal);
  el.btnLive.addEventListener('click', exitHistoryMode);
  el.btnHistClose.addEventListener('click', closeHistoryModal);
  el.btnHistRefresh.addEventListener('click', refreshHistoryList);
  el.btnPickSession.addEventListener('click', pickSession);
  el.btnOpenLogDir.addEventListener('click', async () => {
    try {
      await OpenLogDir();
    } catch (e) {
      setDetailEmpty(String(e));
    }
  });
  el.histSearch.addEventListener('input', scheduleHistorySearch);
  el.histSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(histSearchTimer);
      refreshHistoryList();
    }
  });
  el.msgFilter.addEventListener('input', () => applyMsgFilter());
  el.btnRecordClose?.addEventListener('click', closeRecordModal);
  el.btnRecordCancel?.addEventListener('click', closeRecordModal);
  el.btnRecordSave?.addEventListener('click', saveRecord);
  el.btnFmtRecOut?.addEventListener('click', () => formatRecordField(el.recOut));
  el.btnFmtRecIn?.addEventListener('click', () => formatRecordField(el.recIn));
  el.btnFmtRecReq?.addEventListener('click', () => formatRecordField(el.recReqBody));
  el.btnFmtRecRes?.addEventListener('click', () => formatRecordField(el.recResBody));

  el.payload.addEventListener('input', () => {
    schedulePersist();
  });
  el.payloadIn?.addEventListener('input', () => {
    recordDraft.in = el.payloadIn.value || '';
    schedulePersist();
  });
  el.payload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMsg();
    }
  });
  for (const node of [el.recOut, el.recIn, el.recReqBody, el.recResBody]) {
    node?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveRecord();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
      e.preventDefault();
      if (confirmModalOpen() || urlModalOpen() || recordModalOpen() || promptModalOpen() || settingsOpen()) return;
      if (el.histModal && !el.histModal.classList.contains('hidden')) return;
      saveCurrentRequest();
      return;
    }
    if (e.key !== 'Escape') return;
    if (settingsOpen()) {
      closeSettings();
      return;
    }
    if (groupMenuOpen()) {
      closeGroupMenu();
      return;
    }
    if (moduleMenuOpen()) {
      closeModuleMenu();
      return;
    }
    if (promptModalOpen()) {
      closePromptModal(null);
      return;
    }
    if (confirmModalOpen()) {
      closeConfirmModal(false);
      return;
    }
    if (recordModalOpen()) {
      closeRecordModal();
      return;
    }
    if (urlModalOpen()) {
      if (e.isComposing || e.keyCode === 229 || urlModalHasDraft()) return;
      closeUrlModal();
      return;
    }
    if (el.histModal && !el.histModal.classList.contains('hidden')) {
      closeHistoryModal();
    }
  });

  el.url.addEventListener('click', () => {
    if (!urlPrefix) openUrlModal();
  });
  el.url.addEventListener('change', async () => {
    normalizeURLPathInput();
    applyTransportFromURL();
    syncParamsFromURL();
    rematchSavedFromEditor();
    await activateCurrent();
    await persistProfile();
  });
  el.url.addEventListener('input', () => {
    if (syncingQuery) return;
    if (isHTTPMode()) syncParamsFromURL();
  });
  el.protocol.addEventListener('change', persistProfile);
  el.method.addEventListener('change', () => {
    rematchSavedFromEditor();
    persistProfile();
  });
  el.reconnect.addEventListener('change', persistProfile);
  el.reqTitle?.addEventListener('input', onReqMetaInput);
  el.reqModule?.addEventListener('focus', () => {
    moduleFilterArmed = false;
    openModuleMenu();
  });
  el.reqModule?.addEventListener('input', () => {
    moduleFilterArmed = true;
    onReqMetaInput();
    if (moduleMenuOpen()) renderModuleMenu();
    else openModuleMenu();
  });
  el.moduleMenu?.addEventListener('mousedown', (e) => e.preventDefault());
  el.moduleMenu?.addEventListener('click', onModuleMenuClick);
  el.reqDesc?.addEventListener('input', onReqMetaInput);
  el.btnEnvMore?.addEventListener('mousedown', (e) => e.preventDefault());
  el.btnEnvMore?.addEventListener('click', openEnvMenu);
  el.btnCatalogToggle?.addEventListener('click', () => setCatalogOpen(!catalogOpen()));
  el.btnCatalogAdd?.addEventListener('click', () => addCatalogRequest(''));
  el.btnCatalogExport?.addEventListener('click', (e) => {
    e.preventDefault();
    openExportMenu(el.btnCatalogExport);
  });
  el.btnCatalogImport?.addEventListener('click', importCatalog);
  el.btnSaveReq?.addEventListener('click', saveCurrentRequest);
  el.btnSaveWS?.addEventListener('click', saveCurrentRequest);
  el.catalogFilter?.addEventListener('input', () => renderCatalog());
  el.catalogList?.addEventListener('mousedown', (e) => {
    if (e.target?.closest?.('.catalog-more, .catalog-add-module')) {
      e.preventDefault();
    }
  });
  el.catalogList?.addEventListener('click', onCatalogClick);
  el.catalogList?.addEventListener('mouseover', onCatalogHover);
  el.catalogList?.addEventListener('mouseleave', hideCatalogTip);
  el.catalogList?.addEventListener('dragstart', onCatalogDragStart);
  el.catalogList?.addEventListener('dragover', onCatalogDragOver);
  el.catalogList?.addEventListener('drop', onCatalogDrop);
  el.catalogList?.addEventListener('dragend', onCatalogDragEnd);
  el.catalogList?.addEventListener('scroll', () => {
    hideCatalogTip();
    closeGroupMenu();
  });
  el.groupMenu?.addEventListener('mousedown', (e) => e.preventDefault());
  el.groupMenu?.addEventListener('click', onGroupMenuClick);
  window.addEventListener('resize', () => {
    hideCatalogTip();
    closeGroupMenu();
  });

  EventsOn('message', (m) => {
    if (historyMode) return;
    if (!isCurrentProfileEvent(m?.profile)) return;
    rememberLiveMsg(m);
    appendMsg(m, true);
  });
  EventsOn('status', (s) => {
    if (!isCurrentProfileEvent(s?.profile)) return;
    setState(s);
  });

  if (!profiles.length) {
    try {
      setState(await GetStatus());
    } catch (_) {}
  }

  const paths = await GetPaths();
  el.footer.textContent = `requests: ${paths.requests}   ·   servers: ${paths.servers}`;
}

init().catch((e) => {
  setDetailEmpty('init failed: ' + e);
});
