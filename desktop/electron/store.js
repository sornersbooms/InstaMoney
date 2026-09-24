const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const brand = require('./active-brand.json');

// Cada marca guarda sus datos aparte, para que convivan sin pisarse en el mismo equipo.
const FILE = path.join(app.getPath('userData'), brand.dataFile);

const DEFAULTS = {
  leads: [],
  templates: [],
  settings: {
    groqApiKey: '',
    groqModel: 'llama-3.1-8b-instant',
    icpKeywords: '',
    offer: '',
    dailyContactSoftLimit: 15,
  },
  dailyStats: [],
  sendQueue: null,
  license: null,
  deviceId: null,
};

let data = null;
let saveTimer = null;

function load() {
  if (data) return data;
  try {
    data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    data = { ...DEFAULTS };
  }
  return data;
}

function flush() {
  saveTimer = null;
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('No se pudo guardar el archivo de datos:', err);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  scheduleSave();
  return value;
}

function getAll() {
  return { ...load() };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getTodayStats() {
  const today = todayKey();
  return get('dailyStats').find((s) => s.date === today) ?? { date: today, contactedCount: 0 };
}

function incrementContactedToday() {
  const stats = get('dailyStats');
  const today = todayKey();
  const existing = stats.find((s) => s.date === today);
  if (existing) {
    existing.contactedCount += 1;
  } else {
    stats.push({ date: today, contactedCount: 1 });
  }
  scheduleSave();
  return getTodayStats();
}

/** Solo agrega perfiles que no estén ya guardados, comparando por username. */
function addLeads(newLeads) {
  const leads = get('leads');
  const known = new Set(leads.map((l) => l.username.toLowerCase()));
  const toAdd = newLeads.filter((l) => !known.has(l.username.toLowerCase()));
  set('leads', [...toAdd, ...leads]);
  return { added: toAdd.length, skipped: newLeads.length - toAdd.length };
}

function updateLead(id, patch) {
  const leads = get('leads');
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  leads[idx] = { ...leads[idx], ...patch };
  scheduleSave();
  return leads[idx];
}

function updateLeadByUsername(username, patch) {
  const leads = get('leads');
  const idx = leads.findIndex((l) => l.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return null;
  leads[idx] = { ...leads[idx], ...patch };
  scheduleSave();
  return leads[idx];
}

module.exports = {
  FILE,
  get,
  set,
  getAll,
  getTodayStats,
  incrementContactedToday,
  addLeads,
  updateLead,
  updateLeadByUsername,
  flush,
};
