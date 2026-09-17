import type { LeadStatus } from '@/lib/types';

export interface FilterState {
  search: string;
  status: LeadStatus | 'all';
  sortByScore: boolean;
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const STATUS_OPTIONS: Array<{ value: LeadStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'new', label: 'Nuevo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'replied', label: 'Respondió' },
  { value: 'converted', label: 'Convertido' },
  { value: 'discarded', label: 'Descartado' },
];

export function Filters({ filters, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 16px', flexWrap: 'wrap' }}>
      <input
        placeholder="Buscar username, nombre o bio..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd' }}
      />
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as LeadStatus | 'all' })}
        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd' }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={filters.sortByScore}
          onChange={(e) => onChange({ ...filters, sortByScore: e.target.checked })}
        />
        Ordenar por score
      </label>
    </div>
  );
}
