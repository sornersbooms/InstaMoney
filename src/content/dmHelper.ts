import { getDmComposeBox } from './selectors';

/**
 * Inserta texto en la caja de redacción del DM como si el usuario lo hubiera tecleado,
 * para que React/Instagram registre el cambio. NUNCA dispara el envío: eso lo hace
 * el usuario pulsando el botón "Enviar" propio de Instagram.
 */
export function insertTemplateIntoComposeBox(text: string): boolean {
  const box = getDmComposeBox();
  if (!box) return false;

  box.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const inserted = document.execCommand('insertText', false, text);
  if (!inserted) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  }
  return true;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}
