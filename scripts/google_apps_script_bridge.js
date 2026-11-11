// Puente Automático Google Sheets ("Control") + Chips Columna K ("Estado") + Google Calendar para POPURRÍ
// 1. En tu Google Sheet (pestaña "Control"), abrí Extensiones -> Apps Script
// 2. Pegá este código completo y tocá "Implementar" -> "Gestionar implementaciones" -> Editar (lápiz) -> "Nueva versión" -> "Implementar"
// 3. Ejecutar como: "Yo" | Quién tiene acceso: "Cualquier persona" -> Copiá la URL (/exec) y pegala en Configuración.

var DEFAULT_SHEET_ID = '1IjsWFTYXnFZPo76GVbEKngG5ksU5ZLpwxddV1cj6F8k';

var ESTADOS_OFICIALES_POPURRI = [
  '1. Nuevo · Sin contactar',
  '1b. Nuevo · Falta nombre',
  '2. Contactado · Sin respuesta',
  '3. Respondió · Faltan datos',
  '3b. Pidió más info',
  '3c. Prefiere Punto / Sede',
  '4. Pasó datos · Por confirmar',
  '5. Confirmado · En ruta',
  '6. En camino / Recordatorio',
  '7. Fichas extra · Por retirar',
  '8. En pausa · Viaje o salud',
  '9. ✅ Ya firmó',
  '10. Sin DNI CABA · Referidos',
  '11. Baja / Descartado'
];

function extractSpreadsheetId(rawIdOrUrl) {
  var s = String(rawIdOrUrl || '').trim();
  if (!s) return DEFAULT_SHEET_ID;
  var m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1] && m[1] !== 'e') return m[1];
  return s;
}

function getTargetSheet(sheetIdOverride) {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    var targetId = extractSpreadsheetId(sheetIdOverride);
    ss = SpreadsheetApp.openById(targetId);
  }
  return ss.getSheetByName('Control') || ss.getSheets()[0];
}

function resolveColMap(headers) {
  var map = {
    id: 0,
    nombre: 1,
    barrio: 2,
    tel: 3,
    rsp: 4,
    adhirio: 5,
    dias: -1,
    horario: -1,
    direccion: -1,
    comentario: 6,
    estado: 7
  };
  if (!headers || !headers.length) return map;
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').toLowerCase().trim();
    if (h === '#' || h === 'id' || h === 'nro') map.id = c;
    else if (h.indexOf('nombre') !== -1) map.nombre = c;
    else if (h.indexOf('barrio') !== -1) map.barrio = c;
    else if (h.indexOf('tel') !== -1 || h.indexOf('cel') !== -1) map.tel = c;
    else if (h === 'rsp' || h.indexOf('resp') !== -1) map.rsp = c;
    else if (h.indexOf('adhir') !== -1 || h.indexOf('firm') !== -1) map.adhirio = c;
    else if (h.indexOf('día') !== -1 || h === 'dia' || h === 'dias' || h === 'dia(s)' || h.indexOf('dias') !== -1) map.dias = c;
    else if (h.indexOf('horario') !== -1 || h.indexOf('hora') !== -1) map.horario = c;
    else if (h.indexOf('direcc') !== -1 || h.indexOf('punto') !== -1 || h.indexOf('cruce') !== -1 || h.indexOf('calle') !== -1) map.direccion = c;
    else if (h.indexOf('coment') !== -1 || h.indexOf('nota') !== -1) map.comentario = c;
    else if (h.indexOf('estado') !== -1 || h.indexOf('etapa') !== -1) map.estado = c;
  }
  if (map.comentario === -1 && map.direccion !== -1) map.comentario = map.direccion;
  return map;
}

function normalizarEstadoPopurri(estadoRaw, nombreRaw, rspRaw, adhirioRaw, comentarioRaw, idRaw, diasRaw, horarioRaw, direccionRaw) {
  var est = String(estadoRaw || '').trim();
  var eLow = est.toLowerCase();
  var com = String(comentarioRaw || '').trim();
  var comLow = com.toLowerCase();
  var adhLow = String(adhirioRaw || '').toLowerCase().trim();
  var rspLow = String(rspRaw || '').toLowerCase().trim();
  var nom = String(nombreRaw || '').trim();
  var sinNom = !nom || nom === '-' || nom.toLowerCase() === 'sin nombre' || nom.toLowerCase() === 's/n' || nom.toLowerCase().indexOf('teléfono sin nombre') === 0 || nom.toLowerCase() === 'telefono' || nom.toLowerCase() === 'teléfono';
  var numId = parseInt(String(idRaw || '').replace(/\D+/g, ''), 10) || 0;
  var diasStr = String(diasRaw || '').trim();
  var horarioStr = String(horarioRaw || '').trim();
  var dirStr = String(direccionRaw || '').trim();

  // 1. Adhesión completada o Retiro de Fichas Extra (Columna F = Sí)
  if (adhLow === 'sí' || adhLow === 'si' || comLow.indexOf('adhesión firmada') !== -1 || comLow.indexOf('firmó el') !== -1 || eLow.indexOf('9.') === 0) {
    if (comLow.indexOf('buscar fichas') !== -1 || /fichas\s*x\d/i.test(comLow) || /\bx[123]\b/i.test(comLow) || eLow.indexOf('7.') === 0) {
      return '7. Fichas extra · Por retirar';
    }
    return '9. ✅ Ya firmó';
  }
  if (eLow.indexOf('7.') === 0) {
    return '7. Fichas extra · Por retirar';
  }

  // 2. En Pausa (Viaje / Salud / Más adelante)
  if (comLow.indexOf('enferm') !== -1 || comLow.indexOf('salud') !== -1 || comLow.indexOf('regresa en') !== -1 || comLow.indexOf('más adelante') !== -1 || eLow.indexOf('8.') === 0) {
    return '8. En pausa · Viaje o salud';
  }

  // 3. Baja / Número Inválido / Descartado
  if (comLow.indexOf('no existe en whatsapp') !== -1 || comLow.indexOf('inexistente en whatsapp') !== -1 || comLow.indexOf('número equivocado') !== -1 || comLow.indexOf('adhesión digital') !== -1 || comLow.indexOf('vive en eeuu') !== -1 || comLow.indexOf('vive en brasil') !== -1 || comLow.indexOf('vive en españa') !== -1 || comLow.indexOf('vive fuera') !== -1 || eLow.indexOf('11.') === 0) {
    return '11. Baja / Descartado';
  }

  // 4. Sin DNI en CABA · Pedir Referidos
  if (comLow.indexOf('no tiene domicilio en caba') !== -1 || comLow.indexOf('sin dni en caba') !== -1 || comLow.indexOf('dni extranjero') !== -1 || comLow.indexOf('extranjero') !== -1 || comLow.indexOf('vive afuera') !== -1 || eLow.indexOf('10.') === 0) {
    return '10. Sin DNI CABA · Referidos';
  }
  if (adhLow === 'no' && comLow.indexOf('coordinar encuentro en caba') === -1) {
    if (eLow.indexOf('sin dni') !== -1) return '10. Sin DNI CABA · Referidos';
    return '11. Baja / Descartado';
  }

  // 5. Recordatorio / En Camino Enviado
  if (comLow.indexOf('recordatorio enviado') !== -1 || comLow.indexOf('en camino') !== -1 || eLow.indexOf('6.') === 0 || eLow.indexOf('7. recordatorio') === 0) {
    return '6. En camino / Recordatorio';
  }

  // 6. Encuentro Confirmado (En Ruta)
  if (/\bconfirmad[oa]\b/i.test(comLow) || eLow.indexOf('5.') === 0 || eLow.indexOf('6. encuentro agendado') === 0) {
    return '5. Confirmado · En ruta';
  }

  // 7. 3b. Pidió más info (5 ejes enviados)
  if (comLow.indexOf('pidió más info') !== -1 || comLow.indexOf('mas info') !== -1 || eLow.indexOf('3b.') === 0) {
    return '3b. Pidió más info';
  }

  // 8. 3c. Prefiere Punto / Café / Sede
  if (comLow.indexOf('prefiere pasar por un punto') !== -1 || comLow.indexOf('pasar por un punto') !== -1 || comLow.indexOf('chile 1408') !== -1 || comLow.indexOf('reunión de los miércoles') !== -1 || eLow.indexOf('3c.') === 0) {
    return '3c. Prefiere Punto / Sede';
  }

  // 9. Evaluar dirección y día/horario en Columnas G/H/I o Comentario (4 vs 3)
  var parenMatch = com.match(/\(([^)]+)\)/);
  var tieneDir = Boolean(dirStr) || (Boolean(parenMatch) && !/visita\s+consertada/i.test(parenMatch[1])) || /visita\s+con[sc]ertada/i.test(comLow);
  var tieneDiaHora = Boolean(diasStr || horarioStr) || /\b\d{1,2}\/\d{1,2}\b/.test(comLow) || /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(comLow) || /\bcualquier\s+d[ií]a\b/i.test(comLow) || /\b(a\s+las\s+\d|entre\s+las?\s+\d|de\s+\d{1,2}\s+a\s+\d{1,2}|luego\s+de\s+las|despu[eé]s\s+de\s+las|antes\s+de\s+las)\b/i.test(comLow) || /visita\s+con[sc]ertada/i.test(comLow);

  if (eLow.indexOf('4.') === 0 || ((rspLow === 'sí' || rspLow === 'si' || comLow.indexOf('coordinar encuentro en caba') !== -1 || tieneDir) && tieneDir && tieneDiaHora)) {
    return '4. Pasó datos · Por confirmar';
  }
  if (eLow.indexOf('3.') === 0 || rspLow === 'sí' || rspLow === 'si' || comLow.indexOf('coordinar encuentro en caba') !== -1 || tieneDir || tieneDiaHora) {
    return '3. Respondió · Faltan datos';
  }

  // 10. ¿Ya fue contactado (2) o es Nuevo (1 / 1b)?
  var fueContactadoH = eLow.indexOf('2.') === 0 || eLow.indexOf('2b.') === 0 || eLow.indexOf('1er msj enviado') !== -1 || eLow.indexOf('1er mensaje enviado') !== -1 || eLow.indexOf('contactado') !== -1;
  var fueContactadoCom = comLow.indexOf('1er msj') !== -1 || comLow.indexOf('1er mensaje') !== -1 || comLow.indexOf('sin respuesta') !== -1 || comLow.indexOf('no contesta') !== -1;
  var esHistorico = numId > 0 && numId < 167 && rspLow !== 'nuevo';

  if (fueContactadoH || fueContactadoCom || esHistorico) {
    return '2. Contactado · Sin respuesta';
  }
  if (sinNom) {
    return '1b. Nuevo · Falta nombre';
  }
  return '1. Nuevo · Sin contactar';
}

function ensureEstadoValidationAndFormat_(sheet, colEstado1Based, totalDataRows) {
  if (!sheet || colEstado1Based < 1 || totalDataRows < 1) return;
  var rangoEstados = sheet.getRange(2, colEstado1Based, totalDataRows, 1);

  var reglaChip = SpreadsheetApp.newDataValidation()
    .requireValueInList(ESTADOS_OFICIALES_POPURRI, true)
    .setAllowInvalid(true)
    .build();
  rangoEstados.setDataValidation(reglaChip);

  var existingRules = sheet.getConditionalFormatRules() || [];
  var keptRules = [];
  for (var r = 0; r < existingRules.length; r++) {
    var rule = existingRules[r];
    var ranges = rule.getRanges() || [];
    var touchesEstado = false;
    for (var rg = 0; rg < ranges.length; rg++) {
      if (ranges[rg].getColumn() <= colEstado1Based && ranges[rg].getLastColumn() >= colEstado1Based) {
        touchesEstado = true;
        break;
      }
    }
    if (!touchesEstado) keptRules.push(rule);
  }

  var colorSpecs = [
    { prefix: '1.', bg: '#E0F2FE', fg: '#0369A1' },
    { prefix: '1b.', bg: '#FFEDD5', fg: '#C2410C' },
    { prefix: '2.', bg: '#F1F5F9', fg: '#334155' },
    { prefix: '3.', bg: '#FEF3C7', fg: '#B45309' },
    { prefix: '3b.', bg: '#E0E7FF', fg: '#4338CA' },
    { prefix: '3c.', bg: '#CCFBF1', fg: '#0F766E' },
    { prefix: '4.', bg: '#FEF08A', fg: '#854D0E' },
    { prefix: '5.', bg: '#DCFCE7', fg: '#15803D' },
    { prefix: '6.', bg: '#BBF7D0', fg: '#166534' },
    { prefix: '7.', bg: '#F3E8FF', fg: '#6B21A8' },
    { prefix: '8.', bg: '#FCE7F3', fg: '#9D174D' },
    { prefix: '9.', bg: '#86EFAC', fg: '#14532D' },
    { prefix: '10.', bg: '#F3F4F6', fg: '#4B5563' },
    { prefix: '11.', bg: '#FEE2E2', fg: '#991B1B' }
  ];

  for (var cs = 0; cs < colorSpecs.length; cs++) {
    var spec = colorSpecs[cs];
    var condRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith(spec.prefix)
      .setBackground(spec.bg)
      .setFontColor(spec.fg)
      .setBold(true)
      .setRanges([rangoEstados])
      .build();
    keptRules.push(condRule);
  }

  sheet.setConditionalFormatRules(keptRules);
}

function instalarChipsEstadoPopurri(sheetOpt, estadosMapPorId) {
  var sheet = sheetOpt || getTargetSheet();
  var lastRow = Math.max(2, sheet.getLastRow());
  var lastCol = Math.max(8, sheet.getLastColumn());
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var cols = resolveColMap(data[0] || []);
  var colEstado1Based = cols.estado + 1;

  sheet.getRange(1, colEstado1Based).setValue('Estado');

  var valoresEstado = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowIdRaw = String(row[cols.id] || '').trim();
    var rowIdClean = rowIdRaw.replace(/^#/, '').trim();
    var estadoDesdeApp = (estadosMapPorId && ((rowIdRaw && estadosMapPorId[rowIdRaw]) || (rowIdClean && estadosMapPorId[rowIdClean])))
      ? (estadosMapPorId[rowIdRaw] || estadosMapPorId[rowIdClean])
      : '';
    var estFinal = estadoDesdeApp || normalizarEstadoPopurri(
      row[cols.estado],
      row[cols.nombre],
      row[cols.rsp],
      row[cols.adhirio],
      row[cols.comentario],
      rowIdRaw,
      cols.dias !== -1 ? row[cols.dias] : '',
      cols.horario !== -1 ? row[cols.horario] : '',
      cols.direccion !== -1 ? row[cols.direccion] : ''
    );
    valoresEstado.push([estFinal]);
  }

  if (valoresEstado.length > 0) {
    ensureEstadoValidationAndFormat_(sheet, colEstado1Based, valoresEstado.length);
    var rangoEstados = sheet.getRange(2, colEstado1Based, valoresEstado.length, 1);
    rangoEstados.setValues(valoresEstado);
  }
  return valoresEstado.length;
}

function doGet(e) {
  var sheetIdParam = (e && e.parameter && (e.parameter.sheetId || e.parameter.sheetUrlOrId)) || '';
  var sheet = getTargetSheet(sheetIdParam);
  var lastRow = Math.max(1, sheet.getLastRow());
  var lastCol = Math.max(8, sheet.getLastColumn());
  var rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var now = new Date(Date.now() - 2 * 3600 * 1000);
  var endWindow = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  var calEvents = [];
  try {
    var calendars = CalendarApp.getAllCalendars();
    calendars.forEach(function(cal) {
      var calName = cal.getName() || 'Mi Calendar';
      if (calName.toLowerCase().indexOf('feriado') !== -1 || calName.toLowerCase().indexOf('holiday') !== -1) return;
      cal.getEvents(now, endWindow).forEach(function(ev) {
        if (ev.getEndTime().getTime() < Date.now()) return;
        calEvents.push({
          id: cal.getId() + '-' + ev.getId(),
          summary: ev.getTitle() || 'Compromiso',
          location: ev.getLocation() || 'CABA',
          fecha: Utilities.formatDate(ev.getStartTime(), 'America/Argentina/Buenos_Aires', 'dd/MM'),
          fechaISO: Utilities.formatDate(ev.getStartTime(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd'),
          startTime: Utilities.formatDate(ev.getStartTime(), 'America/Argentina/Buenos_Aires', 'HH:mm'),
          endTime: Utilities.formatDate(ev.getEndTime(), 'America/Argentina/Buenos_Aires', 'HH:mm'),
          startIso: ev.getStartTime().toISOString(),
          endIso: ev.getEndTime().toISOString(),
          calendarName: calName,
          source: 'apps_script'
        });
      });
    });
  } catch (err) {}
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows, calendarEvents: calEvents }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.action === 'syncRouteCalendarEvents' && Array.isArray(body.events)) {
    var cal = CalendarApp.getDefaultCalendar();
    var createdIds = [];
    for (var k = 0; k < body.events.length; k++) {
      var ev = body.events[k];
      if (!ev || !ev.startIso || !ev.endIso) continue;
      var startDt = new Date(ev.startIso);
      var endDt = new Date(ev.endIso);
      var title = String(ev.summary || 'Recorrido Puerta a Puerta POPURRÍ');
      var existing = cal.getEvents(new Date(startDt.getTime() - 60000), new Date(endDt.getTime() + 60000));
      var matched = null;
      for (var m = 0; m < existing.length; m++) {
        if (existing[m].getTitle() === title) {
          matched = existing[m];
          break;
        }
      }
      if (matched) {
        matched.setTime(startDt, endDt);
        if (ev.location) matched.setLocation(ev.location);
        if (ev.description) matched.setDescription(ev.description);
        createdIds.push(matched.getId());
      } else {
        var created = cal.createEvent(title, startDt, endDt, {
          location: ev.location || '',
          description: ev.description || ''
        });
        createdIds.push(created.getId());
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'syncRouteCalendarEvents', createdCount: createdIds.length, eventIds: createdIds }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = getTargetSheet(body.sheetId || body.sheetUrlOrId);
  if (body.action === 'syncEstadosChips') {
    var totalActualizados = instalarChipsEstadoPopurri(sheet, body.estadosPorId || {});
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'syncEstadosChips', updatedRows: totalActualizados }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (body.action === 'replaceAll' && Array.isArray(body.payload) && body.payload.length > 0) {
    sheet.clearContents();
    sheet.getRange(1, 1, body.payload.length, body.payload[0].length).setValues(body.payload);
    instalarChipsEstadoPopurri(sheet);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'replaceAll' })).setMimeType(ContentService.MimeType.JSON);
  }
  if ((body.action === 'updateRow' || body.action === 'upsertRow' || body.action === 'batchUpdateRows') && (body.payload || body.updates)) {
    var list = Array.isArray(body.updates) && body.updates.length > 0 ? body.updates : [body.payload];
    var data = sheet.getDataRange().getValues();
    var cols = resolveColMap(data[0] || []);
    var reglaUnitaria = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS_OFICIALES_POPURRI, true).setAllowInvalid(true).build();
    var updatedCount = 0;

    for (var u = 0; u < list.length; u++) {
      var p = list[u];
      if (!p) continue;
      var idTargetRaw = String(p.id || p.contactId || '').trim();
      var idTargetClean = idTargetRaw.replace(/^#/, '').trim();
      var idTargetDigits = idTargetClean.replace(/\D+/g, '');
      var telTarget = String(p.telefonoNorm || p.telRaw || p.tel || '').replace(/\D+/g, '').slice(-8);
      var found = false;
      for (var i = 1; i < data.length; i++) {
        var rowIdRaw = String(data[i][cols.id] || '').trim();
        var rowIdClean = rowIdRaw.replace(/^#/, '').trim();
        var rowIdDigits = rowIdClean.replace(/\D+/g, '');
        var rowTel = String(data[i][cols.tel] || '').replace(/\D+/g, '').slice(-8);
        var matchId = Boolean(
          idTargetClean &&
          (rowIdClean === idTargetClean || (idTargetDigits && rowIdDigits === idTargetDigits))
        );
        var matchTel = Boolean(telTarget && rowTel && rowTel === telTarget);
        if (matchId || matchTel) {
          if (p.nombre !== undefined && p.nombre !== '') sheet.getRange(i + 1, cols.nombre + 1).setValue(p.nombre);
          if (p.barrio !== undefined && p.barrio !== '') sheet.getRange(i + 1, cols.barrio + 1).setValue(p.barrio);
          if (p.telRaw !== undefined && p.telRaw !== '') sheet.getRange(i + 1, cols.tel + 1).setValue(p.telRaw);
          if (p.rsp !== undefined) sheet.getRange(i + 1, cols.rsp + 1).setValue(p.rsp);
          if (p.adhirio !== undefined) sheet.getRange(i + 1, cols.adhirio + 1).setValue(p.adhirio);
          if (cols.dias !== -1 && p.diasEncuentro !== undefined) sheet.getRange(i + 1, cols.dias + 1).setValue(p.diasEncuentro);
          if (cols.horario !== -1 && p.horarioEncuentro !== undefined) sheet.getRange(i + 1, cols.horario + 1).setValue(p.horarioEncuentro);
          if (cols.direccion !== -1 && p.calleOCruce !== undefined) sheet.getRange(i + 1, cols.direccion + 1).setValue(p.calleOCruce);
          if (p.comentario !== undefined) {
            sheet.getRange(i + 1, cols.comentario + 1).setValue(p.comentario);
          } else if (p.comentarioNota) {
            var prevCom = String(data[i][cols.comentario] || '').replace(/\[Intento auto fallido[^\]]*\]/gi, '').trim();
            var nextCom = prevCom.indexOf(p.comentarioNota) >= 0 ? prevCom : (prevCom ? prevCom + ' · ' + p.comentarioNota : p.comentarioNota);
            sheet.getRange(i + 1, cols.comentario + 1).setValue(nextCom);
          }
          var rawEst = String(p.estado || p.estadoFlujo || '').trim();
          var estNormalizado = ESTADOS_OFICIALES_POPURRI.indexOf(rawEst) !== -1
            ? rawEst
            : normalizarEstadoPopurri(
                rawEst,
                p.nombre || data[i][cols.nombre],
                p.rsp || data[i][cols.rsp],
                p.adhirio || data[i][cols.adhirio],
                p.comentario || data[i][cols.comentario],
                rowIdRaw,
                p.diasEncuentro !== undefined ? p.diasEncuentro : (cols.dias !== -1 ? data[i][cols.dias] : ''),
                p.horarioEncuentro !== undefined ? p.horarioEncuentro : (cols.horario !== -1 ? data[i][cols.horario] : ''),
                p.calleOCruce !== undefined ? p.calleOCruce : (cols.direccion !== -1 ? data[i][cols.direccion] : '')
              );
          var celdaEst = sheet.getRange(i + 1, cols.estado + 1);
          celdaEst.setDataValidation(reglaUnitaria);
          celdaEst.setValue(estNormalizado);
          found = true;
          updatedCount++;
          break;
        }
      }
      if (!found && idTargetClean && body.action !== 'updateRow' && body.action !== 'batchUpdateRows' && p.action !== 'actualizacion_contacto') {
        var totalCols = Math.max(data[0] ? data[0].length : 0, 11);
        var newRow = [];
        for (var cIdx = 0; cIdx < totalCols; cIdx++) newRow.push('');
        newRow[cols.id] = idTargetClean;
        newRow[cols.nombre] = p.nombre || '';
        newRow[cols.barrio] = p.barrio || '';
        newRow[cols.tel] = p.telRaw || p.telefonoNorm || '';
        newRow[cols.rsp] = p.rsp || 'Nuevo';
        newRow[cols.adhirio] = p.adhirio || 'Pendiente';
        if (cols.dias !== -1) newRow[cols.dias] = p.diasEncuentro || '';
        if (cols.horario !== -1) newRow[cols.horario] = p.horarioEncuentro || '';
        if (cols.direccion !== -1) newRow[cols.direccion] = p.calleOCruce || '';
        newRow[cols.comentario] = p.comentario !== undefined ? p.comentario : (p.comentarioNota || '');
        var rawEstNew = String(p.estado || p.estadoFlujo || '').trim();
        newRow[cols.estado] = ESTADOS_OFICIALES_POPURRI.indexOf(rawEstNew) !== -1
          ? rawEstNew
          : normalizarEstadoPopurri(rawEstNew, p.nombre, p.rsp, p.adhirio, p.comentario, idTargetClean, p.diasEncuentro, p.horarioEncuentro, p.calleOCruce);
        sheet.appendRow(newRow);
        var newRowIdx = sheet.getLastRow();
        var celdaNueva = sheet.getRange(newRowIdx, cols.estado + 1);
        celdaNueva.setDataValidation(reglaUnitaria);
        updatedCount++;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: body.action, updatedCount: updatedCount })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
