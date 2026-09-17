import type { Lead } from './types';

const COLUMNS: Array<keyof Lead> = [
  'username',
  'fullName',
  'bio',
  'followerCount',
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

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = Array.isArray(value) ? value.join('|') : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = COLUMNS.join(',');
  const rows = leads.map((lead) => COLUMNS.map((col) => escapeCsvValue(lead[col])).join(','));
  return [header, ...rows].join('\n');
}

export function downloadCsv(leads: Lead[], filename = `instamoney-leads-${Date.now()}.csv`): void {
  const csv = leadsToCsv(leads);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
