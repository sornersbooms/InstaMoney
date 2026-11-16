import { useState } from 'react';
import { clearActionLog } from '@/lib/storage';
import type { ActionKind, ActionLogEntry } from '@/lib/types';
import { Button, Chip, Empty, Icon, PageHead, timeAgo, type IconName } from '../ui';
import { useActivity, useNav } from '../hooks';

const ACTION_ICON: Record<ActionKind | 'system', IconName> = {
  dm: 'send',
  voice: 'mic',
  follow: 'userPlus',
  unfollow: 'userMinus',
  like: 'heart',
  comment: 'message',
  story: 'eye',
  closeFriends: 'star',
  lookup: 'search',
  system: 'bot',
};

const LEVEL_STYLE = {
  info: { bg: 'var(--surface-2)', fg: 'var(--text-2)' },
  ok: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  warn: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  error: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

export function ActivityItem({ e }: { e: ActionLogEntry }) {
  const st = LEVEL_STYLE[e.level];
  return (
    <div className="tl-item">
      <div className="tl-dot" style={{ background: st.bg, color: st.fg }}>
        <Icon name={e.level === 'error' ? 'alert' : ACTION_ICON[e.action ?? 'system']} size={14} />
      </div>
      <div className="tl-body">
        <div style={{ color: e.level === 'error' ? 'var(--danger)' : undefined }}>
          {e.username && (
            <a href={`https://www.instagram.com/${e.username}/`} target="_blank" rel="noreferrer">
              <b>@{e.username}</b>{' '}
            </a>
          )}
          {e.text}
        </div>
        <div className="meta">{timeAgo(e.at)}</div>
      </div>
    </div>
  );
}

type Filter = 'all' | 'ok' | 'problems';

export function ActivityLog() {
  const nav = useNav();
  const log = useActivity();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = log.filter((e) => (filter === 'all' ? true : filter === 'ok' ? e.level === 'ok' : e.level === 'error' || e.level === 'warn'));

  return (
    <>
      <PageHead
        title="Actividad"
        subtitle="Todo lo que hace el motor, en tiempo real"
        onBack={() => nav({ page: 'more' })}
        actions={log.length > 0 && <Button size="sm" variant="ghost" icon="trash" onClick={clearActionLog}>Limpiar</Button>}
      />
      <div className="chips">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={log.length}>Todo</Chip>
        <Chip active={filter === 'ok'} onClick={() => setFilter('ok')} color="var(--success)">Acciones hechas</Chip>
        <Chip active={filter === 'problems'} onClick={() => setFilter('problems')} color="var(--danger)">Avisos y errores</Chip>
      </div>
      {shown.length === 0 ? (
        <Empty icon="activity" title="Sin actividad todavía" text="Cuando el motor trabaje, aquí verás cada acción con su hora." />
      ) : (
        <div className="card flat">
          <div className="timeline">
            {shown.map((e, i) => (
              <ActivityItem key={`${e.at}-${i}`} e={e} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
