import { normalizarBarrioCABA, sincronizarBarrioConDireccionComentario } from '../geo/cabaLocations';
import { Contact, EstadoFlujo, RawContactRow } from '../../types';
import { esTelefonoValido, normalizarTelefonoWA } from '../contacts/phoneUtils';
import {
  ESTADOS_FLUJO_CATALOGO,
  UMBRAL_ID_SIN_PRIMER_CONTACTO,
  analizarEstadoPorColumnasEFG,
  asegurarIdsUnicosContactos,
  esComentarioDescartadoONoCaba,
  extraerNumeroIdContacto,
  obtenerEtiquetaEstadoFlujo,
  parsearTextoAEstadoFlujo,
  tieneNuevaInformacionEnColumnaG,
} from '../contacts/contactStatus';
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
  const lineasFisicas = texto
    .split(/\r?\n/)
    .filter((l) => l.replace(/[\s,;\t"]/g, '').length > 0);
  if (lineasFisicas.length === 0) return [];

  // Reconstruir filas lógicas cuando una celda (ej. Comentario) contiene un salto de línea interno `\n`
  const esFormatoTab = lineasFisicas[0].includes('\t');
  const headerTabsCount = (lineasFisicas[0].match(/\t/g) || []).length;
  const minFullRowTabs = Math.max(5, headerTabsCount - 1);
  const lineasRaw: string[] = [];
  for (let i = 0; i < lineasFisicas.length; i++) {
    const lin = lineasFisicas[i];
    if (i === 0 || !esFormatoTab) {
      lineasRaw.push(lin);
      continue;
    }
    const currTabs = (lin.match(/\t/g) || []).length;
    const startsWithRowId = /^\s*#?\d+\t/.test(lin);
    const prevLin = lineasRaw[lineasRaw.length - 1] || '';
    const prevTabs = (prevLin.match(/\t/g) || []).length;
    const tieneTelEnLinea = lin.split('\t').some((c) => esTelefonoValido(c.trim()));

    if (
      lineasRaw.length > 1 &&
      !startsWithRowId &&
      !tieneTelEnLinea &&
      (currTabs <= 2 || prevTabs < minFullRowTabs)
    ) {
      lineasRaw[lineasRaw.length - 1] = `${prevLin} / ${lin.trim()}`;
    } else {
      lineasRaw.push(lin);
    }
  }

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

  // Detectar si el archivo / Google Sheets usa el nuevo formato estructurado de 11 columnas:
  // #, Nombre, Barrio, Tel, RSP, Adhirió, Día(s), Horario, Dirección / Punto, Comentario, Estado
  const baseAfterAdhirio = idxAdhirio + 1;
  const tieneFormatoEstructurado =
    (tieneHeader &&
      headerNormalizado.some(
        (h) =>
          h.includes('día') ||
          h.includes('dia(s)') ||
          h.includes('horario') ||
          h.includes('direcci')
      )) ||
    (!tieneHeader && maxColsNorm >= baseAfterAdhirio + 5);

  const idxDias = tieneFormatoEstructurado ? baseAfterAdhirio : -1;
  const idxHorario = tieneFormatoEstructurado ? baseAfterAdhirio + 1 : -1;
  const idxDireccion = tieneFormatoEstructurado ? baseAfterAdhirio + 2 : -1;
  const idxComentario = tieneFormatoEstructurado ? baseAfterAdhirio + 3 : baseAfterAdhirio;
  const idxEstado = tieneFormatoEstructurado ? baseAfterAdhirio + 4 : baseAfterAdhirio + 1;

  const resultado: RawContactRow[] = [];
  const idsUsados = new Set<string>();
  const idxPorId = new Map<string, number>();
  const idxPorTelNorm = new Map<string, number>();
  let ultimoIdNumerico = 0;

  for (let i = 0; i < filasNormalizadas.length; i++) {
    const cols = filasNormalizadas[i];
    const idRaw = idxId >= 0 ? String(cols[idxId] || '').trim() : '';
    const idCandidato = idRaw && esIdFilaValido(idRaw) ? idRaw.replace(/^#/, '').trim() : '';
    const telRawPeek = String(cols[idxTel] || '').trim();
    const telNormPeek = normalizarTelefonoWA(telRawPeek);

    // Detectar si esta fila es un duplicado accidental en Sheets de una fila ya leída (mismo ID + mismo teléfono, o mismo teléfono + mismo nombre)
    let duplicateTargetIdx: number | undefined;
    if (idCandidato && idxPorId.has(idCandidato)) {
      const prevIdx = idxPorId.get(idCandidato)!;
      const prevRow = resultado[prevIdx];
      const prevTel = normalizarTelefonoWA(prevRow.telRaw);
      if (telNormPeek && prevTel && telNormPeek === prevTel) {
        duplicateTargetIdx = prevIdx;
      }
    }
    if (duplicateTargetIdx === undefined && telNormPeek && idxPorTelNorm.has(telNormPeek)) {
      const prevIdx = idxPorTelNorm.get(telNormPeek)!;
      const prevRow = resultado[prevIdx];
      const nomPeek = String(cols[idxNombre] || '').trim().toLowerCase();
      const prevNom = String(prevRow.nombre || '').trim().toLowerCase();
      if (
        (nomPeek && prevNom && nomPeek === prevNom && !esCeldaSinNombre(nomPeek)) ||
        (idCandidato && idCandidato === prevRow.id)
      ) {
        duplicateTargetIdx = prevIdx;
      }
    }

    let id = '';
    if (duplicateTargetIdx !== undefined) {
      id = resultado[duplicateTargetIdx].id;
    } else {
      if (idCandidato && !idsUsados.has(idCandidato)) {
        id = idCandidato;
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
    const diasEncuentro = idxDias >= 0 ? String(cols[idxDias] || '').trim() : undefined;
    const horarioEncuentro = idxHorario >= 0 ? String(cols[idxHorario] || '').trim() : undefined;
    const calleOCruce = idxDireccion >= 0 ? String(cols[idxDireccion] || '').trim() : undefined;
    let horaInicioParsed: string | undefined;
    let horaFinParsed: string | undefined;
    if (horarioEncuentro !== undefined) {
      const mPuntual = horarioEncuentro.match(/^(\d{1,2}):(\d{2})(?:\s*hs)?$/i);
      const mRango = horarioEncuentro.match(/^(\d{1,2}):(\d{2})\s*(?:a|-)\s*(\d{1,2}):(\d{2})(?:\s*hs)?$/i);
      const mDesde = horarioEncuentro.match(/^(?:desde(?:\s+las)?)\s*(\d{1,2}):(\d{2})(?:\s*hs)?$/i);
      const mHasta = horarioEncuentro.match(/^(?:hasta(?:\s+las)?)\s*(\d{1,2}):(\d{2})(?:\s*hs)?$/i);
      if (mPuntual) {
        horaInicioParsed = `${mPuntual[1].padStart(2, '0')}:${mPuntual[2]}`;
        horaFinParsed = '';
      } else if (mRango) {
        horaInicioParsed = `${mRango[1].padStart(2, '0')}:${mRango[2]}`;
        horaFinParsed = `${mRango[3].padStart(2, '0')}:${mRango[4]}`;
      } else if (mDesde) {
        horaInicioParsed = `${mDesde[1].padStart(2, '0')}:${mDesde[2]}`;
        horaFinParsed = '';
      } else if (mHasta) {
        horaInicioParsed = '';
        horaFinParsed = `${mHasta[1].padStart(2, '0')}:${mHasta[2]}`;
      } else {
        horaInicioParsed = '';
        horaFinParsed = '';
      }
    }
    const comentario = String(cols[idxComentario] || '').trim();
    const estadoCeldaRaw =
      cols.length > idxEstado ? String(cols[idxEstado] || '').trim() : '';

    // Verificar si la celda de Estado ya tiene cualquiera de las 14 etiquetas oficiales del catálogo (o versión previa con Café)
    const estadoFlujoParseado = parsearTextoAEstadoFlujo(estadoCeldaRaw);
    const esEtiquetaOficialExplicita =
      Boolean(estadoCeldaRaw) &&
      estadoFlujoParseado !== undefined &&
      (ESTADOS_FLUJO_CATALOGO.some(
        (e) => e.label.toLowerCase() === estadoCeldaRaw.toLowerCase()
      ) ||
        estadoCeldaRaw.toLowerCase() === '3c. prefiere punto / café / sede');

    const comentarioCombinadoParaAnalisis = tieneFormatoEstructurado
      ? [
          diasEncuentro ? `Visita ${diasEncuentro}` : '',
          horarioEncuentro ? `a las ${horarioEncuentro}` : '',
          calleOCruce ? `(${calleOCruce})` : '',
          comentario,
        ]
          .filter(Boolean)
          .join(' ')
      : comentario;

    const estadoAnalizadoPorEFG = analizarEstadoPorColumnasEFG({
      id,
      nombre,
      rsp: rspRaw,
      adhirio: adhRaw,
      comentario: comentarioCombinadoParaAnalisis,
      estadoColH: estadoCeldaRaw,
    });

    const rspEsSi = /^(s[ií]|respond[ií]o|ok)$/i.test(rspRaw);
    const adhEsSi = /^(s[ií]|firm[oó]|firmad[oa]|adherid[oa])$/i.test(adhRaw);

    const estadoFlujoFinal: EstadoFlujo =
      esEtiquetaOficialExplicita && estadoFlujoParseado !== undefined
        ? estadoFlujoParseado === 'SIN_CONTACTAR_1ER_MSJ' && esCeldaSinNombre(nombre)
          ? 'FALTA_NOMBRE_Y_APELLIDO'
          : estadoFlujoParseado
        : estadoAnalizadoPorEFG;

    const necesitaPrimerContacto =
      estadoFlujoFinal === 'SIN_CONTACTAR_1ER_MSJ' ||
      estadoFlujoFinal === 'FALTA_NOMBRE_Y_APELLIDO';

    const adhirioFinal: RawContactRow['adhirio'] =
      estadoFlujoFinal === 'YA_ADHIRIO_FIRMA_OK' ||
      estadoFlujoFinal === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO' ||
      estadoFlujoFinal === 'PENDIENTE_RETIRO_FICHAS' ||
      (!esEtiquetaOficialExplicita && adhEsSi)
        ? 'Sí'
        : estadoFlujoFinal === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
            estadoFlujoFinal === 'DESCARTADO_O_BAJA'
          ? 'No'
          : 'Pendiente';

    const rspFinal: RawContactRow['rsp'] = necesitaPrimerContacto
      ? 'Nuevo'
      : estadoFlujoFinal === '1ER_MSJ_ENVIADO_SIN_RSP' ||
          estadoFlujoFinal === 'SEGUNDO_SEGUIMIENTO_SIN_RSP'
        ? 'No'
        : estadoFlujoFinal === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
            estadoFlujoFinal === 'PIDIO_MAS_INFO_ENVIADA' ||
            estadoFlujoFinal === 'PASO_DATOS_FALTA_CONFIRMAR' ||
            estadoFlujoFinal === 'PREFIERE_CAFE_HUB_O_SEDE' ||
            estadoFlujoFinal === 'ENCUENTRO_CONFIRMADO' ||
            estadoFlujoFinal === 'RECORDATORIO_DIA_ENVIADO' ||
            estadoFlujoFinal === 'PENDIENTE_RETIRO_FICHAS' ||
            estadoFlujoFinal === 'YA_ADHIRIO_FIRMA_OK' ||
            estadoFlujoFinal === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
          ? 'Sí'
          : rspEsSi
            ? 'Sí'
            : 'No';

    // Marca temporal base para contactos ya contactados en la planilla (>48h si no tienen marca reciente en la app)
    const fechaBaseHistorica = '2025-05-14';

    const filaCruda: RawContactRow = sincronizarBarrioConDireccionComentario({
      id,
      nombre,
      barrio,
      email: email && esEmailValido(email) ? email : undefined,
      telRaw,
      rsp: rspFinal,
      adhirio: adhirioFinal,
      diasEncuentro,
      horaInicio: horaInicioParsed,
      horaFin: horaFinParsed,
      horarioEncuentro,
      calleOCruce: calleOCruce || undefined,
      comentario,
      estadoFlujo: estadoFlujoFinal,
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoFlujoFinal),
      enSheets: marcarEnSheets,
      primerContactoEnviado: !necesitaPrimerContacto,
      fechaAgregado: necesitaPrimerContacto
        ? new Date().toISOString().slice(0, 10)
        : fechaBaseHistorica,
      ultimoContacto: necesitaPrimerContacto ? '' : fechaBaseHistorica,
      intentos: necesitaPrimerContacto ? 0 : 1,
    });

    if (duplicateTargetIdx !== undefined) {
      const prev = resultado[duplicateTargetIdx];
      const merged: RawContactRow = sincronizarBarrioConDireccionComentario({
        ...prev,
        nombre:
          !esCeldaSinNombre(filaCruda.nombre) && filaCruda.nombre
            ? filaCruda.nombre
            : prev.nombre,
        barrio: filaCruda.barrio || prev.barrio,
        email: filaCruda.email || prev.email,
        rsp:
          filaCruda.rsp === 'Sí' || prev.rsp === 'Sí'
            ? 'Sí'
            : filaCruda.rsp === 'No' || prev.rsp === 'No'
            ? 'No'
            : filaCruda.rsp,
        adhirio:
          filaCruda.adhirio === 'Sí' || prev.adhirio === 'Sí'
            ? 'Sí'
            : filaCruda.adhirio === 'No' || prev.adhirio === 'No'
            ? 'No'
            : 'Pendiente',
        diasEncuentro: filaCruda.diasEncuentro || prev.diasEncuentro,
        horaInicio: filaCruda.horaInicio || prev.horaInicio,
        horaFin: filaCruda.horaFin || prev.horaFin,
        horarioEncuentro: filaCruda.horarioEncuentro || prev.horarioEncuentro,
        calleOCruce: filaCruda.calleOCruce || prev.calleOCruce,
        comentario:
          filaCruda.comentario && prev.comentario && filaCruda.comentario !== prev.comentario
            ? prev.comentario.includes(filaCruda.comentario)
              ? prev.comentario
              : `${prev.comentario} · ${filaCruda.comentario}`
            : filaCruda.comentario || prev.comentario,
        estadoFlujo:
          filaCruda.adhirio === 'Sí'
            ? filaCruda.estadoFlujo
            : prev.adhirio === 'Sí'
            ? prev.estadoFlujo
            : filaCruda.diasEncuentro || filaCruda.calleOCruce
            ? filaCruda.estadoFlujo
            : prev.estadoFlujo || filaCruda.estadoFlujo,
        estadoFlujoEtiqueta:
          filaCruda.adhirio === 'Sí'
            ? filaCruda.estadoFlujoEtiqueta
            : prev.adhirio === 'Sí'
            ? prev.estadoFlujoEtiqueta
            : filaCruda.diasEncuentro || filaCruda.calleOCruce
            ? filaCruda.estadoFlujoEtiqueta
            : prev.estadoFlujoEtiqueta || filaCruda.estadoFlujoEtiqueta,
        primerContactoEnviado: Boolean(prev.primerContactoEnviado || filaCruda.primerContactoEnviado),
      });
      resultado[duplicateTargetIdx] = merged;
    } else {
      const idxAdded = resultado.length;
      resultado.push(filaCruda);
      idxPorId.set(id, idxAdded);
      if (telNormPeek) {
        idxPorTelNorm.set(telNormPeek, idxAdded);
      }
    }
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
 * Exporta el padrón en formato CSV con delimitador punto y coma (;),
 * ideal para Microsoft Excel con configuración regional en español (Argentina / Latinoamérica).
 * Abre directamente separando todas las columnas al hacer doble clic.
 */
export function exportarContactosACSVExcelPuntoYComa(contacts: Contact[]): string {
  const incluyeEmail = contacts.some((c) => Boolean(c.email));
  const header = incluyeEmail
    ? ['#', 'Nombre', 'Barrio', 'Mail', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado', '1er Contacto']
    : ['#', 'Nombre', 'Barrio', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado', '1er Contacto'];
  const esc = (v: string) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r') ? `"${s}"` : s;
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
    return base.map(esc).join(';');
  });
  return '\uFEFF' + [header.join(';'), ...rows].join('\r\n');
}


