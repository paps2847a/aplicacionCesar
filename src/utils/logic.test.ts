import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarTelefonoWA,
  extraerPrimerNombre,
  analizarYCorregirNombreCompleto,
  extraerCalleOCruce,
  analizarFranjaHoraria,
  procesarContacto,
  construirMicroClusters,
  generarCorteEstrategicoLocal,
  calcularHojaDeRuta,
  parsearTSVoCSVContactos,
  repararContactosDesfasados,
  inferirBarrioDesdeDireccionOComentario,
  sincronizarBarrioConDireccionComentario,
  migrarContactosDesde167SinPrimerContacto,
  fusionarContactosDesdeSheetsConControl,
  sortearCupoSeguroAntiBloqueo,
  generarColaEnvioAutomaticoPrimerContacto,
  aplicarResultadoEnvioAutoAContacto,
  generarScriptPythonAutomatizador,
  limpiarUrlsDePrimerMensaje,
  limpiarErroresFalsosRestriccionWA,
  deduplicarEventosCalendar,
  generarMensajeTerrenoParadaRuta,
  generarMensajePropuestaBloqueAgenda,
  generarMensajeContextual,
  generarMensajePersonalizadoCircuitoMapa,
  analizarDisponibilidadColumnaG,
  aplicarRespuestaPropuestaAgenda,
  esContactoConfirmadoEnLista1a1,
  asegurarIdsUnicosContactos,
  fusionarContactosMultiDispositivo,
  actualizarDatosContactoEnApp,
  registrarEnvioMensajeContacto,
  filtrarEventosCalendarVigentes,
  obtenerFechaSugeridaReprogramacionContacto,
  adaptarMensajeConRespuestaVecinoLocal,
  calcularMinutosTrasladoCABA,
  corregirPelonesDiaSemanaEnTexto,
  yaSeHabloConContactoHoy,
  aplicarReglaSaludoMismoDia,
  generarPanelTareasDiarias,
  generarVariantePolimorficaPrimerContacto,
  inferirTransicionInteligenteWA,
  getMacroStageForContact,
  exportarContactosACSV,
  exportarContactosACSVExcelPuntoYComa,
  exportarContactosATSVParaExcel,
} from './logic';
import {
  DEFAULT_VOICE_PROFILE,
  INITIAL_RAW_CONTACTS,
  INITIAL_CALENDAR_EVENTS,
} from '../data/estatusPopurriData';
import {
  CATALOGO_CAFES_ESPECIALIDAD_HUB,
  CATALOGO_CAFES_HUB_CABA,
  listarCafesHubCercanos,
} from '../data/cafesHubCatalog';

test('normalizarTelefonoWA formatea números argentinos correctamente', () => {
  assert.equal(normalizarTelefonoWA('54 9 11 6590-6852'), '5491165906852');
  assert.equal(normalizarTelefonoWA('11 3345-7903'), '5491133457903');
  assert.equal(normalizarTelefonoWA('15 4412-5685'), '5491144125685');
  assert.equal(normalizarTelefonoWA('N/A'), '');
});

test('analizarYCorregirNombreCompleto desambigua Nombre vs Apellido y corrige mayúsculas, minúsculas y tildes', () => {
  // Invertidos sin coma ("Apellido Nombre" y "Apellido1 Apellido2 Nombre")
  assert.equal(extraerPrimerNombre('Quintela Laura'), 'Laura');
  assert.equal(extraerPrimerNombre('Oks Florencia'), 'Florencia');
  assert.equal(extraerPrimerNombre('Hevia Juan'), 'Juan');
  assert.equal(extraerPrimerNombre('Frison Lovera Justine'), 'Justine');
  assert.equal(extraerPrimerNombre('Dal Porto Guido'), 'Guido');
  assert.equal(extraerPrimerNombre('Biedma Delfina'), 'Delfina');
  assert.equal(extraerPrimerNombre('Rodríguez Carla'), 'Carla');
  assert.equal(extraerPrimerNombre('Levite María Valeria'), 'María Valeria');
  assert.equal(extraerPrimerNombre('Gómez Ortiz María Belen'), 'María Belén');
  assert.equal(extraerPrimerNombre('Molinari Leto Laura'), 'Laura');
  assert.equal(extraerPrimerNombre('Kandel Analía'), 'Analía');
  assert.equal(extraerPrimerNombre('Guido iezzi'), 'Guido');
  assert.equal(extraerPrimerNombre('Milagros del Priore'), 'Milagros');
  assert.equal(extraerPrimerNombre('Andreotti Cecilia Beatriz'), 'Cecilia');
  assert.equal(extraerPrimerNombre('Bronfman Melina'), 'Melina');

  // Todo en MAYÚSCULAS o todo en minúsculas
  const mayus1 = analizarYCorregirNombreCompleto('MENDEZ CUETO ALEJANDRA');
  assert.equal(mayus1.vocativo, 'Alejandra');
  assert.equal(mayus1.nombreCompletoOrdenado, 'Alejandra Méndez Cueto');

  const mayus2 = analizarYCorregirNombreCompleto('ALEJANDRA LOPEZ');
  assert.equal(mayus2.vocativo, 'Alejandra');
  assert.equal(mayus2.nombreCompletoOrdenado, 'Alejandra López');

  const mayus3 = analizarYCorregirNombreCompleto('POZZO DIEGO');
  assert.equal(mayus3.vocativo, 'Diego');
  assert.equal(mayus3.nombreCompletoOrdenado, 'Diego Pozzo');

  const minus1 = analizarYCorregirNombreCompleto('fiorella perez da costa');
  assert.equal(minus1.vocativo, 'Fiorella');
  assert.equal(minus1.nombreCompletoOrdenado, 'Fiorella Pérez da Costa');

  const minus2 = analizarYCorregirNombreCompleto('Grieco demey mariana');
  assert.equal(minus2.vocativo, 'Mariana');
  assert.equal(minus2.nombreCompletoOrdenado, 'Mariana Grieco Demey');

  // Restitución de tildes faltantes en nombres y apellidos
  assert.equal(extraerPrimerNombre('Ines Muñoz'), 'Inés');
  assert.equal(extraerPrimerNombre('Agustin Carrizo'), 'Agustín');
  assert.equal(extraerPrimerNombre('Analia Perez'), 'Analía');
  assert.equal(extraerPrimerNombre('Belen Anabella Reyes'), 'Belén');
  assert.equal(extraerPrimerNombre('Martin Mena'), 'Martín');
  assert.equal(extraerPrimerNombre('Tomas Sciolla'), 'Tomás');
  assert.equal(extraerPrimerNombre('German Pinasco'), 'Germán');
  assert.equal(extraerPrimerNombre('Sofia Piñeiro Pearson'), 'Sofía');
  assert.equal(extraerPrimerNombre('Pelli Ines Aime'), 'Inés');
  assert.equal(extraerPrimerNombre('Maria Eugenia Rapp'), 'María Eugenia');

  // Desambiguación cuando un apellido también existe como nombre ("Ernestina Martin Turrion")
  const ernestina = analizarYCorregirNombreCompleto('Ernestina Martin Turrion');
  assert.equal(ernestina.vocativo, 'Ernestina');
  assert.equal(ernestina.apellidos, 'Martín Turrión');

  // Con coma ("Apellido, Nombre SegundoNombre")
  const coma1 = analizarYCorregirNombreCompleto('Salazar, Horacio Martin');
  assert.equal(coma1.vocativo, 'Horacio');
  assert.equal(coma1.nombrePilaCompleto, 'Horacio Martín');

  const coma2 = analizarYCorregirNombreCompleto('Medina Bariffi, Carolina Sofia');
  assert.equal(coma2.vocativo, 'Carolina');
  assert.equal(coma2.nombrePilaCompleto, 'Carolina Sofía');
});

test('extraerCalleOCruce limpia comentarios e ignora notas de cantidad (X2/X3)', () => {
  assert.equal(
    extraerCalleOCruce('COORDINAR para buscar fichas X2 el 23/10 (Correa 2838)'),
    'Correa 2838'
  );
  assert.equal(
    extraerCalleOCruce('Visita 16/10 entre 15 y 18 (Melián 3845, hija de Sandra)'),
    'Melián 3845'
  );
  assert.equal(extraerCalleOCruce('Visita 16/10 a las 15:30 (Pza. Italia)'), 'Plaza Italia');
});

test('analizarFranjaHoraria clasifica ventanas horarias correctamente', () => {
  assert.equal(analizarFranjaHoraria('Visita 21/10 a las 10 (Charcas 3702)'), 'Mañana');
  assert.equal(analizarFranjaHoraria('Visita 16/10 entre las 13 y 15 (Pqe. Saavedra)'), 'Mediodía');
  assert.equal(analizarFranjaHoraria('Visita 20/10 entre 15:30 y 17:30 (El Salvador 5920)'), 'Tarde');
  assert.equal(analizarFranjaHoraria('Visita cualquier día luego de las 18:00 (Caracas 5581)'), 'Vespertino');
});

test('procesarContacto distingue entre Nuevos, En Sheets sin respuesta y Cambió el Chip', () => {
  const nuevo = procesarContacto({
    id: 'N1',
    nombre: 'Lucía Fernández',
    barrio: 'Palermo',
    telRaw: '11 5412-8890',
    rsp: 'Nuevo',
    adhirio: 'Pendiente',
    comentario: '',
    enSheets: false,
  });
  assert.equal(nuevo.situacion, 'NUEVO_SIN_PRIMER_MENSAJE');
  assert.equal(nuevo.enSheets, false);

  const cambioChip = procesarContacto({
    id: '49',
    nombre: 'Procaccini Federico',
    barrio: 'Palermo',
    telRaw: '54 9 11 6799-9631',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: '',
    enSheets: true,
  });
  assert.equal(cambioChip.situacion, 'SEGUIMIENTO_CAMBIO_CHIP');
  assert.equal(cambioChip.primerNombre, 'Federico');

  const sinRespuesta = procesarContacto({
    id: '4',
    nombre: 'Laura Vazquez',
    barrio: 'Villa Urquiza',
    telRaw: '54 9 11 6958-4857',
    rsp: 'No',
    adhirio: 'Pendiente',
    comentario: '',
    enSheets: true,
  });
  assert.equal(sinRespuesta.situacion, 'SEGUIMIENTO_SIN_RESPUESTA');
});

test('construirMicroClusters y generarCorteEstrategicoLocal operan sobre la base completa y excluyen contactos sin dirección en Columna G', () => {
  const procesados = INITIAL_RAW_CONTACTS.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE));
  const clusters = construirMicroClusters(procesados, 15, 'Todos', DEFAULT_VOICE_PROFILE);
  assert.ok(clusters.length >= 2, 'Debe detectar múltiples micro-clusters geoespaciales reales en CABA');
  assert.ok(
    clusters.every((cl) =>
      cl.miembros.every(
        (m) => m.contact.adhirio !== 'Sí' && m.contact.tieneDireccionRealEnComentario
      )
    ),
    'Ningún contacto adherido ni ningún contacto sin dirección en Columna G debe aparecer en los micro-clusters del mapa'
  );

  const corte = generarCorteEstrategicoLocal(procesados, DEFAULT_VOICE_PROFILE, 'Todos');
  assert.ok(corte.colaMensajes.length > 20, 'Debe generar la cola de mensajes accionables en 1 clic');
  assert.ok(corte.metricas.nuevosPrimerContacto >= 35, 'Debe contar con personas nuevas sin primer contacto para la cola');

  const conDireccion = procesados.filter((c) => c.adhirio !== 'Sí' && c.tieneDireccionRealEnComentario);
  const ruta = calcularHojaDeRuta(conDireccion.slice(0, 5), '09:40', 20, DEFAULT_VOICE_PROFILE, []);
  assert.ok(ruta.length >= 1);
  assert.equal(ruta[0].horaLlegada, '10:00');
});

test('auto-corrección de barrio según la dirección o punto de encuentro en Columna G (Comentario)', () => {
  // Contacto con barrio "Palermo" pero dirección "Correa 2838" (que queda en Saavedra)
  const desajuste1 = procesarContacto({
    id: '201',
    nombre: 'Laura Quintela',
    barrio: 'Palermo',
    telRaw: '11 6590-6852',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: 'COORDINAR para buscar fichas X2 el 23/10 (Correa 2838)',
    enSheets: true,
  });
  assert.equal(desajuste1.barrio, 'Saavedra');
  assert.equal(desajuste1.barrioOriginalSheet, 'Palermo');
  assert.equal(desajuste1.barrioCorregidoPorDireccion, true);
  assert.equal(desajuste1.tieneDireccionRealEnComentario, true);

  // Contacto con barrio "Saavedra" pero punto de encuentro "Pza. Arenales" (Villa Devoto)
  const desajuste2 = sincronizarBarrioConDireccionComentario({
    id: '202',
    nombre: 'Mariana Grieco',
    barrio: 'Saavedra',
    telRaw: '11 5555-1234',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: 'Visita viernes a las 16hs (Pza. Arenales)',
  });
  assert.equal(desajuste2.barrio, 'Villa Devoto');
  assert.equal(desajuste2.barrioCorregidoPorDireccion, true);

  // Inferencia directa de calle + altura fuera del diccionario puntual
  assert.equal(
    inferirBarrioDesdeDireccionOComentario('Visita por confirmar (Cabildo 2150)', 'Saavedra'),
    'Belgrano'
  );
});

test('contactos desde #167 en adelante y nuevos ingresos de Sheets requieren 1er contacto hasta que se envíe', () => {
  const migrados = migrarContactosDesde167SinPrimerContacto([
    {
      id: '166',
      nombre: 'Contacto Anterior',
      barrio: 'Palermo',
      telRaw: '11 4000-0166',
      rsp: 'No',
      adhirio: 'Pendiente',
      comentario: '',
    },
    {
      id: '167',
      nombre: 'Contacto Ciento Sesenta y Siete',
      barrio: 'Palermo',
      telRaw: '11 4000-0167',
      rsp: 'No',
      adhirio: 'Pendiente',
      comentario: '',
    },
  ]);

  assert.equal(migrados[0].rsp, 'No');
  assert.equal(migrados[1].rsp, 'Nuevo');
  assert.equal(migrados[1].estadoFlujo, 'SIN_CONTACTAR_1ER_MSJ');

  // Si luego se registra en el control de envíos, fusionarContactosDesdeSheetsConControl respeta que ya fue contactado
  const fusionados = fusionarContactosDesdeSheetsConControl(
    [
      {
        id: '167',
        nombre: 'Contacto Ciento Sesenta y Siete',
        barrio: 'Palermo',
        telRaw: '11 4000-0167',
        rsp: 'No',
        adhirio: 'Pendiente',
        comentario: '',
      },
      {
        id: '168',
        nombre: 'Persona Nueva En Sheets',
        barrio: 'Belgrano',
        telRaw: '11 4000-0168',
        rsp: 'No',
        adhirio: 'Pendiente',
        comentario: '',
      },
    ],
    migrados,
    new Set(['id:167', 'tel:5491140000167'])
  );

  assert.equal(fusionados.contactosFusionados[0].rsp, 'No');
  assert.equal(fusionados.contactosFusionados[0].estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP');
  assert.equal(fusionados.contactosFusionados[1].rsp, 'Nuevo');
  assert.equal(fusionados.contactosFusionados[1].estadoFlujo, 'SIN_CONTACTAR_1ER_MSJ');
});

test('teléfonos sin nombre en Google Sheets incluyen pregunta sutil de nombre y apellido anti-desconfianza y estado FALTA_NOMBRE_Y_APELLIDO', () => {
  const sinNombreContact = procesarContacto({
    id: 'S/N-1',
    nombre: '',
    barrio: 'Palermo',
    telRaw: '54 9 11 5802-4419',
    rsp: 'No',
    adhirio: 'Pendiente',
    comentario: 'Teléfono registrado en Google Sheets sin nombre cargado',
    enSheets: true,
  });

  assert.equal(sinNombreContact.sinNombre, true);
  assert.equal(sinNombreContact.estadoFlujo, 'FALTA_NOMBRE_Y_APELLIDO');
  assert.ok(
    sinNombreContact.mensajeSugerido.includes('nombre y apellido'),
    'El mensaje de primer contacto para un teléfono sin nombre debe consultar sutilmente nombre y apellido'
  );
  assert.ok(
    sinNombreContact.mensajeSugerido.includes('adhesión') &&
      sinNombreContact.mensajeSugerido.includes('afiliación'),
    'Debe dar tranquilidad explicando que es adhesión y no afiliación'
  );
});

test('inferirEstadoFlujo distingue si pasó día/franja/dirección, encuentro confirmado, recordatorio enviado y ya adhirió', () => {
  const pasoDatos = procesarContacto({
    id: '9',
    nombre: 'Silvina',
    barrio: 'Saavedra',
    telRaw: '54 9 11 6153-5440',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: 'Visita por confirmar (Av. Balbín y Larralde)',
    enSheets: true,
  });
  assert.equal(pasoDatos.estadoFlujo, 'PASO_DATOS_FALTA_CONFIRMAR');

  const confirmado = procesarContacto({
    id: '42',
    nombre: 'Sofia Piñeiro Pearson',
    barrio: 'Palermo',
    telRaw: '54 9 11 5495-3330',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: 'Visita 20/10 entre 15:30 y 17:30 (El Salvador 5920)',
    enSheets: true,
  });
  assert.equal(confirmado.estadoFlujo, 'ENCUENTRO_CONFIRMADO');

  const recordatorio = procesarContacto({
    id: '43',
    nombre: 'Lucila',
    barrio: 'Palermo',
    telRaw: '54 9 11 5175-2561',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: 'Visita 21/10 a las 10 (Charcas 3702) - recordatorio enviado',
    enSheets: true,
  });
  assert.equal(recordatorio.estadoFlujo, 'RECORDATORIO_DIA_ENVIADO');
});

test('parsearTSVoCSVContactos y repararContactosDesfasados detectan siempre la Columna B como Nombre y jamás confunden Barrio con Nombre', () => {
  // 1. TSV con Columna A vacía y Nombre en Columna B (y Mail en Columna D)
  const tsvConColAVacia = [
    '\tKandel Analía\tPalermo\tpoliticalinguisticagcba@gmail.com\t1144119161\tNo\tPendiente\t',
    '\tGuido iezzi\tPalermo\tguidoiezzi@gmail.com\t1141575844\tNo\tPendiente\t',
    '\tMilagros del Priore\tPalermo\tMilagros.Delp@gmail.com\t1121776845\tNo\tPendiente\tTiene domicilio fuera de CABA....',
    '\tAndreotti Cecilia Beatriz\tPalermo\tceciliaandreotti@gmail.com\t1167511816\tNo\tPendiente\tTiene una situación de salud con ...',
    '\tBronfman Melina\tNuñez\tmelinabronfman@gmail.com\t1150577654\tNo\tPendiente\tPróxima semana.',
  ].join('\n');

  const filasTsv = parsearTSVoCSVContactos(tsvConColAVacia, true).map((r) => procesarContacto(r));
  assert.equal(filasTsv.length, 5);
  assert.equal(filasTsv[0].primerNombre, 'Analía');
  assert.equal(filasTsv[0].barrio, 'Palermo');
  assert.equal(filasTsv[0].email, 'politicalinguisticagcba@gmail.com');
  assert.equal(filasTsv[1].primerNombre, 'Guido');
  assert.equal(filasTsv[1].nombreCompletoCorregido, 'Guido Iezzi');
  assert.equal(filasTsv[2].primerNombre, 'Milagros');
  assert.equal(filasTsv[2].estadoFlujo, 'DESCARTADO_O_BAJA');
  assert.equal(filasTsv[2].esCerradoOArchivadoSinDniCaba, true);
  assert.equal(filasTsv[3].primerNombre, 'Cecilia');
  assert.equal(filasTsv[3].estadoFlujo, 'POSTERGO_SALUD_O_VIAJE');
  assert.equal(filasTsv[4].primerNombre, 'Melina');
  assert.equal(filasTsv[4].barrio, 'Núñez');

  // 2. CSV donde Google Sheets omitió la Columna A vacía al exportar
  const csvColAOmitida = [
    'Kandel Analía,Palermo,politicalinguisticagcba@gmail.com,1144119161,No,Pendiente,',
    'Bronfman Melina,Nuñez,melinabronfman@gmail.com,1150577654,No,Pendiente,Próxima semana.',
  ].join('\n');

  const filasCsv = parsearTSVoCSVContactos(csvColAOmitida, true).map((r) => procesarContacto(r));
  assert.equal(filasCsv[0].primerNombre, 'Analía');
  assert.equal(filasCsv[0].barrio, 'Palermo');
  assert.equal(filasCsv[1].primerNombre, 'Melina');
  assert.equal(filasCsv[1].barrio, 'Núñez');

  // 3. Auto-reparación de contactos ya guardados con desfase en localStorage
  const desfasados = repararContactosDesfasados([
    {
      id: 'Kandel Analía',
      nombre: 'Palermo',
      barrio: 'politicalinguisticagcba@gmail.com',
      telRaw: '1144119161',
      rsp: 'No',
      adhirio: 'Pendiente',
      comentario: '',
    },
  ]);
  const reparado = procesarContacto(desfasados[0]);
  assert.equal(reparado.id, '1');
  assert.equal(reparado.primerNombre, 'Analía');
  assert.equal(reparado.barrio, 'Palermo');
  assert.equal(reparado.email, 'politicalinguisticagcba@gmail.com');
});

test('automatizador de primeros mensajes aplica las 7 capas anti-bloqueo (< 45 msjs, variabilidad Spintax, Opt-Out Baja, cero URLs, pausas de café y estados Sheets)', () => {
  // 1. Cupo siempre menor a 45 incluso si se pide 100
  for (let i = 0; i < 20; i++) {
    const cupo = sortearCupoSeguroAntiBloqueo(30, 99);
    assert.ok(cupo >= 30 && cupo <= 44, `El cupo sorteado (${cupo}) debe ser estrictamente < 45`);
  }

  // 2. Sanitizador de URLs en primer mensaje
  assert.equal(
    limpiarUrlsDePrimerMensaje('Hola Juan, mirá https://ejemplo.com/form o bit.ly/abc123 hoy'),
    'Hola Juan, mirá o hoy'
  );

  // 3. Generar cola sobre contactos pendientes de 1er mensaje
  const basePrueba = Array.from({ length: 50 }, (_, idx) =>
    procesarContacto({
      id: String(167 + idx),
      nombre: `Vecino Prueba ${idx + 1}`,
      barrio: 'Palermo',
      telRaw: `11 5000-${String(1000 + idx)}`,
      rsp: 'Nuevo',
      adhirio: 'Pendiente',
      comentario: '',
      primerContactoEnviado: false,
    })
  );

  const campana = generarColaEnvioAutomaticoPrimerContacto(basePrueba, {
    horaInicio: '10:30',
    horaVentanaInicio: '09:00',
    horaVentanaFin: '19:00',
    nivelWarmup: 'DIA_5_MADURO_MENOS_45',
    cupoSorteado: 48, // Intenta 48, debe recortar a 44 (< 45)
    lotePausaCafeCada: 12,
    incluirOptOutBaja: true,
  });

  assert.equal(campana.items.length, 44, 'Nunca debe permitir 45 o más mensajes en la cola');
  assert.notEqual(
    campana.items[0].mensajePrimerContacto,
    campana.items[1].mensajePrimerContacto,
    'Dos mensajes consecutivos nunca deben ser idénticos (polimorfismo activo)'
  );
  assert.ok(
    campana.items[0].mensajePrimerContacto.includes('Baja'),
    'Debe incluir la cláusula amigable de Salida Fácil (Baja)'
  );
  assert.equal(
    campana.items[12].esPausaCafeAntes,
    true,
    'El envío #13 (tras 12 enviados) debe incluir una Pausa de Café larga'
  );

  // 4. Actualización automática según resultado (Enviado OK vs Número Inexistente vs Error)
  const rawBase = {
    id: '170',
    nombre: 'Martín Gómez',
    barrio: 'Palermo',
    telRaw: '11 5000-1003',
    rsp: 'Nuevo' as const,
    adhirio: 'Pendiente' as const,
    comentario: '',
    primerContactoEnviado: false,
  };

  const trasExito = aplicarResultadoEnvioAutoAContacto(rawBase, 'ENVIADO_OK');
  assert.equal(trasExito.primerContactoEnviado, true);
  assert.equal(trasExito.estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP');

  const trasInexistente = aplicarResultadoEnvioAutoAContacto(rawBase, 'NUMERO_INEXISTENTE');
  assert.equal(trasInexistente.adhirio, 'No');
  assert.equal(trasInexistente.estadoFlujo, 'DESCARTADO_O_BAJA');
  assert.ok(trasInexistente.comentario.includes('No existe en WhatsApp'));

  // 5. El script Python generado incluye SQLite, ventana comercial y tipeo humano
  const scriptPy = generarScriptPythonAutomatizador(
    campana,
    'http://localhost:3000',
    '1abc',
    ''
  );
  assert.ok(scriptPy.includes('sqlite3'));
  assert.ok(scriptPy.includes('control_enviados_popurri.db'));
  assert.ok(scriptPy.includes('esta_dentro_de_ventana_comercial'));
  assert.ok(scriptPy.includes('page.keyboard.type'));
});

test('Catálogo de Cafés HUB de Google Maps vincula los lugares del usuario a los circuitos y barrios de CABA', () => {
  assert.ok(
    CATALOGO_CAFES_ESPECIALIDAD_HUB.length >= 100,
    'Debe contener la lista completa de Cafés de Especialidad del JSON de Google Maps del usuario'
  );
  assert.ok(
    CATALOGO_CAFES_HUB_CABA.length >= 80,
    'Debe filtrar los Cafés HUB ubicados dentro de CABA para los circuitos'
  );

  // Cerca de Parque Saavedra (Cori / Rosie Café)
  const cercanosSaavedra = listarCafesHubCercanos(-34.551, -58.48, 3, true);
  assert.equal(cercanosSaavedra.length, 3);
  assert.ok(
    cercanosSaavedra.some((c) => c.nombre.includes('Cori') || c.nombre.includes('Rosie')),
    'Debe encontrar Cori o Rosie Café en Saavedra'
  );

  // Verificar que construirMicroClusters asigne cafesHubCercanos con URL oficial de Google Maps (cid)
  const procesados = INITIAL_RAW_CONTACTS.map((r) => procesarContacto(r));
  const clusters = construirMicroClusters(procesados, 15, 'Todos');
  assert.ok(clusters.length > 0);
  assert.ok(
    clusters[0].cafesHubCercanos && clusters[0].cafesHubCercanos.length > 0,
    'Cada circuito debe incluir los Cafés HUB más cercanos de la lista oficial de Google Maps'
  );
  assert.ok(
    clusters[0].urlGoogleMapsCafe.includes('google.com/maps?cid='),
    'El enlace principal de Café HUB del circuito debe apuntar al lugar exacto del Google Maps compartido'
  );
});

test('Stealth v2.0: navegación SPA sin page.goto en bucle, rompehielo corto, filtro +54 y limpieza de falsos errores (#168, #169, #170)', () => {
  const contactosTest = [
    {
      id: '167',
      nombre: 'Alberto Federico Pena',
      barrio: 'Palermo',
      telRaw: '34623031115', // Número internacional (España +34)
      rsp: 'Nuevo' as const,
      adhirio: 'Pendiente' as const,
      comentario: '',
      primerContactoEnviado: false,
    },
    {
      id: '168',
      nombre: 'Pablo Enrique Rubio',
      barrio: 'Belgrano',
      telRaw: '5491159773959',
      rsp: 'No' as const,
      adhirio: 'Pendiente' as const,
      comentario: '[Reintentar envío WA: Navigation to https://web.whatsapp.com/send is interrupted]',
      estadoFlujo: 'SIN_CONTACTAR_1ER_MSJ' as const,
      estadoFlujoEtiqueta: '1. Sin contactar (Reintentar envío)',
      primerContactoEnviado: false,
    },
    {
      id: '169',
      nombre: 'Rodrigo Piczman',
      barrio: 'Palermo',
      telRaw: '5491159613637',
      rsp: 'No' as const,
      adhirio: 'Pendiente' as const,
      comentario: '[Reintentar envío WA: Tiempo de espera agotado al abrir el chat en WhatsApp Web]',
      estadoFlujo: 'SIN_CONTACTAR_1ER_MSJ' as const,
      estadoFlujoEtiqueta: '1. Sin contactar (Reintentar envío)',
      primerContactoEnviado: false,
    },
  ];

  // 1. Limpieza en 1 clic de falsos errores de sesión (#168, #169)
  const { actualizados, limpiadosCount } = limpiarErroresFalsosRestriccionWA(contactosTest);
  assert.equal(limpiadosCount, 2, 'Debe limpiar exactamente los 2 contactos con falso error de sesión (#168 y #169)');
  assert.equal(actualizados[1].comentario, '');
  assert.equal(actualizados[1].rsp, 'Nuevo');
  assert.equal(actualizados[1].estadoFlujo, 'SIN_CONTACTAR_1ER_MSJ');

  // 2. Filtro de sólo números de Argentina (+54) y modo rompehielo corto (< 260 caracteres, sin "Baja")
  const procesados = actualizados.map((r) => procesarContacto(r));
  const campanaStealth = generarColaEnvioAutomaticoPrimerContacto(
    procesados,
    {
      modoRompehieloCorto: true,
      soloNumerosArgentina: true,
      incluirOptOutBaja: false,
    },
    DEFAULT_VOICE_PROFILE
  );

  assert.equal(
    campanaStealth.items.some((it) => it.contactId === '167'),
    false,
    'Con soloNumerosArgentina=true debe omitir el número internacional +34 (#167)'
  );
  assert.equal(campanaStealth.items.length, 2, 'Debe incluir a #168 y #169 (+54 Argentina)');
  assert.ok(
    campanaStealth.items[0].mensajePrimerContacto.length < 260,
    'El mensaje rompehielo corto debe tener menos de 260 caracteres'
  );
  assert.equal(
    campanaStealth.items[0].mensajePrimerContacto.includes('Baja'),
    false,
    'El rompehielo corto no debe incluir palabras gatillo de bot como Baja'
  );

  // 3. El script Python Stealth v2.0 usa navegación interna SPA y NO usa page.goto("https://web.whatsapp.com/send?phone=...")
  const scriptStealth = generarScriptPythonAutomatizador(
    campanaStealth,
    'http://localhost:3000',
    '1abc',
    ''
  );
  assert.equal(
    scriptStealth.includes('page.goto(f"https://web.whatsapp.com/send?phone='),
    false,
    'CRÍTICO: Nunca debe usar page.goto hacia /send?phone= porque recarga la SPA y dispara el bloqueo de Meta'
  );
  assert.ok(
    scriptStealth.includes('def abrir_chat_spa_sin_recargar'),
    'Debe incluir navegación interna SPA sin recargar WhatsApp Web'
  );
  assert.ok(
    scriptStealth.includes('--disable-blink-features=AutomationControlled'),
    'Debe ocultar el flag navigator.webdriver de Chromium'
  );
  assert.ok(
    scriptStealth.includes('detectar_restriccion_o_cierre_sesion'),
    'Debe incluir cortacircuitos inmediato ante restricción de dispositivo vinculado'
  );
});

test('deduplicarEventosCalendar elimina claves duplicadas de eventos recurrentes y generarMensajeTerrenoParadaRuta incluye todos los modos de terreno', () => {
  const eventosDuplicados = [
    {
      id: 'qt9rfgj11hagjcgv6tt4prf24c@google.com',
      summary: 'Reunión Semanal',
      location: 'Cabildo 2040, Belgrano',
      fecha: '21/10',
      fechaISO: '2026-10-21',
      startTime: '11:00',
      endTime: '12:00',
      startIso: '2026-10-21T11:00:00-03:00',
      endIso: '2026-10-21T12:00:00-03:00',
    },
    {
      id: 'qt9rfgj11hagjcgv6tt4prf24c@google.com',
      summary: 'Reunión Semanal',
      location: 'Cabildo 2040, Belgrano',
      fecha: '21/10',
      fechaISO: '2026-10-21',
      startTime: '11:00',
      endTime: '12:00',
      startIso: '2026-10-21T11:00:00-03:00',
      endIso: '2026-10-21T12:00:00-03:00',
    },
    {
      id: 'qt9rfgj11hagjcgv6tt4prf24c@google.com',
      summary: 'Reunión Semanal',
      location: 'Cabildo 2040, Belgrano',
      fecha: '28/10',
      fechaISO: '2026-10-28',
      startTime: '11:00',
      endTime: '12:00',
      startIso: '2026-10-28T11:00:00-03:00',
      endIso: '2026-10-28T12:00:00-03:00',
    },
  ];

  const dedup = deduplicarEventosCalendar(eventosDuplicados);
  assert.equal(dedup.length, 2, 'Debe eliminar el duplicado exacto del 21/10 y conservar la instancia del 28/10');
  assert.notEqual(dedup[0].id, dedup[1].id, 'Cada instancia recurrente debe recibir un id único con su fecha/hora');

  const contactos = INITIAL_RAW_CONTACTS.map((r) => procesarContacto(r));
  const pendientesConLugar = contactos.filter(
    (c) => c.adhirio !== 'Sí' && Boolean(c.calleOCruce || c.tienePuntoEncuentroDeterminado)
  );
  const ruta = calcularHojaDeRuta(
    pendientesConLugar.slice(0, 4),
    '10:45',
    20,
    DEFAULT_VOICE_PROFILE,
    dedup,
    '21/10'
  );
  assert.ok(ruta.length > 0);
  const parada = ruta[0];

  const msjDisculpas = generarMensajeTerrenoParadaRuta(parada, 'DISCULPAS_CANCELACION_REPROGRAMAR');
  assert.ok(msjDisculpas.toLowerCase().includes('disculpas'), 'El modo DISCULPAS_CANCELACION_REPROGRAMAR debe pedir disculpas y ofrecer reprogramar');

  const msjNoEstaba = generarMensajeTerrenoParadaRuta(parada, 'NO_ESTABA_REPROGRAMAR');
  assert.ok(msjNoEstaba.toLowerCase().includes('pasé') || msjNoEstaba.toLowerCase().includes('desencuentro') || msjNoEstaba.toLowerCase().includes('reprogram'), 'El modo NO_ESTABA_REPROGRAMAR debe indicar que pasamos por el domicilio y proponer reprogramar o Café HUB');
});

test('generarCorteEstrategicoLocal unifica circuitos con Agenda Día por Día, genera franjas diurnas coherentes sin desbordar a la madrugada y limpia metadatos de los mensajes WA', () => {
  const ahoraSimulado = new Date('2026-10-21T09:12:00-03:00').getTime();
  const contactos = INITIAL_RAW_CONTACTS.map((r) =>
    procesarContacto(r, DEFAULT_VOICE_PROFILE, ahoraSimulado)
  );
  // Simular un evento vespertino que termina a las 20:30 para comprobar que ningún bloque arranque a las 18:32 ni termine a las 03:50 hs
  const eventos = [
    {
      id: 'ev-tarde-noche',
      summary: 'Actividad Vespertina',
      location: 'Cabildo 2040, Belgrano',
      fecha: '21/10',
      fechaISO: '2026-10-21',
      startTime: '18:00',
      endTime: '20:30',
      startIso: '2026-10-21T18:00:00-03:00',
      endIso: '2026-10-21T20:30:00-03:00',
    },
  ];

  const corte = generarCorteEstrategicoLocal(
    contactos,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    eventos,
    ahoraSimulado
  );

  assert.ok(corte.agendaSugeridaDias.length > 0, 'Debe generar bloques de agenda');

  for (const b of corte.agendaSugeridaDias) {
    // 1. Ningún bloque puede mezclar barrios distantes como "Palermo / Saavedra"
    assert.equal(
      b.barrio.includes('/'),
      false,
      `El bloque ${b.id} no debe mezclar barrios distintos en el título (${b.barrio})`
    );
    // 2. Ni diaEtiqueta ni franjaHoraria deben tener texto operativo ("Actualizado", "paradas", "min reales")
    assert.equal(
      b.diaEtiqueta.includes('Actualizado'),
      false,
      `diaEtiqueta no debe incluir "Actualizado": ${b.diaEtiqueta}`
    );
    assert.equal(
      b.franjaHoraria.includes('paradas'),
      false,
      `franjaHoraria debe ser limpia para el vecino: ${b.franjaHoraria}`
    );
    assert.equal(
      b.franjaHoraria.includes('03:'),
      false,
      `franjaHoraria jamás debe desbordar a la madrugada: ${b.franjaHoraria}`
    );

    // 3. El mensaje generado para cada vecino del bloque no debe filtrar metadatos internos
    for (const vecino of b.contactosIncluidos) {
      const msg = generarMensajePropuestaBloqueAgenda(vecino, b, DEFAULT_VOICE_PROFILE);
      assert.equal(
        msg.includes('Actualizado'),
        false,
        `El mensaje WA no debe contener "Actualizado": ${msg}`
      );
      assert.equal(
        msg.includes('min reales'),
        false,
        `El mensaje WA no debe contener "min reales": ${msg}`
      );
      assert.equal(
        msg.includes('paradas'),
        false,
        `El mensaje WA no debe contener "paradas": ${msg}`
      );
    }
  }
});

test('analizarDisponibilidadColumnaG y calcularHojaDeRuta: franja amplia no dispara cancelación falsa con Calendar y define horario conveniente', () => {
  const dispAmplia = analizarDisponibilidadColumnaG(
    'Miércoles 22/4 entre 9 y 16:00 (Av. Cramer 3280)'
  );
  assert.equal(dispAmplia.esVentanaAmplia, true);
  assert.equal(dispAmplia.horaPuntualPactada, undefined);
  assert.equal(dispAmplia.minInicioVentana, 9 * 60);
  assert.equal(dispAmplia.minFinVentana, 16 * 60);

  const dispFija = analizarDisponibilidadColumnaG('Miércoles 22/4 a las 11 hs (Av. Cramer 3280)');
  assert.equal(dispFija.esVentanaAmplia, false);
  assert.equal(dispFija.horaPuntualPactada, '11:00');

  const vecinoVentanaAmplia = procesarContacto({
    id: '49',
    nombre: '',
    barrio: 'Saavedra',
    telRaw: '11 5555-0049',
    rsp: 'Sí',
    adhirio: 'Pendiente',
    comentario: 'Miércoles 22/4 entre 9 y 16:00 (Av. Cramer 3280)',
    enSheets: true,
  });

  const eventoCortoMediodia = [
    {
      id: 'ev-entrevista',
      summary: 'Entrevista con Emi',
      location: 'Cabildo 2040, Belgrano',
      fecha: '22/04',
      fechaISO: '2026-04-22',
      startTime: '11:00',
      endTime: '11:50',
      startIso: '2026-04-22T11:00:00-03:00',
      endIso: '2026-04-22T11:50:00-03:00',
    },
  ];

  const paradas = calcularHojaDeRuta(
    [vecinoVentanaAmplia],
    '10:50',
    20,
    DEFAULT_VOICE_PROFILE,
    eventoCortoMediodia,
    '22/04',
    {
      cafeHubBloque: {
        nombre: 'Café Martínez',
        direccion: 'Av. Ricardo Balbín 3893, Saavedra',
      },
      modalidadBloque: 'CAFE_HUB',
    }
  );

  assert.equal(paradas.length, 1);
  // No debe marcar conflictoCalendar para cancelar/reprogramar porque tiene ventana amplia 9 a 16:00
  assert.equal(paradas[0].conflictoCalendar, undefined);
  assert.ok(paradas[0].notaHorarioConveniente, 'Debe definir horario conveniente dentro de la ventana');
  assert.equal(paradas[0].cafeHubAsignado?.nombre, 'Café Martínez');
});

test('correspondencia 100% de Café HUB entre Agenda Recomendada Día por Día, Lista 1-a-1, recuadro amarillo y Mensaje WA de Hoja de Ruta, sin bloques superpuestos', () => {
  const ahoraSimulado = new Date('2026-04-21T10:00:00-03:00').getTime();
  const contactos = INITIAL_RAW_CONTACTS.map((r) =>
    procesarContacto(r, DEFAULT_VOICE_PROFILE, ahoraSimulado)
  );
  const corte = generarCorteEstrategicoLocal(
    contactos,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    [],
    ahoraSimulado
  );

  // Verificar que los bloques de un mismo día NO se superpongan en horario
  const porFecha = new Map<string, { ini: number; fin: number; id: string }[]>();
  const aMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  for (const b of corte.agendaSugeridaDias) {
    if (b.modalidad === 'EVENTO_SEDE') continue;
    const ini = aMin(b.horaInicioCalculada || '09:30');
    const fin = aMin(b.horaFinCalculada || '10:30');
    const previos = porFecha.get(b.fechaClave) || [];
    for (const prev of previos) {
      const seSolapan = ini < prev.fin && fin > prev.ini;
      assert.equal(
        seSolapan,
        false,
        `Los bloques ${prev.id} (${prev.ini}-${prev.fin}) y ${b.id} (${ini}-${fin}) del día ${b.fechaClave} no deben superponerse`
      );
    }
    previos.push({ ini, fin, id: b.id });
    porFecha.set(b.fechaClave, previos);

    // Verificar correspondencia del Café HUB entre el bloque, el mensaje de propuesta 1-a-1 y cada parada de la Hoja de Ruta
    const cafeBloque = b.cafesHubOpciones?.[0];
    if (cafeBloque && b.paradasRutaSugerida && b.paradasRutaSugerida.length > 0) {
      for (const p of b.paradasRutaSugerida) {
        assert.equal(
          p.cafeHubAsignado?.nombre,
          cafeBloque.nombre,
          `El Café HUB asignado en la parada (${p.cafeHubAsignado?.nombre}) debe coincidir con el Café HUB del bloque (${cafeBloque.nombre})`
        );
        const msgPropuesta1a1 = generarMensajePropuestaBloqueAgenda(
          p.contact,
          b,
          DEFAULT_VOICE_PROFILE
        );
        assert.ok(
          msgPropuesta1a1.includes(cafeBloque.nombre),
          `El mensaje 1-a-1 debe sugerir el mismo Café HUB del bloque (${cafeBloque.nombre}): ${msgPropuesta1a1}`
        );
        const msgTerrenoCafe = generarMensajeTerrenoParadaRuta(
          p,
          'YA_EN_CAFE_HUB',
          DEFAULT_VOICE_PROFILE
        );
        assert.ok(
          msgTerrenoCafe.includes(cafeBloque.nombre),
          `El mensaje WA en terreno debe mencionar el mismo Café HUB del recuadro amarillo (${cafeBloque.nombre}): ${msgTerrenoCafe}`
        );
      }
    }
  }

  // Verificar que al consolidar respuesta en Lista 1-a-1 se activa esContactoConfirmadoEnLista1a1 y se adapta el estado
  const bloquePrueba = corte.agendaSugeridaDias[0];
  const vecinoPrueba = bloquePrueba.contactosIncluidos[0];
  const rawActualizado = aplicarRespuestaPropuestaAgenda(
    vecinoPrueba,
    bloquePrueba,
    'DECLINO_CAFE_PASA_PUERTA_A_PUERTA',
    undefined,
    DEFAULT_VOICE_PROFILE
  );
  const procActualizado = procesarContacto(rawActualizado, DEFAULT_VOICE_PROFILE, ahoraSimulado);
  assert.equal(esContactoConfirmadoEnLista1a1(procActualizado), true);
  assert.equal(procActualizado.estadoFlujo, 'ENCUENTRO_CONFIRMADO');
});

test('todos los contactos pautados para HOY 21/10 (incluyendo #1 Laura Masson y fechas compuestas como 20 o 21/10) aparecen en la planificación de HOY 21/10', () => {
  const ahora21Oct = new Date('2026-10-21T07:00:00-03:00').getTime();
  const contactos = INITIAL_RAW_CONTACTS.map((r) =>
    procesarContacto(r, DEFAULT_VOICE_PROFILE, ahora21Oct)
  );
  const corte = generarCorteEstrategicoLocal(
    contactos,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    [],
    ahora21Oct
  );

  const bloquesHoy = corte.agendaSugeridaDias.filter((b) => b.fechaClave === '21/10');
  assert.ok(bloquesHoy.length >= 2, 'Debe haber bloques planificados para HOY 21/10');

  const idsEnHoy = new Set(
    bloquesHoy.flatMap((b) => b.contactosIncluidos.map((c) => c.id))
  );

  // Verificar que #1 Laura Masson (Visita 21/10 a las 10 - Charcas 3702) está incluida en HOY 21/10
  assert.equal(idsEnHoy.has('1'), true, '#1 Laura Masson debe estar en la planificación de HOY 21/10');
  // Verificar que contactos con "20 o 21/10" o "21 o 23/10" también están en HOY 21/10
  assert.equal(idsEnHoy.has('96'), true, '#96 Marina Peralta Ramos (20 o 21/10) debe estar en HOY 21/10');
  assert.equal(idsEnHoy.has('105'), true, '#105 Paulina Czyzyk (21 o 23/10) debe estar en HOY 21/10');
  assert.equal(idsEnHoy.has('13'), true, '#13 Felipe Manzano (21/10 a las 15) debe estar en HOY 21/10');
  assert.equal(idsEnHoy.has('40'), true, '#40 Alejandra Gottardi (21/10 11:30) debe estar en HOY 21/10');
});

test('el aviso de reprogramación se activa también cuando el horario se superpone con el horario/día fijado o confirmado por otra persona', () => {
  const ahora21Oct = new Date('2026-10-21T07:00:00-03:00').getTime();
  const vecinoA = procesarContacto(
    {
      id: '901',
      nombre: 'Laura Masson',
      telRaw: '1155550001',
      rsp: 'Sí',
      adhirio: 'Pendiente',
      barrio: 'Palermo',
      comentario: 'Visita 21/10 a las 10 (Charcas 3702)',
    },
    DEFAULT_VOICE_PROFILE,
    ahora21Oct
  );
  const vecinoB = procesarContacto(
    {
      id: '902',
      nombre: 'Carlos Gómez',
      telRaw: '1155550002',
      rsp: 'Sí',
      adhirio: 'Pendiente',
      barrio: 'Belgrano',
      comentario: 'Visita 21/10 a las 10:05 (Cabildo 2040)',
    },
    DEFAULT_VOICE_PROFILE,
    ahora21Oct
  );

  // Caso 1: Ambos en la misma ruta (superposición directa entre parada 1 y parada 2)
  const paradasMismaRuta = calcularHojaDeRuta(
    [vecinoA, vecinoB],
    '09:40',
    20,
    DEFAULT_VOICE_PROFILE,
    [],
    '21/10',
    { modalidadBloque: 'PUERTA_A_PUERTA' }
  );
  assert.equal(paradasMismaRuta.length, 2);
  const paradaConChoqueMismaRuta = paradasMismaRuta.find((p) => Boolean(p.conflictoCalendar));
  assert.ok(
    paradaConChoqueMismaRuta,
    'Debe activar conflictoCalendar cuando dos personas fijan horarios superpuestos en la misma ruta'
  );
  assert.ok(
    paradaConChoqueMismaRuta!.conflictoCalendar!.includes('se superpone con el horario/día fijado o confirmado'),
    `El aviso debe indicar la superposición con la otra persona: ${paradaConChoqueMismaRuta!.conflictoCalendar}`
  );
  assert.ok(
    paradaConChoqueMismaRuta!.mensajeReprogramacionCalendar?.includes('nuestro compromiso'),
    'El mensaje de reprogramación debe asumir la responsabilidad por no poder cumplir con el compromiso en ese horario'
  );

  // Caso 2: Superposición con otra persona agendada/confirmada ese mismo día en otro circuito (contactosMismoDia)
  const paradasOtroCircuito = calcularHojaDeRuta(
    [vecinoB],
    '09:45',
    20,
    DEFAULT_VOICE_PROFILE,
    [],
    '21/10',
    {
      modalidadBloque: 'PUERTA_A_PUERTA',
      contactosMismoDia: [vecinoA, vecinoB],
    }
  );
  assert.equal(paradasOtroCircuito.length, 1);
  assert.ok(
    paradasOtroCircuito[0].conflictoCalendar?.includes('Laura Masson'),
    `Debe detectar choque con Laura Masson en el mismo día 21/10: ${paradasOtroCircuito[0].conflictoCalendar}`
  );
});

test('parsearTSVoCSVContactos y asegurarIdsUnicosContactos evitan IDs duplicados como 212 cuando hay filas sin número de orden en Columna A', () => {
  const tsvConColision212 = [
    '#\tNombre\tBarrio\tTeléfono\tRSP\tAdhirió\tComentario',
    '212\tMartín Echeverría\tPalermo\t1144440212\tNuevo\tPendiente\t',
    '\tLucía Fernández\tBelgrano\t1144440213\tNuevo\tPendiente\t',
    '212\tDiego Morales\tCaballito\t1144440214\tNuevo\tPendiente\t',
  ].join('\n');

  const parseados = parsearTSVoCSVContactos(tsvConColision212, true);
  assert.equal(parseados.length, 3);
  const ids = parseados.map((r) => r.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, 3, `Todos los IDs deben ser únicos, se obtuvo: ${ids.join(', ')}`);

  // Verificar también sobre una lista en memoria que ya tuviera dos elementos con id '212'
  const desduplicados = asegurarIdsUnicosContactos([
    { ...parseados[0], id: '212' },
    { ...parseados[1], id: '212' },
  ]);
  assert.notEqual(desduplicados[0].id, desduplicados[1].id);
});

test('a las 10:18 del 21/10 detecta visitas/encuentros vencidos sin adherir y recalcula el cronograma de HOY con Terapia (14:30-15:20) en Calendar', () => {
  const ahora1018 = new Date('2026-10-21T10:18:00-03:00').getTime();

  // 1. Verificar extracción de dirección fuera de paréntesis y disponibilidad real
  assert.equal(extraerCalleOCruce('Charcas 3702 1B (el 21/10 a las 10)'), 'Charcas 3702 1B');
  assert.equal(
    extraerCalleOCruce('Beruti 3459, depto 12B (entre el 20 y 24/10, antes de las 11:30 y 12:00)'),
    'Beruti 3459, depto 12B'
  );
  assert.equal(
    extraerCalleOCruce('Av. Bullrich y Av. Santa Fe (20 o 21/10 por la tarde) [Propuesta Miércoles 21/10 · 10:16 a 12:11 hs (Mañana)]'),
    'Av. Bullrich y Av. Santa Fe'
  );

  const dispFelipe = analizarDisponibilidadColumnaG(
    'Beruti 3459, depto 12B (entre el 20 y 24/10, antes de las 11:30 y 12:00)'
  );
  assert.equal(dispFelipe.minFinVentana, 12 * 60);

  const dispSantiago = analizarDisponibilidadColumnaG(
    'Av. Bullrich y Av. Santa Fe (20 o 21/10 por la tarde) [Propuesta Miércoles 21/10 · 10:16 a 12:11 hs (Mañana)]'
  );
  assert.equal(dispSantiago.minInicioVentana, 14 * 60);
  assert.equal(dispSantiago.minFinVentana, 19 * 60);

  // 2. Contactos reales del usuario en Palermo y eventos de Google Calendar del 21/10
  const rawPalermo = [
    {
      id: '94',
      nombre: 'Laura Masson',
      barrio: 'Palermo',
      telRaw: '54 9 11 5337-4625',
      rsp: 'Sí' as const,
      adhirio: 'No' as const,
      comentario: 'Charcas 3702 1B (el 21/10 a las 10)',
    },
    {
      id: '116',
      nombre: 'Felipe',
      barrio: 'Palermo',
      telRaw: '54 9 11 4991-0023',
      rsp: 'Sí' as const,
      adhirio: 'No' as const,
      comentario: 'Beruti 3459, depto 12B (entre el 20 y 24/10, antes de las 11:30 y 12:00)',
    },
    {
      id: '149',
      nombre: 'Alejandra Gottardi',
      barrio: 'Palermo',
      telRaw: '54 9 11 5003-2211',
      rsp: 'Sí' as const,
      adhirio: 'No' as const,
      comentario: 'Av. Cnel. Díaz 2277 11 B [Propuesta Miércoles 21/10 · 09:43 a 12:11 hs (Mañana)]',
    },
    {
      id: '162',
      nombre: 'Santiago',
      barrio: 'Palermo',
      telRaw: '54 9 11 6112-3344',
      rsp: 'Sí' as const,
      adhirio: 'No' as const,
      comentario: 'Av. Bullrich y Av. Santa Fe (20 o 21/10 por la tarde) [Propuesta Miércoles 21/10 · 10:16 a 12:11 hs (Mañana)]',
    },
  ];

  const eventos21Oct = [
    {
      id: 'cal-1',
      summary: 'Dentista',
      fecha: '21/10',
      startTime: '11:30',
      endTime: '13:00',
      location: 'Virrey Arredondo 2427, C1426 CABA',
    },
    {
      id: 'cal-2',
      summary: 'Almuerzo con Frima',
      fecha: '21/10',
      startTime: '13:15',
      endTime: '14:15',
      location: 'Loreto Garden Bar, Virrey Loreto 2912, C1426 CABA',
    },
    {
      id: 'cal-3',
      summary: 'Terapia',
      fecha: '21/10',
      startTime: '14:30',
      endTime: '15:20',
      location: 'Av. Sta. Fe 3242, C1425 CABA',
    },
    {
      id: 'cal-4',
      summary: 'Reunión virtual',
      fecha: '21/10',
      startTime: '16:00',
      endTime: '17:00',
      location: 'Google Meet (Virtual)',
    },
  ];

  const contactosProc = rawPalermo.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE, ahora1018));
  const corte = generarCorteEstrategicoLocal(
    contactosProc,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    eventos21Oct,
    ahora1018
  );

  // A las 10:18 AM, Laura Masson (10:00 hs), Felipe (desde 20/10) y Santiago (desde 20/10) deben figurar como alertas vencidas para reprogramar
  assert.ok(
    corte.alertasPendientesVencidos.length >= 3,
    `Debe detectar al menos 3 alertas vencidas sin adherir a las 10:18 AM, se obtuvieron: ${corte.alertasPendientesVencidos.length}`
  );
  assert.equal(
    corte.metricas.alertasVencidasReprogramar,
    corte.alertasPendientesVencidos.length
  );
  assert.ok(
    corte.alertasPendientesVencidos.some((c) => c.id === '94'),
    'Laura Masson (#94, 21/10 a las 10) debe estar marcada como alerta vencida a las 10:18'
  );

  // El bloque de HOY 21/10 debe haberse recalculado considerando Dentista (11:30-13:00), Almuerzo (13:15-14:15), Terapia (14:30-15:20) y Reunión virtual (16:00-17:00)
  const bloqueHoy = corte.agendaSugeridaDias.find((b) => b.fechaClave === '21/10');
  assert.ok(bloqueHoy, 'Debe existir bloque para HOY 21/10');
  const paradaLaura = bloqueHoy!.paradasRutaSugerida?.find((p) => p.contact.id === '94');
  assert.equal(paradaLaura?.vencidaSinAdherir, true, 'La parada de Laura (10:00 hs) debe marcarse vencidaSinAdherir a las 10:18');

  const paradaAlejandra = bloqueHoy!.paradasRutaSugerida?.find((p) => p.contact.id === '149');
  assert.ok(paradaAlejandra, 'Alejandra Gottardi debe estar en la ruta de HOY 21/10');
  assert.ok(
    paradaAlejandra!.horaLlegada >= '15:20',
    `Alejandra debe reprogramarse después de Terapia (14:30-15:20), pero quedó a las ${paradaAlejandra!.horaLlegada}`
  );

  const paradaSantiago = bloqueHoy!.paradasRutaSugerida?.find((p) => p.contact.id === '162');
  assert.ok(paradaSantiago, 'Santiago debe estar en la ruta de HOY 21/10 por la tarde');
  assert.ok(
    paradaSantiago!.horaLlegada >= '17:00',
    `Santiago (por la tarde) debe ubicarse luego de Reunión virtual (16:00-17:00), pero quedó a las ${paradaSantiago!.horaLlegada}`
  );
});

test('Chile 1408 los miércoles (21/10), presentación sólo en 1er contacto y sin respuesta, tono conversacional sin "¡Un abrazo grande!" ni "ya hayamos firmado", y café con dirección y minutos sólo para grupos >= 2', () => {
  const ahoraMiercoles = new Date('2026-10-21T10:00:00-03:00').getTime();
  const contactos = INITIAL_RAW_CONTACTS.map((r) =>
    procesarContacto(r, DEFAULT_VOICE_PROFILE, ahoraMiercoles)
  );
  const corte = generarCorteEstrategicoLocal(
    contactos,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    undefined,
    ahoraMiercoles
  );

  // 1. Las reuniones en Chile 1408 se ubican el miércoles 21/10 (18:30 a 20:30 hs) y conservan el barrio residencial del vecino
  const bloqueSede = corte.agendaSugeridaDias.find((b) => b.id === 'agenda-sede-chile-1408');
  assert.ok(bloqueSede, 'Debe existir el bloque de reunión en Chile 1408');
  assert.equal(
    bloqueSede!.fechaClave,
    '21/10',
    `La reunión en Chile 1408 debe agendarse el miércoles 21/10 y no otro día (se agendó en ${bloqueSede!.fechaClave})`
  );
  assert.equal(bloqueSede!.franjaHoraria, '18:30 a 20:30 hs');
  assert.ok(
    bloqueSede!.diaEtiqueta.toLowerCase().includes('miércoles') ||
      bloqueSede!.diaEtiqueta.toLowerCase().includes('miercoles'),
    `La etiqueta del día debe corresponder al miércoles: ${bloqueSede!.diaEtiqueta}`
  );

  const anaClara = contactos.find((c) => c.id === '15');
  const celeste = contactos.find((c) => c.id === '74');
  assert.equal(anaClara?.situacion, 'EVENTO_CHILE_1408');
  assert.equal(anaClara?.barrio, 'Palermo', 'Ana Clara (#15) debe conservar su barrio Palermo');
  assert.equal(celeste?.situacion, 'EVENTO_CHILE_1408');
  assert.equal(celeste?.barrio, 'Saavedra', 'Celeste (#74) debe conservar su barrio Saavedra');

  // 2. "Soy César" sólo aparece en primer_contacto y seguimiento_sin_respuesta, NUNCA en mensajes de conversación en curso
  const vecinoEjemplo = contactos.find(
    (c) => c.barrio === 'Saavedra' && c.tieneDireccionRealEnComentario
  )!;

  const msjPrimerContacto = generarMensajeContextual(vecinoEjemplo, DEFAULT_VOICE_PROFILE, 'primer_contacto').texto;
  const msjSinRespuesta = generarMensajeContextual(vecinoEjemplo, DEFAULT_VOICE_PROFILE, 'seguimiento_sin_respuesta').texto;
  assert.ok(msjPrimerContacto.includes('Soy César'), 'El primer contacto debe incluir presentación');
  assert.ok(msjSinRespuesta.includes('Soy César'), 'El seguimiento sin respuesta debe recordar quién escribe');

  const plantillasConversacionEnCurso = [
    'seguimiento_cambio_chip',
    'confirmacion_visita',
    'convocatoria_cafe_hub',
    'mas_info',
    'en_camino',
    'llegando',
    'demorado',
    'retiro_fichas',
    'agradecimiento_post_firma',
    'no_caba_referidos',
    'baja_respetuosa',
    'disculpas_y_reprogramacion',
    'propuesta_bloque_agenda',
  ] as const;

  for (const tpl of plantillasConversacionEnCurso) {
    const msj = generarMensajeContextual(vecinoEjemplo, DEFAULT_VOICE_PROFILE, tpl).texto;
    assert.equal(
      /soy\s+c[eé]sar/i.test(msj),
      false,
      `La plantilla "${tpl}" es parte de una conversación iniciada y NO debe decir "Soy César": ${msj}`
    );
  }

  // 3. Ningún mensaje en toda la app debe decir "¡Un abrazo grande!", ni hablar de "Café HUB" como evento, ni pedir que avise "si ya hayamos firmado"
  const todosLosMensajesGenerados: string[] = [];
  for (const c of contactos) {
    if (c.mensajeSugerido) todosLosMensajesGenerados.push(c.mensajeSugerido);
    if (c.alertaVencido?.mensajeDisculpasReprogramacion) {
      todosLosMensajesGenerados.push(c.alertaVencido.mensajeDisculpasReprogramacion);
    }
    if (c.diagnostico48h?.mensajePersonalizado48h) {
      todosLosMensajesGenerados.push(c.diagnostico48h.mensajePersonalizado48h);
    }
  }
  for (const item of corte.colaMensajes) {
    if (item.mensajePersonalizado) todosLosMensajesGenerados.push(item.mensajePersonalizado);
  }
  for (const b of corte.agendaSugeridaDias) {
    for (const c of b.contactosIncluidos) {
      todosLosMensajesGenerados.push(generarMensajePropuestaBloqueAgenda(c, b, DEFAULT_VOICE_PROFILE));
    }
    for (const p of b.paradasRutaSugerida || []) {
      if (p.mensajeWhatsappSugerido) todosLosMensajesGenerados.push(p.mensajeWhatsappSugerido);
      if (p.mensajeTerrenoSugerido) todosLosMensajesGenerados.push(p.mensajeTerrenoSugerido);
    }
  }
  const clustersMapa = construirMicroClusters(contactos, 15, 'Todos', DEFAULT_VOICE_PROFILE, ahoraMiercoles);
  for (const cl of clustersMapa) {
    for (const m of cl.miembros) {
      todosLosMensajesGenerados.push(
        generarMensajePersonalizadoCircuitoMapa(m.contact, cl, DEFAULT_VOICE_PROFILE)
      );
    }
  }

  for (const msj of todosLosMensajesGenerados) {
    assert.equal(
      /un\s+abrazo\s+grande/i.test(msj),
      false,
      `Ningún mensaje debe terminar diciendo "Un abrazo grande": ${msj}`
    );
    assert.equal(
      /ya\s+hayamos\s+firmado|actualizo\s+tu\s+estado\s+en\s+la\s+planilla/i.test(msj),
      false,
      `Ningún mensaje debe pedir que avisen si ya firmaron: ${msj}`
    );
    assert.equal(
      /caf[eé]\s+hub/i.test(msj),
      false,
      `Ningún mensaje debe hablar del "Café HUB" como evento: ${msj}`
    );
  }

  // 4. Cuando se propone un café para un bloque que agrupa >= 2 personas, menciona nombre del café, dirección y minutos aproximados; si es 1 sola persona, NO propone café
  const bloqueConCafeGrupal = corte.agendaSugeridaDias.find(
    (b) => b.contactosIncluidos.length >= 2 && (b.cafesHubOpciones?.length || 0) > 0
  );
  assert.ok(bloqueConCafeGrupal, 'Debe existir al menos un bloque grupal (>= 2 personas) con café asignado');
  const cafeEsperado = bloqueConCafeGrupal!.cafesHubOpciones![0];
  const vecinoDelGrupo = bloqueConCafeGrupal!.contactosIncluidos[0];
  const msjPropuestaGrupo = generarMensajePropuestaBloqueAgenda(
    vecinoDelGrupo,
    bloqueConCafeGrupal!,
    DEFAULT_VOICE_PROFILE
  );
  assert.ok(
    msjPropuestaGrupo.includes(cafeEsperado.nombre),
    `La propuesta grupal debe mencionar el nombre del café (${cafeEsperado.nombre}): ${msjPropuestaGrupo}`
  );
  assert.ok(
    /a\s+unos\s+\d+\s+minutos\s+de/i.test(msjPropuestaGrupo),
    `La propuesta de café debe indicar a cuántos minutos aproximados está del lugar sugerido por la persona: ${msjPropuestaGrupo}`
  );

  // Y si un bloque tiene 1 sola persona, no debe tener cafesHubOpciones ni proponer café en su mensaje
  const bloqueIndividual: typeof bloqueConCafeGrupal = {
    ...bloqueConCafeGrupal!,
    modalidad: 'PUERTA_A_PUERTA',
    contactosIncluidos: [vecinoDelGrupo],
    cafesHubOpciones: [],
    cafesCandidatosCurados: [],
  };
  const msjIndividual = generarMensajePropuestaBloqueAgenda(
    vecinoDelGrupo,
    bloqueIndividual,
    DEFAULT_VOICE_PROFILE
  );
  assert.equal(
    /el\s+caf[eé]\s+\*/i.test(msjIndividual),
    false,
    `Un bloque de 1 sola persona no debe proponer encontrarnos en un café: ${msjIndividual}`
  );
});

test('los cambios de estatus, envíos de mensajes en 2. Corte Hoy y ediciones se conservan al recargar la página, sincronizar con Sheets y fusionar entre compu y PC', () => {
  // 1. Un contacto >= 167 al que se le envía mensaje o se le edita estatus nunca vuelve a SIN_CONTACTAR_1ER_MSJ al recargar
  const base180 = INITIAL_RAW_CONTACTS.find((r) => r.id === '180') || {
    id: '180',
    nombre: 'Vecino Prueba 180',
    barrio: 'Palermo',
    telRaw: '1155550180',
    rsp: 'Nuevo' as const,
    adhirio: 'Pendiente' as const,
    comentario: '',
  };

  const trasEnvio = registrarEnvioMensajeContacto(
    base180,
    'primer_contacto',
    '2026-10-21'
  ).actualizado;
  assert.equal(trasEnvio.primerContactoEnviado, true);
  assert.ok(trasEnvio.actualizadoEnAppAt, 'Debe estampar actualizadoEnAppAt al enviar');
  assert.ok(trasEnvio.ultimoMensajeCorteEnviadoAt, 'Debe estampar ultimoMensajeCorteEnviadoAt al enviar');

  // Al recargar sin controlEnviadosKeys, migrarContactosDesde167SinPrimerContacto debe preservar su estado
  const recargado = migrarContactosDesde167SinPrimerContacto([trasEnvio], new Set())[0];
  assert.equal(recargado.estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP');
  assert.equal(recargado.primerContactoEnviado, true);

  // 2. Si el usuario cambia el estatus en la app (ej. ENCUENTRO_CONFIRMADO o YA_ADHIRIO_FIRMA_OK),
  // fusionarContactosDesdeSheetsConControl NO debe pisarlo con la fila vieja del CSV de Google Sheets
  const editadoEnCompu = actualizarDatosContactoEnApp(trasEnvio, {
    rsp: 'Sí',
    estadoFlujo: 'ENCUENTRO_CONFIRMADO',
    comentario: 'Charcas 3702 (Confirmado 22/10 11hs)',
  }).actualizado;

  const filaViejaDeSheets = {
    ...base180,
    rsp: 'Nuevo' as const,
    adhirio: 'Pendiente' as const,
    comentario: '',
    estadoFlujo: 'SIN_CONTACTAR_1ER_MSJ' as const,
  };

  const fusionadoConSheets = fusionarContactosDesdeSheetsConControl(
    [filaViejaDeSheets],
    [editadoEnCompu],
    new Set()
  ).contactosFusionados[0];
  assert.equal(
    fusionadoConSheets.estadoFlujo,
    'ENCUENTRO_CONFIRMADO',
    'El estatus editado en la app no debe perderse al sincronizar con una fila más vieja de Sheets'
  );
  assert.equal(
    fusionadoConSheets.comentario,
    'Charcas 3702 (Confirmado 22/10 11hs)'
  );

  // 3. Fusión multi-dispositivo (compu vs PC) conserva el estado más reciente y el envío en Corte Hoy
  const fusionMultiDispositivo = fusionarContactosMultiDispositivo(
    [filaViejaDeSheets],
    [editadoEnCompu],
    new Set()
  )[0];
  assert.equal(fusionMultiDispositivo.estadoFlujo, 'ENCUENTRO_CONFIRMADO');
  assert.equal(fusionMultiDispositivo.rsp, 'Sí');
  assert.ok(fusionMultiDispositivo.ultimoMensajeCorteEnviadoAt);
});

test('en "2. Hacer Corte y Plan Hoy" ningún mensaje dice "Recién pasé" ni "nos desencuentramos", todos asumen la responsabilidad de no haber podido cumplir el compromiso sin sobreexplicar motivos, y las ventanas matutinas vencidas no chocan con eventos vespertinos', () => {
  // Simular las 19:19 hs del miércoles 21/10 (mismo escenario de las capturas del usuario)
  const ahora1919 = new Date('2026-10-21T19:19:00-03:00').getTime();
  const contactos = INITIAL_RAW_CONTACTS.map((r) =>
    procesarContacto(r, DEFAULT_VOICE_PROFILE, ahora1919)
  );
  const corte = generarCorteEstrategicoLocal(
    contactos,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    undefined,
    ahora1919
  );

  // 1. #136 Valeria Zamberlin ("Visita martes a jueves entre 9 y 16:00") NO tiene fecha vencida hoy 21/10 porque mañana jueves 22/10 sigue dentro de su rango
  const valeriaEnAlertas = corte.alertasPendientesVencidos.find((c) => c.id === '136');
  assert.equal(
    valeriaEnAlertas,
    undefined,
    '#136 Valeria Zamberlin (martes a jueves) debe agendarse para el jueves 22/10 cuando ya pasaron las 16:00 del miércoles, no como alerta vencida de hoy'
  );

  // 2. Todas las tarjetas en alertasPendientesVencidos tienen propuestaReprogramacion completa y un mensaje asumiendo responsabilidad de no haber podido cumplir el compromiso (nunca "Recién pasé" ni "nos desencuentramos")
  assert.ok(corte.alertasPendientesVencidos.length > 0, 'Deben existir alertas de compromisos vencidos reales a las 19:19');
  for (const c of corte.alertasPendientesVencidos) {
    const alerta = c.alertaVencido!;
    assert.ok(
      alerta.propuestaReprogramacion && alerta.propuestaReprogramacion.trim().length > 10,
      `La tarjeta #${c.id} ${c.nombreCompletoCorregido} debe tener propuestaReprogramacion completa`
    );
    assert.equal(
      /reci[eé]n\s+pas[eé]|nos\s+desencuentramos/i.test(alerta.mensajeDisculpasReprogramacion),
      false,
      `El mensaje en Paso 2 para #${c.id} NO debe decir que pasó por el lugar ni que se desencuentraron: ${alerta.mensajeDisculpasReprogramacion}`
    );
    assert.ok(
      /no\s+pude\s+cumplir\s+con\s+nuestro\s+compromiso/i.test(alerta.mensajeDisculpasReprogramacion),
      `El mensaje en Paso 2 para #${c.id} debe asumir la responsabilidad de no haber podido cumplir con el compromiso: ${alerta.mensajeDisculpasReprogramacion}`
    );
  }

  // 3. Ningún mensaje en toda la cola ni en la Agenda Recomendada del Paso 2 debe decir "Recién pasé" ni "nos desencuentramos"
  for (const item of corte.colaMensajes) {
    assert.equal(
      /reci[eé]n\s+pas[eé]|nos\s+desencuentramos/i.test(item.mensajePersonalizado),
      false,
      `Ningún mensaje de la cola del Paso 2 (#${item.contact.id}) debe decir "Recién pasé" ni "nos desencuentramos": ${item.mensajePersonalizado}`
    );
  }

  // 4. #40 Alejandra Gottardi ("Visita 21/10 antes de las 11:30 y 12:00") evaluada a las 19:19 hs NO debe chocar falsamente con "Hagamos Popurrí (18:30-20:30)"
  for (const b of corte.agendaSugeridaDias) {
    const parada40 = b.paradasRutaSugerida?.find((p) => p.contact.id === '40');
    if (parada40) {
      assert.equal(
        Boolean(parada40.conflictoCalendar?.includes('Hagamos Popurrí')),
        false,
        `#40 Alejandra Gottardi (ventana matutina antes de las 11:30 y 12:00) no debe reportar choque con Hagamos Popurrí (18:30-20:30): ${parada40.conflictoCalendar}`
      );
    }
  }
});

test('Calendar filtra eventos ficticios y terminados; al terminar HOY desaparece la planificación de HOY pero quedan alertas vencidas; Confirmar Plan guarda Día y Turno; Adaptar IA, Sortear Nuevo Cupo y Auto-WA funcionan correctamente', () => {
  // 1. Filtrado de eventos ficticios y ya pasados/terminados
  const ahora1930 = new Date('2026-10-21T19:30:00-03:00').getTime();
  const eventosSucios: typeof INITIAL_CALENDAR_EVENTS = [
    ...INITIAL_CALENDAR_EVENTS,
    {
      id: 'fake-1',
      summary: 'Reunión equipo comunal / Zoom',
      fecha: '21/10',
      startTime: '09:00',
      endTime: '10:30',
      location: 'Virtual',
    },
    {
      id: 'fake-2',
      summary: 'Trámite personal en Microcentro',
      fecha: '22/10',
      startTime: '14:00',
      endTime: '15:30',
      location: 'San Nicolás',
    },
  ];
  const vigentes1930 = filtrarEventosCalendarVigentes(eventosSucios, ahora1930);
  // No deben estar los eventos ficticios ni el evento ya terminado 09:30-10:30 de hoy 21/10
  assert.equal(
    vigentes1930.some((e) => /Reuni[oó]n equipo comunal|Tr[aá]mite personal en Microcentro/i.test(e.summary)),
    false,
    'No deben aparecer eventos ficticios que no están en el Google Calendar del usuario'
  );
  assert.equal(
    vigentes1930.some((e) => e.startTime === '09:30' && e.fecha === '21/10'),
    false,
    'El evento 09:30–10:30 del 21/10 ya terminó a las 19:30 y no debe mostrarse como vigente'
  );
  assert.equal(
    vigentes1930.some((e) => /Hagamos Popurr[ií]/i.test(e.summary) && e.fecha === '21/10'),
    true,
    'El evento Hagamos Popurrí (18:30–20:30) sigue en curso a las 19:30'
  );

  // 2. Una vez terminado el día (ej. 20:30 hs del 21/10), la planificación de HOY desaparece de agendaSugeridaDias y quedan pendientes en alertasPendientesVencidos quienes tenían horario vencido sin adherir
  const ahoraFinDelDia = new Date('2026-10-21T20:30:00-03:00').getTime();
  const rawsMigrados = migrarContactosDesde167SinPrimerContacto(INITIAL_RAW_CONTACTS);
  const contactosFinDia = rawsMigrados.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE, ahoraFinDelDia));
  const corteFinDia = generarCorteEstrategicoLocal(
    contactosFinDia,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    INITIAL_CALENDAR_EVENTS,
    ahoraFinDelDia
  );
  const bloquesHoy = corteFinDia.agendaSugeridaDias.filter(
    (b) => b.fechaClave === '21/10' || /^HOY\b/i.test(b.diaEtiqueta || '')
  );
  assert.equal(
    bloquesHoy.length,
    0,
    'Una vez terminado el día (20:30 hs), la planificación de HOY debe desaparecer de agendaSugeridaDias'
  );
  assert.ok(
    corteFinDia.alertasPendientesVencidos.length > 0,
    'Quedan pendientes en alertasPendientesVencidos los usuarios con "⚠️ Horario vencido sin adherir — Reprogramar" a los que no se les escribió'
  );

  // 3. Confirmar un plan (CONFIRMO_PROPUESTA, DECLINO_CAFE_PASA_PUERTA_A_PUERTA, PASA_A_CAFE_HUB, REPROGRAMAR_DIA_HORA) permite fijar y guardar Día y Turno
  const contactoEjemplo = contactosFinDia.find((c) => c.id === '40') || contactosFinDia[0];
  const fechaSugerida = obtenerFechaSugeridaReprogramacionContacto(contactoEjemplo, '21/10', ahoraFinDelDia);
  assert.notEqual(fechaSugerida, '21/10', 'La fecha sugerida nunca debe ser un día ya vencido (21/10 a las 20:30)');

  const bloqueBase = corteFinDia.agendaSugeridaDias[0];
  const rawConfirmado = aplicarRespuestaPropuestaAgenda(
    contactoEjemplo,
    bloqueBase,
    'CONFIRMO_PROPUESTA',
    {
      nuevaFecha: '22/10',
      nuevaFranja: 'Tarde',
      nuevoHorarioPuntual: '16:30',
      nuevaDireccion: 'Cabildo 2100',
    },
    DEFAULT_VOICE_PROFILE
  );
  const confirmadoConDiaYTurno = procesarContacto(rawConfirmado, DEFAULT_VOICE_PROFILE, ahoraFinDelDia);
  assert.equal(confirmadoConDiaYTurno.estadoFlujo, 'ENCUENTRO_CONFIRMADO');
  assert.equal(confirmadoConDiaYTurno.franjaHoraria, 'Tarde');
  assert.ok(confirmadoConDiaYTurno.comentario.includes('22/10'), 'Debe guardar el día 22/10 en el comentario');
  assert.ok(confirmadoConDiaYTurno.comentario.includes('16:30'), 'Debe guardar la hora 16:30 en el comentario');

  const rawPuertaAPuerta = aplicarRespuestaPropuestaAgenda(
    contactoEjemplo,
    bloqueBase,
    'DECLINO_CAFE_PASA_PUERTA_A_PUERTA',
    {
      nuevaFecha: '23/10',
      nuevaFranja: 'Mañana',
      nuevoHorarioPuntual: '10:30',
      nuevaDireccion: 'Amenábar 1945',
    },
    DEFAULT_VOICE_PROFILE
  );
  const puertaAPuertaConDiaYTurno = procesarContacto(rawPuertaAPuerta, DEFAULT_VOICE_PROFILE, ahoraFinDelDia);
  assert.equal(puertaAPuertaConDiaYTurno.estadoFlujo, 'ENCUENTRO_CONFIRMADO');
  assert.equal(puertaAPuertaConDiaYTurno.franjaHoraria, 'Mañana');
  assert.ok(puertaAPuertaConDiaYTurno.comentario.includes('23/10'), 'Puerta a Puerta debe guardar el día 23/10');
  assert.ok(puertaAPuertaConDiaYTurno.comentario.includes('10:30'), 'Puerta a Puerta debe guardar la hora 10:30');

  // 4. Reparación de falsos "[Intento auto fallido ... Tiempo de espera agotado al abrir el chat]" y garantía de cola de no contactados
  const c170 = contactosFinDia.find((c) => c.id === '170')!;
  const c186 = contactosFinDia.find((c) => c.id === '186')!;
  const c189 = contactosFinDia.find((c) => c.id === '189')!;
  assert.equal(c170.estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP', '#170 sí recibió el mensaje y debe quedar como 1ER_MSJ_ENVIADO_SIN_RSP');
  assert.equal(c186.estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP', '#186 sí recibió el mensaje y debe quedar como 1ER_MSJ_ENVIADO_SIN_RSP');
  assert.equal(c189.estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP', '#189 sí recibió el mensaje y debe quedar como 1ER_MSJ_ENVIADO_SIN_RSP');

  // Y si el puente Python reporta un falso timeout "Tiempo de espera agotado al abrir el chat", aplicarResultadoEnvioAutoAContacto lo registra como ENVIADO_OK
  const c190 = contactosFinDia.find((c) => c.id === '190')!;
  assert.ok(
    c190.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' || c190.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO',
    '#190 (navegador cerrado) debe estar disponible para 1er contacto'
  );
  const raw190TrasTimeout = aplicarResultadoEnvioAutoAContacto(
    c190,
    'ERROR_ENVIO',
    'Tiempo de espera agotado al abrir el chat',
    '2026-10-21T19:26:00-03:00'
  );
  const c190TrasTimeout = procesarContacto(raw190TrasTimeout, DEFAULT_VOICE_PROFILE, ahoraFinDelDia);
  assert.equal(
    c190TrasTimeout.estadoFlujo,
    '1ER_MSJ_ENVIADO_SIN_RSP',
    'Un falso timeout al abrir/verificar el chat debe marcarse como 1er contacto enviado correctamente'
  );

  // 5. Cola de 1er Contacto siempre tiene personas sin contactar y Sortear Nuevo Cupo Aleatorio cambia el cupo y rota la cola
  const campana1 = generarColaEnvioAutomaticoPrimerContacto(
    contactosFinDia,
    { cupoSorteado: 30, semillaSorteo: 1 },
    DEFAULT_VOICE_PROFILE
  );
  assert.ok(
    campana1.totalElegiblesEnBase >= 35,
    `La cola debe tener al menos 35 personas sin 1er contacto (actual: ${campana1.totalElegiblesEnBase})`
  );
  const nuevoCupo = sortearCupoSeguroAntiBloqueo(28, 44, Math.random, campana1.config.cupoSorteado);
  assert.notEqual(nuevoCupo, campana1.config.cupoSorteado, 'sortearCupoSeguroAntiBloqueo debe devolver un cupo distinto al actual');
  assert.ok(nuevoCupo >= 22 && nuevoCupo <= 44, 'El cupo sorteado debe estar entre 22 y 44 (< 45)');

  // 6. Adaptar IA / Acortar aún más funciona determinísticamente
  const msjOriginal = c170.mensajeSugerido;
  const msjAcortado = adaptarMensajeConRespuestaVecinoLocal(
    c170,
    'Acortar a máximo 2 oraciones breves y directas',
    msjOriginal,
    DEFAULT_VOICE_PROFILE
  );
  assert.notEqual(msjAcortado, msjOriginal, 'Acortar aún más debe producir un mensaje más conciso y diferente al original');
  assert.ok(msjAcortado.length < msjOriginal.length, 'El mensaje acortado debe tener menos caracteres que el original');
});

test('los tiempos de viaje a pie y en transporte público coinciden con Google Maps y las URLs del botón Maps son limpias y secuenciales', () => {
  const ahora22Oct = new Date('2026-10-22T08:00:00-03:00').getTime();
  const raws = migrarContactosDesde167SinPrimerContacto(INITIAL_RAW_CONTACTS);
  const contactos = raws.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE, ahora22Oct));

  // 1. Extracción limpia de direcciones complejas (#109 Ana Gomis y #15 Ana Clara Odello)
  const c109 = contactos.find((c) => c.id === '109')!;
  assert.equal(c109.calleOCruce, 'Libertador 4700 y Maure');
  const c15 = contactos.find((c) => c.id === '15')!;
  assert.equal(c15.calleOCruce, 'Chile 1408');
  assert.equal(c15.direccionMaps, 'Chile 1408, Monserrat, CABA, Argentina');

  // 2. Tiempos realistas desde Km 0 (Godoy Cruz 3268, entre Sinclair y Libertador) hacia puntos de CABA
  const c136 = contactos.find((c) => c.id === '136')!; // Valeria Zamberlin: Güemes y Oro (~900m reales caminando -> 13-16 min, antes daba 7 min)
  const trGuemes = calcularMinutosTrasladoCABA(
    DEFAULT_VOICE_PROFILE.latPartida,
    DEFAULT_VOICE_PROFILE.lngPartida,
    c136.lat,
    c136.lng
  );
  assert.equal(trGuemes.modo, 'WALKING');
  assert.ok(
    trGuemes.minutos >= 12 && trGuemes.minutos <= 17,
    `Godoy Cruz 3268 -> Güemes y Oro a pie en Google Maps toma ~13-16 min (obtenido: ${trGuemes.minutos} min)`
  );

  const c137 = contactos.find((c) => c.id === '137')!; // Nanci Biondini: Honduras 3707 (~2.3 km -> ~22-26 min en transporte público, antes daba 14 min)
  const trHonduras = calcularMinutosTrasladoCABA(
    DEFAULT_VOICE_PROFILE.latPartida,
    DEFAULT_VOICE_PROFILE.lngPartida,
    c137.lat,
    c137.lng
  );
  assert.equal(trHonduras.modo, 'TRANSIT');
  assert.ok(
    trHonduras.minutos >= 21 && trHonduras.minutos <= 27,
    `Godoy Cruz 3268 -> Honduras 3707 en transporte público toma ~22-25 min (obtenido: ${trHonduras.minutos} min)`
  );

  // Tramo inter-barrio Palermo -> Monserrat (Chile 1408) no está artificialmente topado en 26 min
  const trMonserrat = calcularMinutosTrasladoCABA(
    DEFAULT_VOICE_PROFILE.latPartida,
    DEFAULT_VOICE_PROFILE.lngPartida,
    c15.lat,
    c15.lng
  );
  assert.ok(
    trMonserrat.minutos >= 38,
    `Godoy Cruz 3268 -> Chile 1408 (Monserrat) toma >= 38 min en transporte público (obtenido: ${trMonserrat.minutos} min)`
  );

  // 3. Secuencia de paradas del 22/10 con eventos de Calendar reales (Terapia 15:00-15:50 en Arévalo 2885)
  const paradas22 = calcularHojaDeRuta(
    [c136, c137, contactos.find((c) => c.id === '164')!, contactos.find((c) => c.id === '133')!],
    '10:00',
    20,
    DEFAULT_VOICE_PROFILE,
    INITIAL_CALENDAR_EVENTS,
    '22/10',
    { ahoraMs: ahora22Oct }
  );
  assert.equal(paradas22.length, 4);

  // Ninguna URL de Google Maps debe tener paréntesis rotos ni orígenes sin "CABA, Argentina"
  for (const p of paradas22) {
    const decodedUrl = decodeURIComponent(p.urlGoogleMapsTramo);
    assert.equal(
      decodedUrl.includes('(Palermo&'),
      false,
      `La URL de Google Maps no debe tener paréntesis sin cerrar: ${decodedUrl}`
    );
    assert.ok(
      decodedUrl.includes('CABA, Argentina'),
      `La URL de Google Maps debe incluir CABA, Argentina: ${decodedUrl}`
    );
  }

  // Verificar que tras Terapia (15:00-15:50 en Arévalo 2885), sólo la primera parada posterior sale de Arévalo 2885,
  // y la parada siguiente sale de la dirección del vecino anterior (no repite Arévalo 2885)
  const paradasPostTerapia = paradas22.filter((p) => p.horaSalida >= '15:50');
  if (paradasPostTerapia.length >= 2) {
    assert.ok(
      paradasPostTerapia[0].origenNombre.includes('Arévalo 2885'),
      `La primera parada tras Terapia debe salir de Arévalo 2885 (obtenido: ${paradasPostTerapia[0].origenNombre})`
    );
    assert.equal(
      paradasPostTerapia[1].origenNombre.includes('Arévalo 2885'),
      false,
      `La segunda parada tras Terapia debe salir de la parada anterior (${paradasPostTerapia[0].destinoNombre}), no repetir Arévalo 2885 (obtenido: ${paradasPostTerapia[1].origenNombre})`
    );
  }
});

test('Validador Anti-Pelones de fechas, regla de saludo en el mismo día, voz real de César en el Bot, Panel de Tareas Diarias (7 etapas + 24h/48h/baja) y Cierre Diario (Google Forms + Apps)', () => {
  const ahora22Oct = new Date('2026-10-22T10:30:00-03:00').getTime();

  // 1. Validador Anti-Pelones: "miércoles 23/10" en 2026 debe corregirse automáticamente a "viernes 23/10"
  const textoConPelon = 'Te propongo vernos el miércoles 23/10 a las 11 hs o el Jueves 21/10 por la tarde.';
  const textoCorregido = corregirPelonesDiaSemanaEnTexto(textoConPelon, 2026);
  assert.ok(
    textoCorregido.includes('viernes 23/10'),
    `Debe corregir "miércoles 23/10" a "viernes 23/10" (obtenido: ${textoCorregido})`
  );
  assert.ok(
    textoCorregido.includes('Miércoles 21/10'),
    `Debe corregir "Jueves 21/10" a "Miércoles 21/10" respetando mayúscula inicial (obtenido: ${textoCorregido})`
  );

  // 2. Regla de Saludo en el Mismo Día según marca temporal
  const contactoHabladoHoy = procesarContacto(
    {
      id: '501',
      nombre: 'Lucía Fernández',
      barrio: 'Palermo',
      telRaw: '11 5555-0501',
      rsp: 'Sí',
      adhirio: 'Pendiente',
      comentario: 'Charcas 3702 (23/10 a las 11)',
      ultimoMensajeCorteEnviadoAt: '2026-10-22T09:15:00-03:00',
    },
    DEFAULT_VOICE_PROFILE,
    ahora22Oct
  );
  assert.equal(yaSeHabloConContactoHoy(contactoHabladoHoy, ahora22Oct), true);

  const msjMismoDia = generarMensajeContextual(
    contactoHabladoHoy,
    DEFAULT_VOICE_PROFILE,
    'confirmacion_visita',
    { modoSaludo: 'AUTO_MISMO_DIA', ahoraMs: ahora22Oct }
  ).texto;
  assert.equal(
    /^hola\b/i.test(msjMismoDia),
    false,
    `Si ya le escribimos hoy (22/10), no debe arrancar repitiendo "Hola, Lucía, ¿cómo estás?": ${msjMismoDia}`
  );

  const msjForzandoSaludo = aplicarReglaSaludoMismoDia(
    'Hola, Lucía, ¿cómo estás? Te escribo para confirmar.',
    contactoHabladoHoy,
    'SIEMPRE_SALUDAR',
    ahora22Oct
  );
  assert.ok(msjForzandoSaludo.startsWith('Hola, Lucía'));

  // 3. Voz real de César en el Bot: cero emojis artificiales (👋, 😊, 🙌)
  for (let i = 0; i < 8; i++) {
    const varBot = generarVariantePolimorficaPrimerContacto(contactoHabladoHoy, i, DEFAULT_VOICE_PROFILE);
    assert.equal(
      /[👋😊🙌]/.test(varBot.texto),
      false,
      `La variante #${i + 1} del bot no debe tener emojis artificiales: ${varBot.texto}`
    );
  }

  // 4. Panel de Tareas Diarias (7 Etapas + Seguimientos 24h/48h/Baja) + Resumen Google Forms
  const raws = migrarContactosDesde167SinPrimerContacto(INITIAL_RAW_CONTACTS);
  const contactos = raws.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE, ahora22Oct));
  const corte = generarCorteEstrategicoLocal(
    contactos,
    DEFAULT_VOICE_PROFILE,
    'Todos',
    INITIAL_CALENDAR_EVENTS,
    ahora22Oct
  );

  const panel = generarPanelTareasDiarias(
    contactos,
    corte,
    [],
    DEFAULT_VOICE_PROFILE,
    ahora22Oct
  );

  assert.ok(panel.tareasPriorizadas.length > 0, 'Debe generar la lista de tareas diarias priorizadas');
  assert.ok(
    panel.conteoPorEtapa.ETAPA_1_PRIMER_CONTACTO > 0,
    'Debe detectar contactos en Etapa 1 (1er mensaje pendiente)'
  );
  assert.ok(
    panel.conteoPorEtapa.ETAPA_6_TERRENO_HOY_Y_RECORDATORIO > 0,
    'Debe detectar contactos en Etapa 6 (Encuentros de hoy / Recordatorio de la mañana)'
  );
  assert.ok(
    panel.resumenFormsYApps.adhesionesTotalesAcumuladas > 0,
    'Debe contabilizar las adhesiones acumuladas para el control diario'
  );

  // 5. Colas multi-etapa del Bot (Recordatorios de la mañana y Agradecimientos post-firma)
  const colaRecordatorios = generarColaEnvioAutomaticoPrimerContacto(
    contactos,
    { modoCola: 'RECORDATORIO_MANIANA_HOY', cupoSorteado: 15 },
    DEFAULT_VOICE_PROFILE
  );
  assert.ok(colaRecordatorios.items.length > 0, 'Debe armar cola de recordatorios de la mañana');

  const colaAgradecimientos = generarColaEnvioAutomaticoPrimerContacto(
    contactos,
    { modoCola: 'AGRADECIMIENTO_POST_FIRMA', cupoSorteado: 15 },
    DEFAULT_VOICE_PROFILE
  );
  assert.ok(colaAgradecimientos.items.length > 0, 'Debe armar cola de agradecimientos post-adhesión');
});

test('Matriz de transiciones inteligentes de WhatsApp y prioridad operativa de Retiro de Fichas', () => {
  // 1. Contacto nuevo en 1er contacto pasa a 1ER_MSJ_ENVIADO_SIN_RSP
  const trans1 = inferirTransicionInteligenteWA(
    {
      estadoFlujo: 'SIN_CONTACTAR_1ER_MSJ',
      rsp: 'Nuevo',
      adhirio: 'Pendiente',
    },
    'primer_contacto'
  );
  assert.equal(trans1.estadoFlujo, '1ER_MSJ_ENVIADO_SIN_RSP');
  assert.equal(trans1.primerContactoEnviado, true);

  // 2. Mensajes de terreno en camino / en puerta / recordatorio conservan ENCUENTRO_CONFIRMADO
  const transTerreno = inferirTransicionInteligenteWA(
    {
      estadoFlujo: 'ENCUENTRO_CONFIRMADO',
      rsp: 'Sí',
      adhirio: 'Pendiente',
    },
    'en_camino'
  );
  assert.equal(transTerreno.estadoFlujo, 'ENCUENTRO_CONFIRMADO');
  assert.equal(transTerreno.recordatorioEnviado, true);

  // 3. Contacto confirmado NO sufre regresión a 1er mensaje ante mensaje ad-hoc
  const transNoRegresion = inferirTransicionInteligenteWA(
    {
      estadoFlujo: 'ENCUENTRO_CONFIRMADO',
      rsp: 'Sí',
      adhirio: 'Pendiente',
    },
    'mensaje_general'
  );
  assert.equal(transNoRegresion.estadoFlujo, 'ENCUENTRO_CONFIRMADO');

  // 4. Disculpas / reprogramación pasa a PASO_DATOS_FALTA_CONFIRMAR
  const transReprog = inferirTransicionInteligenteWA(
    {
      estadoFlujo: 'ENCUENTRO_CONFIRMADO',
      rsp: 'Sí',
      adhirio: 'Pendiente',
    },
    'disculpas_y_reprogramacion'
  );
  assert.equal(transReprog.estadoFlujo, 'PASO_DATOS_FALTA_CONFIRMAR');

  // 5. Sin DNI CABA pasa a SIN_DNI_CABA_PEDIR_REFERIDOS
  const transBaja = inferirTransicionInteligenteWA(
    {
      estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
      rsp: 'Sí',
      adhirio: 'Pendiente',
    },
    'no_caba_referidos'
  );
  assert.equal(transBaja.estadoFlujo, 'SIN_DNI_CABA_PEDIR_REFERIDOS');
  assert.equal(transBaja.adhirio, 'No');

  // 6. Agradecimiento post firma conserva YA_ADHIRIO_FIRMA_OK
  const transFirma = inferirTransicionInteligenteWA(
    {
      estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
      rsp: 'Sí',
      adhirio: 'Sí',
    },
    'agradecimiento_post_firma'
  );
  assert.equal(transFirma.estadoFlujo, 'YA_ADHIRIO_FIRMA_OK');
  assert.equal(transFirma.adhirio, 'Sí');

  // 7. Prioridad operativa: PENDIENTE_RETIRO_FICHAS debe evaluarse antes de adheridos puros
  const contactoConFichas = procesarContacto(
    {
      id: '999',
      nombre: 'Prueba Fichas',
      barrio: 'Palermo',
      telRaw: '1122334455',
      adhirio: 'Sí',
      comentario: 'Firma lista, pendiente retiro de 5 fichas extras del local',
      rsp: 'Sí',
    },
    DEFAULT_VOICE_PROFILE
  );
  assert.equal(contactoConFichas.estadoFlujo, 'PENDIENTE_RETIRO_FICHAS');
  assert.equal(getMacroStageForContact(contactoConFichas), 'pausa');

  // 8. Exportación CSV incluye BOM UTF-8 y encabezados correctos
  const csv = exportarContactosACSV([contactoConFichas]);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV debe comenzar con BOM UTF-8 para apertura directa en Excel');
  assert.ok(csv.includes('Prueba Fichas'), 'CSV debe contener el nombre del contacto');

  // 9. Exportación CSV con punto y coma (;) para Excel en español
  const csvExcel = exportarContactosACSVExcelPuntoYComa([contactoConFichas]);
  assert.ok(csvExcel.startsWith('\uFEFF'), 'CSV Excel debe comenzar con BOM UTF-8');
  assert.ok(csvExcel.includes(';Prueba Fichas;'), 'CSV Excel debe usar punto y coma como delimitador');

  // 10. Exportación TSV para copiar y pegar en Sheets / Excel
  const tsv = exportarContactosATSVParaExcel([contactoConFichas]);
  assert.ok(tsv.includes('\tPrueba Fichas\t'), 'TSV debe usar tabulaciones como delimitador');
});





