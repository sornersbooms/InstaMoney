import { useState } from 'react';
import type { Settings } from '@/lib/types';
import { saveSettings } from '@/lib/storage';
import { fetchGroqModels } from '@/lib/groqScoring';

interface Props {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}

export function SettingsPanel({ settings, setSettings }: Props) {
  const [local, setLocal] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  async function handleSave() {
    await saveSettings(local);
    setSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function handleLoadModels() {
    if (!local.groqApiKey) {
      setModelsError('Pega tu API key de Groq primero.');
      return;
    }
    setModelsError('');
    setLoadingModels(true);
    try {
      const fetched = await fetchGroqModels(local.groqApiKey);
      setModels(fetched.map((m) => m.id));
      if (fetched.length === 0) setModelsError('Groq no devolvió modelos para esta cuenta.');
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Error al consultar modelos de Groq.');
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff8e1', border: '1px solid #f5d97a', borderRadius: 8, padding: 12, fontSize: 12, color: '#7a5c00' }}>
        ⚠️ <strong>Úsalo con criterio.</strong> Instagram puede marcar tu cuenta como spam si envías muchos mensajes
        no solicitados en poco tiempo, aunque los envíes manualmente. Respeta el límite diario que definas abajo,
        personaliza tus mensajes y evita enviar el mismo texto a decenas de personas seguidas.
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>API key de Groq</label>
        <input
          type="password"
          value={local.groqApiKey ?? ''}
          onChange={(e) => setLocal({ ...local, groqApiKey: e.target.value })}
          placeholder="gsk_..."
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
        />
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Se guarda solo en tu navegador. Consíguela en console.groq.com.</div>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Modelo de Groq</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={local.groqModel}
            onChange={(e) => setLocal({ ...local, groqModel: e.target.value })}
            style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
          />
          <button
            onClick={handleLoadModels}
            disabled={loadingModels}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 12, whiteSpace: 'nowrap' }}
          >
            {loadingModels ? 'Cargando...' : '🔄 Ver modelos'}
          </button>
        </div>
        {modelsError && <div style={{ fontSize: 11, color: '#ed4956', marginTop: 4 }}>{modelsError}</div>}
        {models.length > 0 && (
          <select
            value={local.groqModel}
            onChange={(e) => setLocal({ ...local, groqModel: e.target.value })}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', marginTop: 6 }}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          Groq retira modelos de vez en cuando. Si te da error "model_not_found", pulsa "Ver modelos" y elige uno de la lista actual.
        </div>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Palabras clave / perfil de cliente ideal</label>
        <textarea
          value={local.icpKeywords}
          onChange={(e) => setLocal({ ...local, icpKeywords: e.target.value })}
          placeholder="ej. emprendedores fitness, dueños de gimnasios, coaches online..."
          rows={3}
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', resize: 'vertical' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Límite diario de contactos (informativo)
        </label>
        <input
          type="number"
          min={1}
          value={local.dailyContactSoftLimit}
          onChange={(e) => setLocal({ ...local, dailyContactSoftLimit: Number(e.target.value) || 1 })}
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
        />
      </div>

      <button onClick={handleSave} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#0095f6', color: '#fff', fontWeight: 600 }}>
        {saved ? '✓ Guardado' : 'Guardar ajustes'}
      </button>
    </div>
  );
}
