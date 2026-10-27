// Puente Nativo Google Sheets + Todos tus Calendars para Rutas POPURRÍ (Sin bloqueo Error 400)
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
    const idTarget = String(p.id || '').trim();
    const telTarget = String(p.telefonoNorm || '').replace(/\D+/g, '').slice(-8);
    for (var i = 1; i < data.length; i++) {
      var rowId = String(data[i][0] || '').trim();
      var rowTel = String(data[i][4] || '').replace(/\D+/g, '').slice(-8);
      if ((idTarget && rowId === idTarget) || (telTarget && rowTel && rowTel === telTarget)) {
        if (p.rsp !== undefined) sheet.getRange(i + 1, 6).setValue(p.rsp);
        if (p.adhirio !== undefined) sheet.getRange(i + 1, 7).setValue(p.adhirio);
        if (p.comentarioNota) {
          var prevCom = String(data[i][7] || '').replace(/\[Intento auto fallido[^\]]*\]/gi, '').trim();
          var nextCom = prevCom.indexOf(p.comentarioNota) >= 0 ? prevCom : (prevCom ? prevCom + ' · ' + p.comentarioNota : p.comentarioNota);
          sheet.getRange(i + 1, 8).setValue(nextCom);
        }
        if (p.estado) sheet.getRange(i + 1, 9).setValue(p.estado);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'updateRow' })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
