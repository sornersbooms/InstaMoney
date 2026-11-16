import { useEffect, useRef, useState } from 'react';
import { getVoiceNotes, saveVoiceNotes } from '@/lib/storage';
import { uid } from '@/lib/text';
import type { VoiceNote } from '@/lib/types';
import { Button, Callout, ConfirmButton, Empty, Field, Icon, useToast } from '../ui';

const MAX_SECONDS = 60;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function durationOf(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return Math.round(buf.duration * 1000);
  } finally {
    ctx.close();
  }
}

/** Notas de voz pregrabadas: se suben como archivo o se graban aquí mismo con el micrófono. */
export function VoiceNotes() {
  const toast = useToast();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [name, setName] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    getVoiceNotes().then(setNotes);
  }, []);

  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function add(blob: Blob, fallbackName: string) {
    try {
      const durationMs = await durationOf(blob);
      if (durationMs > MAX_SECONDS * 1000) return toast(`Máximo ${MAX_SECONDS} segundos`, true);
      const note: VoiceNote = { id: uid('v'), name: name.trim() || fallbackName, dataUrl: await readAsDataUrl(blob), durationMs, createdAt: Date.now() };
      const next = [note, ...notes];
      await saveVoiceNotes(next);
      setNotes(next);
      setName('');
      toast('Audio guardado');
    } catch {
      toast('No se pudo leer el audio. Usa MP3, M4A, OGG, WAV o WEBM.', true);
    }
  }

  async function toggleRecord() {
    if (recording) return recorder.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        add(new Blob(chunks, { type: rec.mimeType }), `Grabación ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_SECONDS * 1000);
    } catch {
      toast('Chrome no dio acceso al micrófono aquí. Graba con el móvil y sube el archivo.', true);
    }
  }

  async function remove(id: string) {
    const next = notes.filter((n) => n.id !== id);
    await saveVoiceNotes(next);
    setNotes(next);
  }

  return (
    <>
      <div className="card">
        <Field label="Nombre del audio">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Saludo cálido" />
        </Field>
        <div className="grid2">
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={15} /> Subir archivo
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) add(f, f.name.replace(/\.[^.]+$/, ''));
                e.target.value = '';
              }}
            />
          </label>
          <Button variant={recording ? 'danger' : 'primary'} icon={recording ? 'pause' : 'mic'} onClick={toggleRecord}>
            {recording ? `Detener · ${elapsed}s` : 'Grabar'}
          </Button>
        </div>
        <Callout tone="warning">Experimental: se envía como nota de voz real en el chat. Máx. {MAX_SECONDS} s.</Callout>
      </div>
      {notes.length === 0 ? (
        <Empty icon="mic" title="Sin notas de voz" text="Un audio corto y cercano después del primer mensaje suele subir mucho la tasa de respuesta." />
      ) : (
        <div className="stack">
          {notes.map((n) => (
            <div key={n.id} className="card tight">
              <div className="row">
                <Icon name="volume" size={16} />
                <b className="grow ellipsis">{n.name}</b>
                <span className="muted small">{Math.round(n.durationMs / 1000)} s</span>
                <ConfirmButton size="sm" onConfirm={() => remove(n.id)} confirmLabel="¿Borrar?" />
              </div>
              <audio controls src={n.dataUrl} style={{ width: '100%', height: 34 }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
