import { normalizarBarrioCABA, sincronizarBarrioConDireccionComentario } from '../geo/cabaLocations';
import { Contact, EstadoFlujo, RawContactRow } from '../../types';
import { esTelefonoValido } from '../contacts/phoneUtils';
import { UMBRAL_ID_SIN_PRIMER_CONTACTO, asegurarIdsUnicosContactos, esComentarioDescartadoONoCaba, extraerNumeroIdContacto, obtenerEtiquetaEstadoFlujo, parsearTextoAEstadoFlujo, tieneNuevaInformacionEnColumnaG } from '../contacts/contactStatus';
import { esCeldaSinNombre } from '../contacts/nameCorrection';
import {
  esBarrioDeCABA,
  esEmailValido,
  esIdFilaValido,
  } from '../geo/cabaLocations';

export function dividirLineaTSVoCSV(lineaRaw: string): string[] {
  const linea = lineaRaw.replace(/\r$/, '');
  if (linea.includes('\t')) {
    return linea.split('\t').map((c) => c.replace(/^"|"$/g, '').trim());
  }
  const cols: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if (ch === ',' && !enComillas) {
      cols.push(actual.trim());
      actual = '';
    } else {
      actual += ch;
    }
  }
  cols.push(actual.trim());
  return cols;
}

/**
 * Parsea texto TSV o CSV pegado o sincronizado desde Google Sheets Estatus_POPURRÍ.
 * Detecta la Columna B como el Nombre y Apellido (incluso si la Columna A está vacía o fue omitida
 * por la exportación de Google Sheets), distingue automáticamente Barrio vs. Nombre, soporta columna
 * de Email (Columna D) y vincula la columna de Estado.
 */
export function parsearTSVoCSVContactos(
  texto: string,
  marcarEnSheets: boolean = true
): RawContactRow[] {
  if (!texto || !texto.trim()) return [];
  const lineasRaw = texto
    .split(/\r?\n/)
    .filter((l) => l.replace(/[\s,;\t"]/g, '').length > 0);
  if (lineasRaw.length === 0) return [];

  const matriz = lineasRaw.map(dividirLineaTSVoCSV);

  // Detectar si la primera fila es de encabezados
  const fila0Low = matriz[0].map((c) => c.toLowerCase().trim());
  const palabrasHeader = [
    'nombre',
    'apellido',
    'barrio',
    'comuna',
    'tel',
    'cel',
    'whatsapp',
    'mail',
    'correo',
    'rsp',
    'respond',
    'adhir',
    'comentario',
    'observaci',
    'estado',
  ];
  const coincidenciasHeader = fila0Low.filter((celda) =>
    palabrasHeader.some((p) => celda.includes(p))
  ).length;
  const tieneHeader =
    coincidenciasHeader >= 2 ||
    fila0Low[0] === '#' ||
    fila0Low[1]?.includes('nombre');

  const filasDatos = (tieneHeader ? matriz.slice(1) : matriz).filter(
    (cols) => cols.length >= 2 && cols.some((c) => c.trim().length > 0)
  );
  if (filasDatos.length === 0) return [];

  const maxCols = Math.max(...filasDatos.map((r) => r.length), fila0Low.length);

  // Contar patrones reales por columna en las filas de datos
  const conteoBarrio = new Array(maxCols).fill(0);
  const conteoEmail = new Array(maxCols).fill(0);
  const conteoTel = new Array(maxCols).fill(0);
  const conteoId = new Array(maxCols).fill(0);

  for (const r of filasDatos) {
    for (let c = 0; c < r.length; c++) {
      const val = (r[c] || '').trim();
      if (!val) continue;
      if (esBarrioDeCABA(val)) conteoBarrio[c]++;
      if (esEmailValido(val)) conteoEmail[c]++;
      if (esTelefonoValido(val)) conteoTel[c]++;
      if (esIdFilaValido(val)) conteoId[c]++;
    }
  }

  // Determinar si Google Sheets omitió la Columna A vacía al exportar CSV/getDataRange
  // (en ese caso, la Columna B "Nombre" llega en el índice 0 y la Columna C "Barrio" en el índice 1)
  const colAOmitidaPorSheets =
    conteoBarrio[1] > 0 &&
    conteoBarrio[1] >= conteoBarrio[2] &&
    conteoId[0] < Math.ceil(filasDatos.length * 0.5) &&
    (conteoEmail[2] > 0 || conteoTel[2] > 0 || conteoTel[3] > 0);

  // Si la Columna A fue omitida por Google Sheets al exportar, anteponemos '' como Columna A
  // para que los índices coincidan exactamente con las columnas reales del Google Sheet (A=0, B=1, C=2, D=3...)
  const filasNormalizadas = colAOmitidaPorSheets
    ? filasDatos.map((r) => ['', ...r])
    : filasDatos;
  const headerNormalizado =
    tieneHeader && colAOmitidaPorSheets ? ['', ...fila0Low] : fila0Low;

  // Recalcular conteos sobre las filas ya alineadas con Columna A = 0, Columna B = 1
  const maxColsNorm = Math.max(
    ...filasNormalizadas.map((r) => r.length),
    headerNormalizado.length,
    9
  );
  const barNorm = new Array(maxColsNorm).fill(0);
  const mailNorm = new Array(maxColsNorm).fill(0);
  const telNorm = new Array(maxColsNorm).fill(0);

  for (const r of filasNormalizadas) {
    for (let c = 0; c < r.length; c++) {
      const val = (r[c] || '').trim();
      if (!val) continue;
      if (esBarrioDeCABA(val)) barNorm[c]++;
      if (esEmailValido(val)) mailNorm[c]++;
      if (esTelefonoValido(val)) telNorm[c]++;
    }
  }

  // El nombre a detectar está en la Columna "B" (índice 1) del Google Sheets
  let idxId = 0;
  let idxNombre = 1; // Columna B
  let idxBarrio = 2; // Columna C

  // Si en alguna hoja la Columna A (índice 0) tuviera el Barrio y la Columna B (índice 1) el Nombre:
  if (barNorm[0] > barNorm[2] && barNorm[0] > 0 && barNorm[1] === 0) {
    idxBarrio = 0;
    idxNombre = 1; // Columna B sigue siendo Nombre
    idxId = -1;
  } else if (tieneHeader) {
    const hNombre = headerNormalizado.findIndex(
      (h, idx) =>
        idx > 0 &&
        (h.includes('nombre') || h.includes('apellido') || h.includes('vecino')) &&
        !h.includes('barrio')
    );
    const hBarrio = headerNormalizado.findIndex(
      (h) => h.includes('barrio') || h.includes('comuna')
    );
    if (hNombre >= 0 && barNorm[hNombre] === 0) idxNombre = hNombre;
    if (hBarrio >= 0) idxBarrio = hBarrio;
  }

  // Detectar si existe columna de Email en Columna D (índice 3)
  const tieneColumnaEmailEnD =
    mailNorm[3] > 0 ||
    (tieneHeader &&
      Boolean(
        headerNormalizado[3]?.includes('mail') ||
          headerNormalizado[3]?.includes('correo')
      )) ||
    (telNorm[4] > telNorm[3] && telNorm[4] > 0);

  const idxEmail = tieneColumnaEmailEnD ? 3 : -1;
  const idxTel = tieneColumnaEmailEnD ? 4 : 3;
  const idxRsp = tieneColumnaEmailEnD ? 5 : 4;
  const idxAdhirio = tieneColumnaEmailEnD ? 6 : 5;
  const idxComentario = tieneColumnaEmailEnD ? 7 : 6;
  const idxEstado = tieneColumnaEmailEnD ? 8 : 7;

  const resultado: RawContactRow[] = [];
  const idsUsados = new Set<string>();
  let ultimoIdNumerico = 0;

  for (let i = 0; i < filasNormalizadas.length; i++) {
    const cols = filasNormalizadas[i];
    const idRaw = idxId >= 0 ? String(cols[idxId] || '').trim() : '';
    let id = '';
    if (idRaw && esIdFilaValido(idRaw)) {
      const idCandidato = idRaw.replace(/^#/, '').trim();
      if (!idsUsados.has(idCandidato)) {
        id = idCandidato;
      }
    }
    if (!id) {
      let siguienteNum = Math.max(i + 1, ultimoIdNumerico + 1);
      while (idsUsados.has(String(siguienteNum))) {
        siguienteNum += 1;
      }
      id = String(siguienteNum);
    }
    idsUsados.add(id);
    const numActual = Number(id);
    if (Number.isFinite(numActual) && numActual > ultimoIdNumerico) {
      ultimoIdNumerico = numActual;
    }

    let nombre = String(cols[idxNombre] || '').trim();
    let barrio = String(cols[idxBarrio] || '').trim();
    const email = idxEmail >= 0 ? String(cols[idxEmail] || '').trim() : undefined;
    const telRaw = String(cols[idxTel] || '').trim();

    // Salvaguarda adicional por fila: si en `nombre` cayó un barrio de CABA, jamás asumirlo como nombre de persona
    if (esBarrioDeCABA(nombre)) {
      const candidatoColB = String(cols[1] || '').trim();
      const candidatoColA = String(cols[0] || '').trim();
      if (candidatoColB && !esBarrioDeCABA(candidatoColB) && !esIdFilaValido(candidatoColB)) {
        barrio = normalizarBarrioCABA(nombre);
        nombre = candidatoColB;
      } else if (
        candidatoColA &&
        !esBarrioDeCABA(candidatoColA) &&
        !esIdFilaValido(candidatoColA)
      ) {
        barrio = normalizarBarrioCABA(nombre);
        nombre = candidatoColA;
      } else {
        barrio = normalizarBarrioCABA(nombre);
        nombre = '';
      }
    }

    barrio = barrio && !esEmailValido(barrio) ? normalizarBarrioCABA(barrio) : 'Palermo';

    // Permitir filas que tengan teléfono o nombre válido
    if (!nombre && !telRaw) continue;

    const rspRaw = String(cols[idxRsp] || '').trim();
    const adhRaw = String(cols[idxAdhirio] || 'Pendiente').trim();
    const comentario = String(cols[idxComentario] || '').trim();
    const estadoCeldaRaw =
      cols.length > idxEstado ? String(cols[idxEstado] || '').trim() : '';
    const estadoFlujoExplicito = parsearTextoAEstadoFlujo(estadoCeldaRaw);

    const numId = extraerNumeroIdContacto(id);
    const esDesde167EnAdelante = numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO;
    const rspEsSi = /^(s[ií]|respond[ií]o|ok)$/i.test(rspRaw);
    const adhEsSi = /^(s[ií]|firm[oó]|firmad[oa]|adherid[oa])$/i.test(adhRaw);
    const adhEsDescartadoExplicito =
      /^(baja|descartad[oa]|no\s*caba|fuera\s*de\s*caba)$/i.test(adhRaw) ||
      esComentarioDescartadoONoCaba(comentario, estadoFlujoExplicito);
    const tieneInfoColG = tieneNuevaInformacionEnColumnaG(comentario);

    // Determinar si ya fue contactado por primera vez o si requiere 1er contacto (#167 en adelante o RSP="Nuevo")
    // Nota: en el Google Sheet la columna F ("Adhirió") suele tener "No" o "Pendiente" por defecto para todos los que aún no adhirieron,
    // por lo que "No" en Columna F significa "Pendiente de adherir" y NO que ya haya sido contactado.
    const yaContactadoExplicitoEnSheet =
      rspEsSi ||
      adhEsSi ||
      adhEsDescartadoExplicito ||
      tieneInfoColG ||
      (estadoFlujoExplicito !== undefined &&
        estadoFlujoExplicito !== 'SIN_CONTACTAR_1ER_MSJ' &&
        estadoFlujoExplicito !== 'FALTA_NOMBRE_Y_APELLIDO') ||
      /1er\s*(mensaje|msj)\s*enviado|visita|sin respuesta|no contesta|vive en|no tiene domicilio/i.test(
        comentario
      );

    const necesitaPrimerContacto =
      /^nuevo$/i.test(rspRaw) ||
      estadoFlujoExplicito === 'SIN_CONTACTAR_1ER_MSJ' ||
      estadoFlujoExplicito === 'FALTA_NOMBRE_Y_APELLIDO' ||
      (esDesde167EnAdelante && !yaContactadoExplicitoEnSheet);

    const sinNom = esCeldaSinNombre(nombre);
    const estadoFlujoFinal: EstadoFlujo | undefined = necesitaPrimerContacto
      ? sinNom
        ? 'FALTA_NOMBRE_Y_APELLIDO'
        : 'SIN_CONTACTAR_1ER_MSJ'
      : estadoFlujoExplicito;

    // Marca temporal base para contactos ya contactados en la planilla (>48h si no tienen marca reciente en la app)
    const fechaBaseHistorica = '2025-05-14';

    const filaCruda: RawContactRow = sincronizarBarrioConDireccionComentario({
      id,
      nombre,
      barrio,
      email: email && esEmailValido(email) ? email : undefined,
      telRaw,
      rsp: rspEsSi ? 'Sí' : necesitaPrimerContacto ? 'Nuevo' : 'No',
      adhirio: adhEsSi ? 'Sí' : adhEsDescartadoExplicito ? 'No' : 'Pendiente',
      comentario,
      estadoFlujo: estadoFlujoFinal,
      estadoFlujoEtiqueta: estadoFlujoFinal
        ? obtenerEtiquetaEstadoFlujo(estadoFlujoFinal)
        : undefined,
      enSheets: marcarEnSheets,
      primerContactoEnviado: !necesitaPrimerContacto,
      fechaAgregado: necesitaPrimerContacto
        ? new Date().toISOString().slice(0, 10)
        : fechaBaseHistorica,
      ultimoContacto: necesitaPrimerContacto ? '' : fechaBaseHistorica,
      intentos: necesitaPrimerContacto ? 0 : 1,
    });

    resultado.push(filaCruda);
  }

  return asegurarIdsUnicosContactos(resultado);
}

/**
 * Actualiza automáticamente todas las personas desde el #167 en adelante que aún no hayan sido
 * marcadas como contactadas en el registro de control para que figuren como pendientes de 1er Contacto,
 * y sincroniza automáticamente el barrio según la dirección cargada en la Columna G ("Comentario").
 */

export function exportarContactosACSV(contacts: Contact[]): string {
  const incluyeEmail = contacts.some((c) => Boolean(c.email));
  const header = incluyeEmail
    ? ['#', 'Nombre', 'Barrio', 'Mail', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado', '1er Contacto']
    : ['#', 'Nombre', 'Barrio', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado', '1er Contacto'];
  const esc = (v: string) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };
  const rows = contacts.map((c) => {
    const etiqueta1erContacto = c.primerContactoEnviado
      ? `Enviado${c.fechaPrimerContacto ? ` (${c.fechaPrimerContacto})` : ''}`
      : 'Pendiente 1er Contacto';
    const base = incluyeEmail
      ? [
          c.id,
          c.nombre,
          c.barrio,
          c.email || '',
          c.telRaw,
          c.rsp === 'Sí' ? 'Sí' : 'No',
          c.adhirio,
          c.comentario,
          c.estadoFlujoEtiqueta,
          etiqueta1erContacto,
        ]
      : [
          c.id,
          c.nombre,
          c.barrio,
          c.telRaw,
          c.rsp === 'Sí' ? 'Sí' : 'No',
          c.adhirio,
          c.comentario,
          c.estadoFlujoEtiqueta,
          etiqueta1erContacto,
        ];
    return base.map(esc).join(',');
  });
  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}

/**
 * Exporta las filas en formato TSV (separado por tabulaciones) ideal para copiar con 1 clic
 * y pegar directamente (`Ctrl+V`) sobre una tabla de Excel o Google Sheets respetando cada columna.
 */
export function exportarContactosATSVParaExcel(contacts: Contact[]): string {
  const incluyeEmail = contacts.some((c) => Boolean(c.email));
  const header = incluyeEmail
    ? ['#', 'Nombre', 'Barrio', 'Mail', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado', '1er Contacto']
    : ['#', 'Nombre', 'Barrio', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado', '1er Contacto'];
  const clean = (v: string) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const rows = contacts.map((c) => {
    const etiqueta1erContacto = c.primerContactoEnviado
      ? `Enviado${c.fechaPrimerContacto ? ` (${c.fechaPrimerContacto})` : ''}`
      : 'Pendiente 1er Contacto';
    const cols = incluyeEmail
      ? [
          c.id,
          c.nombre,
          c.barrio,
          c.email || '',
          c.telRaw,
          c.rsp === 'Sí' ? 'Sí' : 'No',
          c.adhirio,
          c.comentario,
          c.estadoFlujoEtiqueta,
          etiqueta1erContacto,
        ]
      : [
          c.id,
          c.nombre,
          c.barrio,
          c.telRaw,
          c.rsp === 'Sí' ? 'Sí' : 'No',
          c.adhirio,
          c.comentario,
          c.estadoFlujoEtiqueta,
          etiqueta1erContacto,
        ];
    return cols.map(clean).join('\t');
  });
  return [header.join('\t'), ...rows].join('\n');
}

/**
 * Tope estricto anti-bloqueo de WhatsApp: SIEMPRE menor a 45 mensajes por tanda.
 */

