import { brand } from './brand.js';

const COLUMNS = [
  'username',
  'fullName',
  'bio',
  'followerCount',
  'externalLink',
  'isBusiness',
  'sourceType',
  'sourceRef',
  'status',
  'score',
  'scoreReason',
  'tags',
  'notes',
  'capturedAt',
];

function escapeValue(value) {
  if (value === undefined || value === null) return '';
  const text = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(leads) {
  const csv = [COLUMNS.join(','), ...leads.map((lead) => COLUMNS.map((col) => escapeValue(lead[col])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${brand.csvPrefix}-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
