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
  let digits = trimmed.replace(/\D/g, '');
  if (!digits || digits.length < 8) return '';

  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    return '549' + digits.slice(2);
  }

  // Quitar el 0 inicial del prefijo interurbano (ej. 011 -> 11)
  if (digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }

  // Si tiene el formato CABA con 15 intermedio (ej. 011-15-xxxx-xxxx -> 1115xxxxxxxx)
  if (digits.startsWith('1115') && digits.length === 12) {
    return '54911' + digits.slice(4);
  }

  if (digits.startsWith('15') && digits.length === 10) {
    return '54911' + digits.slice(2);
  }

  // Si tiene 8 dígitos (número local directo en CABA sin prefijo de área)
  if (digits.length === 8) {
    return '54911' + digits;
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

