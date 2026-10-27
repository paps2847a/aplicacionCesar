export function esTelefonoValido(valor: string): boolean {
  const limpio = String(valor || '').trim();
  if (!limpio || limpio.includes('@')) return false;
  if (/^(n\/a|no existe|sin tel|-)$/i.test(limpio)) return true;
  const digitos = limpio.replace(/\D/g, '');
  if (digitos.length < 7 || digitos.length > 16) return false;
  return /^[+\d\s().-]{7,24}$/.test(limpio);
}


/**
 * Normaliza cualquier formato de teléfono argentino o internacional para enlaces wa.me
 */
export function normalizarTelefonoWA(rawTel: string): string {
  if (!rawTel) return '';
  const trimmed = String(rawTel).trim();
  if (trimmed.toUpperCase() === 'N/A' || trimmed === '-') return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits || digits.length < 8) return '';

  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    return '549' + digits.slice(2);
  }
  if (digits.startsWith('15') && digits.length === 10) {
    return '54911' + digits.slice(2);
  }
  if (digits.length === 10 && (digits.startsWith('11') || digits.startsWith('2') || digits.startsWith('3'))) {
    return '549' + digits;
  }
  return digits;
}

/**
 * Extrae la calle, intersección o punto de encuentro cargado en la Columna "G" ("Comentario") del Google Sheets.
 * Soporta tanto direcciones entre paréntesis `(Correa 2838)` como direcciones o puntos escritos directamente
 * en el comentario (`Chile 1408`, `Cabildo y Juramento`, `Parque Saavedra`, `Av. Santa Fe 3200`),
 * ignorando menciones que sean únicamente el nombre de un barrio o notas de estado (`(x2)`, `(confirmado)`, `Sin respuesta`).
 */

