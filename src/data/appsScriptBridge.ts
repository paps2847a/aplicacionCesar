/**
 * Código Apps Script Puente para Google Sheets + Google Calendar
 * Permite sincronizar contactos y eventos evitando el Error 400 (policy_enforced)
 * por Google Advanced Protection.
 */
export const CODIGO_APPS_SCRIPT_PUENTE = `// Puente Nativo Google Sheets + Todos tus Calendars para Rutas POPURRÍ (Sin bloqueo Error 400)
// 1. En tu Google Sheet "Estatus_POPURRÍ", abrí Extensiones -> Apps Script
// 2. Pegá este código y tocá "Implementar" -> "Nueva implementación" -> "Aplicación web"
// 3. Ejecutar como: "Yo" | Quién tiene acceso: "Cualquier persona" -> Copiá la URL y pegala en la app.

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const lastRow = Math.max(1, sheet.getLastRow());
  const lastCol = Math.max(1, sheet.getLastColumn());
  const rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const now = new Date(Date.now() - 24 * 3600 * 1000);
  const endWindow = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const calendars = CalendarApp.getAllCalendars();
  const calEvents = [];
  calendars.forEach(cal => {
    const calName = cal.getName() || 'Mi Calendar';
    if (calName.toLowerCase().indexOf('feriado') !== -1 || calName.toLowerCase().indexOf('holiday') !== -1) return;
    cal.getEvents(now, endWindow).forEach(ev => {
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
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows, calendarEvents: calEvents }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (body.action === 'replaceAll' && Array.isArray(body.payload)) {
    sheet.clearContents();
    sheet.getRange(1, 1, body.payload.length, body.payload[0].length).setValues(body.payload);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'replaceAll' })).setMimeType(ContentService.MimeType.JSON);
  }
  if (body.action === 'updateRow' && body.payload) {
    const p = body.payload;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Hoja sin filas' })).setMimeType(ContentService.MimeType.JSON);
    
    // Auto-detectar columnas a partir de la fila de encabezados (fila 0)
    var header = data[0];
    var colId = 0, colNombre = 1, colTel = -1, colRsp = -1, colAdhirio = -1, colComentario = -1, colEstado = -1;
    for (var c = 0; c < header.length; c++) {
      var h = String(header[c] || '').toLowerCase().trim();
      if (h === '#' || h.indexOf('id') === 0 || h.indexOf('orden') >= 0) colId = c;
      else if (h.indexOf('nombre') >= 0 || h.indexOf('vecino') >= 0) colNombre = c;
      else if (h.indexOf('tel') >= 0 || h.indexOf('cel') >= 0 || h.indexOf('wa') >= 0 || h.indexOf('contacto') >= 0) colTel = c;
      else if (h.indexOf('rsp') >= 0 || h.indexOf('respond') >= 0) colRsp = c;
      else if (h.indexOf('adhir') >= 0) colAdhirio = c;
      else if (h.indexOf('comentario') >= 0 || h.indexOf('nota') >= 0 || h.indexOf('direcc') >= 0) colComentario = c;
      else if (h.indexOf('estado') >= 0 || h.indexOf('etapa') >= 0) colEstado = c;
    }
    // Fallback si no hay encabezados explícitos
    if (colTel < 0) colTel = (header.length >= 8 && String(header[3] || '').toLowerCase().indexOf('mail') >= 0) ? 4 : 3;
    if (colRsp < 0) colRsp = colTel + 1;
    if (colAdhirio < 0) colAdhirio = colRsp + 1;
    if (colComentario < 0) colComentario = colAdhirio + 1;
    if (colEstado < 0) colEstado = colComentario + 1;

    var idTarget = String(p.id || '').replace(/^#/, '').trim();
    var telTarget = String(p.telefonoNorm || p.telRaw || '').replace(/\\D+/g, '').slice(-8);
    var nomTarget = String(p.nombre || '').toLowerCase().trim();

    var targetRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      var rowId = String(data[i][colId] || '').replace(/^#/, '').trim();
      var rowTel = colTel >= 0 ? String(data[i][colTel] || '').replace(/\\D+/g, '').slice(-8) : '';
      var rowNom = colNombre >= 0 ? String(data[i][colNombre] || '').toLowerCase().trim() : '';

      if (
        (idTarget && rowId === idTarget) ||
        (telTarget && rowTel && rowTel === telTarget) ||
        (nomTarget && rowNom && (rowNom === nomTarget || rowNom.indexOf(nomTarget) === 0 || nomTarget.indexOf(rowNom) === 0))
      ) {
        targetRowIdx = i + 1;
        break;
      }
    }

    if (targetRowIdx > 0) {
      if (p.rsp !== undefined && colRsp >= 0) sheet.getRange(targetRowIdx, colRsp + 1).setValue(p.rsp);
      if (p.adhirio !== undefined && colAdhirio >= 0) sheet.getRange(targetRowIdx, colAdhirio + 1).setValue(p.adhirio);
      if (p.comentarioNota && colComentario >= 0) {
        var prevCom = String(data[targetRowIdx - 1][colComentario] || '').replace(/\\[Intento auto fallido[^\\]]*\\]/gi, '').trim();
        var nextCom = prevCom.indexOf(p.comentarioNota) >= 0 ? prevCom : (prevCom ? prevCom + ' · ' + p.comentarioNota : p.comentarioNota);
        sheet.getRange(targetRowIdx, colComentario + 1).setValue(nextCom);
      } else if (p.comentario && colComentario >= 0) {
        sheet.getRange(targetRowIdx, colComentario + 1).setValue(p.comentario);
      }
      if (p.estado && colEstado >= 0) sheet.getRange(targetRowIdx, colEstado + 1).setValue(p.estado);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'updateRow', updatedRow: targetRowIdx })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Contacto no encontrado en la hoja', idTarget: idTarget, telTarget: telTarget })).setMimeType(ContentService.MimeType.JSON);
  }
  if (body.action === 'appendRow' && body.payload) {
    const p = body.payload;
    const lastRow = Math.max(1, sheet.getLastRow());
    const nextId = p.id ? String(p.id).replace(/^#/, '') : String(lastRow);
    const newRow = [
      nextId,
      p.nombre || '',
      p.barrio || 'CABA',
      p.email || '',
      p.telRaw || p.telefonoNorm || '',
      p.rsp || 'Nuevo',
      p.adhirio || 'Pendiente',
      p.comentario || '',
      p.estado || '1. Sin contactar (1er mensaje pendiente)'
    ];
    sheet.appendRow(newRow);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'appendRow', id: nextId })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}`;
