import { useState } from 'react';

export function SettingsPanel({ settings, reload, license, onSignOut }) {
  const [local, setLocal] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  function update(patch) {
    setLocal({ ...local, ...patch });
  }

  async function handleSave() {
    await window.api.data.setSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    reload();
  }

  async function handleLoadModels() {
    if (!local.groqApiKey) {
      setModelsError('Pega tu API key de Groq primero.');
      return;
    }
    setModelsError('');
    setLoadingModels(true);
    const result = await window.api.groq.models(local.groqApiKey);
    setLoadingModels(false);
    if (result.error) {
      setModelsError(result.error);
      return;
    }
    setModels(result.models);
    if (result.models.length === 0) setModelsError('Groq no devolvió modelos para esta cuenta.');
  }

  return (
    <div className="panel">
      <div className="notice">
        ⚠️ <strong>Úsalo con criterio.</strong> Instagram puede marcar tu cuenta como spam si envías muchos
        mensajes no solicitados en poco tiempo, aunque los envíes a mano. Respeta el límite diario, personaliza
        cada mensaje y evita mandar el mismo texto a decenas de personas seguidas.
      </div>

      {license && (
        <div className="card">
          <div className="card-title">🔑 Tu licencia</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span className="muted">Clave</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{license.key}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span className="muted">Tipo</span>
            <span style={{ fontSize: 12 }}>{license.isTrial ? 'Prueba gratuita' : 'Licencia completa'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span className="muted">Vence</span>
            <span style={{ fontSize: 12 }}>
              {license.expiresAt}
              {typeof license.daysLeft === 'number' && ` · ${license.daysLeft} días`}
            </span>
          </div>
          {license.email && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span className="muted">Correo</span>
              <span style={{ fontSize: 12 }}>{license.email}</span>
            </div>
          )}
          <button className="btn btn-danger" onClick={onSignOut}>
            Cerrar sesión de licencia
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-title">🤖 Inteligencia artificial</div>

        <div className="field">
          <label>API key de Groq</label>
          <input
            type="password"
            value={local.groqApiKey ?? ''}
            onChange={(e) => update({ groqApiKey: e.target.value })}
            placeholder="gsk_..."
          />
          <span className="muted">Se guarda solo en este equipo. Consíguela gratis en console.groq.com.</span>
        </div>

        <div className="field">
          <label>Modelo</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ flex: 1 }} value={local.groqModel} onChange={(e) => update({ groqModel: e.target.value })} />
            <button className="btn" onClick={handleLoadModels} disabled={loadingModels}>
              {loadingModels ? <span className="spin">◌</span> : '🔄'}
            </button>
          </div>
          {modelsError && <span style={{ color: '#ff6b9d', fontSize: 11 }}>{modelsError}</span>}
          {models.length > 0 && (
            <select value={local.groqModel} onChange={(e) => update({ groqModel: e.target.value })}>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
          <span className="muted">Si da error "model_not_found", pulsa 🔄 y elige uno de la lista actual.</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🎯 Tu negocio</div>

        <div className="field">
          <label>Cliente ideal</label>
          <textarea
            rows={3}
            value={local.icpKeywords}
            onChange={(e) => update({ icpKeywords: e.target.value })}
            placeholder="ej. dueños de gimnasios, coaches fitness, emprendedores..."
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="field">
          <label>Qué ofreces</label>
          <textarea
            rows={3}
            value={local.offer ?? ''}
            onChange={(e) => update({ offer: e.target.value })}
            placeholder="ej. sistemas de automatización para negocios de servicios"
            style={{ resize: 'vertical' }}
          />
          <span className="muted">La IA lo usa para redactar los mensajes personalizados.</span>
        </div>

        <div className="field">
          <label>Límite diario de contactos</label>
          <input
            type="number"
            min={1}
            value={local.dailyContactSoftLimit}
            onChange={(e) => update({ dailyContactSoftLimit: Number(e.target.value) || 1 })}
          />
          <span className="muted">Solo informativo: te avisa, no te bloquea.</span>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave}>
        {saved ? '✓ Guardado' : 'Guardar ajustes'}
      </button>
      <button className="btn" onClick={() => window.api.data.openFolder()}>
        📂 Ver archivo de datos
      </button>
    </div>
  );
}
