// Puente Nativo Google Sheets ("Control") + Google Calendar para Rutas POPURRÍ (Sin bloqueo Error 400)
// 1. En tu Google Sheet (pestaña "Control"), abrí Extensiones -> Apps Script
// 2. Pegá este código y tocá "Implementar" -> "Nueva implementación" -> "Aplicación web"
// 3. Ejecutar como: "Yo" | Quién tiene acceso: "Cualquier persona" -> Copiá la URL (/exec) y pegala en la app.

function getTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
    else if (h.indexOf('d\u00eda') !== -1 || h === 'dia' || h === 'dias' || h === 'dia(s)' || h.indexOf('dias') !== -1) map.dias = c;
    else if (h.indexOf('horario') !== -1 || h.indexOf('hora') !== -1) map.horario = c;
    else if (h.indexOf('direcc') !== -1 || h.indexOf('punto') !== -1 || h.indexOf('cruce') !== -1 || h.indexOf('calle') !== -1) map.direccion = c;
    else if (h.indexOf('coment') !== -1 || h.indexOf('nota') !== -1) map.comentario = c;
    else if (h.indexOf('estado') !== -1 || h.indexOf('etapa') !== -1) map.estado = c;
  }
  if (map.comentario === -1 && map.direccion !== -1) map.comentario = map.direccion;
  return map;
}

function doGet() {
  var sheet = getTargetSheet();
  var lastRow = Math.max(1, sheet.getLastRow());
  var lastCol = Math.max(1, sheet.getLastColumn());
  var rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var now = new Date(Date.now() - 24 * 3600 * 1000);
  var endWindow = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  var calEvents = [];
  try {
    var calendars = CalendarApp.getAllCalendars();
    calendars.forEach(function(cal) {
      var calName = cal.getName() || 'Mi Calendar';
      if (calName.toLowerCase().indexOf('feriado') !== -1 || calName.toLowerCase().indexOf('holiday') !== -1) return;
      cal.getEvents(now, endWindow).forEach(function(ev) {
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
  var sheet = getTargetSheet();
  if (body.action === 'replaceAll' && Array.isArray(body.payload) && body.payload.length > 0) {
    sheet.clearContents();
    sheet.getRange(1, 1, body.payload.length, body.payload[0].length).setValues(body.payload);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'replaceAll' })).setMimeType(ContentService.MimeType.JSON);
  }
  if ((body.action === 'updateRow' || body.action === 'upsertRow' || body.action === 'batchUpdateRows') && (body.payload || body.updates)) {
    var list = Array.isArray(body.updates) && body.updates.length > 0 ? body.updates : [body.payload];
    var data = sheet.getDataRange().getValues();
    var cols = resolveColMap(data[0] || []);
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
          if (p.estado !== undefined && p.estado !== '') sheet.getRange(i + 1, cols.estado + 1).setValue(p.estado);
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
        newRow[cols.estado] = p.estado || '1. Sin contactar (Enviar 1er mensaje)';
        sheet.appendRow(newRow);
        updatedCount++;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: body.action, updatedCount: updatedCount })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
