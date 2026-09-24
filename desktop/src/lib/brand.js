/** Marca activa, horneada por Vite desde electron/active-brand.json. */
export const brand = __BRAND__;

/** Pinta los colores de la marca sobre las variables CSS del tema. */
export function applyBrandColors() {
  const root = document.documentElement;
  root.style.setProperty('--cyan', brand.colors.primary);
  root.style.setProperty('--purple', brand.colors.secondary);
  root.style.setProperty('--pink', brand.colors.accent);
  document.title = brand.productName;
}
