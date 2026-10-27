import {
  AlertaPendienteVencido,
  AnalisisNombre,
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  AutoFirstMessageQueueItem,
  BloqueAgendaRecomendado,
  CafeHubCercanoCluster,
  CalendarEventItem,
  Contact,
  ControlEnvioRegistro,
  CorteResultado,
  DiagnosticoSinRsp48h,
  EstadoFlujo,
  EstatusHabladoHoyItem,
  EstatusReporteApp,
  EtapaProcesoTerritorial,
  FranjaHoraria,
  ItemColaCorte,
  MicroCluster,
  ModalidadEncuentroAgenda,
  ModoColaAutomatizacionWA,
  ModoMensajeTerrenoRuta,
  ModoSaludoMismoDia,
  NivelWarmupWA,
  PanelTareasDiariasResultado,
  ParadaRuta,
  RawContactRow,
  ResultadoEnvioAuto,
  ResumenDiarioFormsYApps,
  ResumenKPIsPadron,
  SituacionContacto,
  SubtipoSinRsp48h,
  TareaDiariaItem,
  TipoAlertaPendienteVencido,
  TipoPlantillaWA,
  TipoRespuestaPropuestaAgenda,
  VoiceProfile,
} from '../types';
import {
  COORDENADAS_BARRIOS_CABA,
  COORDENADAS_DIRECCIONES_CABA,
  DEFAULT_VOICE_PROFILE,
  INITIAL_CALENDAR_EVENTS,
  INITIAL_RAW_CONTACTS,
} from '../data/estatusPopurriData';
import {
  buscarCafeHubMasCercano,
  CATALOGO_CAFES_HUB_CABA,
  CafeHubCurado,
  listarCafesHubCercanos,
} from '../data/cafesHubCatalog';

// Diccionario de restitución de tildes y grafía correcta para nombres de pila (clave en minúscula sin/con tilde -> forma canónica)
const DICCIONARIO_NOMBRES_CANONICOS: Record<string, { canonico: string; peso: number }> = {
  // Nombres con tilde obligatoria u ortografía específica (peso 1.0 = inequívocamente nombre de pila)
  maria: { canonico: 'María', peso: 1.0 },
  maría: { canonico: 'María', peso: 1.0 },
  belen: { canonico: 'Belén', peso: 1.0 },
  belén: { canonico: 'Belén', peso: 1.0 },
  ines: { canonico: 'Inés', peso: 1.0 },
  inés: { canonico: 'Inés', peso: 1.0 },
  agustin: { canonico: 'Agustín', peso: 1.0 },
  agustín: { canonico: 'Agustín', peso: 1.0 },
  analia: { canonico: 'Analía', peso: 1.0 },
  analía: { canonico: 'Analía', peso: 1.0 },
  magali: { canonico: 'Magalí', peso: 1.0 },
  magalí: { canonico: 'Magalí', peso: 1.0 },
  sofia: { canonico: 'Sofía', peso: 1.0 },
  sofía: { canonico: 'Sofía', peso: 1.0 },
  lucia: { canonico: 'Lucía', peso: 1.0 },
  lucía: { canonico: 'Lucía', peso: 1.0 },
  rocio: { canonico: 'Rocío', peso: 1.0 },
  rocío: { canonico: 'Rocío', peso: 1.0 },
  veronica: { canonico: 'Verónica', peso: 1.0 },
  verónica: { canonico: 'Verónica', peso: 1.0 },
  monica: { canonico: 'Mónica', peso: 1.0 },
  mónica: { canonico: 'Mónica', peso: 1.0 },
  barbara: { canonico: 'Bárbara', peso: 1.0 },
  bárbara: { canonico: 'Bárbara', peso: 1.0 },
  debora: { canonico: 'Débora', peso: 1.0 },
  débora: { canonico: 'Débora', peso: 1.0 },
  erica: { canonico: 'Érica', peso: 1.0 },
  érica: { canonico: 'Érica', peso: 1.0 },
  fatima: { canonico: 'Fátima', peso: 1.0 },
  fátima: { canonico: 'Fátima', peso: 1.0 },
  ursula: { canonico: 'Úrsula', peso: 1.0 },
  úrsula: { canonico: 'Úrsula', peso: 1.0 },
  noemi: { canonico: 'Noemí', peso: 1.0 },
  noemí: { canonico: 'Noemí', peso: 1.0 },
  ayelen: { canonico: 'Ayelén', peso: 1.0 },
  ayelén: { canonico: 'Ayelén', peso: 1.0 },
  mailen: { canonico: 'Mailén', peso: 1.0 },
  mailén: { canonico: 'Mailén', peso: 1.0 },
  malen: { canonico: 'Malén', peso: 1.0 },
  malén: { canonico: 'Malén', peso: 1.0 },
  antu: { canonico: 'Antü', peso: 1.0 },
  antü: { canonico: 'Antü', peso: 1.0 },
  jazmin: { canonico: 'Jazmín', peso: 1.0 },
  jazmín: { canonico: 'Jazmín', peso: 1.0 },
  angeles: { canonico: 'Ángeles', peso: 1.0 },
  ángeles: { canonico: 'Ángeles', peso: 1.0 },
  angel: { canonico: 'Ángel', peso: 0.9 },
  ángel: { canonico: 'Ángel', peso: 0.9 },
  andres: { canonico: 'Andrés', peso: 0.95 },
  andrés: { canonico: 'Andrés', peso: 0.95 },
  joaquin: { canonico: 'Joaquín', peso: 1.0 },
  joaquín: { canonico: 'Joaquín', peso: 1.0 },
  maximo: { canonico: 'Máximo', peso: 1.0 },
  máximo: { canonico: 'Máximo', peso: 1.0 },
  raul: { canonico: 'Raúl', peso: 1.0 },
  raúl: { canonico: 'Raúl', peso: 1.0 },
  matias: { canonico: 'Matías', peso: 1.0 },
  matías: { canonico: 'Matías', peso: 1.0 },
  nicolas: { canonico: 'Nicolás', peso: 1.0 },
  nicolás: { canonico: 'Nicolás', peso: 1.0 },
  sebastian: { canonico: 'Sebastián', peso: 1.0 },
  sebastián: { canonico: 'Sebastián', peso: 1.0 },
  julian: { canonico: 'Julián', peso: 1.0 },
  julián: { canonico: 'Julián', peso: 1.0 },
  damian: { canonico: 'Damián', peso: 1.0 },
  damián: { canonico: 'Damián', peso: 1.0 },
  hernan: { canonico: 'Hernán', peso: 1.0 },
  hernán: { canonico: 'Hernán', peso: 1.0 },
  adrian: { canonico: 'Adrián', peso: 1.0 },
  adrián: { canonico: 'Adrián', peso: 1.0 },
  fabian: { canonico: 'Fabián', peso: 1.0 },
  fabián: { canonico: 'Fabián', peso: 1.0 },
  gaston: { canonico: 'Gastón', peso: 1.0 },
  gastón: { canonico: 'Gastón', peso: 1.0 },
  ramon: { canonico: 'Ramón', peso: 1.0 },
  ramón: { canonico: 'Ramón', peso: 1.0 },
  simon: { canonico: 'Simón', peso: 0.9 },
  simón: { canonico: 'Simón', peso: 0.9 },
  valentin: { canonico: 'Valentín', peso: 1.0 },
  valentín: { canonico: 'Valentín', peso: 1.0 },
  benjamin: { canonico: 'Benjamín', peso: 1.0 },
  benjamín: { canonico: 'Benjamín', peso: 1.0 },
  fermin: { canonico: 'Fermín', peso: 1.0 },
  fermín: { canonico: 'Fermín', peso: 1.0 },
  tobias: { canonico: 'Tobías', peso: 1.0 },
  tobías: { canonico: 'Tobías', peso: 1.0 },
  jeronimo: { canonico: 'Jerónimo', peso: 1.0 },
  jerónimo: { canonico: 'Jerónimo', peso: 1.0 },
  cesar: { canonico: 'César', peso: 1.0 },
  césar: { canonico: 'César', peso: 1.0 },
  hector: { canonico: 'Héctor', peso: 1.0 },
  héctor: { canonico: 'Héctor', peso: 1.0 },
  victor: { canonico: 'Víctor', peso: 1.0 },
  víctor: { canonico: 'Víctor', peso: 1.0 },
  nestor: { canonico: 'Néstor', peso: 1.0 },
  néstor: { canonico: 'Néstor', peso: 1.0 },
  ruben: { canonico: 'Rubén', peso: 1.0 },
  rubén: { canonico: 'Rubén', peso: 1.0 },
  jose: { canonico: 'José', peso: 1.0 },
  josé: { canonico: 'José', peso: 1.0 },
  jesus: { canonico: 'Jesús', peso: 1.0 },
  jesús: { canonico: 'Jesús', peso: 1.0 },
  // Nombres que también pueden aparecer como apellido (peso 0.78 para desambiguar cuando hay otro nombre de peso 1.0)
  martin: { canonico: 'Martín', peso: 0.78 },
  martín: { canonico: 'Martín', peso: 0.78 },
  tomas: { canonico: 'Tomás', peso: 0.85 },
  tomás: { canonico: 'Tomás', peso: 0.85 },
  german: { canonico: 'Germán', peso: 0.88 },
  germán: { canonico: 'Germán', peso: 0.88 },
  sol: { canonico: 'Sol', peso: 0.85 },
  paz: { canonico: 'Paz', peso: 0.85 },
  aime: { canonico: 'Aimé', peso: 0.75 },
  aimé: { canonico: 'Aimé', peso: 0.75 },
  // Nombres sin tilde frecuentes en Argentina y el padrón (peso 1.0)
  laura: { canonico: 'Laura', peso: 1.0 },
  carolina: { canonico: 'Carolina', peso: 1.0 },
  florencia: { canonico: 'Florencia', peso: 1.0 },
  valentina: { canonico: 'Valentina', peso: 1.0 },
  micaela: { canonico: 'Micaela', peso: 1.0 },
  valeria: { canonico: 'Valeria', peso: 1.0 },
  natalia: { canonico: 'Natalia', peso: 1.0 },
  marcelo: { canonico: 'Marcelo', peso: 1.0 },
  sandra: { canonico: 'Sandra', peso: 1.0 },
  lorena: { canonico: 'Lorena', peso: 1.0 },
  mayra: { canonico: 'Mayra', peso: 1.0 },
  julieta: { canonico: 'Julieta', peso: 1.0 },
  lara: { canonico: 'Lara', peso: 1.0 },
  cecilia: { canonico: 'Cecilia', peso: 1.0 },
  mateo: { canonico: 'Mateo', peso: 1.0 },
  ana: { canonico: 'Ana', peso: 1.0 },
  juan: { canonico: 'Juan', peso: 1.0 },
  felipe: { canonico: 'Felipe', peso: 1.0 },
  paula: { canonico: 'Paula', peso: 1.0 },
  amira: { canonico: 'Amira', peso: 1.0 },
  camila: { canonico: 'Camila', peso: 1.0 },
  paola: { canonico: 'Paola', peso: 1.0 },
  victoria: { canonico: 'Victoria', peso: 1.0 },
  alejandra: { canonico: 'Alejandra', peso: 1.0 },
  federico: { canonico: 'Federico', peso: 1.0 },
  claudia: { canonico: 'Claudia', peso: 1.0 },
  gabriela: { canonico: 'Gabriela', peso: 1.0 },
  raquel: { canonico: 'Raquel', peso: 1.0 },
  celeste: { canonico: 'Celeste', peso: 1.0 },
  silvia: { canonico: 'Silvia', peso: 1.0 },
  mariana: { canonico: 'Mariana', peso: 1.0 },
  fiorella: { canonico: 'Fiorella', peso: 1.0 },
  justine: { canonico: 'Justine', peso: 1.0 },
  nazarena: { canonico: 'Nazarena', peso: 1.0 },
  marisol: { canonico: 'Marisol', peso: 1.0 },
  noelia: { canonico: 'Noelia', peso: 1.0 },
  sabrina: { canonico: 'Sabrina', peso: 1.0 },
  cristina: { canonico: 'Cristina', peso: 1.0 },
  agustina: { canonico: 'Agustina', peso: 1.0 },
  soledad: { canonico: 'Soledad', peso: 1.0 },
  lucas: { canonico: 'Lucas', peso: 1.0 },
  aldana: { canonico: 'Aldana', peso: 1.0 },
  gustavo: { canonico: 'Gustavo', peso: 1.0 },
  fernanda: { canonico: 'Fernanda', peso: 1.0 },
  horacio: { canonico: 'Horacio', peso: 1.0 },
  irene: { canonico: 'Irene', peso: 1.0 },
  manuela: { canonico: 'Manuela', peso: 1.0 },
  cintia: { canonico: 'Cintia', peso: 1.0 },
  eugenia: { canonico: 'Eugenia', peso: 1.0 },
  eleonora: { canonico: 'Eleonora', peso: 1.0 },
  ignacio: { canonico: 'Ignacio', peso: 1.0 },
  romina: { canonico: 'Romina', peso: 1.0 },
  melina: { canonico: 'Melina', peso: 1.0 },
  rodrigo: { canonico: 'Rodrigo', peso: 1.0 },
  marina: { canonico: 'Marina', peso: 1.0 },
  clara: { canonico: 'Clara', peso: 1.0 },
  paulina: { canonico: 'Paulina', peso: 1.0 },
  dolores: { canonico: 'Dolores', peso: 1.0 },
  delfina: { canonico: 'Delfina', peso: 1.0 },
  manuelita: { canonico: 'Manuelita', peso: 1.0 },
  gonzalo: { canonico: 'Gonzalo', peso: 1.0 },
  eluney: { canonico: 'Eluney', peso: 1.0 },
  andrea: { canonico: 'Andrea', peso: 1.0 },
  luis: { canonico: 'Luis', peso: 1.0 },
  jorge: { canonico: 'Jorge', peso: 1.0 },
  marcela: { canonico: 'Marcela', peso: 1.0 },
  carla: { canonico: 'Carla', peso: 1.0 },
  pablo: { canonico: 'Pablo', peso: 1.0 },
  ernestina: { canonico: 'Ernestina', peso: 1.0 },
  patricio: { canonico: 'Patricio', peso: 1.0 },
  nanci: { canonico: 'Nanci', peso: 1.0 },
  nancy: { canonico: 'Nancy', peso: 1.0 },
  santiago: { canonico: 'Santiago', peso: 1.0 },
  mariano: { canonico: 'Mariano', peso: 1.0 },
  alberto: { canonico: 'Alberto', peso: 1.0 },
  mario: { canonico: 'Mario', peso: 1.0 },
  guido: { canonico: 'Guido', peso: 1.0 },
  giselle: { canonico: 'Giselle', peso: 1.0 },
  pilar: { canonico: 'Pilar', peso: 1.0 },
  denise: { canonico: 'Denise', peso: 1.0 },
  daniela: { canonico: 'Daniela', peso: 1.0 },
  renata: { canonico: 'Renata', peso: 1.0 },
  magdalena: { canonico: 'Magdalena', peso: 1.0 },
  guillermina: { canonico: 'Guillermina', peso: 1.0 },
  milagros: { canonico: 'Milagros', peso: 1.0 },
  violeta: { canonico: 'Violeta', peso: 1.0 },
  azul: { canonico: 'Azul', peso: 1.0 },
  diego: { canonico: 'Diego', peso: 1.0 },
  marla: { canonico: 'Marla', peso: 1.0 },
  guillermo: { canonico: 'Guillermo', peso: 1.0 },
  martina: { canonico: 'Martina', peso: 1.0 },
  modesto: { canonico: 'Modesto', peso: 1.0 },
  melania: { canonico: 'Melania', peso: 1.0 },
  emma: { canonico: 'Emma', peso: 1.0 },
  facundo: { canonico: 'Facundo', peso: 1.0 },
  manuel: { canonico: 'Manuel', peso: 0.9 },
  anabella: { canonico: 'Anabella', peso: 1.0 },
  eva: { canonico: 'Eva', peso: 1.0 },
  constanza: { canonico: 'Constanza', peso: 1.0 },
  alejandro: { canonico: 'Alejandro', peso: 1.0 },
  ceferino: { canonico: 'Ceferino', peso: 1.0 },
  mercedes: { canonico: 'Mercedes', peso: 1.0 },
  nahuel: { canonico: 'Nahuel', peso: 1.0 },
  lautaro: { canonico: 'Lautaro', peso: 1.0 },
  camille: { canonico: 'Camille', peso: 1.0 },
  francisco: { canonico: 'Francisco', peso: 1.0 },
  franco: { canonico: 'Franco', peso: 0.78 },
  macarena: { canonico: 'Macarena', peso: 1.0 },
  emiliano: { canonico: 'Emiliano', peso: 1.0 },
  leandro: { canonico: 'Leandro', peso: 1.0 },
  ezequiel: { canonico: 'Ezequiel', peso: 1.0 },
  federica: { canonico: 'Federica', peso: 1.0 },
  josefina: { canonico: 'Josefina', peso: 1.0 },
  candelaria: { canonico: 'Candelaria', peso: 1.0 },
  agostina: { canonico: 'Agostina', peso: 1.0 },
  ornella: { canonico: 'Ornella', peso: 1.0 },
  brenda: { canonico: 'Brenda', peso: 1.0 },
  nadia: { canonico: 'Nadia', peso: 1.0 },
  natalio: { canonico: 'Natalio', peso: 1.0 },
  esteban: { canonico: 'Esteban', peso: 1.0 },
  ramiro: { canonico: 'Ramiro', peso: 1.0 },
  mauro: { canonico: 'Mauro', peso: 1.0 },
  enrique: { canonico: 'Enrique', peso: 1.0 },
  carlos: { canonico: 'Carlos', peso: 1.0 },
  ricardo: { canonico: 'Ricardo', peso: 1.0 },
  eduardo: { canonico: 'Eduardo', peso: 1.0 },
  roberto: { canonico: 'Roberto', peso: 1.0 },
  sergio: { canonico: 'Sergio', peso: 1.0 },
  claudio: { canonico: 'Claudio', peso: 1.0 },
  javier: { canonico: 'Javier', peso: 1.0 },
  fernando: { canonico: 'Fernando', peso: 1.0 },
  gabriel: { canonico: 'Gabriel', peso: 1.0 },
  daniel: { canonico: 'Daniel', peso: 1.0 },
  ariel: { canonico: 'Ariel', peso: 1.0 },
  osvaldo: { canonico: 'Osvaldo', peso: 1.0 },
  lidia: { canonico: 'Lidia', peso: 1.0 },
  liliana: { canonico: 'Liliana', peso: 1.0 },
  susana: { canonico: 'Susana', peso: 1.0 },
  graciela: { canonico: 'Graciela', peso: 1.0 },
  mirta: { canonico: 'Mirta', peso: 1.0 },
  norma: { canonico: 'Norma', peso: 1.0 },
  alicia: { canonico: 'Alicia', peso: 1.0 },
  beatriz: { canonico: 'Beatriz', peso: 1.0 },
  patricia: { canonico: 'Patricia', peso: 1.0 },
  adriana: { canonico: 'Adriana', peso: 1.0 },
  silvana: { canonico: 'Silvana', peso: 1.0 },
  viviana: { canonico: 'Viviana', peso: 1.0 },
  karina: { canonico: 'Karina', peso: 1.0 },
  vanesa: { canonico: 'Vanesa', peso: 1.0 },
  yanina: { canonico: 'Yanina', peso: 1.0 },
  jimena: { canonico: 'Jimena', peso: 1.0 },
  ximena: { canonico: 'Ximena', peso: 1.0 },
  malena: { canonico: 'Malena', peso: 1.0 },
  morena: { canonico: 'Morena', peso: 1.0 },
  alma: { canonico: 'Alma', peso: 1.0 },
  mia: { canonico: 'Mía', peso: 1.0 },
  mía: { canonico: 'Mía', peso: 1.0 },
};

// Diccionario de restitución de tildes para apellidos frecuentes
const DICCIONARIO_APELLIDOS_CANONICOS: Record<string, string> = {
  perez: 'Pérez',
  pérez: 'Pérez',
  gomez: 'Gómez',
  gómez: 'Gómez',
  lopez: 'López',
  lópez: 'López',
  rodriguez: 'Rodríguez',
  rodríguez: 'Rodríguez',
  fernandez: 'Fernández',
  fernández: 'Fernández',
  gonzalez: 'González',
  gonzález: 'González',
  martinez: 'Martínez',
  martínez: 'Martínez',
  sanchez: 'Sánchez',
  sánchez: 'Sánchez',
  ramirez: 'Ramírez',
  ramírez: 'Ramírez',
  gutierrez: 'Gutiérrez',
  gutiérrez: 'Gutiérrez',
  benitez: 'Benítez',
  benítez: 'Benítez',
  mendez: 'Méndez',
  méndez: 'Méndez',
  jimenez: 'Jiménez',
  jiménez: 'Jiménez',
  gimenez: 'Giménez',
  giménez: 'Giménez',
  suarez: 'Suárez',
  suárez: 'Suárez',
  alvarez: 'Álvarez',
  álvarez: 'Álvarez',
  vazquez: 'Vázquez',
  vázquez: 'Vázquez',
  garcia: 'García',
  garcía: 'García',
  echevarria: 'Echevarría',
  echevarría: 'Echevarría',
  echeverria: 'Echeverría',
  echeverría: 'Echeverría',
  mendizabal: 'Mendizábal',
  mendizábal: 'Mendizábal',
  diaz: 'Díaz',
  díaz: 'Díaz',
  rios: 'Ríos',
  ríos: 'Ríos',
  baez: 'Báez',
  báez: 'Báez',
  cazon: 'Cazón',
  cazón: 'Cazón',
  cedron: 'Cedrón',
  cedrón: 'Cedrón',
  efron: 'Efrón',
  efrón: 'Efrón',
  olguin: 'Olguín',
  olguín: 'Olguín',
  turrion: 'Turrión',
  turrión: 'Turrión',
  araoz: 'Aráoz',
  aráoz: 'Aráoz',
  naon: 'Naón',
  naón: 'Naón',
  rincon: 'Rincón',
  rincón: 'Rincón',
  muñoz: 'Muñoz',
  piñeiro: 'Piñeiro',
  burgueño: 'Burgueño',
  hamu: 'Hamú',
  hamù: 'Hamú',
  hamú: 'Hamú',
};

const CONECTORES_ONOMASTICOS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'di', 'van', 'von']);

export function capitalizarPalabras(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((w, idx) => {
      if (!w) return '';
      const low = w.toLowerCase();
      if (idx > 0 && CONECTORES_ONOMASTICOS.has(low)) return low;
      if (DICCIONARIO_NOMBRES_CANONICOS[low]) return DICCIONARIO_NOMBRES_CANONICOS[low].canonico;
      if (DICCIONARIO_APELLIDOS_CANONICOS[low]) return DICCIONARIO_APELLIDOS_CANONICOS[low];
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatearTokenOnomastico(
  palabraRaw: string,
  esConectorInterno: boolean,
  correcciones: string[]
): string {
  const limpio = palabraRaw.trim();
  if (!limpio) return '';
  const low = limpio.toLowerCase();

  if (esConectorInterno && CONECTORES_ONOMASTICOS.has(low)) {
    return low;
  }

  let resultado = limpio[0].toUpperCase() + limpio.slice(1).toLowerCase();
  if (DICCIONARIO_NOMBRES_CANONICOS[low]) {
    resultado = DICCIONARIO_NOMBRES_CANONICOS[low].canonico;
  } else if (DICCIONARIO_APELLIDOS_CANONICOS[low]) {
    resultado = DICCIONARIO_APELLIDOS_CANONICOS[low];
  }

  // Registrar si se restituyó tilde (comparando en minúsculas)
  if (resultado.toLowerCase() !== low) {
    correcciones.push(`Tilde/ortografía corregida (${limpio} → ${resultado})`);
  }

  return resultado;
}

function obtenerPesoNombre(palabraRaw: string): number {
  const low = palabraRaw.toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
  if (!low || CONECTORES_ONOMASTICOS.has(low)) return 0;
  if (DICCIONARIO_NOMBRES_CANONICOS[low]) {
    return DICCIONARIO_NOMBRES_CANONICOS[low].peso;
  }
  if (DICCIONARIO_APELLIDOS_CANONICOS[low]) {
    return 0.05;
  }
  // Heurística morfológica para apellidos frecuentes no listados (-ez, -ini, -etti, -oni, -elli, -berg, -man)
  if (/(ez|ini|etti|otti|oni|elli|ucci|acci|berg|stein|man|garay|buru|zabal|borda)$/i.test(low)) {
    return 0.05;
  }
  return 0.2;
}

const MAPA_BARRIOS_CABA_CANONICOS: Record<string, string> = {
  palermo: 'Palermo',
  'palermo soho': 'Palermo',
  'palermo hollywood': 'Palermo',
  'palermo chico': 'Palermo',
  'las cañitas': 'Palermo',
  'las canitas': 'Palermo',
  saavedra: 'Saavedra',
  nuñez: 'Núñez',
  nunez: 'Núñez',
  núñez: 'Núñez',
  belgrano: 'Belgrano',
  'belgrano r': 'Belgrano',
  'belgrano c': 'Belgrano',
  'villa urquiza': 'Villa Urquiza',
  urquiza: 'Villa Urquiza',
  coghlan: 'Coghlan',
  'villa pueyrredon': 'Villa Pueyrredón',
  'villa pueyrredón': 'Villa Pueyrredón',
  colegiales: 'Colegiales',
  recoleta: 'Recoleta',
  caballito: 'Caballito',
  almagro: 'Almagro',
  'villa crespo': 'Villa Crespo',
  chacarita: 'Chacarita',
  'villa devoto': 'Villa Devoto',
  devoto: 'Villa Devoto',
  boedo: 'Boedo',
  'san telmo': 'San Telmo',
  retiro: 'Retiro',
  flores: 'Flores',
  floresta: 'Floresta',
  'parque patricios': 'Parque Patricios',
  monserrat: 'Monserrat',
  montserrat: 'Monserrat',
  balvanera: 'Balvanera',
  once: 'Balvanera',
  abasto: 'Balvanera',
  'san nicolas': 'San Nicolás',
  'san nicolás': 'San Nicolás',
  microcentro: 'San Nicolás',
  constitucion: 'Constitución',
  constitución: 'Constitución',
  barracas: 'Barracas',
  'la boca': 'La Boca',
  boca: 'La Boca',
  'puerto madero': 'Puerto Madero',
  'san cristobal': 'San Cristóbal',
  'san cristóbal': 'San Cristóbal',
  'nueva pompeya': 'Nueva Pompeya',
  pompeya: 'Nueva Pompeya',
  'parque chacabuco': 'Parque Chacabuco',
  paternal: 'Paternal',
  'la paternal': 'Paternal',
  agronomia: 'Agronomía',
  agronomía: 'Agronomía',
  'parque chas': 'Parque Chas',
  'villa ortuzar': 'Villa Ortúzar',
  'villa ortúzar': 'Villa Ortúzar',
  'villa del parque': 'Villa del Parque',
  'villa general mitre': 'Villa General Mitre',
  'villa santa rita': 'Villa Santa Rita',
  'monte castro': 'Monte Castro',
  'velez sarsfield': 'Vélez Sársfield',
  'vélez sársfield': 'Vélez Sársfield',
  'villa luro': 'Villa Luro',
  versalles: 'Versalles',
  'villa real': 'Villa Real',
  liniers: 'Liniers',
  mataderos: 'Mataderos',
  'parque avellaneda': 'Parque Avellaneda',
  'villa soldati': 'Villa Soldati',
  'villa lugano': 'Villa Lugano',
  lugano: 'Villa Lugano',
  'villa riachuelo': 'Villa Riachuelo',
  caba: 'CABA',
  'capital federal': 'CABA',
};

export function esBarrioDeCABA(valor: string): boolean {
  const limpio = String(valor || '')
    .replace(/"/g, '')
    .trim()
    .toLowerCase();
  if (!limpio) return false;
  return Boolean(MAPA_BARRIOS_CABA_CANONICOS[limpio]);
}

export function normalizarBarrioCABA(valor: string): string {
  const limpio = String(valor || '').replace(/"/g, '').trim();
  if (!limpio) return 'Palermo';
  const canon = MAPA_BARRIOS_CABA_CANONICOS[limpio.toLowerCase()];
  return canon || capitalizarPalabras(limpio);
}

export function esEmailValido(valor: string): boolean {
  const limpio = String(valor || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio);
}

export function esTelefonoValido(valor: string): boolean {
  const limpio = String(valor || '').trim();
  if (!limpio || limpio.includes('@')) return false;
  if (/^(n\/a|no existe|sin tel|-)$/i.test(limpio)) return true;
  const digitos = limpio.replace(/\D/g, '');
  if (digitos.length < 7 || digitos.length > 16) return false;
  return /^[+\d\s().-]{7,24}$/.test(limpio);
}

export function esIdFilaValido(valor: string): boolean {
  const limpio = String(valor || '').trim();
  if (!limpio) return true;
  return (
    /^#?\d+$/.test(limpio) ||
    /^#?N\d+$/i.test(limpio) ||
    /^#?S\/?N(-\d+)?$/i.test(limpio) ||
    /^S\d+-\d+$/i.test(limpio)
  );
}

/**
 * Repara automáticamente cualquier contacto cuyas columnas hayan quedado desfasadas
 * (por ejemplo, cuando el Nombre de la Columna B quedó en `id`, el Barrio en `nombre` y el Email en `barrio`).
 */
export function repararContactoDesfasado(raw: RawContactRow, index: number = 0): RawContactRow {
  const nombreEsBarrio = esBarrioDeCABA(raw.nombre);
  const barrioEsEmail = esEmailValido(raw.barrio);

  if (!nombreEsBarrio && !barrioEsEmail) {
    return raw;
  }

  const rawIdLimpio = String(raw.id || '')
    .replace(/^#/, '')
    .trim();
  const idContieneNombrePersona =
    Boolean(rawIdLimpio) &&
    !esIdFilaValido(rawIdLimpio) &&
    !esBarrioDeCABA(rawIdLimpio) &&
    !esEmailValido(rawIdLimpio) &&
    !esTelefonoValido(rawIdLimpio);

  const nombreReal = idContieneNombrePersona
    ? rawIdLimpio
    : !nombreEsBarrio
    ? raw.nombre
    : '';

  const barrioReal = nombreEsBarrio
    ? normalizarBarrioCABA(raw.nombre)
    : esBarrioDeCABA(raw.barrio)
    ? normalizarBarrioCABA(raw.barrio)
    : 'Palermo';

  const emailReal = barrioEsEmail ? raw.barrio.trim() : raw.email;
  const idReal = idContieneNombrePersona ? String(index + 1) : raw.id || String(index + 1);

  return {
    ...raw,
    id: idReal,
    nombre: nombreReal,
    barrio: barrioReal,
    email: emailReal,
    // Recalcular estadoFlujo si había quedado con un estado genérico producto del desfase
    estadoFlujo:
      raw.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ? undefined : raw.estadoFlujo,
  };
}

export function asegurarIdsUnicosContactos(rows: RawContactRow[]): RawContactRow[] {
  let maxIdNum = rows.reduce((max, r, idx) => {
    const num = Number(String(r?.id || '').replace(/^#/, '').trim());
    return Number.isFinite(num) && num > 0 ? Math.max(max, num) : Math.max(max, idx + 1);
  }, rows.length);

  const idsUsados = new Set<string>();
  return rows.map((row) => {
    const idLimpio = String(row.id || '')
      .replace(/^#/, '')
      .trim();
    if (idLimpio && !idsUsados.has(idLimpio)) {
      idsUsados.add(idLimpio);
      return row.id === idLimpio ? row : { ...row, id: idLimpio };
    }
    maxIdNum += 1;
    while (idsUsados.has(String(maxIdNum))) {
      maxIdNum += 1;
    }
    const nuevoId = String(maxIdNum);
    idsUsados.add(nuevoId);
    return {
      ...row,
      id: nuevoId,
    };
  });
}

export function repararContactosDesfasados(rows: RawContactRow[]): RawContactRow[] {
  return asegurarIdsUnicosContactos(rows.map((r, i) => repararContactoDesfasado(r, i)));
}

function construirVocativoNatural(tokensNombrePila: string[]): string {
  if (tokensNombrePila.length === 0) return 'Vecino/a';
  if (tokensNombrePila.length === 1) return tokensNombrePila[0];

  const primeroLow = tokensNombrePila[0].toLowerCase();
  const segundoLow = tokensNombrePila[1]?.toLowerCase() || '';

  // Caso "María del Pilar" -> "María del Pilar"
  if (
    (primeroLow === 'maría' || primeroLow === 'maria') &&
    segundoLow === 'del' &&
    tokensNombrePila[2]
  ) {
    return `${tokensNombrePila[0]} del ${tokensNombrePila[2]}`;
  }

  // En español rioplatense, "María + SegundoNombre" o "Ana + SegundoNombre" o "Juan + SegundoNombre" suelen usarse compuestos
  if (
    (primeroLow === 'maría' ||
      primeroLow === 'maria' ||
      primeroLow === 'ana' ||
      primeroLow === 'juan' ||
      primeroLow === 'luis') &&
    tokensNombrePila.length >= 2 &&
    !CONECTORES_ONOMASTICOS.has(segundoLow)
  ) {
    return `${tokensNombrePila[0]} ${tokensNombrePila[1]}`;
  }

  // En combinaciones de dos nombres independientes ("Carolina Ayelén", "Cintia Daniela", "Horacio Martín", "Soledad Mercedes", "Mariano Joaquín"),
  // el trato conversacional natural en WhatsApp es usar el primer nombre de pila ("Carolina", "Cintia", "Horacio", "Soledad", "Mariano")
  return tokensNombrePila[0];
}

/**
 * Detecta si la celda de Nombre en Google Sheets está en blanco, tiene un placeholder ("-", "S/N") o sólo números.
 */
export function esCeldaSinNombre(rawCell: string): boolean {
  const limpio = String(rawCell || '').replace(/"/g, '').trim();
  if (!limpio) return true;
  if (esBarrioDeCABA(limpio) || esEmailValido(limpio)) return true;
  const low = limpio.toLowerCase();
  if (
    low === '-' ||
    low === '--' ||
    low === '?' ||
    low === 's/n' ||
    low === 'sn' ||
    low === 'n/n' ||
    low === 'nn' ||
    low === 'n/a' ||
    low === 'sin nombre' ||
    low === 'desconocido' ||
    low === 'pendiente' ||
    low === 'vecino' ||
    low === 'vecino/a'
  ) {
    return true;
  }
  const soloLetras = limpio.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
  return soloLetras.length === 0;
}

/**
 * Analiza probabilísticamente una celda de Nombre y Apellido (llenada por el usuario en formulario),
 * determina qué palabras corresponden al nombre de pila vs. apellido sin asumir que la primera palabra es el nombre,
 * y corrige mayúsculas, minúsculas y tildes faltantes.
 */
export function analizarYCorregirNombreCompleto(rawCell: string): AnalisisNombre {
  const original = String(rawCell || '').replace(/"/g, '').trim();
  if (esCeldaSinNombre(original)) {
    return {
      original,
      sinNombre: true,
      vocativo: '',
      nombrePilaCompleto: '',
      apellidos: '',
      nombreCompletoOrdenado: 'Teléfono sin nombre (Consultar en chat)',
      ordenDetectado: 'SIN_NOMBRE',
      correccionesAplicadas: [
        'Celda sin nombre en Google Sheets: se incluye pregunta sutil de nombre y apellido',
      ],
      confianza: 0,
    };
  }

  const correccionesAplicadas: string[] = [];
  const soloLetras = original.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
  if (soloLetras.length > 2) {
    if (soloLetras === soloLetras.toUpperCase()) {
      correccionesAplicadas.push('Texto en MAYÚSCULAS normalizado');
    } else if (soloLetras === soloLetras.toLowerCase()) {
      correccionesAplicadas.push('Texto en minúsculas capitalizado');
    }
  }

  // CASO 1: Formato explícito con coma ("Apellido, Nombre SegundoNombre")
  if (original.includes(',')) {
    const [parteApellidosRaw, parteNombresRaw] = original.split(',').map((s) => s.trim());
    const tokensApellidos = (parteApellidosRaw || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((t, idx) => formatearTokenOnomastico(t, idx > 0, correccionesAplicadas));
    const tokensNombres = (parteNombresRaw || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((t, idx) => formatearTokenOnomastico(t, idx > 0, correccionesAplicadas));

    correccionesAplicadas.push('Formato "Apellido, Nombre" reordenado');
    const vocativo = construirVocativoNatural(tokensNombres);
    const nombrePilaCompleto = tokensNombres.join(' ');
    const apellidos = tokensApellidos.join(' ');
    const nombreCompletoOrdenado = [nombrePilaCompleto, apellidos].filter(Boolean).join(' ');

    return {
      original,
      sinNombre: false,
      vocativo,
      nombrePilaCompleto,
      apellidos,
      nombreCompletoOrdenado,
      ordenDetectado: 'APELLIDO_COMA_NOMBRE',
      correccionesAplicadas,
      confianza: 99,
    };
  }

  const palabrasRaw = original.split(/\s+/).filter(Boolean);

  // CASO 2: Una sola palabra
  if (palabrasRaw.length === 1) {
    const token = formatearTokenOnomastico(palabrasRaw[0], false, correccionesAplicadas);
    return {
      original,
      sinNombre: false,
      vocativo: token,
      nombrePilaCompleto: token,
      apellidos: '',
      nombreCompletoOrdenado: token,
      ordenDetectado: 'SOLO_NOMBRE',
      correccionesAplicadas,
      confianza: 95,
    };
  }

  // Evaluar pesos de cada palabra para decidir dónde está el bloque de Nombre de Pila vs. Apellido(s)
  const pesos = palabrasRaw.map((w) => obtenerPesoNombre(w));
  const p0 = pesos[0];
  const pLast = pesos[pesos.length - 1];

  // ¿Empieza con apellido(s) y termina con nombre(s)?
  if (p0 < 0.5 && pesos.some((p, idx) => idx > 0 && p >= 0.75)) {
    const primerIdxNombre = pesos.findIndex((p, idx) => idx > 0 && p >= 0.75);
    const rawApellidos = palabrasRaw.slice(0, primerIdxNombre);
    const rawNombres = palabrasRaw.slice(primerIdxNombre);

    const tokensApellidos = rawApellidos.map((t, idx) =>
      formatearTokenOnomastico(t, idx > 0, correccionesAplicadas)
    );
    const tokensNombres = rawNombres.map((t, idx) =>
      formatearTokenOnomastico(t, idx > 0, correccionesAplicadas)
    );

    correccionesAplicadas.push('Orden invertido "Apellido Nombre" detectado');
    const vocativo = construirVocativoNatural(tokensNombres);
    const nombrePilaCompleto = tokensNombres.join(' ');
    const apellidos = tokensApellidos.join(' ');
    const nombreCompletoOrdenado = [nombrePilaCompleto, apellidos].filter(Boolean).join(' ');

    return {
      original,
      sinNombre: false,
      vocativo,
      nombrePilaCompleto,
      apellidos,
      nombreCompletoOrdenado,
      ordenDetectado: 'APELLIDO_NOMBRE',
      correccionesAplicadas,
      confianza: 96,
    };
  }

  // Si ninguna palabra está en el diccionario de nombres conocidos (ambas son desconocidas), pero la primera tiene morfología de apellido y la última no
  if (p0 <= 0.1 && pLast > p0) {
    const rawApellidos = palabrasRaw.slice(0, -1);
    const rawNombres = palabrasRaw.slice(-1);
    const tokensApellidos = rawApellidos.map((t, idx) =>
      formatearTokenOnomastico(t, idx > 0, correccionesAplicadas)
    );
    const tokensNombres = rawNombres.map((t, idx) =>
      formatearTokenOnomastico(t, idx > 0, correccionesAplicadas)
    );
    correccionesAplicadas.push('Inferido "Apellido Nombre" por patrón morfológico');
    const vocativo = construirVocativoNatural(tokensNombres);
    const nombrePilaCompleto = tokensNombres.join(' ');
    const apellidos = tokensApellidos.join(' ');
    return {
      original,
      sinNombre: false,
      vocativo,
      nombrePilaCompleto,
      apellidos,
      nombreCompletoOrdenado: [nombrePilaCompleto, apellidos].filter(Boolean).join(' '),
      ordenDetectado: 'APELLIDO_NOMBRE',
      correccionesAplicadas,
      confianza: 82,
    };
  }

  // CASO 3: Empieza con Nombre de Pila ("Nombre [SegundoNombre] Apellido1 [Apellido2]")
  const p0Low = palabrasRaw[0].toLowerCase();
  const esPrefijoCompuesto =
    p0Low === 'maría' ||
    p0Low === 'maria' ||
    p0Low === 'ana' ||
    p0Low === 'juan' ||
    p0Low === 'luis' ||
    p0Low === 'josé' ||
    p0Low === 'jose';

  let cantTokensNombre = 1;
  if (palabrasRaw.length >= 3) {
    if (
      (p0Low === 'maría' || p0Low === 'maria') &&
      palabrasRaw[1].toLowerCase() === 'del' &&
      pesos[2] >= 0.75
    ) {
      cantTokensNombre = 3;
    } else if (esPrefijoCompuesto && pesos[1] >= 0.75) {
      cantTokensNombre = 2;
    } else if (pesos[1] >= 0.95) {
      cantTokensNombre = 2;
    }
  } else if (palabrasRaw.length === 2 && esPrefijoCompuesto && pesos[1] >= 0.9) {
    cantTokensNombre = 2;
  }

  const rawNombres = palabrasRaw.slice(0, cantTokensNombre);
  const rawApellidos = palabrasRaw.slice(cantTokensNombre);

  const tokensNombres = rawNombres.map((t, idx) =>
    formatearTokenOnomastico(t, idx > 0, correccionesAplicadas)
  );
  const tokensApellidos = rawApellidos.map((t, idx) =>
    formatearTokenOnomastico(t, idx > 0, correccionesAplicadas)
  );

  const vocativo = construirVocativoNatural(tokensNombres);
  const nombrePilaCompleto = tokensNombres.join(' ');
  const apellidos = tokensApellidos.join(' ');
  const nombreCompletoOrdenado = [nombrePilaCompleto, apellidos].filter(Boolean).join(' ');

  return {
    original,
    sinNombre: false,
    vocativo,
    nombrePilaCompleto,
    apellidos,
    nombreCompletoOrdenado,
    ordenDetectado: rawApellidos.length > 0 ? 'NOMBRE_APELLIDO' : 'SOLO_NOMBRE',
    correccionesAplicadas,
    confianza: 98,
  };
}

/**
 * Extrae el nombre de pila (vocativo) corregido en mayúsculas/minúsculas y acentuación
 * a partir de cualquier celda de Nombre y Apellido.
 */
export function extraerPrimerNombre(nombreCompleto: string): string {
  return analizarYCorregirNombreCompleto(nombreCompleto).vocativo;
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
export function extraerCalleOCruce(comentario: string): string {
  if (!comentario) return '';
  const rawStr = String(comentario).trim();
  if (!rawStr) return '';

  const esExpresionFechaOHora = (s: string): boolean => {
    const t = s.trim();
    if (!t) return true;
    const tieneCalleConAltura =
      /\b(?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+|Dr\.?\s+|Sta\.?\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ]{3,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ.]{2,}){0,3}\s+(?:al\s+)?\d{3,4}\b/i.test(
        t
      );
    if (tieneCalleConAltura) return false;
    if (
      /\b\d{1,2}\/\d{1,2}\b/.test(t) ||
      /\b\d{1,2}\s*(?:o|y|al|-)\s*\d{1,2}\/\d{1,2}\b/i.test(t) ||
      /\b\d{1,2}:\d{2}\b/.test(t) ||
      /\b(?:a\s+las|antes\s+de\s+las|despu[eé]s\s+de\s+las|cualquier\s+hora|entre\s+(?:el\s+|las\s+)?\d|de\s+\d{1,2}\s+a\s+\d{1,2}|\d{1,2}\s*(?:hs|horas|h)\b|por\s+la\s+(?:ma[ñn]ana|tarde|noche)|al\s+mediod[ií]a|paradas?\s+en\s+orden|mesa\s+caf[eé])/i.test(
        t
      )
    ) {
      return true;
    }
    return false;
  };

  // 1. Evaluar primero el texto escrito FUERA de los paréntesis cuando el usuario escribe "Dirección (fecha y hora)"
  //    (ej: "Charcas 3702 1B (el 21/10 a las 10)", "Beruti 3459, depto 12B (entre el 20 y 24/10...)", "Av. Cnel. Díaz 2277 (...)", "Av. Bullrich y Av. Santa Fe (...)")
  const antesDeParentesis = rawStr
    .split('(')[0]
    .replace(
      /^(?:visita\s+confirmada|visita\s+reprogramada|visita\s+puerta\s+a\s+puerta|visita|encuentro\s+confirmado|confirmad[oa]|reprogramad[oa]|vive\s+en|domicilio\s+en|va\s+a\s+pasar\s+por|pasa\s+por|prefiere\s+pasar\s+por|se\s+acerca\s+a)\b[:\s-]*/i,
      ''
    )
    .replace(/\b\d{1,2}\s*(?:o|y|al|-)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\b(?:a\s+las\s+\d{1,2}(?::\d{2})?\s*(?:hs|h)?|\d{1,2}:\d{2}\s*hs|cualquier\s+hora|en\s+cualquier\s+horario)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, '')
    .trim();

  if (
    antesDeParentesis.length >= 5 &&
    !esExpresionFechaOHora(antesDeParentesis) &&
    !esBarrioDeCABA(antesDeParentesis) &&
    !/^(sin\s+respuesta|no\s+contesta|1er\s+mensaje|pidi[oó]\s+m[aá]s\s+info|no\s+tiene\s+domicilio)/i.test(
      antesDeParentesis
    )
  ) {
    const tieneAlturaOCruce =
      /\b(?:al\s+)?\d{3,4}\b/.test(antesDeParentesis) ||
      /\b[A-ZÁÉÍÓÚÑa-záéíóúñ.]{3,}\s+(?:y|e)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ.]{3,}/i.test(antesDeParentesis) ||
      /\b(parque|pqe\.?|plaza|pza\.?|estaci[oó]n|subte|club|shopping|caf[eé]|sede|ecoparque|bot[aá]nico)\b/i.test(
        antesDeParentesis
      );
    if (tieneAlturaOCruce) {
      return antesDeParentesis
        .replace(/,?\s*hija de.*$/i, '')
        .replace(/^Pqe\.\s*/i, 'Parque ')
        .replace(/^Pza\.\s*/i, 'Plaza ')
        .trim();
    }
  }

  // 2. Buscar dentro de paréntesis (...) en la Columna G ignorando paréntesis que sean fechas u horarios
  const matches = [...rawStr.matchAll(/\(([^)]+)\)/g)];
  for (let i = 0; i < matches.length; i++) {
    let txt = matches[i][1].trim();
    if (
      /^x\d+$/i.test(txt) ||
      /consertada|concertada|confirmad[oa]|sin respuesta|pendiente|verificad[oa]|auto-wa|no existe|1er\s*(contacto|msj|mensaje)|^#\d+$/i.test(
        txt
      ) ||
      esExpresionFechaOHora(txt)
    ) {
      continue;
    }
    txt = txt
      .replace(/,?\s*hija de.*$/i, '')
      .replace(/,\s*\d+\s*$/i, '')
      .replace(/^Pqe\.\s*/i, 'Parque ')
      .replace(/^Pza\.\s*/i, 'Plaza ')
      .trim();

    const esPuntoEspecifico =
      /^(parque|pqe\.?|plaza|pza\.?|estaci[oó]n|subte|club|shopping|caf[eé]|sede|hospital|ecoparque|bot[aá]nico|obelisco)\b/i.test(
        txt
      );
    if (esBarrioDeCABA(txt) && !esPuntoEspecifico) {
      continue;
    }
    if (txt.length > 3) return txt;
  }

  // 3. Buscar coincidencias directas en el diccionario de direcciones y puntos de CABA (priorizando coincidencias más específicas)
  const comLow = rawStr.toLowerCase();
  const coordenadasOrdenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
    (a, b) => b.match.length - a.match.length
  );
  for (const item of coordenadasOrdenadas) {
    if (comLow.includes(item.match)) {
      const etiquetaLimpia = item.label.split(',')[0].replace(/\s*\([^)]*\)/g, '').trim();
      return etiquetaLimpia || item.match;
    }
  }

  // 4. Buscar puntos de encuentro explícitos (Parque, Plaza, Estación, Club, Shopping) escritos sin paréntesis
  const matchPunto = rawStr.match(
    /\b((?:Parque|Pqe\.|Plaza|Pza\.|Estaci[oó]n|Club|Shopping)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?)/
  );
  if (matchPunto && matchPunto[1]) {
    return matchPunto[1]
      .replace(/^Pqe\.\s*/i, 'Parque ')
      .replace(/^Pza\.\s*/i, 'Plaza ')
      .trim();
  }

  // 5. Buscar intersecciones explícitas ("Calle1 y Calle2" o "Calle1 e Calle2") escritas sin paréntesis
  const matchCruce = rawStr.match(
    /\b((?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+){0,2}\s+(?:y|e)\s+(?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+){0,2})\b/
  );
  if (matchCruce && matchCruce[1]) {
    const cand = matchCruce[1].trim();
    const palabrasTiempo =
      /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[ñn]ana|tarde|noche|nombre|apellido)\b/i;
    if (!palabrasTiempo.test(cand) && !esBarrioDeCABA(cand)) {
      return cand;
    }
  }

  // 6. Buscar calle con altura numérica (ej. "Av. Cabildo 2040", "Av. Cnel. Díaz 2277", "Charcas 3702") escrita sin paréntesis
  const matchAltura = rawStr.match(
    /\b((?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+|Dr\.?\s+|Sta\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+(?:\s+(?:del|de\s+la|de|[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+)){0,3}\s+(?:al\s+)?\d{3,4}(?:\s*,?\s*(?:depto\.?|piso|dto\.?)?\s*\d*[A-Za-z]?)?)\b/
  );
  if (matchAltura && matchAltura[1]) {
    const cand = matchAltura[1].trim();
    const prefijoInvalido =
      /^(visita|semana|entre|hasta|desde|despu[eé]s|luego|antes|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|contacto|fila)\b/i;
    if (!prefijoInvalido.test(cand)) {
      return cand;
    }
  }

  return '';
}

/**
 * Determina si el contacto tiene una dirección real, intersección o punto de encuentro
 * cargado en la Columna "G" ("Comentario") del Google Sheets.
 * Si sólo contamos con el barrio en la Columna C pero no hay dirección/punto en la Columna G, devuelve `false`.
 */
export function tieneDireccionOPuntoEnComentario(comentario: string): boolean {
  return extraerCalleOCruce(comentario).trim().length > 0;
}

/**
 * Infiere el barrio oficial de CABA a partir de la dirección, esquina o punto de encuentro
 * introducido en la Columna "G" ("Comentario") del Google Sheets.
 * Si no hay dirección/punto de encuentro o no puede determinarse un barrio específico, devuelve `null`.
 */
export function inferirBarrioDesdeDireccionOComentario(
  calleOCruce: string,
  comentario: string = ''
): string | null {
  const dirLimpia = (calleOCruce || '').trim();
  if (!dirLimpia) return null;

  const low = dirLimpia.toLowerCase();
  const comLow = (comentario || '').toLowerCase();

  // 1. Buscar primero en el diccionario geoespacial exacto de direcciones y puntos de encuentro de CABA
  for (const item of COORDENADAS_DIRECCIONES_CABA) {
    if (low.includes(item.match) || item.match.includes(low)) {
      return item.barrio;
    }
  }

  // Extraer altura numérica si la dirección incluye número de puerta (ej: "Cabildo 2100" -> 2100)
  const matchNum = low.match(/\b(\d{2,4})\b/);
  const altura = matchNum ? parseInt(matchNum[1], 10) : null;

  // 2. Reglas por avenidas largas de CABA según altura o intersección
  if (low.includes('cabildo')) {
    if (altura !== null) {
      if (altura < 1500) return 'Colegiales';
      if (altura >= 3000) return 'Núñez';
      return 'Belgrano';
    }
    if (low.includes('congreso') || low.includes('quesada') || low.includes('manuela pedraza') || low.includes('criszólogo') || low.includes('larralde')) {
      return 'Núñez';
    }
    if (low.includes('lacroze') || low.includes('teodoro') || low.includes('newbery') || low.includes('dorrego')) {
      return 'Colegiales';
    }
    return 'Belgrano';
  }

  if (low.includes('santa fe')) {
    if (altura !== null && altura < 2800) return 'Recoleta';
    if (low.includes('callao') || low.includes('pueyrredón') || low.includes('pueyrredon')) return 'Recoleta';
    return 'Palermo';
  }

  if (low.includes('corrientes')) {
    if (altura !== null) {
      if (altura < 1800) return 'San Nicolás';
      if (altura < 3400) return 'Balvanera';
      if (altura < 4700) return 'Almagro';
      return 'Villa Crespo';
    }
    if (low.includes('medrano') || low.includes('bulnes') || low.includes('gascón') || low.includes('gascon')) return 'Almagro';
    if (low.includes('scalabrini') || low.includes('malabia') || low.includes('thames') || low.includes('dorrego')) return 'Villa Crespo';
    if (low.includes('callao') || low.includes('pueyrredón') || low.includes('pueyrredon')) return 'Balvanera';
    if (low.includes('9 de julio') || low.includes('obelisco') || low.includes('florida') || low.includes('maipú') || low.includes('maipu')) return 'San Nicolás';
  }

  if (low.includes('rivadavia')) {
    if (altura !== null) {
      if (altura < 1800) return 'Monserrat';
      if (altura < 3400) return 'Balvanera';
      if (altura < 4400) return 'Almagro';
      if (altura < 6200) return 'Caballito';
      return 'Flores';
    }
    if (low.includes('acoyte') || low.includes('parque rivadavia') || low.includes('primera junta')) return 'Caballito';
  }

  if (low.includes('álvarez thomas') || low.includes('alvarez thomas')) {
    if (altura !== null) {
      if (altura < 1300) return 'Colegiales';
      if (altura < 2200) return 'Villa Ortúzar';
      return 'Villa Urquiza';
    }
    if (low.includes('lacroze') || low.includes('elcano') || low.includes('virrey')) return 'Colegiales';
    return 'Villa Urquiza';
  }

  if (low.includes('monroe')) {
    if (altura !== null) {
      if (altura < 3000) return 'Belgrano';
      if (altura < 4200) return 'Coghlan';
      return 'Villa Urquiza';
    }
    if (low.includes('triunvirato') || low.includes('capdevila') || low.includes('bauness') || low.includes('bucarelli')) {
      return 'Villa Urquiza';
    }
    if (low.includes('naón') || low.includes('naon') || low.includes('melián') || low.includes('melian') || low.includes('washington')) {
      return 'Coghlan';
    }
    if (low.includes('cabildo') || low.includes('cuba') || low.includes('vuelta de obligado')) {
      return 'Belgrano';
    }
  }

  // 3. Reglas por calles, parques y puntos emblemáticos de cada barrio de CABA
  if (
    /parque saavedra|pqe\.?\s*saavedra|garc[ií]a del r[ií]o|besares|vilela|paroissien|arias\b|deheza|pico\b|correa\b|balb[ií]n y larralde|pinto y vilela|amen[aá]bar y besares|vidal y garc[ií]a/i.test(
      low
    ) ||
    ((/meli[aá]n|washington|r[oó]mulo na[oó]n|pinto\b|larralde|balb[ií]n|zapiola/i.test(low)) &&
      (altura === null || altura >= 3200 || low.includes('iberá') || low.includes('ibera')))
  ) {
    return 'Saavedra';
  }

  if (
    /plaza italia|pza\.?\s*italia|ecoparque|bot[aá]nico|rosedal|el solar|las ca[ñn]itas|huergo\b|godoy cruz|el salvador|honduras|costa rica|nicaragua|soler\b|guatemala\b|fitz roy|bonpland|carranza|ravignani|ravigniani|niceto|g[üu]emes|coronel d[ií]az|salguero|ar[aá]oz|charcas|scalabrini ort[ií]z y charcas|libertador 4\d\d\d/i.test(
      low
    )
  ) {
    return 'Palermo';
  }

  if (
    /chile 1\d\d\d|santiago del estero \d+|per[uú] al 100|per[uú] \d{1,3}\b|plaza de mayo|av\.?\s*de mayo|bol[ií]var \d{1,3}\b|piedras \d{1,3}\b|tacuar[ií] \d{1,3}\b|moreno \d{3,4}\b|alsina \d{3,4}\b/i.test(
      low
    )
  ) {
    return 'Monserrat';
  }

  if (
    /maip[uú] \d+|florida \d+|lavalle \d+|microcentro|obelisco|reconquista \d+|san mart[ií]n \d{1,3}\b|suipacha \d{1,3}\b|esmeralda \d{1,3}\b/i.test(
      low
    )
  ) {
    return 'San Nicolás';
  }

  if (
    /club pinocho|capdevila|triunvirato|plaza echeverr[ií]a|estaci[oó]n urquiza|bucarelli|bauness|cullen|andonaegui|altolaguirre|olaz[aá]bal [45]\d\d\d|blanco encalada [45]\d\d\d|manuela pedraza [45]\d\d\d/i.test(
      low
    )
  ) {
    return 'Villa Urquiza';
  }

  if (
    /caracas [45]\d\d\d|mosconi [23]\d\d\d|artigas [45]\d\d\d|plaza mart[ií]n rodr[ií]guez|plaza alem|gavil[aá]n [45]\d\d\d|nazca [45]\d\d\d/i.test(
      low
    )
  ) {
    return 'Villa Pueyrredón';
  }

  if (/estaci[oó]n coghlan|pedro ignacio rivera [34]\d\d\d|tronador [23]\d\d\d|nahuel huapi [34]\d\d\d/i.test(low)) {
    return 'Coghlan';
  }

  if (
    /plaza mafalda|lacroze y conde|conde \d{3,4}\b|teodoro garc[ií]a|palpa\b|aguilar\b|c[eé]spedes\b/i.test(
      low
    )
  ) {
    return 'Colegiales';
  }

  if (
    /barrancas de belgrano|juramento|barrio chino|sucre \d+|echeverr[ií]a [123]\d\d\d|la pampa \d+|virrey del pino|vuelta de obligado/i.test(
      low
    )
  ) {
    return 'Belgrano';
  }

  if (/las heras y pueyrred[oó]n|plaza francia|jun[ií]n 1\d\d\d|callao 1\d\d\d|quintana\b|alvear 1\d\d\d|posadas 1\d\d\d/i.test(low)) {
    return 'Recoleta';
  }

  if (/acoyte|parque rivadavia|parque centenario|primera junta|pedro goyena|rosario \d{3}\b|jose mar[ií]a moreno/i.test(low)) {
    return 'Caballito';
  }

  if (/medrano|castro barros|plaza almagro|pr[ií]ngles|yatay|gasc[oó]n/i.test(low)) {
    return 'Almagro';
  }

  if (/warnes|camargo|padilla|murillo|luis viale|aguirre \d+|vera \d+|velasco \d+|loyola \d+/i.test(low)) {
    return 'Villa Crespo';
  }

  if (/parque lezama|plaza dorrego|defensa [6789]\d\d|defensa 1\d\d\d|san telmo/i.test(low)) {
    return 'San Telmo';
  }

  if (/parque patricios|caseros [23]\d\d\d|uspallata/i.test(low)) {
    return 'Parque Patricios';
  }

  if (/plaza arenales|chivilcoy [34]\d\d\d|beir[oó] [345]\d\d\d/i.test(low)) {
    return 'Villa Devoto';
  }

  // 4. Si en la dirección o el comentario con dirección se menciona explícitamente un barrio oficial de CABA
  for (const [keyBarrio, nombreCanonico] of Object.entries(MAPA_BARRIOS_CABA_CANONICOS)) {
    if (keyBarrio.length >= 5 && (low.includes(keyBarrio) || comLow.includes(`(${keyBarrio})`))) {
      return nombreCanonico;
    }
  }

  return null;
}

/**
 * Si la dirección o punto de encuentro introducido en la Columna "G" ("Comentario") del Google Sheets
 * no coincide con el barrio cargado en el Google Sheets, modifica automáticamente el barrio al barrio
 * adecuado/correcto en función de la dirección o punto de encuentro cargada.
 */
export function sincronizarBarrioConDireccionComentario(raw: RawContactRow): RawContactRow {
  const comLow = (raw.comentario || '').toLowerCase();
  if (
    comLow.includes('chile 1408') ||
    /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(comLow)
  ) {
    const barrioActualSede = (raw.barrio || '').trim()
      ? normalizarBarrioCABA(raw.barrio)
      : 'Palermo';
    return {
      ...raw,
      barrio: barrioActualSede,
    };
  }

  const calleOCruce = extraerCalleOCruce(raw.comentario);
  if (!calleOCruce) {
    return raw;
  }

  const barrioCorrecto = inferirBarrioDesdeDireccionOComentario(calleOCruce, raw.comentario);
  if (!barrioCorrecto) {
    return raw;
  }

  const barrioActual = (raw.barrio || '').trim() ? normalizarBarrioCABA(raw.barrio) : 'Palermo';
  if (barrioCorrecto.toLowerCase() !== barrioActual.toLowerCase()) {
    return {
      ...raw,
      barrio: barrioCorrecto,
      barrioOriginalSheet: raw.barrioOriginalSheet || barrioActual,
      barrioCorregidoPorDireccion: true,
    };
  }

  return {
    ...raw,
    barrio: barrioCorrecto,
  };
}

/**
 * Extrae todas las fechas DD/MM mencionadas en el comentario, incluyendo expresiones compuestas
 * donde varios días comparten el mismo mes (ej: "20 o 21/10", "21 o 22/10", "21 o 23/10", "21 y 22/10", "del 20 al 22/10").
 */
export function extraerFechasMencionadas(comentario: string): string[] {
  if (!comentario) return [];
  const text = String(comentario);
  const encontradas: string[] = [];
  const agregarFecha = (dStr: string | number, mStr: string | number) => {
    const d = Number(dStr);
    const m = Number(mStr);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const ddmm = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
      if (!encontradas.includes(ddmm)) {
        encontradas.push(ddmm);
      }
    }
  };

  // 1. Expresiones compuestas con conjunción ("20 o 21/10", "21 o 22/10", "21 o 23/10", "20, 21 o 22/10", "21 y 22/10")
  const regexCompuesta =
    /\b(\d{1,2})\s*(?:,\s*(\d{1,2})\s*)?(?:o|u|y|e)\s*(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/gi;
  for (const m of text.matchAll(regexCompuesta)) {
    const mes = m[4];
    agregarFecha(m[1], mes);
    if (m[2]) agregarFecha(m[2], mes);
    agregarFecha(m[3], mes);
  }

  // 2. Rangos de días que comparten mes ("del 20 al 22/10", "entre el 20 y 24/10", "entre el 21 y el 23/10")
  const regexRangoDias =
    /\b(?:del|entre(?:\s+el)?)\s+(\d{1,2})\s+(?:al|a|y(?:\s+el)?|-)\s*(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/gi;
  for (const m of text.matchAll(regexRangoDias)) {
    const d1 = Number(m[1]);
    const d2 = Number(m[2]);
    const mes = m[3];
    if (d2 >= d1 && d2 - d1 <= 10) {
      for (let d = d1; d <= d2; d++) {
        agregarFecha(d, mes);
      }
    }
  }

  // 3. Fechas directas DD/MM o DD/MM/YYYY
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    agregarFecha(m[1], m[2]);
  }

  return encontradas;
}

/**
 * Limpia menciones de fechas simples ("el 21/10") y rangos/listas de fechas ("entre el 20 y 24/10", "20 o 21/10")
 * para que los números de día ("20") nunca sean confundidos con una hora del día al analizar franjas horarias.
 */
export function limpiarFechasDeTextoParaHorario(comentario: string): string {
  const raw = String(comentario || '');
  const sinPropuestaBloque = raw
    .replace(/\[Propuesta\s+[^\]]*\]/gi, ' ')
    .replace(/\(\d{1,2}:\d{2}\s*a\s*\d{1,2}:\d{2}\s*hs(?:\s*\([^)]*\))?\)/gi, ' ');
  const sinFechas = (txt: string) =>
    txt
      .replace(
        /\b(?:entre\s+(?:el\s+)?|del\s+|el\s+)?\d{1,2}(?:\s*(?:o|y|al|a|-|,)\s*(?:el\s+)?\d{1,2})+\/\d{1,2}(?:\/\d{2,4})?\b/gi,
        ' '
      )
      .replace(/\b(?:el\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ');
  const limpioDePropuesta = sinFechas(sinPropuestaBloque);
  if (
    /\b(\d{1,2}(?::\d{2})?\s*(?:hs|h|horas)?|antes\s+de\s+las|despu[eé]s\s+de\s+las|luego\s+de\s+las|a\s+las|ma[ñn]ana|mediod[ií]a|tarde|noche|vespertin[oa]|cualquier\s+hora)\b/i.test(
      limpioDePropuesta
    )
  ) {
    return limpioDePropuesta;
  }
  return sinFechas(raw);
}

/**
 * Determina la franja horaria compatible a partir del comentario en la Columna G,
 * evitando confundir límites superiores ("hasta las 18", "antes de las 18", "entre 10 y 18:00") con horario Vespertino.
 */
export function analizarFranjaHoraria(comentario: string): FranjaHoraria {
  if (!comentario) return 'Flexible';
  // Quitar fechas DD/MM(/YYYY) y rangos de fechas ("entre el 20 y 24/10", "20 o 21/10")
  const com = limpiarFechasDeTextoParaHorario(comentario).toLowerCase();

  // 1. Rango explícito "entre X y Y" o "de X a Y"
  const mRango = com.match(
    /\b(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:y|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\b/i
  );
  if (mRango) {
    const h1 = Number(mRango[1]);
    const min1 = mRango[2] ? Number(mRango[2]) : 0;
    const h2 = Number(mRango[3]);
    const min2 = mRango[4] ? Number(mRango[4]) : 0;
    if (h1 >= 6 && h1 <= 22 && h2 > h1 && h2 <= 23) {
      const ini = h1 * 60 + min1;
      const fin = h2 * 60 + min2;
      // Si cubre casi toda la jornada (ej: "entre 10 y 18:00" o "de 14 a 20:00" con >= 7 horas)
      if (fin - ini >= 450) return 'Flexible';
      if (ini >= 17 * 60) return 'Vespertino';
      if (ini >= 14 * 60 + 30) return 'Tarde';
      if (ini >= 12 * 60 && fin <= 15 * 60 + 30) return 'Mediodía';
      if (ini < 12 * 60 && fin <= 13 * 60 + 30) return 'Mañana';
      const medio = (ini + fin) / 2;
      if (medio < 12 * 60 + 30) return 'Mañana';
      if (medio < 14 * 60 + 30) return 'Mediodía';
      if (medio < 17 * 60 + 45) return 'Tarde';
      return 'Vespertino';
    }
  }

  // 2. Vespertino real: "después de las 18", "luego de las 18", "a partir de las 18", o cita puntual a las 18/19/20 (NO "antes de las 18" ni "hasta las 18")
  if (
    /\b(despu[eé]s|luego|a\s+partir|cerca)\s+de\s+las\s*(18|19|20|21)\b/.test(com) ||
    /\ba\s+las\s*(18|19|20|21)(\b|:)/.test(com) ||
    (!/\b(antes|hasta)\s+de?\s*(las\s+)?(18|19|20)\b/.test(com) &&
      /(^|\s)(18|19|20):\d{2}/.test(com))
  ) {
    return 'Vespertino';
  }

  // 3. Mención explícita de "por la tarde" / "a la tarde" o "antes de las 18" / "hasta las 18"
  if (
    com.includes('por la tarde') ||
    com.includes('a la tarde') ||
    /\b(a las|cerca de las|tipo|después de las|luego de las)\s+(15|16|17)(\b|:)/.test(com) ||
    /(^|\s)(15|16|17):\d{2}/.test(com)
  ) {
    return 'Tarde';
  }

  // 4. Mañana ("a la mañana", "a las 10", "antes de las 11:30")
  if (
    com.includes('mañana') ||
    /\b(a las|cerca de las|tipo|antes de las|hasta las)\s+(8|9|10|11)(\b|:)/.test(com) ||
    /(^|\s)(8|9|10|11):\d{2}/.test(com)
  ) {
    return 'Mañana';
  }

  // 5. Mediodía ("a las 12/13/14", "mediodía")
  if (
    com.includes('mediodía') ||
    com.includes('mediodia') ||
    /\b(a las|cerca de las|tipo|antes de las|hasta las)\s+(12|13|14)(\b|:)/.test(com) ||
    /(^|\s)(12|13|14):\d{2}/.test(com)
  ) {
    return 'Mediodía';
  }

  if (com.includes('tarde') || /\b(antes de las|hasta las)\s+(16|17|18)\b/.test(com)) {
    return 'Tarde';
  }

  return 'Flexible';
}

/**
 * Geocodifica determinísticamente las intersecciones y alturas conocidas de CABA
 */
export function geocodificarContactoLocal(
  calleOCruce: string,
  barrio: string,
  id: string = ''
): { lat: number; lng: number; exacta: boolean } {
  const limpio = (calleOCruce || '')
    .toLowerCase()
    .replace(/\bsta\.?\s*fe\b/g, 'santa fe')
    .replace(/\bcnel\.?\b/g, 'coronel')
    .replace(/\bgral\.?\b/g, 'general')
    .trim();

  if (limpio) {
    // Ordenar de mayor a menor longitud de match para que "godoy cruz 3268" tenga prioridad sobre "godoy cruz"
    const ordenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
      (a, b) => b.match.length - a.match.length
    );
    for (const item of ordenadas) {
      if (limpio.includes(item.match) || (limpio.length >= 6 && item.match.includes(limpio))) {
        return { lat: item.lat, lng: item.lng, exacta: true };
      }
    }
  }

  // Fallback alrededor del centro del barrio (corregido según dirección si aplica)
  const base = COORDENADAS_BARRIOS_CABA[barrio] || COORDENADAS_BARRIOS_CABA.Palermo;
  const numId = parseInt(String(id).replace(/\D/g, ''), 10) || 1;
  const angle = (numId * 137.5 * Math.PI) / 180;
  const radius = 0.002 + (numId % 7) * 0.0008;
  return {
    lat: Number((base.lat + Math.cos(angle) * radius).toFixed(5)),
    lng: Number((base.lng + Math.sin(angle) * radius).toFixed(5)),
    exacta: Boolean(limpio),
  };
}

/**
 * Resuelve las coordenadas exactas del punto de partida configurado en el perfil
 * a partir de `profile.direccionPartida`, garantizando que si el usuario cambia
 * la dirección de salida (o corrige su altura), el cálculo de tramos use la ubicación real.
 */
export function resolverCoordenadasPartidaPerfil(profile: VoiceProfile): {
  lat: number;
  lng: number;
  direccionMaps: string;
} {
  const dirRaw = (profile.direccionPartida || 'Godoy Cruz 3268, Palermo, CABA').trim();
  const geo = geocodificarContactoLocal(dirRaw, 'Palermo', '0');
  const direccionMaps = /caba|ciudad aut[oó]noma|buenos aires/i.test(dirRaw)
    ? /argentina/i.test(dirRaw)
      ? dirRaw
      : `${dirRaw}, Argentina`
    : `${dirRaw}, CABA, Argentina`;

  if (geo.exacta) {
    return { lat: geo.lat, lng: geo.lng, direccionMaps };
  }
  return {
    lat: profile.latPartida || -34.5738,
    lng: profile.lngPartida || -58.4215,
    direccionMaps,
  };
}

/**
 * Distancia Haversine en metros y estimación realista de caminata en la traza urbana de CABA
 * (alineada con los tiempos reales de Google Maps a pie y cruces de avenidas).
 */
export function distanciaHaversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimarMinutosCaminandoCABA(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { distanciaMetros: number; cuadrasAprox: number; minutosCaminando: number } {
  const lineal = distanciaHaversineMetros(lat1, lng1, lat2, lng2);
  if (lineal < 15) {
    return { distanciaMetros: 0, cuadrasAprox: 0, minutosCaminando: 1 };
  }
  // En CABA (Palermo / Recoleta / Belgrano / Colegiales) la cuadrícula está rotada ~35° respecto del norte
  // (calles SO-NE como Godoy Cruz/Oro y avenidas NO-SE como Santa Fe/Libertador/Córdoba).
  const radLat = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const dy = (lat2 - lat1) * 111320;
  const dx = (lng2 - lng1) * 111320 * Math.cos(radLat);
  const theta = (35 * Math.PI) / 180;
  const du = Math.abs(dx * Math.cos(theta) - dy * Math.sin(theta));
  const dv = Math.abs(dx * Math.sin(theta) + dy * Math.cos(theta));
  const manhattanRotado = du + dv;

  const metrosGrilla =
    lineal <= 320
      ? Math.round(lineal * 1.28)
      : Math.round(Math.max(lineal * 1.28, manhattanRotado * 1.04));
  const cuadrasAprox = Math.max(1, Math.round(metrosGrilla / 100));
  // Velocidad efectiva urbana de Google Maps en CABA (~70 m/min incluyendo semáforos y esquinas)
  const esperaCrucesMin = metrosGrilla > 950 ? 1.5 : metrosGrilla > 450 ? 1 : 0;
  const minutosCaminando = Math.max(
    1,
    Math.round((metrosGrilla / 70 + esperaCrucesMin) * 10) / 10
  );
  return { distanciaMetros: metrosGrilla, cuadrasAprox, minutosCaminando };
}

export const ESTADOS_FLUJO_CATALOGO: {
  value: EstadoFlujo;
  label: string;
  shortLabel: string;
  colorClass: string;
}[] = [
  {
    value: 'SIN_CONTACTAR_1ER_MSJ',
    label: '1. Sin contactar (Enviar 1er mensaje)',
    shortLabel: '1. Enviar 1er msj',
    colorClass: 'bg-amber-100 text-amber-950 border-amber-300',
  },
  {
    value: 'FALTA_NOMBRE_Y_APELLIDO',
    label: '2. Teléfono sin nombre (Pedir nombre y apellido)',
    shortLabel: '2. Pedir nombre y apellido',
    colorClass: 'bg-rose-100 text-rose-950 border-rose-300',
  },
  {
    value: '1ER_MSJ_ENVIADO_SIN_RSP',
    label: '3. 1er mensaje enviado (Sin respuesta aún)',
    shortLabel: '3. 1er msj enviado (Sin rsp)',
    colorClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  {
    value: 'RESPONDIO_FALTA_DNI_O_ZONA',
    label: '4. Respondió Sí — Falta corroborar DNI CABA / zona',
    shortLabel: '4. Respondió Sí (Falta zona/DNI)',
    colorClass: 'bg-orange-100 text-orange-950 border-orange-300',
  },
  {
    value: 'PIDIO_MAS_INFO_ENVIADA',
    label: '5. Pidió más info (5 ejes enviados)',
    shortLabel: '5. Pidió más info',
    colorClass: 'bg-purple-100 text-purple-950 border-purple-300',
  },
  {
    value: 'PREFIERE_CAFE_HUB_O_SEDE',
    label: '6. Prefiere Punto / Café Hub / Sede Chile 1408',
    shortLabel: '6. Prefiere Punto / Café Hub',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  {
    value: 'PASO_DATOS_FALTA_CONFIRMAR',
    label: '7. Pasó día/franja/dirección — Falta confirmar encuentro',
    shortLabel: '7. Pasó datos (Falta confirmar)',
    colorClass: 'bg-sky-100 text-sky-950 border-sky-300',
  },
  {
    value: 'ENCUENTRO_CONFIRMADO',
    label: '8. Encuentro confirmado (En agenda de ruta)',
    shortLabel: '8. Encuentro confirmado',
    colorClass: 'bg-indigo-100 text-indigo-950 border-indigo-300',
  },
  {
    value: 'RECORDATORIO_DIA_ENVIADO',
    label: '9. Recordatorio del día / En camino enviado',
    shortLabel: '9. Recordatorio del día enviado',
    colorClass: 'bg-teal-100 text-teal-950 border-teal-300',
  },
  {
    value: 'YA_ADHIRIO_FIRMA_OK',
    label: '10. ✅ Proceso terminado — Ya adhirió (Listo)',
    shortLabel: '10. ✅ Listo · Ya adhirió',
    colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
  },
  {
    value: 'PENDIENTE_RETIRO_FICHAS',
    label: '11. Adhirió + Retirar fichas extra (X1/X2/X3)',
    shortLabel: '11. Retirar fichas X1/X2/X3',
    colorClass: 'bg-emerald-200 text-emerald-950 border-emerald-400',
  },
  {
    value: 'POSTERGO_SALUD_O_VIAJE',
    label: '12. En pausa temporal (Salud / Viaje)',
    shortLabel: '12. Pausa (Salud/Viaje)',
    colorClass: 'bg-slate-200 text-slate-800 border-slate-300',
  },
  {
    value: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
    label: '13. Sin DNI en CABA (Consultar referidos CABA — Pendiente envío)',
    shortLabel: '13. Sin DNI CABA (Consultar ref.)',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  {
    value: 'DESCARTADO_O_BAJA',
    label: '14. Archivado / Sin DNI CABA ya respondido / Baja',
    shortLabel: '14. Archivado / Ya respondido',
    colorClass: 'bg-red-50 text-red-800 border-red-200',
  },
];

export function obtenerEtiquetaEstadoFlujo(estado: EstadoFlujo): string {
  return (
    ESTADOS_FLUJO_CATALOGO.find((e) => e.value === estado)?.label ||
    '3. 1er mensaje enviado (Sin respuesta aún)'
  );
}

export function parsearTextoAEstadoFlujo(textoRaw: string): EstadoFlujo | undefined {
  const t = String(textoRaw || '').trim();
  if (!t) return undefined;
  const exact = ESTADOS_FLUJO_CATALOGO.find(
    (e) =>
      e.value === t ||
      e.label.toLowerCase() === t.toLowerCase() ||
      e.shortLabel.toLowerCase() === t.toLowerCase()
  );
  if (exact) return exact.value;

  const low = t.toLowerCase();
  if (low.includes('sin nombre') || low.includes('pedir nombre')) return 'FALTA_NOMBRE_Y_APELLIDO';
  if (low.includes('sin contactar') || low.includes('enviar 1er')) return 'SIN_CONTACTAR_1ER_MSJ';
  if (low.includes('recordatorio') || low.includes('en camino')) return 'RECORDATORIO_DIA_ENVIADO';
  if (low.includes('confirmado')) return 'ENCUENTRO_CONFIRMADO';
  if (low.includes('pasó') || low.includes('falta confirmar')) return 'PASO_DATOS_FALTA_CONFIRMAR';
  if (low.includes('punto') || low.includes('café hub') || low.includes('sede'))
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  if (low.includes('más info') || low.includes('mas info')) return 'PIDIO_MAS_INFO_ENVIADA';
  if (low.includes('fichas') || low.includes('x1') || low.includes('x2') || low.includes('x3'))
    return 'PENDIENTE_RETIRO_FICHAS';
  if (
    low.includes('ya adhirió') ||
    low.includes('proceso terminado') ||
    low.includes('firmada') ||
    low.includes('firmó')
  )
    return 'YA_ADHIRIO_FIRMA_OK';
  if (low.includes('salud') || low.includes('viaje') || low.includes('pausa'))
    return 'POSTERGO_SALUD_O_VIAJE';
  if (low.includes('archivado') || low.includes('ya respondido') || low.includes('baja') || low.includes('inválido'))
    return 'DESCARTADO_O_BAJA';
  if (low.includes('sin dni') || low.includes('referidos')) return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  if (low.includes('respondió sí') || low.includes('cambio de chip'))
    return 'RESPONDIO_FALTA_DNI_O_ZONA';
  if (low.includes('sin respuesta')) return '1ER_MSJ_ENVIADO_SIN_RSP';
  return undefined;
}

export const UMBRAL_ID_SIN_PRIMER_CONTACTO = 167;

export function extraerNumeroIdContacto(idRaw: string): number {
  const limpio = String(idRaw || '').trim();
  const digits = limpio.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) || 0;
}

/**
 * Verifica si un contacto YA ADHIRIÓN antes (según Columna F "Adhirió" = "Sí", estado `YA_ADHIRIO_FIRMA_OK`,
 * o nota explícita en Columna G de haber firmado), para garantizar que nunca sea agregado por error
 * a estados activos como "3. Prefiere Punto (Convocar a Café Hub)" ni a listas de envío de mensajes.
 */
export function yaAdhirioAntes(raw: {
  adhirio?: string;
  estadoFlujo?: EstadoFlujo;
  comentario?: string;
}): boolean {
  const adh = (raw.adhirio || '').toLowerCase().trim();
  if (/^(s[ií]|firm[oó]|firmad[oa]|adherid[oa])$/i.test(adh)) return true;
  if (
    raw.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    raw.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
  ) {
    return true;
  }
  const com = (raw.comentario || '').toLowerCase().trim();
  return /\b(ya\s+adhir[ií]o|ya\s+firm[oó]|firm[oó]\s+el\s+\d|adhesi[oó]n\s+firmada|ficha\s+firmada|proceso\s+terminado)\b/i.test(
    com
  );
}

export function esComentarioDescartadoONoCaba(comentario: string, estadoFlujo?: EstadoFlujo): boolean {
  const com = (comentario || '').toLowerCase().trim();
  if (
    estadoFlujo === 'DESCARTADO_O_BAJA' ||
    estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
  ) {
    return true;
  }
  return (
    com.includes('no tiene domicilio en caba') ||
    com.includes('fuera de caba') ||
    com.includes('no vive en caba') ||
    com.includes('extranjero') ||
    com.includes('adhesión digital') ||
    com.includes('vive en ') ||
    com.includes('vive fuera') ||
    com.includes('no existe en whatsapp') ||
    com.includes('número equivocado') ||
    /\bbaja\b/i.test(com)
  );
}

/**
 * Determina si una persona marcada sin DNI en CABA ("No tiene domicilio en CABA", "Vive fuera", etc.)
 * o con baja/teléfono inválido YA FUE RESPONDIDA y por lo tanto debe salir de la lista de pendientes
 * y dejar de ser visible en las colas activas:
 * 1. Si es anterior al #167 y tiene en Columna G "No tiene domicilio en CABA" (o equivalente fuera de CABA)
 *    y en Columna F ("Adhirió") no ha adherido ("No" / "Pendiente"), ya se le respondió históricamente.
 * 2. De aquí en adelante (#167+ o nuevos cambios a `SIN_DNI_CABA_PEDIR_REFERIDOS`), una vez que se envía
 *    el mensaje de consulta de referidos CABA (`referidosCabaYaEnviado === true` o nota `[Referidos CABA consultados — Cerrado]`),
 *    pasa automáticamente a cerrado/archivado y sale de la lista de pendientes.
 */
export function esSinDniCabaYaRespondidoOCerrado(raw: {
  id?: string;
  adhirio?: string;
  comentario?: string;
  estadoFlujo?: EstadoFlujo;
  referidosCabaYaEnviado?: boolean;
}): boolean {
  if (yaAdhirioAntes(raw)) return false;

  const com = (raw.comentario || '').toLowerCase().trim();
  const adh = (raw.adhirio || '').toLowerCase().trim();

  if (
    com.includes('no existe en whatsapp') ||
    com.includes('número equivocado') ||
    /\bbaja\b/i.test(com)
  ) {
    return true;
  }

  if (raw.estadoFlujo === 'DESCARTADO_O_BAJA') {
    return true;
  }

  if (
    raw.referidosCabaYaEnviado === true ||
    /referidos\s+caba\s+consultados|ya\s+respondido|\[cerrado/i.test(com)
  ) {
    return true;
  }

  // Si el usuario acaba de poner explícitamente `referidosCabaYaEnviado: false` para poder enviarle el mensaje por primera vez
  if (raw.referidosCabaYaEnviado === false) {
    return false;
  }

  const tieneComentarioNoCaba =
    com.includes('no tiene domicilio en caba') ||
    com.includes('fuera de caba') ||
    com.includes('no vive en caba') ||
    com.includes('extranjero') ||
    com.includes('adhesión digital') ||
    com.includes('vive en ') ||
    com.includes('vive fuera');

  const numId = extraerNumeroIdContacto(raw.id || '');
  // Regla del usuario: cuando las personas están marcadas como "6. Sin DNI en CABA" y a su vez
  // en la Columna G ("Comentario") tienen "No tiene domicilio en CABA" (o fuera de CABA)
  // y en la Columna F ("Adhirió") es "No" (antes del #167), ya se les respondió y deben salir de pendientes.
  if (
    tieneComentarioNoCaba &&
    adh === 'no' &&
    numId > 0 &&
    numId < UMBRAL_ID_SIN_PRIMER_CONTACTO
  ) {
    return true;
  }

  return false;
}

/**
 * Determina si la Columna "G" ("Comentario") tiene información nueva real cargada sobre el contacto
 * (ignorando notas automáticas de sistema como "Ingresado en Google Sheets", "1er mensaje enviado", "Sin respuesta").
 */
export function tieneNuevaInformacionEnColumnaG(comentario: string): boolean {
  const com = (comentario || '').trim();
  if (!com) return false;
  const sinNotasSistema = com
    .replace(/ingresad[oa] en google sheets[^·;\n]*/gi, '')
    .replace(/tel[eé]fono cargado en google sheets[^·;\n]*/gi, '')
    .replace(/pendiente de 1er contacto/gi, '')
    .replace(/1er\s*(mensaje|msj|contacto)\s*enviado[^·;\n]*/gi, '')
    .replace(/^sin respuesta\.?$/gi, '')
    .replace(/^no contesta\.?$/gi, '')
    .replace(/[—\-·,;:\s]+/g, '')
    .trim();
  return sinNotasSistema.length > 0;
}

/**
 * Determina si una persona NO adherida ya tiene una VISITA CONCRETADA con TODOS los datos necesarios
 * para realizarla (dirección/lugar específico + fecha/día concreto o confirmación explícita).
 */
export function tieneVisitaConcretadaConDatosCompletos(params: {
  adhirio: string;
  comentario: string;
  calleOCruce: string;
  fechasMencionadas: string[];
  estadoFlujo?: EstadoFlujo;
}): boolean {
  if (yaAdhirioAntes(params)) return false;
  if (esComentarioDescartadoONoCaba(params.comentario, params.estadoFlujo)) return false;

  const com = (params.comentario || '').toLowerCase().trim();
  const tieneLugarConcreto =
    Boolean(params.calleOCruce && params.calleOCruce.trim().length > 0) ||
    com.includes('chile 1408') ||
    /visita\s+con[sc]ertada/i.test(com);

  if (!tieneLugarConcreto) return false;

  // Si explícitamente dice "CONFIRMAR Visita" o "por confirmar" y no fue confirmada aún, le falta confirmación
  const pideConfirmarExplicitamente =
    /\b(confirmar\s+visita|visita\s+por\s+confirmar|falta\s+confirmar|esperando\s+confirmaci[oó]n)\b/i.test(
      com
    ) &&
    params.estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
    params.estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO' &&
    !/visita\s+confirmada/i.test(com);

  if (pideConfirmarExplicitamente) return false;

  if (
    params.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    params.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    /visita\s+confirmada|visita\s+con[sc]ertada|va\s+a\s+pasar\s+por\s+chile\s*1408/i.test(com)
  ) {
    return true;
  }

  const tieneDiaDeSemanaExplicito =
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(com) &&
    !/pidi[oó]\s+que\s+le\s+escribiera/i.test(com);

  const tieneFechaConcreta = params.fechasMencionadas.length > 0 || tieneDiaDeSemanaExplicito;

  // Si dice "cualquier día" sin fecha ni día de semana puntual, falta concretar el día exacto
  if (!tieneFechaConcreta) return false;

  return true;
}

/**
 * Determina si un contacto aún NO ha recibido el mensaje de primer contacto.
 * Regla operativa:
 * 1. Todas las personas desde el #167 en adelante (y toda persona nueva que se incluya en Google Sheets)
 *    necesitan un mensaje de primer contacto hasta que se haga clic en el botón de enviar mensaje
 *    (lo cual marca `primerContactoEnviado = true` y pasa su estado a `3. 1er mensaje enviado`).
 * 2. Las personas del #1 al #166 ya fueron contactadas históricamente (salvo que figuren explícitamente como Nuevo).
 */
export function esContactoSinPrimerContacto(raw: RawContactRow): boolean {
  if (yaAdhirioAntes(raw)) return false;
  if (raw.primerContactoEnviado === true) return false;
  if (raw.primerContactoEnviado === false) return true;

  const rsp = (raw.rsp || '').toLowerCase().trim();
  const com = (raw.comentario || '').toLowerCase().trim();

  if (esComentarioDescartadoONoCaba(raw.comentario, raw.estadoFlujo)) return false;
  if (rsp === 'sí' || rsp === 'si') return false;

  if (
    raw.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
    rsp === 'nuevo' ||
    raw.enSheets === false
  ) {
    return true;
  }

  if (
    raw.estadoFlujo &&
    raw.estadoFlujo !== '1ER_MSJ_ENVIADO_SIN_RSP'
  ) {
    return false;
  }

  const numId = extraerNumeroIdContacto(raw.id);
  if (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO) {
    const tieneInfoRealColG = tieneNuevaInformacionEnColumnaG(raw.comentario || '');
    const tieneEvidenciaContactoPrevio =
      tieneInfoRealColG ||
      com.includes('1er mensaje enviado') ||
      com.includes('1er msj enviado') ||
      com.includes('sin respuesta') ||
      com.includes('no contesta') ||
      com.includes('visita ') ||
      com.includes('vive en ') ||
      com.includes('no tiene domicilio') ||
      com.includes('no existe en whatsapp') ||
      com.includes('número equivocado');
    if (!tieneEvidenciaContactoPrevio) {
      return true;
    }
  }

  return false;
}

export function inferirEstadoFlujo(
  raw: RawContactRow,
  sinNombre: boolean,
  calleOCruce: string,
  fechasMencionadas: string[],
  franjaHoraria: FranjaHoraria
): EstadoFlujo {
  const com = (raw.comentario || '').toLowerCase();
  const adh = (raw.adhirio || '').toLowerCase();
  const rsp = (raw.rsp || '').toLowerCase();
  const sinPrimerContacto = esContactoSinPrimerContacto(raw);

  // 1. VERIFICACIÓN PRIORITARIA DE ADHESIÓN PREVIA:
  // Antes de asignar cualquier estado activo (como "Prefiere Punto / Café Hub"), verificar si ya adhirió antes.
  if (yaAdhirioAntes(raw)) {
    if (
      raw.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
      com.includes('buscar fichas') ||
      /x\d/i.test(com)
    ) {
      return 'PENDIENTE_RETIRO_FICHAS';
    }
    return 'YA_ADHIRIO_FIRMA_OK';
  }

  // 2. VERIFICACIÓN DE PERSONAS SIN DNI EN CABA O BAJA QUE YA FUERON RESPONDIDAS:
  // Si es < #167 con "No tiene domicilio en CABA" + Adhirió=No, o si ya se le envió el mensaje de referidos CABA,
  // pasa directamente a DESCARTADO_O_BAJA (Archivado / Ya respondido) para salir de la lista de pendientes.
  if (esSinDniCabaYaRespondidoOCerrado(raw)) {
    return 'DESCARTADO_O_BAJA';
  }

  if (
    com.includes('no tiene domicilio en caba') ||
    com.includes('fuera de caba') ||
    com.includes('no vive en caba') ||
    com.includes('extranjero') ||
    com.includes('adhesión digital')
  ) {
    return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  }
  if (
    com.includes('enferm') ||
    com.includes('salud') ||
    com.includes('vive en ') ||
    com.includes('vive fuera') ||
    com.includes('regresa en ')
  ) {
    if (adh === 'no' || com.includes('vive en ') || com.includes('vive fuera')) {
      return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
    }
    return 'POSTERGO_SALUD_O_VIAJE';
  }

  // Si es un teléfono sin nombre en Google Sheets y aún no se registró envío de 1er contacto
  if (sinNombre && !raw.vocativoOverride?.trim() && raw.primerContactoEnviado !== true) {
    return 'FALTA_NOMBRE_Y_APELLIDO';
  }

  // Si aún NO recibió el primer contacto (#167 en adelante o nuevo ingreso en Sheets)
  if (sinPrimerContacto) {
    return 'SIN_CONTACTAR_1ER_MSJ';
  }

  // Si ya tenía un estado explícito guardado y ya recibió el 1er contacto
  if (raw.estadoFlujo) {
    if (
      (raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
        raw.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ') &&
      raw.primerContactoEnviado === true
    ) {
      return '1ER_MSJ_ENVIADO_SIN_RSP';
    }
    if (raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' && !sinNombre) {
      // Sigue abajo para inferir su estado con nombre
    } else {
      return raw.estadoFlujo;
    }
  }

  if (com.includes('recordatorio enviado') || com.includes('en camino')) {
    return 'RECORDATORIO_DIA_ENVIADO';
  }

  if (
    com.includes('chile 1408') ||
    com.includes('reunión de los miércoles') ||
    com.includes('punto') ||
    com.includes('fds')
  ) {
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  }

  if (com.includes('pidió más info') || com.includes('mas info')) {
    return 'PIDIO_MAS_INFO_ENVIADA';
  }

  const visitaCompleta = tieneVisitaConcretadaConDatosCompletos({
    adhirio: raw.adhirio,
    comentario: raw.comentario,
    calleOCruce,
    fechasMencionadas,
    estadoFlujo: raw.estadoFlujo,
  });

  if (visitaCompleta) {
    return 'ENCUENTRO_CONFIRMADO';
  }

  const tieneAlgunDatoEnColG =
    tieneNuevaInformacionEnColumnaG(raw.comentario) ||
    Boolean(calleOCruce) ||
    fechasMencionadas.length > 0 ||
    franjaHoraria !== 'Flexible';

  if (rsp === 'sí' || rsp === 'si') {
    if (tieneAlgunDatoEnColG) {
      return 'PASO_DATOS_FALTA_CONFIRMAR';
    }
    return 'RESPONDIO_FALTA_DNI_O_ZONA';
  }

  if (tieneAlgunDatoEnColG) {
    return 'PASO_DATOS_FALTA_CONFIRMAR';
  }

  return '1ER_MSJ_ENVIADO_SIN_RSP';
}

export interface OpcionesCafeMensaje {
  incluirCafe?: boolean;
  cafeNombre?: string;
  cafeDireccion?: string;
  cafeLat?: number;
  cafeLng?: number;
  horarioTexto?: string;
  cafeTexto?: string;
  modoSaludo?: ModoSaludoMismoDia;
  ahoraMs?: number;
}

/**
 * Resuelve el café correspondiente a un grupo barrial y formatea la referencia natural
 * incluyendo el nombre del café, su dirección y los minutos aproximados desde el lugar sugerido por la persona.
 */
export function describirCafeConDistanciaDesdeContacto(
  contact: {
    barrio: string;
    calleOCruce?: string;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  opciones?: OpcionesCafeMensaje
): {
  incluirCafe: boolean;
  cafeNombre: string;
  cafeDireccion: string;
  minutosAprox: number;
  fraseCafe: string;
  horarioCafe: string;
} {
  const barrioNorm = (contact.barrio || 'Palermo').trim();
  const geoContacto =
    typeof contact.lat === 'number' && typeof contact.lng === 'number'
      ? { lat: contact.lat, lng: contact.lng }
      : geocodificarContactoLocal(contact.calleOCruce || '', barrioNorm);

  let rawNombre = opciones?.cafeNombre || '';
  let rawDir = opciones?.cafeDireccion || '';
  let cafeLat = opciones?.cafeLat;
  let cafeLng = opciones?.cafeLng;

  if (!rawNombre && opciones?.cafeTexto) {
    const m = opciones.cafeTexto.match(/^([^(]+)(?:\(([^)]+)\))?/);
    if (m) {
      rawNombre = m[1].trim();
      if (m[2]) rawDir = m[2].trim();
    } else {
      rawNombre = opciones.cafeTexto.trim();
    }
  }

  // Buscar coincidencia en el catálogo oficial de cafés CABA para obtener dirección y coordenadas exactas
  const candidatosMismoBarrio = CATALOGO_CAFES_HUB_CABA.filter(
    (cf) => cf.esCaba && cf.barrio.toLowerCase() === barrioNorm.toLowerCase()
  );
  const mejorDelBarrio =
    candidatosMismoBarrio.length > 0
      ? [...candidatosMismoBarrio].sort(
          (a, b) =>
            estimarMinutosCaminandoCABA(geoContacto.lat, geoContacto.lng, a.lat, a.lng)
              .distanciaMetros -
            estimarMinutosCaminandoCABA(geoContacto.lat, geoContacto.lng, b.lat, b.lng)
              .distanciaMetros
        )[0]
      : buscarCafeHubMasCercano(geoContacto.lat, geoContacto.lng);

  if (rawNombre) {
    const matchCat = CATALOGO_CAFES_HUB_CABA.find(
      (cf) =>
        cf.nombre.toLowerCase() === rawNombre.toLowerCase() ||
        rawNombre.toLowerCase().includes(cf.nombre.toLowerCase())
    );
    if (matchCat) {
      if (!rawDir) rawDir = matchCat.direccion.split(',')[0].trim();
      if (cafeLat === undefined) cafeLat = matchCat.lat;
      if (cafeLng === undefined) cafeLng = matchCat.lng;
    }
  } else if (mejorDelBarrio) {
    rawNombre = mejorDelBarrio.nombre;
    rawDir = mejorDelBarrio.direccion.split(',')[0].trim();
    cafeLat = mejorDelBarrio.lat;
    cafeLng = mejorDelBarrio.lng;
  } else if (profile.cafesPorBarrio[barrioNorm]) {
    rawNombre = profile.cafesPorBarrio[barrioNorm].nombre;
    rawDir = profile.cafesPorBarrio[barrioNorm].esquina.split(',')[0].trim();
  }

  const cafeNombre =
    rawNombre.replace(/\s*\([^)]*\)\s*$/, '').split('/')[0].trim() ||
    `Café de ${barrioNorm}`;
  const cafeDireccion =
    rawDir.split(',')[0].trim() ||
    profile.cafesPorBarrio[barrioNorm]?.esquina?.split(',')[0]?.trim() ||
    barrioNorm;

  const coordsBarrio =
    COORDENADAS_BARRIOS_CABA[barrioNorm] || COORDENADAS_BARRIOS_CABA.Palermo;
  const latDest = cafeLat ?? mejorDelBarrio?.lat ?? coordsBarrio.lat;
  const lngDest = cafeLng ?? mejorDelBarrio?.lng ?? coordsBarrio.lng;

  const est = estimarMinutosCaminandoCABA(
    geoContacto.lat,
    geoContacto.lng,
    latDest,
    lngDest
  );
  const minutosAprox = Math.max(2, Math.min(18, Math.round(est.minutosCaminando)));

  const lugarSugerido = (contact.calleOCruce || '').trim();
  const tieneLugarEspecifico =
    Boolean(lugarSugerido) && !/chile\s*1408/i.test(lugarSugerido);

  const fraseCafe = tieneLugarEspecifico
    ? `el café *${cafeNombre}* (${cafeDireccion}, que está a unos ${minutosAprox} minutos de ${lugarSugerido})`
    : `el café *${cafeNombre}* (${cafeDireccion}, a unos ${minutosAprox} minutos dentro de ${barrioNorm})`;

  const horarioCafe =
    opciones?.horarioTexto ||
    profile?.cafesPorBarrio?.[barrioNorm]?.horariosSugeridos ||
    'esta semana por la tarde';

  return {
    incluirCafe: opciones?.incluirCafe ?? true,
    cafeNombre,
    cafeDireccion,
    minutosAprox,
    fraseCafe,
    horarioCafe,
  };
}

/**
 * Genera el mensaje conversacional con la voz de César Rincón (Modo Breve o Modo Completo),
 * evitando redundancias y orientándolo a concretar la adhesión de forma natural en una conversación de WhatsApp.
 * Reglas de estilo:
 * - Sólo dice quién es ("Soy César...") en el primer mensaje (`primer_contacto`) y en el seguimiento si la persona no respondió (`seguimiento_sin_respuesta`).
 * - No termina los mensajes con "¡Un abrazo grande!" ni abusa de los signos de exclamación.
 * - No menciona "Café HUB" como evento: propone pasar/encontrarse en el café [nombre] con su dirección adjunta y los minutos aproximados desde el lugar sugerido por la persona (sólo cuando ese café agrupa a varias personas ya contactadas).
 */
export function generarMensajeContextual(
  contact: {
    sinNombre?: boolean;
    primerNombre: string;
    barrio: string;
    calleOCruce: string;
    comentario: string;
    franjaHoraria: FranjaHoraria;
    fechasMencionadas: string[];
    situacion: SituacionContacto;
    estadoFlujo?: EstadoFlujo;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  plantillaOverride: TipoPlantillaWA = 'auto',
  extra?: OpcionesCafeMensaje
): { tipoUsado: TipoPlantillaWA; asunto: string; texto: string; objetivo: string } {
  const esSinNombre = Boolean(contact.sinNombre) || !contact.primerNombre?.trim();
  const nombre = esSinNombre ? '' : contact.primerNombre.trim();
  const saludoConNombre = esSinNombre ? 'Hola' : `Hola, ${nombre}`;
  const promotor = `${profile.nombrePromotor} ${profile.apellidoPromotor}`.trim();

  const infoCafe = describirCafeConDistanciaDesdeContacto(contact, profile, extra);
  const { incluirCafe, fraseCafe, horarioCafe } = infoCafe;

  const dir = contact.calleOCruce || contact.barrio || 'tu zona';
  const fechaCitada = contact.fechasMencionadas[0] || 'esta semana';

  // Posdata sutil anti-fraude para cuando falta el nombre en cualquier mensaje de seguimiento
  const posdataSutilNombre = esSinNombre
    ? `\n\n_(De paso te hago una consulta cortita: al pasar los teléfonos del formulario a mi planilla me quedó en blanco la casilla de tu nombre; ¿me recordarías tu *nombre y apellido* así te agendo bien en mi celular?)_`
    : '';

  // Determinar qué plantilla aplicar cuando está en 'auto'
  let tipo: TipoPlantillaWA = plantillaOverride;
  if (tipo === 'auto') {
    if (contact.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO') {
      tipo = 'primer_contacto';
    } else if (contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO') {
      tipo = 'en_camino';
    } else if (contact.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR') {
      tipo = 'confirmacion_visita';
    } else {
      switch (contact.situacion) {
        case 'NUEVO_SIN_PRIMER_MENSAJE':
          tipo = 'primer_contacto';
          break;
        case 'SEGUIMIENTO_CAMBIO_CHIP':
          tipo = 'seguimiento_cambio_chip';
          break;
        case 'SEGUIMIENTO_SIN_RESPUESTA':
          tipo = 'seguimiento_sin_respuesta';
          break;
        case 'VISITA_AGENDADA':
          tipo = 'confirmacion_visita';
          break;
        case 'PREFIERE_PUNTO':
          tipo = 'convocatoria_cafe_hub';
          break;
        case 'EVENTO_CHILE_1408':
          tipo = 'confirmacion_visita';
          break;
        case 'PIDIO_MAS_INFO':
          tipo = 'mas_info';
          break;
        case 'SITUACION_SALUD':
          tipo = 'seguimiento_cambio_chip';
          break;
        case 'RETIRO_FICHAS':
          tipo = 'retiro_fichas';
          break;
        case 'YA_ADHIRIO':
          tipo = 'agradecimiento_post_firma';
          break;
        case 'DESCARTADO_NO_CABA':
          tipo = 'no_caba_referidos';
          break;
        default:
          tipo = 'seguimiento_cambio_chip';
      }
    }
  }

  const breve = profile.modoBreve;

  const construirBase = (): {
    tipoUsado: TipoPlantillaWA;
    asunto: string;
    texto: string;
    objetivo: string;
  } => {
    switch (tipo) {
    case 'primer_contacto': {
      // CASO ESPECIAL ESTRATÉGICO: Teléfono en Google Sheets sin nombre registrado
      if (esSinNombre) {
        if (breve) {
          return {
            tipoUsado: 'primer_contacto',
            asunto: '1er Contacto para Teléfono Sin Nombre (Sutil y Anti-Desconfianza)',
            objetivo: 'Dar máxima confianza identificándose primero, aclarar que es adhesión (no afiliación) y consultar sutilmente nombre y apellido.',
            texto: `Hola, muy buen día, ¿cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque dejaste tu contacto en nuestro formulario para apoyarnos a constituir el partido (${profile.partidoLegal}) en CABA —antes que nada, quería darte la tranquilidad de que lo que firmamos es sólo una *adhesión* ciudadana y de ninguna manera es una _afiliación_—.\n\nComo al pasar los datos del formulario a mi planilla me quedó registrado tu número pero salió en blanco la casilla de tu nombre, ¿me dirías tu *nombre y apellido* así te agendo como corresponde? Y contame si esta semana preferís que pase 2 minutos por tu cuadra en ${contact.barrio || 'la zona'} o que nos crucemos en algún café del barrio. Muchas gracias.`,
          };
        }
        return {
          tipoUsado: 'primer_contacto',
          asunto: '1er Contacto Completo para Teléfono Sin Nombre (Sutil y Transparente)',
          objetivo: 'Generar confianza plena, explicar el motivo del mensaje y obtener nombre y apellido para actualizar Google Sheets.',
          texto: `Hola, muy buen día, ¿cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque vimos que dejaste tu teléfono en nuestro formulario para apoyarnos y ayudarnos a reconstruir lo común en CABA. Antes que nada, quiero darte la total tranquilidad de que lo que vamos a firmar es únicamente una *adhesión* para avalar la creación de nuestro partido (${profile.partidoLegal}), y de ninguna manera es una _afiliación_. Es un apoyo inicial que no te compromete a nada.\n\nTe hago una consulta muy cortita: al descargar la planilla del formulario me apareció tu número de WhatsApp pero quedó en blanco la casilla de tu nombre. Para poder agendarte bien acá en mi teléfono y organizar la hoja de ruta por ${contact.barrio || 'el barrio'} sin confundirme, ¿me recordarías tu *nombre y apellido*? Y de paso decime si preferís que pase dos minutos por tu puerta o que nos veamos en algún café de la zona. Muchas gracias.`,
        };
      }

      if (breve) {
        return {
          tipoUsado: 'primer_contacto',
          asunto: 'Primer Contacto (Breve y conversacional)',
          objetivo: 'Lograr primera respuesta aclarando que es adhesión (no afiliación) y ofrecer pasar 2 min.',
          texto: `Hola, ${nombre}, buen día. ¿Cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque completaste el formulario para apoyarnos a reconstruir lo común. Quería darte la tranquilidad de que lo que firmamos es sólo una *adhesión* para avalar la creación del partido (${profile.partidoLegal}) y de ninguna manera es una _afiliación_.\n\nEsta semana voy a estar recorriendo ${contact.barrio || 'la zona'} para juntar las firmas en papel (toma apenas dos minutos). ¿Preferís que pase un ratito por tu casa o que nos encontremos en algún café de ${contact.barrio || 'la zona'}? Muchas gracias.`,
        };
      }
      return {
        tipoUsado: 'primer_contacto',
        asunto: 'Primer Contacto (Completo)',
        objetivo: 'Presentación completa de Hacemos Popurrí y coordinación de firma presencial.',
        texto: `Hola, ${nombre}, buen día. ¿Cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque vimos que completaste el formulario para apoyarnos y ayudarnos a reconstruir lo común. Antes que nada, quiero darte la tranquilidad de que lo que vamos a firmar es únicamente una *adhesión* para avalar la creación de nuestro partido (${profile.partidoLegal}), y de ninguna manera es una _afiliación_. Es un apoyo inicial que no te compromete ni te afilia a nada, e incluso podés firmarlo sin problema aunque hoy estés afiliado/a a otro espacio.\n\nVivo y trabajo por la zona, así que esta semana voy a estar organizándome para hacer la recorrida casa por casa y juntar las firmas en papel (es un trámite que nos toma apenas dos minutos). Vos decime dónde te resulta más cómodo —si preferís que pase por tu casa o que nos encontremos en algún café de la zona—, en qué día y horario, y agendamos. Muchas gracias.`,
      };
    }

    case 'seguimiento_cambio_chip': {
      if (contact.situacion === 'SITUACION_SALUD' || /enferm|salud/i.test(contact.comentario)) {
        return {
          tipoUsado: 'seguimiento_cambio_chip',
          asunto: 'Seguimiento Empático (Salud familiar)',
          objetivo: 'Acompañar sin presionar y dejar abierta la puerta para cuando estén mejor.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito antes que nada para saber cómo siguen en casa de salud y ojalá esté todo mucho mejor.\n\nCero apuro con lo nuestro: cuando estés más aliviada/o y te quede cómodo, avisame y me acerco dos minutos por ${contact.barrio || 'tu casa'} cuando te venga bien.${posdataSutilNombre}`,
        };
      }

      const faltaUbicacionTerritorial =
        !contact.calleOCruce ||
        !(contact as { tienePuntoEncuentroDeterminado?: boolean }).tienePuntoEncuentroDeterminado;

      if (faltaUbicacionTerritorial) {
        const opcionCafeSinDir = incluirCafe
          ? `ver si nos queda cómodo cruzarnos en ${fraseCafe} o que pase 2 minutos por tu puerta`
          : `pasar 2 minutos por tu puerta`;
        if (breve) {
          return {
            tipoUsado: 'seguimiento_cambio_chip',
            asunto: 'Seguimiento Estratégico: Obtener Esquina / Punto de Referencia para Mapa (Breve)',
            objetivo: 'Obtener esquina de referencia o dirección en su barrio + días/franja horaria para ubicarlo en el mapa.',
            texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito para organizarnos con tu firma de adhesión en ${contact.barrio || 'la zona'} (recordá que el domicilio impreso en tu DNI físico debe ser de CABA).\n\nPara sumarte al recorrido de esta semana y ${opcionCafeSinDir}: ¿me pasarías una *esquina de referencia o dirección* en ${contact.barrio || 'el barrio'} y en qué *días y franja horaria* solés estar? Gracias.${posdataSutilNombre}`,
          };
        }

        return {
          tipoUsado: 'seguimiento_cambio_chip',
          asunto: 'Seguimiento Estratégico: Obtener Punto de Encuentro o Referencia Territorial (Completo)',
          objetivo: 'Corroborar DNI en CABA y obtener una esquina, referencia o dirección + franja horaria para geolocalizar en el mapa.',
          texto: `${esSinNombre ? 'Genial, muchas gracias por responder.' : `Buenísimo, ${nombre}.`}\n\nAntes de armar el recorrido de esta semana por ${contact.barrio || 'tu barrio'}, te hago dos consultas cortitas:\n1. ¿La última dirección que figura impresa en el dorso de tu DNI físico es de CABA? (La Justicia Electoral exige que el domicilio del documento sea de Capital).\n2. Para ubicarte en el recorrido y ${opcionCafeSinDir}: ¿me pasarías una *esquina de referencia, cuadra aproximada o dirección* por ${contact.barrio || 'el barrio'}, y en qué *día y franja horaria* te queda más cómodo?\n\nCon esa referencia ya nos organizamos. Además, si en casa hay alguien más con DNI en CABA que quiera adherir, llevo fichas extra.${posdataSutilNombre}`,
        };
      }

      const alternativaCafeConDir = incluirCafe
        ? `, o si preferís que nos encontremos en ${fraseCafe}`
        : '';

      if (breve) {
        return {
          tipoUsado: 'seguimiento_cambio_chip',
          asunto: 'Seguimiento "Cambió el chip" (Ya tiene ubicación)',
          objetivo: 'Confirmar día y horario aprovechando la ubicación ya cargada.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito para dejar coordinada tu firma de adhesión en ${contact.barrio || 'la zona'}. ¿Qué día y franja horaria de esta semana te queda más cómodo que pase 2 minutos por *${dir}*${alternativaCafeConDir}? Gracias.${posdataSutilNombre}`,
        };
      }

      return {
        tipoUsado: 'seguimiento_cambio_chip',
        asunto: 'Seguimiento "Cambió el chip" (Confirmar Horario en su Dirección o Café)',
        objetivo: 'Cerrar día y franja horaria sobre el punto de referencia ya detectado.',
        texto: `${esSinNombre ? 'Buenísimo.' : `Perfecto, ${nombre}.`} Ya te tengo ubicado/a por *${dir}* en ${contact.barrio}.\n\nPara organizar la recorrida de esta semana: ¿en qué *día y franja horaria* te queda más cómodo que pase 2 minutos por *${dir}*${alternativaCafeConDir}? Acordate sólo de tener a mano el DNI físico con domicilio en CABA.${posdataSutilNombre}`,
      };
    }

    case 'seguimiento_sin_respuesta': {
      const mencCafeSinRsp = incluirCafe
        ? `tanto pasando por ${fraseCafe} (${horarioCafe}) como haciendo recorridas rápidas de 2 minutos por domicilio`
        : `haciendo recorridas rápidas de 2 minutos por domicilio`;
      if (breve) {
        return {
          tipoUsado: 'seguimiento_sin_respuesta',
          asunto: 'Seguimiento Suave (+48h sin respuesta al 1er mensaje)',
          objetivo: 'Reactivar contacto identificándose nuevamente porque no respondió al primer mensaje.',
          texto: `${saludoConNombre}, ¿cómo estás? Soy ${profile.nombrePromotor}, de *${profile.espacioPolitico}*.\n\nTe escribo muy cortito para no molestar: como estos días estoy armando el recorrido por ${contact.barrio || 'el barrio'}${incluirCafe ? ` (y también vamos a estar un rato en ${fraseCafe})` : ''}, ¿me dirías qué *esquina de referencia o dirección en ${contact.barrio || 'la zona'}* te queda a mano y en qué horario, así vemos qué opción te resulta más cómoda?\n\nSi esta semana estás complicado/a, avisame sin problema.${posdataSutilNombre}`,
        };
      }
      return {
        tipoUsado: 'seguimiento_sin_respuesta',
        asunto: 'Seguimiento +48h (Obtener Esquina de Referencia Territorial)',
        objetivo: 'Reactivar contacto que no respondió al primer mensaje pidiendo una esquina o proponiendo el café del grupo.',
        texto: `${saludoConNombre}, ¿cómo estás? Espero que estés bien. Soy ${promotor}, de *${profile.espacioPolitico}*.\n\nTe escribo cortito por el mensaje que te dejé hace unos días sobre la firma de adhesión para constituir el partido (${profile.partidoLegal}). Para organizarnos de la forma más práctica para vos en ${contact.barrio}, esta semana vamos a estar ${mencCafeSinRsp}.\n\n¿Me contarías qué *esquina de referencia o dirección de ${contact.barrio}* te queda más cómoda y en qué *días o franja horaria* solés estar? Así coordinamos lo que te quede más a mano. Muchas gracias.${posdataSutilNombre}`,
      };
    }

    case 'confirmacion_visita': {
      if (
        contact.situacion === 'EVENTO_CHILE_1408' ||
        /chile 1408|reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(contact.comentario)
      ) {
        return {
          tipoUsado: 'confirmacion_visita',
          asunto: 'Confirmación Encuentro de los Miércoles en Chile 1408',
          objetivo: 'Confirmar cruce el miércoles en sede central (Chile 1408) y recordar DNI físico.',
          texto: `${saludoConNombre}, ¿cómo estás? Vi que te sumás a la reunión del miércoles en *Chile 1408* (18:30 hs). Yo voy a estar ahí también, así que cuando llegues escribime por acá, nos buscamos y firmamos la ficha en dos minutos (acordate sólo de traer el DNI físico). Nos vemos el miércoles.${posdataSutilNombre}`,
        };
      }

      if (breve) {
        return {
          tipoUsado: 'confirmacion_visita',
          asunto: 'Confirmación de Visita (Breve)',
          objetivo: 'Dejar cerrado el horario/dirección y recordar DNI en mano.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo para dejar confirmado nuestro encuentro (${fechaCitada}) por *${dir}*.\n\nEse día te mando un mensaje unos 10-15 minutos antes de llegar. Cuando nos veamos, acordate por favor de tener el DNI físico a mano (y si en casa hay alguien más con DNI en CABA que quiera firmar, lo sumamos en ese ratito).\n\nNos vemos, muchas gracias.${posdataSutilNombre}`,
        };
      }

      return {
        tipoUsado: 'confirmacion_visita',
        asunto: 'Confirmación de Visita (Completa)',
        objetivo: 'Confirmación detallada con recordatorio de DNI y familiares.',
        texto: `${esSinNombre ? 'Perfecto, muchas gracias.' : `Perfecto, ${nombre}.`} Ya dejamos agendado entonces para el ${fechaCitada} en *${dir}*.\n\nEse día te escribo un ratito antes cuando esté saliendo para allá, unos 10-15 minutos antes de llegar, así te doy tiempo.\n\nPara ese momento sólo te pido tener tu último DNI físico a mano, así copiamos los datos tal cual están impresos (toma apenas dos minutos). Si ahí con vos hay alguien más que tenga domicilio de CABA en el DNI y quiera sumar su firma, también lo hacemos en el momento.\n\nCualquier cosa que te surja de acá a ese día, avisame sin problema.${posdataSutilNombre}`,
      };
    }

    case 'convocatoria_cafe_hub': {
      if (!incluirCafe) {
        return {
          tipoUsado: 'convocatoria_cafe_hub',
          asunto: 'Coordinación de Encuentro en el Barrio',
          objetivo: 'Coordinar pasada rápida de 2 minutos por el punto sugerido.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo para coordinar los 2 minutos de la firma de adhesión por *${dir}*.\n\n¿En qué día y franja horaria de esta semana te queda más cómodo que pase un ratito (acordate sólo de tener el DNI físico con domicilio en CABA)? Gracias.${posdataSutilNombre}`,
        };
      }
      return {
        tipoUsado: 'convocatoria_cafe_hub',
        asunto: 'Propuesta de Encuentro en Café del Barrio',
        objetivo: 'Agrupar firmas de vecinos ya contactados en un café cercano con dirección y tiempo de caminata.',
        texto: `${saludoConNombre}, ¿cómo estás? Como esta semana vamos a vernos con varios vecinos de la zona, quería proponerte encontrarnos unos minutos en ${fraseCafe} durante la franja de *${horarioCafe}* para firmar la ficha de adhesión.\n\nPodés pasar en cualquier momento dentro de esa ventana (toma apenas 2 minutos y sólo hace falta llevar el DNI físico con domicilio en CABA). ¿Te queda cómodo pasar por ahí o preferís que me acerque yo un minuto por *${dir}*?${posdataSutilNombre}`,
      };
    }

    case 'mas_info': {
      if (breve) {
        return {
          tipoUsado: 'mas_info',
          asunto: 'Más Información de Popurrí (Breve y al pie)',
          objetivo: 'Explicar los 5 ejes de Popurrí en CABA y cerrar encuentro de 2 min.',
          texto: `${saludoConNombre}, claro, te cuento un poco más.\n\n*Popurrí* es un espacio nuevo y colectivo con el que buscamos renovar la política desde lo concreto y reconstruir la vida en comunidad. En CABA estamos trabajando en 5 prioridades cotidianas: acceso a la vivienda y alquiler, no perder horas viajando en transporte público, recuperar el encuentro barrial y cultural, apoyar a quienes cuidan a familiares, y sacarle trabas a quienes emprenden y generan trabajo.\n\nPara inscribir legalmente el partido (*${profile.partidoLegal}*), la ley nos pide juntar 4.000 firmas de adhesión en papel (es sólo un aval inicial y no te afilia a nada). Cuando nos crucemos esos 2 minutos para firmar te cuento más —o también podés acercarte a las reuniones de los miércoles en Chile 1408—. ¿Por dónde andás y en qué horario te queda cómodo que nos veamos?${posdataSutilNombre}`,
        };
      }
      return {
        tipoUsado: 'mas_info',
        asunto: 'Más Información de Popurrí (Explicación completa 5 ejes)',
        objetivo: 'Presentar visión humanista, los 5 ejes de CABA y coordinar firma.',
        texto: `${saludoConNombre}, qué bueno que quieras conocer un poco más.\n\nTe cuento brevemente: *Popurrí* es un proyecto colectivo y humanista que nació para reconstruir lo común y volver a hacer que la política funcione. Creemos que antes que el Estado o el mercado está la comunidad, y que la discusión hoy es tener un Estado moderno que resuelva y no estorbe.\n\nEstamos construyendo propuestas concretas a partir de cinco ejes prioritarios para CABA:\n• _Un lugar donde vivir_: que alquilar no sea un privilegio.\n• _Que no pierdas tiempo viajando_: transporte más ágil y confiable.\n• _Recuperar el encuentro_: clubes de barrio, vereda y cultura frente a la soledad.\n• _Poder cuidarnos_: red de apoyo a quienes cuidan hijos, mayores o personas con discapacidad.\n• _Economía de impacto_: menos trabas para emprender y exportar talento.\n\nAhora estamos juntando las firmas de adhesión para constituir el partido (*${profile.partidoLegal}*), que sólo sirven como aval ciudadano y no son una afiliación. ¿Qué día y horario te resulta más cómodo que nos veamos 2 minutos?${posdataSutilNombre}`,
      };
    }

    case 'en_camino': {
      return {
        tipoUsado: 'en_camino',
        asunto: 'Recordatorio del Día / Estoy en Camino (10-15 min antes)',
        objetivo: 'Avisar llegada inminente el día de la visita y recordar DNI físico.',
        texto: `${saludoConNombre}, ¿cómo va? Te aviso que ya estoy en camino para *${dir}*. Calculo estar ahí en unos 10-15 minutos. Cuando bajes, acordate por favor de tener el DNI físico a mano. Nos vemos en un ratito.`,
      };
    }

    case 'llegando': {
      return {
        tipoUsado: 'llegando',
        asunto: 'Estoy Llegando (2 min)',
        objetivo: 'Avisar que ya estás en la esquina/puerta.',
        texto: `${esSinNombre ? 'Hola, ya' : `${nombre}, ya`} estoy llegando, a 2 minutos de *${dir}*. Cuando puedas bajá tranquilo/a que te espero acá.`,
      };
    }

    case 'demorado': {
      return {
        tipoUsado: 'demorado',
        asunto: 'Aviso de Demora (+10 min)',
        objetivo: 'Cuidar el tiempo de la persona si el transporte o parada previa se atrasó.',
        texto: `${esSinNombre ? 'Hola, te' : `${nombre}, te`} aviso que vengo con unos 10 minutos de demora por el transporte, pero ya estoy yendo directo para *${dir}*. Disculpame la demora, nos vemos en un ratito.`,
      };
    }

    case 'retiro_fichas': {
      return {
        tipoUsado: 'retiro_fichas',
        asunto: 'Coordinar Retiro de Fichas Extra (X1/X2/X3)',
        objetivo: 'Retirar fichas firmadas por familiares/amigos en el domicilio.',
        texto: `${saludoConNombre}, ¿cómo estás? Muchas gracias de nuevo por habernos dado una mano juntando fichas.\n\nEsta semana voy a estar recorriendo ${contact.barrio || 'el barrio'} cerca de *${dir}*. ¿Ya tenés listas las fichas para que pase un ratito a retirarlas o qué día te queda más cómodo?`,
      };
    }

    case 'agradecimiento_post_firma': {
      return {
        tipoUsado: 'agradecimiento_post_firma',
        asunto: 'Agradecimiento Post-Firma + Referidos CABA',
        objetivo: 'Cerrar el vínculo con calidez y abrir referidos con DNI en CABA.',
        texto: `${esSinNombre ? 'Hola, quería' : `Hola, ${nombre}. Quería`} escribirte para agradecerte por recibirme y por sumar tu adhesión a *${profile.espacioPolitico}*.\n\nSi en estos días algún familiar, amigo o vecino con DNI en CABA se quiere sumar a firmar, avisame y me acerco en un ratito. Muchas gracias.`,
      };
    }

    case 'no_caba_referidos': {
      return {
        tipoUsado: 'no_caba_referidos',
        asunto: 'Sin DNI en CABA (Pedido amable de referidos)',
        objetivo: 'Agradecer la buena onda y consultar si conoce a alguien con DNI en CABA.',
        texto: `${esSinNombre ? 'Qué lástima.' : `Qué lástima, ${nombre}.`} La Justicia Electoral nos exige que el último domicilio impreso en el DNI físico sea en CABA.\n\nDe todas formas, si conocés a algún amigo, familiar o compañero de trabajo por la zona con DNI en CABA que le interese apoyarnos para constituir el partido (${profile.partidoLegal}), me podés pasar su contacto o darle mi número para que me acerque. Muchas gracias igual por la buena predisposición.`,
      };
    }

    case 'baja_respetuosa': {
      return {
        tipoUsado: 'baja_respetuosa',
        asunto: 'Confirmación de Baja Respetuosa',
        objetivo: 'Dar tranquilidad inmediata de baja definitiva de la lista.',
        texto: `${esSinNombre ? 'No te preocupes.' : `No te preocupes, ${nombre}.`} Te agradezco igual por el tiempo y por avisarme; ya mismo lo dejo anotado acá para no volver a molestarte con este tema. Que tengas muy buen día.`,
      };
    }

    case 'recordatorio_maniana_encuentro': {
      const lugarRec =
        contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' && incluirCafe
          ? fraseCafe
          : `*${dir}*`;
      const resRec = {
        tipoUsado: 'recordatorio_maniana_encuentro' as const,
        asunto: 'Recordatorio a la Mañana antes de Salir (Etapa 6)',
        objetivo: 'Recordar por la mañana que hoy se realiza el encuentro y avisar que le escribirás al estar en camino.',
        texto: `${saludoConNombre}, buen día, ¿cómo estás? Te escribo antes de arrancar el recorrido de hoy por ${contact.barrio || 'la zona'} para recordarte que hoy nos vemos por ${lugarRec} (${fechaCitada}) para los 2 minutos de la firma de adhesión.\n\nTe voy avisando por acá cuando ya esté en camino o a 2 minutos de llegar (acordate por favor de tener a mano el DNI físico con domicilio en CABA). Nos vemos más tarde.${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resRec, contact, tipo, extra);
    }

    case 'esperado_no_estaba_reprogramar': {
      const alternativaCafeNoEstaba = incluirCafe
        ? ` o que nos encontremos unos minutos en ${fraseCafe}`
        : '';
      const resNoEstaba = {
        tipoUsado: 'esperado_no_estaba_reprogramar' as const,
        asunto: 'Esperé un Rato en el Lugar y No Estaba (Reprogramar)',
        objetivo: 'Avisar con amabilidad que estuvimos esperando unos minutos en el punto acordado y proponer reprogramar.',
        texto: `${saludoConNombre}, ¿cómo estás? Recién pasé por *${dir}* y aguardé unos minutos para hacer la firma de adhesión, pero imagino que se te complicó o no llegaste a ver el teléfono.\n\nNo te hagas problema: ¿en qué otro día y franja horaria te queda cómodo que volvamos a coordinar los 2 minutos por *${dir}*${alternativaCafeNoEstaba}?${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resNoEstaba, contact, tipo, extra);
    }

    case 'seguimiento_24h_falta_dato': {
      const faltaDir = !contact.calleOCruce;
      const pedidoPuntual = faltaDir
        ? `una *esquina de referencia o dirección* por ${contact.barrio || 'tu zona'} y en qué *días y franja horaria* te queda más cómodo`
        : `en qué *día y franja horaria* te queda más cómodo que pase 2 minutos por *${dir}*${incluirCafe ? ` (o si preferís acercarte a ${fraseCafe})` : ''}`;
      const res24Dato = {
        tipoUsado: 'seguimiento_24h_falta_dato' as const,
        asunto: 'Seguimiento +24h: Falta Dirección o Franja Horaria',
        objetivo: 'Retomar conversación cuando pasaron 24h sin que la persona comparta dirección o franja horaria.',
        texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito para poder sumarte al recorrido de esta semana por ${contact.barrio || 'el barrio'}: ¿me pasarías ${pedidoPuntual}? Así ya lo dejo organizado (son 2 minutos con DNI físico de CABA). Gracias.${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(res24Dato, contact, tipo, extra);
    }

    case 'seguimiento_24h_falta_confirmar': {
      const lugarProp = contact.calleOCruce
        ? `pasar 2 minutos por *${contact.calleOCruce}*${incluirCafe ? ` o vernos en ${fraseCafe}` : ''}`
        : incluirCafe
        ? `encontrarnos 2 minutos en ${fraseCafe}`
        : `pasar 2 minutos por *${dir}*`;
      const res24Conf = {
        tipoUsado: 'seguimiento_24h_falta_confirmar' as const,
        asunto: 'Seguimiento +24h: Falta Confirmar Propuesta de Encuentro',
        objetivo: 'Confirmar si a la persona le queda bien el día/franja propuestos hace más de 24 horas.',
        texto: `${saludoConNombre}, ¿cómo va? Te consulto cortito por la propuesta que te dejé ayer para ${lugarProp} (${fechaCitada}): ¿me confirmás si te viene bien ese horario o si preferís que lo pasemos a otro día/franja? Gracias.${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(res24Conf, contact, tipo, extra);
    }

    case 'baja_amable_sin_respuesta': {
      const resBajaAmable = {
        tipoUsado: 'baja_amable_sin_respuesta' as const,
        asunto: 'Último Mensaje Amable: Baja de la Base para No Molestar',
        objetivo: 'Cerrar el seguimiento con total respeto avisando que damos de baja el número para no incomodar.',
        texto: `${saludoConNombre}, ¿cómo estás? Como te escribí un par de veces por la firma de adhesión de *${profile.espacioPolitico}* y no quiero ser pesado ni molestarte, te doy de baja de mi listado de recorridas así no te siguen llegando mensajes.\n\nSi en algún momento más adelante tenés un ratito y querés sumar tu firma en CABA, escribime por acá con total confianza. Muchas gracias igual y que tengas muy buena semana.`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resBajaAmable, contact, tipo, extra);
    }

    case 'disculpas_y_reprogramacion': {
      const lugarSugerido = contact.calleOCruce
        ? `pasar 2 minutos por *${contact.calleOCruce}* (${contact.barrio})`
        : incluirCafe
        ? `encontrarnos 2 minutos en ${fraseCafe}`
        : `pasar 2 minutos por tu cuadra en ${contact.barrio}`;
      const alternativaCafe =
        contact.calleOCruce && incluirCafe
          ? `, o bien encontrarnos unos minutos en ${fraseCafe}`
          : '';
      const resDisc = {
        tipoUsado: 'disculpas_y_reprogramacion' as const,
        asunto: 'Disculpas por Compromiso Pendiente + Propuesta para Reprogramar',
        objetivo: 'Asumir la responsabilidad por no haber podido cumplir con el compromiso previsto y proponer reprogramarlo con naturalidad.',
        texto: `${saludoConNombre}, ¿cómo estás? Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${dir}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para los próximos días en ${contact.barrio || 'el barrio'}, pudiendo ${lugarSugerido}${alternativaCafe}. ¿Qué día y franja horaria te queda más cómodo?${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resDisc, contact, tipo, extra);
    }

    case 'propuesta_bloque_agenda':
    default: {
      const lugarPropuesta = contact.calleOCruce
        ? `pasar 2 minutos por *${contact.calleOCruce}* (${contact.barrio})${
            incluirCafe ? ` o encontrarnos en ${fraseCafe}` : ''
          }`
        : incluirCafe
        ? `encontrarnos 2 minutos en ${fraseCafe}`
        : `pasar 2 minutos por tu cuadra en *${contact.barrio || 'el barrio'}*`;
      const resProp = {
        tipoUsado: 'propuesta_bloque_agenda' as const,
        asunto: 'Propuesta de Encuentro de Agenda + Pedido de Confirmación',
        objetivo: 'Compartir propuesta concreta de lugar/horario y pedir confirmación para consolidar la agenda diaria.',
        texto: `${saludoConNombre}, ¿cómo estás? Estoy cerrando el recorrido por *${contact.barrio || 'el barrio'}* y quería proponerte ${lugarPropuesta} para sumar tu firma de adhesión en papel (acordate sólo de tener el DNI físico de CABA a mano).\n\n¿Me confirmás si te queda bien o en qué horario te resulta más cómodo?${posdataSutilNombre}`,
      };
      return resProp;
    }
    }
  };

  return postProcesarMensajeAntiPelonesYSaludo(construirBase(), contact, tipo, extra);
}

const DIAS_SEMANA_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const DIAS_SEMANA_MINUSCULA_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/**
 * Validador "Anti-Pelones" de Fechas:
 * Detecta en cualquier mensaje expresiones del tipo "<día_de_la_semana> <dd>/<mm>" (ej. "miércoles 23/10" o "Jueves 21/10")
 * y verifica contra el calendario real (por defecto 2026) qué día de la semana cae realmente esa fecha.
 * Si el día de la semana no coincide con la fecha (ej. dice "miércoles 23/10" cuando el 23/10/2026 es viernes),
 * lo corrige automáticamente a "viernes 23/10" conservando mayúsculas/minúsculas.
 */
export function corregirPelonesDiaSemanaEnTexto(
  texto: string,
  anioDefault: number = 2026
): string {
  if (!texto) return texto;
  const regexDiaFecha =
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(\s+(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)\b/gi;

  return texto.replace(
    regexDiaFecha,
    (matchCompleto, diaEscrito: string, sufijoFecha: string, ddStr: string, mmStr: string, yyStr?: string) => {
      const day = parseInt(ddStr, 10);
      const month = parseInt(mmStr, 10);
      if (!Number.isFinite(day) || !Number.isFinite(month) || month < 1 || month > 12 || day < 1 || day > 31) {
        return matchCompleto;
      }
      let year = anioDefault;
      if (yyStr) {
        const parsedY = parseInt(yyStr, 10);
        if (Number.isFinite(parsedY)) {
          year = parsedY < 100 ? 2000 + parsedY : parsedY;
        }
      }
      const fechaUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (
        fechaUTC.getUTCFullYear() !== year ||
        fechaUTC.getUTCMonth() !== month - 1 ||
        fechaUTC.getUTCDate() !== day
      ) {
        return matchCompleto;
      }
      const dow = fechaUTC.getUTCDay();
      const empiezaMayus =
        diaEscrito.charAt(0) === diaEscrito.charAt(0).toUpperCase() &&
        diaEscrito.charAt(0) !== diaEscrito.charAt(0).toLowerCase();
      const todoMayus = diaEscrito === diaEscrito.toUpperCase() && diaEscrito.length > 1;
      const diaReal = todoMayus
        ? DIAS_SEMANA_ES[dow].toUpperCase()
        : empiezaMayus
        ? DIAS_SEMANA_ES[dow]
        : DIAS_SEMANA_MINUSCULA_ES[dow];
      return `${diaReal}${sufijoFecha}`;
    }
  );
}

/**
 * Determina si ya se le envió un mensaje a esta persona en el día de hoy (en horario de Buenos Aires),
 * en función de las marcas temporales (`ultimoMensajeCorteEnviadoAt`, `ultimoContacto`, `enviadoEnSesion` o sello en comentario).
 */
export function yaSeHabloConContactoHoy(
  contact: {
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  ahoraMs: number = Date.now()
): boolean {
  if (!contact) return false;
  if (contact.enviadoEnSesion === true) return true;
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  if (contact.ultimoContacto && contact.ultimoContacto.startsWith(hoyBA.isoDate)) {
    return true;
  }
  if (contact.ultimoMensajeCorteEnviadoAt) {
    const msEnvio = Date.parse(contact.ultimoMensajeCorteEnviadoAt);
    if (Number.isFinite(msEnvio)) {
      const envioBA = obtenerPartesFechaHoraBA(msEnvio);
      if (envioBA.isoDate === hoyBA.isoDate) return true;
    } else if (contact.ultimoMensajeCorteEnviadoAt.startsWith(hoyBA.isoDate)) {
      return true;
    }
  }
  const com = contact.comentario || '';
  if (
    com.includes(`Corte ${hoyBA.ddmm}`) ||
    com.includes(`auto enviado ${hoyBA.ddmm}`) ||
    com.includes(`Enviado ${hoyBA.ddmm}`)
  ) {
    return true;
  }
  return false;
}

/**
 * Si ya se habló con la persona en el mismo día (o si el usuario elige `SIN_SALUDO`),
 * elimina el saludo repetitivo de apertura ("Hola, Nombre, ¿cómo estás?", "Hola, buen día, ¿cómo te va?", etc.)
 * para que el mensaje continúe la conversación del día de manera fluida y humana.
 */
export function aplicarReglaSaludoMismoDia(
  texto: string,
  contact: {
    primerNombre?: string;
    sinNombre?: boolean;
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  modoSaludo: ModoSaludoMismoDia = 'AUTO_MISMO_DIA',
  ahoraMs: number = Date.now()
): string {
  const textoCorregido = corregirPelonesDiaSemanaEnTexto(texto);
  if (modoSaludo === 'SIEMPRE_SALUDAR') return textoCorregido;

  const debeOmitirSaludo =
    modoSaludo === 'SIN_SALUDO' ||
    (modoSaludo === 'AUTO_MISMO_DIA' && yaSeHabloConContactoHoy(contact, ahoraMs));

  if (!debeOmitirSaludo) return textoCorregido;

  let limpio = textoCorregido.trim();

  // Quitar encabezados de saludo iniciales como:
  // "Hola, Nombre, buen día, ¿cómo estás? ", "Hola, Nombre, ¿cómo estás? ", "Hola, ¿cómo va? ", "Buen día, Nombre. ¿Cómo te va? "
  const patronesSaludoInicial = [
    /^¡?(?:hola|buen\s+d[ií]a|buenas(?:\s+tardes|\s+noches)?|qu[eé]\s+tal)[^.!?\n]*[.!?]\s*(?:¿\s*(?:c[oó]mo\s+(?:est[aá]s|te\s+va|va(?:\s+todo)?|and[aá]s)|todo\s+bien|qu[eé]\s+tal)[^?\n]*\?\s*)?(?:espero\s+que\s+(?:est[eé]s\s+)?(?:muy\s+)?bien\.?\s*)?/i,
    /^¿\s*(?:qu[eé]\s+tal|c[oó]mo\s+(?:est[aá]s|and[aá]s|va\s+todo))[^?\n]*\?\s*(?:¿[^?\n]*\?\s*)?/i,
    /^hola(?:,\s*[^\s,.!?]+)?,\s*(?:quer[ií]a\s+escribirte|ya\s+estoy|te\s+aviso|claro)/i,
  ];

  if (/^hola(?:,\s*[^\s,.!?]+)?[.,]\s*(?:quer[ií]a|ya\s+estoy|te\s+aviso|claro)/i.test(limpio)) {
    limpio = limpio.replace(/^hola(?:,\s*[^\s,.!?]+)?[.,]\s*/i, '');
  } else {
    for (const regex of patronesSaludoInicial) {
      if (regex.test(limpio)) {
        limpio = limpio.replace(regex, '').trim();
        break;
      }
    }
  }

  if (!limpio) return textoCorregido;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function postProcesarMensajeAntiPelonesYSaludo(
  res: { tipoUsado: TipoPlantillaWA; asunto: string; texto: string; objetivo: string },
  contact: {
    primerNombre?: string;
    sinNombre?: boolean;
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  tipo: TipoPlantillaWA,
  extra?: OpcionesCafeMensaje
): { tipoUsado: TipoPlantillaWA; asunto: string; texto: string; objetivo: string } {
  const modo = extra?.modoSaludo ?? (tipo === 'primer_contacto' ? 'SIEMPRE_SALUDAR' : 'AUTO_MISMO_DIA');
  return {
    ...res,
    texto: aplicarReglaSaludoMismoDia(res.texto, contact, modo, extra?.ahoraMs),
  };
}

/**
 * Obtiene determinísticamente la fecha y hora en huso horario de Buenos Aires (UTC-3)
 * a partir de cualquier timestamp `ms`.
 */
export function obtenerPartesFechaHoraBA(ms: number = Date.now()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
  nombreDia: string;
  ddmm: string;
  isoDate: string;
  hhmm: string;
  etiquetaCompleta: string;
} {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  // Argentina es permanentemente UTC-3
  const dBA = new Date(safeMs - 3 * 3600 * 1000);
  const year = dBA.getUTCFullYear();
  const month = dBA.getUTCMonth() + 1;
  const day = dBA.getUTCDate();
  const hour = dBA.getUTCHours();
  const minute = dBA.getUTCMinutes();
  const dayOfWeek = dBA.getUTCDay();
  const nombreDia = DIAS_SEMANA_ES[dayOfWeek] || 'Hoy';
  const ddmm = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek,
    nombreDia,
    ddmm,
    isoDate,
    hhmm,
    etiquetaCompleta: `${nombreDia} ${ddmm} · ${hhmm} hs`,
  };
}

export function sumarDiasAFechaBA(baseMs: number, diasOffset: number) {
  return obtenerPartesFechaHoraBA(baseMs + diasOffset * 86400 * 1000);
}

/**
 * Compara una fecha corta 'dd/MM' (ej: '16/10', '20/10') contra la fecha actual en Buenos Aires.
 * Devuelve < 0 si ya pasó (día anterior), 0 si es HOY, > 0 si es una fecha futura.
 */
export function compararFechaDDMMConHoyBA(
  ddmm: string,
  hoyBA: { year: number; month: number; day: number }
): number {
  const m = (ddmm || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return 1;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (!Number.isFinite(dia) || !Number.isFinite(mes)) return 1;
  const valFecha = mes * 100 + dia;
  const valHoy = hoyBA.month * 100 + hoyBA.day;
  return valFecha - valHoy;
}

/**
 * Determina si un contacto NO adherido ya tiene un punto de encuentro, dirección, esquina,
 * sede o lugar determinado en Google Sheets o en la sección "1. Contacto y Respuestas".
 */
export function tienePuntoEncuentroODireccionDeterminada(input: {
  adhirio?: string;
  estadoFlujo?: EstadoFlujo;
  situacion?: SituacionContacto;
  calleOCruce?: string;
  tieneDireccionRealEnComentario?: boolean;
  comentario?: string;
}): boolean {
  const adh = (input.adhirio || '').toLowerCase();
  if (adh === 'sí' || adh === 'si') return false;
  if (
    input.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    input.estadoFlujo === 'DESCARTADO_O_BAJA' ||
    input.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    input.situacion === 'YA_ADHIRIO' ||
    input.situacion === 'DESCARTADO_NO_CABA'
  ) {
    return false;
  }

  if (input.tieneDireccionRealEnComentario || (input.calleOCruce && input.calleOCruce.trim().length > 0)) {
    return true;
  }

  if (
    input.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
    input.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    input.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    input.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    input.situacion === 'VISITA_AGENDADA' ||
    input.situacion === 'PREFIERE_PUNTO' ||
    input.situacion === 'EVENTO_CHILE_1408'
  ) {
    return true;
  }

  const com = (input.comentario || '').toLowerCase();
  return /\b(chile\s*1408|caf[eé]\s*hub|punto\s*de\s*encuentro|sede|plaza|pza\.|estaci[oó]n|parque|pqe\.|reuni[oó]n\s*de\s*los\s*mi[eé]rcoles|visita)\b/i.test(
    com
  );
}

/**
 * Extrae si la celda de la Columna "G" ("Comentario") contiene una hora o ventana horaria explícita
 * y devuelve el minuto del día (0..1439) en que vence dicha hora/franja.
 */
export function extraerHoraVencimientoEnColumnaG(
  comentario: string,
  franjaHoraria: FranjaHoraria
): { tieneHoraEnCelda: boolean; minutosFin: number; etiquetaHora: string } {
  const com = limpiarFechasDeTextoParaHorario(comentario || '').toLowerCase();

  // 1. Hora puntual explícita con prefijo ("a las 10", "cerca de las 17:30", "alrededor de las 15", "tipo 16 hs")
  // Se evalúa primero para que una cita puntual (ej. Laura 10:00 hs) nunca sea eclipsada por un rango secundario.
  const mPuntualPrefijo = com.match(
    /\b(?:a\s+las\s+|cerca\s+de\s+las\s+|alrededor\s+de\s+las\s+|tipo\s+)(\d{1,2})(?::(\d{2}))?(?!\s*\/)(?:\s*hs|\s*h)?\b/i
  );
  if (mPuntualPrefijo) {
    const h = parseInt(mPuntualPrefijo[1], 10);
    const min = mPuntualPrefijo[2] ? parseInt(mPuntualPrefijo[2], 10) : 0;
    if (Number.isFinite(h) && h >= 6 && h <= 23) {
      return {
        tieneHoraEnCelda: true,
        minutosFin: Math.min(23 * 60 + 59, h * 60 + min + 5),
        etiquetaHora: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 2. "antes de las 11:30 y 12:00", "antes de las 18", "hasta las 16"
  const mAntesRango = com.match(
    /\b(?:antes\s+de\s+(?:las\s+)?|hasta\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?(?:\s*(?:y|o|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?)?\b/i
  );
  if (mAntesRango) {
    const h1 = parseInt(mAntesRango[1], 10);
    const min1 = mAntesRango[2] ? parseInt(mAntesRango[2], 10) : 0;
    const h2 = mAntesRango[3] ? parseInt(mAntesRango[3], 10) : h1;
    const min2 = mAntesRango[4] ? parseInt(mAntesRango[4], 10) : mAntesRango[3] ? 0 : min1;
    if (Number.isFinite(h1) && h1 >= 7 && h1 <= 23 && h2 >= h1 && h2 <= 23) {
      const etiq = mAntesRango[3]
        ? `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} y ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`
        : `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} hs`;
      return {
        tieneHoraEnCelda: true,
        minutosFin: h1 * 60 + min1,
        etiquetaHora: etiq,
      };
    }
  }

  // 3. Rango explícito: "entre (las) 15 y (las) 18", "entre 15:30 y 17:30", "de 13 a 15", "10 a 13 hs"
  const mRango = com.match(
    /\b(?:(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:y|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?|(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h))\b/i
  );
  if (mRango) {
    const h1 = parseInt(mRango[1] || mRango[5], 10);
    const min1 = (mRango[2] || mRango[6]) ? parseInt(mRango[2] || mRango[6], 10) : 0;
    const h2 = parseInt(mRango[3] || mRango[7], 10);
    const min2 = (mRango[4] || mRango[8]) ? parseInt(mRango[4] || mRango[8], 10) : 0;
    if (Number.isFinite(h2) && h2 >= 6 && h2 <= 23 && h1 >= 6 && h2 >= h1) {
      return {
        tieneHoraEnCelda: true,
        minutosFin: h2 * 60 + min2,
        etiquetaHora: `${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} a ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`,
      };
    }
  }

  // 4. "después de las 15", "luego de las 18:00", "a partir de las 16"
  const mDespues = com.match(
    /\b(?:despu[eé]s\s+de\s+las|luego\s+de\s+las|a\s+partir\s+de\s+las|desde\s+las)\s+(\d{1,2})(?::(\d{2}))?(?!\s*\/)\s*(?:hs|h)?\b/i
  );
  if (mDespues) {
    const h = parseInt(mDespues[1], 10);
    const min = mDespues[2] ? parseInt(mDespues[2], 10) : 0;
    if (Number.isFinite(h) && h >= 0 && h <= 23) {
      const fin = Math.min(22 * 60, Math.max((h + 2) * 60 + min, 18 * 60));
      return {
        tieneHoraEnCelda: true,
        minutosFin: fin,
        etiquetaHora: `después de las ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 5. Hora puntual directa: "16hs", "15:30 hs", "10:00"
  const mPuntualDirecta = com.match(
    /\b(\d{1,2}):(\d{2})\s*(?:hs|h)?\b|\b(\d{1,2})\s*(?:hs|horas|h)\b/i
  );
  if (mPuntualDirecta) {
    const hRaw = mPuntualDirecta[1] || mPuntualDirecta[3];
    const minRaw = mPuntualDirecta[2] || '0';
    const h = parseInt(hRaw, 10);
    const min = parseInt(minRaw, 10);
    if (Number.isFinite(h) && h >= 6 && h <= 23) {
      return {
        tieneHoraEnCelda: true,
        minutosFin: Math.min(23 * 60 + 59, h * 60 + min + 5),
        etiquetaHora: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 6. Franja horaria o mención explícita en la celda ("mañana", "mediodía", "tarde", "noche", "cualquier hora")
  if (/\b(cualquier\s+hora|todo\s+el\s+d[ií]a)\b/i.test(com)) {
    return {
      tieneHoraEnCelda: true,
      minutosFin: 19 * 60 + 30,
      etiquetaHora: 'cualquier hora',
    };
  }

  if (
    /\b(ma[ñn]ana|mediod[ií]a|tarde|noche|vespertin[oa])\b/i.test(com) ||
    franjaHoraria !== 'Flexible'
  ) {
    const horaFin =
      franjaHoraria === 'Mañana'
        ? 12 * 60 + 45
        : franjaHoraria === 'Mediodía'
        ? 14 * 60 + 45
        : franjaHoraria === 'Tarde'
        ? 18 * 60 + 15
        : 20 * 60 + 30;
    return {
      tieneHoraEnCelda: true,
      minutosFin: horaFin,
      etiquetaHora: franjaHoraria,
    };
  }

  return {
    tieneHoraEnCelda: false,
    minutosFin: 20 * 60,
    etiquetaHora: '',
  };
}

/**
 * Detecta si un contacto califica como "Atención Prioritaria · Pendientes de Fecha / Hora Anterior":
 * REGLA ESTRICTA DEL USUARIO:
 * Un contacto SÓLO se considera "Atención Prioritaria · Pendientes de Fecha / Hora Anterior"
 * (Visitas sin confirmar, encuentros vencidos sin pasar a "Ya adhirió" o vecinos pendientes de recibir en Café HUB)
 * SI Y SÓLO SI:
 * 1) Tenía la INFORMACIÓN COMPLETA en la columna "G" ("Comentario"):
 *    - Dirección / esquina / punto de encuentro determinado en la celda, Y
 *    - Día / Fecha concreta en la celda (`fechasMencionadas.length > 0`), Y
 *    - Hora o franja horaria explícita en la celda (`tieneHoraEnCelda === true`, o día anterior ya concluido), Y
 * 2) YA PASÓ TANTO EL DÍA COMO LA HORA contenidos en la celda de ese usuario/persona en la Columna G
 *    respecto de la fecha y hora actual (`ahoraMs`), Y
 * 3) Aún no figura como "Adhirió: Sí".
 */
export function detectarAlertaPendienteVencido(
  params: {
    sinNombre: boolean;
    primerNombre: string;
    barrio: string;
    calleOCruce: string;
    comentario: string;
    franjaHoraria: FranjaHoraria;
    fechasMencionadas: string[];
    situacion: SituacionContacto;
    estadoFlujo: EstadoFlujo;
    adhirio: string;
    horasDesdeUltimoContacto: number;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  opcionesCafe?: OpcionesCafeMensaje
): AlertaPendienteVencido | undefined {
  const adh = (params.adhirio || '').toLowerCase().trim();
  if (
    adh === 'sí' ||
    adh === 'si' ||
    params.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    params.estadoFlujo === 'DESCARTADO_O_BAJA' ||
    params.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    params.situacion === 'YA_ADHIRIO' ||
    params.situacion === 'DESCARTADO_NO_CABA' ||
    params.situacion === 'NUEVO_SIN_PRIMER_MENSAJE'
  ) {
    return undefined;
  }

  const comLower = (params.comentario || '').toLowerCase().trim();
  if (!comLower) return undefined;

  // 1. Verificar que tenga LUGAR / DIRECCIÓN / PUNTO en la celda de Columna G
  const tieneLugarEnColG =
    Boolean(params.calleOCruce && params.calleOCruce.trim().length > 0) ||
    /\b(chile\s*1408|caf[eé]\s*hub|plaza|pza\.|parque|pqe\.|estaci[oó]n|sede)\b/i.test(comLower);

  // 2. Verificar que tenga FECHA (día) en la celda de Columna G
  const tieneFechaEnColG = params.fechasMencionadas.length > 0;
  if (!tieneLugarEnColG || !tieneFechaEnColG) {
    return undefined;
  }

  // 3. Verificar que tenga HORA / FRANJA HORARIA en la celda de Columna G
  const infoHoraColG = extraerHoraVencimientoEnColumnaG(params.comentario, params.franjaHoraria);

  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;

  // Si ninguna fecha es anterior a hoy y tampoco tiene hora en celda para hoy, no se puede dar por vencido hoy
  const tieneAlgunaFechaAnteriorAHoy = params.fechasMencionadas.some(
    (f) => compararFechaDDMMConHoyBA(f, hoyBA) < 0
  );
  if (!infoHoraColG.tieneHoraEnCelda && !tieneAlgunaFechaAnteriorAHoy) {
    return undefined;
  }

  // Evaluar si YA PASÓ el día y la hora contenidos en la celda de Columna G
  let fechaVencidaDetectada: string | undefined;
  let tieneFechaHoraHoyOFuturaVigente = false;

  for (const f of params.fechasMencionadas) {
    const cmp = compararFechaDDMMConHoyBA(f, hoyBA);
    if (cmp < 0) {
      // El día contenido en la celda es anterior a hoy -> ya pasaron tanto el día como la hora
      if (!fechaVencidaDetectada) {
        const etiqH = infoHoraColG.etiquetaHora || 'jornada vencida';
        fechaVencidaDetectada = `${f} (${etiqH})`;
      }
    } else if (cmp === 0) {
      // El día es HOY -> verificar si ya pasó la hora contenida en la celda
      if (infoHoraColG.tieneHoraEnCelda && minutosActualesBA >= infoHoraColG.minutosFin) {
        fechaVencidaDetectada = `${f} (${infoHoraColG.etiquetaHora})`;
      } else {
        tieneFechaHoraHoyOFuturaVigente = true;
      }
    } else {
      tieneFechaHoraHoyOFuturaVigente = true;
    }
  }

  if (!fechaVencidaDetectada) {
    return undefined;
  }
  if (tieneFechaHoraHoyOFuturaVigente && !tieneAlgunaFechaAnteriorAHoy) {
    return undefined;
  }

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: params.barrio,
      calleOCruce: params.calleOCruce,
      lat: params.lat,
      lng: params.lng,
    },
    profile,
    opcionesCafe
  );
  const { incluirCafe, cafeNombre, cafeDireccion, fraseCafe } = infoCafe;
  const lugarRef = params.calleOCruce || cafeNombre;

  let tipoAlerta: TipoAlertaPendienteVencido;
  let titulo = '';
  let motivo = '';

  if (/confirmar\s+visita|visita\s+por\s+confirmar|falta\s+confirmar/i.test(comLower)) {
    tipoAlerta = 'VISITA_SIN_CONFIRMAR_A_TIEMPO';
    titulo = `Visita sin confirmar vencida (${fechaVencidaDetectada}) en ${lugarRef}`;
    motivo = `Tenía información completa en Columna G (${lugarRef} · ${fechaVencidaDetectada}), pero ya pasó el día y la hora sin confirmarse ni cambiar a "Ya adhirió".`;
  } else if (
    params.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    params.situacion === 'PREFIERE_PUNTO' ||
    params.situacion === 'EVENTO_CHILE_1408' ||
    /caf[eé]\s*hub|punto|chile\s*1408/i.test(comLower)
  ) {
    tipoAlerta = 'NO_RECIBIDO_EN_CAFE_HUB_O_SEDE';
    titulo = `Encuentro en punto/café vencido (${fechaVencidaDetectada}) — Sin cambio a "Ya adhirió"`;
    motivo = `Tenía encuentro pactado en Columna G para el ${fechaVencidaDetectada} en ${lugarRef} y ya pasó el día y la hora sin pasar a "Ya adhirió".`;
  } else {
    tipoAlerta = 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION';
    titulo = `Encuentro / Visita vencida (${fechaVencidaDetectada}) sin cambio a "Ya adhirió"`;
    motivo = `Tenía dirección (${lugarRef}) y fecha/hora completa en Columna G (${fechaVencidaDetectada}), y ya pasó el día y la hora sin que cambiara a "Adhirió: Sí".`;
  }

  const saludo = params.sinNombre ? 'Hola' : `Hola, ${params.primerNombre}`;
  const posdataNombre = params.sinNombre
    ? `\n\n_(De paso: como en la planilla me quedó en blanco tu nombre, ¿me recordarías tu *nombre y apellido* para agendarte bien?)_`
    : '';

  const propuestaReprogramacion = params.calleOCruce
    ? `Reprogramar pasada Puerta a Puerta por ${params.calleOCruce} (${params.barrio}) para mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}${
        incluirCafe ? ` o en ${cafeNombre} (${cafeDireccion})` : ''
      }`
    : `Reprogramar encuentro en ${
        incluirCafe ? `${cafeNombre} (${cafeDireccion}) o ` : ''
      }domicilio en ${params.barrio} mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}`;

  const altCafeTexto = incluirCafe
    ? `, o bien encontrarnos unos minutos en ${fraseCafe}`
    : '';

  const mensajeDisculpasReprogramacion =
    tipoAlerta === 'NO_RECIBIDO_EN_CAFE_HUB_O_SEDE'
      ? `${saludo}, ¿cómo estás? Te pido disculpas porque no pude cumplir con nuestro compromiso de encontrarnos en *${lugarRef}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo entre mañana (*${manianaBA.nombreDia} ${manianaBA.ddmm}*) y los próximos días en *${params.barrio}*: ${
          incluirCafe
            ? `podemos vernos 2 minutos en ${fraseCafe} o, si te resulta más cómodo, paso yo directo por *${params.calleOCruce || `tu cuadra en ${params.barrio}`}*`
            : `puedo pasar 2 minutos por *${params.calleOCruce || `tu cuadra en ${params.barrio}`}*`
        }. ¿Qué día y horario te viene mejor?${posdataNombre}`
      : `${saludo}, ¿cómo estás? Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${params.calleOCruce || params.barrio}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para mañana *${manianaBA.nombreDia} ${manianaBA.ddmm}* (o el día de esta semana que te quede más cómodo) pasando un ratito por *${params.calleOCruce || `tu cuadra en ${params.barrio}`}*${altCafeTexto}. ¿Qué día y franja horaria te queda mejor?${posdataNombre}`;

  return {
    activa: true,
    tipo: tipoAlerta,
    titulo,
    motivo,
    fechaVencida: fechaVencidaDetectada,
    propuestaReprogramacion,
    mensajeDisculpasReprogramacion,
  };
}

/**
 * Diagnostica por qué un contacto califica en "SIN RSP +48H" (ya sea por falta de respuesta al 1er mensaje,
 * por falta de avance tras responder Sí, o porque tiene algún dato cargado en la Columna "G" ("Comentario")
 * que resulta INSUFICIENTE para concretar una visita o encuentro) y genera automáticamente
 * el mensaje personalizado en función de la información disponible de ese usuario.
 */
export function diagnosticarYGenerarMensajeSeguimiento48h(
  params: {
    sinNombre: boolean;
    primerNombre: string;
    barrio: string;
    rsp: 'Sí' | 'No' | 'Nuevo';
    adhirio: 'Sí' | 'Pendiente' | 'No';
    comentario: string;
    calleOCruce: string;
    franjaHoraria: FranjaHoraria;
    fechasMencionadas: string[];
    primerContactoEnviado: boolean;
    horasDesdeUltimoContacto: number;
    intentos: number;
    situacion: SituacionContacto;
    estadoFlujo: EstadoFlujo;
    esVisitaConcretadaORetiro: boolean;
    tieneNuevaInfoEnColumnaG: boolean;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  opcionesCafe?: OpcionesCafeMensaje
): DiagnosticoSinRsp48h | undefined {
  const adh = (params.adhirio || '').toLowerCase().trim();
  if (
    !params.primerContactoEnviado ||
    adh === 'sí' ||
    adh === 'si' ||
    params.situacion === 'DESCARTADO_NO_CABA' ||
    params.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' ||
    params.esVisitaConcretadaORetiro
  ) {
    return undefined;
  }

  const saludo = params.sinNombre ? 'Hola' : `Hola, ${params.primerNombre}`;
  const posdataNombre = params.sinNombre
    ? `\n\n_(De paso te consulto: como al pasar la planilla me quedó en blanco la casilla de tu nombre, ¿me recordarías tu *nombre y apellido* para agendarte bien?)_`
    : '';
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const pasadoBA = sumarDiasAFechaBA(ahoraMs, 2);

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: params.barrio,
      calleOCruce: params.calleOCruce,
      lat: params.lat,
      lng: params.lng,
    },
    profile,
    opcionesCafe
  );
  const { incluirCafe, fraseCafe } = infoCafe;
  const horarioCafe =
    opcionesCafe?.horarioTexto ||
    profile.cafesPorBarrio[params.barrio]?.horariosSugeridos ||
    `${manianaBA.nombreDia} ${manianaBA.ddmm} o ${pasadoBA.nombreDia} ${pasadoBA.ddmm} de 15:00 a 18:00 hs`;

  const comLow = (params.comentario || '').toLowerCase().trim();
  const tieneDir = Boolean(params.calleOCruce && params.calleOCruce.trim().length > 0);
  const tieneFechas = params.fechasMencionadas.length > 0;
  const tieneFranja = params.franjaHoraria !== 'Flexible';

  // 1. CASO: Se agregó algún dato en la Columna G ("Comentario"), pero es INSUFICIENTE para concretar encuentro
  // (En todos estos subcasos ya hubo conversación previa con la persona, por lo que NO se vuelve a decir "Soy César...")
  if (params.tieneNuevaInfoEnColumnaG) {
    // 1A. Tiene dirección y franja horaria en Col. G (ej: "Visita cualquier día luego de las 18:00 (Caracas 5581)" o "CONFIRMAR Visita..."), pero falta confirmar el día exacto
    if (tieneDir && (tieneFranja || /cualquier\s+d[ií]a|confirmar/i.test(comLow)) && !tieneFechas) {
      const textoFranja =
        params.franjaHoraria === 'Vespertino'
          ? 'después de las 18:00 hs'
          : params.franjaHoraria === 'Mañana'
          ? 'por la mañana (entre 10:00 y 12:30 hs)'
          : params.franjaHoraria === 'Mediodía'
          ? 'al mediodía (entre 12:30 y 14:30 hs)'
          : params.franjaHoraria === 'Tarde'
          ? 'por la tarde (entre 15:00 y 18:00 hs)'
          : 'en el horario que te quede más cómodo';
      const altCafe1A = incluirCafe ? `, o si preferís que nos encontremos en ${fraseCafe}` : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_DIRECCION_Y_FRANJA_FALTA_DIA',
        etiquetaCorta: 'Col. G incompleta: falta confirmar día exacto',
        motivoDetallado: `En Columna G figura ubicación (${params.calleOCruce}) y disponibilidad (${params.franjaHoraria}), pero sin día puntual confirmado.`,
        infoDisponibleResumen: `Dirección: ${params.calleOCruce} (${params.barrio}) · Franja: ${params.franjaHoraria}`,
        datoFaltanteResumen: 'Confirmar día exacto del encuentro (ej. mañana o pasado)',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo porque tenía anotado que podías recibirnos por *${params.calleOCruce}* (${params.barrio}) *${textoFranja}*, pero nos faltó dejar confirmado qué día puntual.\n\n¿Te queda cómodo que pase mañana *${manianaBA.nombreDia} ${manianaBA.ddmm}* o el *${pasadoBA.nombreDia} ${pasadoBA.ddmm}* en esa franja de ${textoFranja} (son apenas 2 minutos con tu DNI físico de CABA)${altCafe1A}?${posdataNombre}`,
      };
    }

    // 1B. Tiene sólo dirección o punto en Col. G (ej: "(El Salvador 5778)", "(Ecoparque)", "(Santiago del Estero 453)"), pero falta día y franja horaria
    if (tieneDir && !tieneFechas && !tieneFranja) {
      const altCafe1B = incluirCafe
        ? `, o preferís que nos encontremos unos minutos en ${fraseCafe}`
        : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_SOLO_DIRECCION_FALTA_DIA',
        etiquetaCorta: 'Col. G incompleta: tiene dirección, falta día/hora',
        motivoDetallado: `En Columna G figura "${params.calleOCruce}" (${params.barrio}), pero falta acordar el día y la franja horaria para concretar el encuentro.`,
        infoDisponibleResumen: `Ubicación en Col. G: ${params.calleOCruce} (${params.barrio})`,
        datoFaltanteResumen: 'Día y franja horaria (o confirmar café cercano)',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo cortito porque tengo agendada tu ubicación por *${params.calleOCruce}* (${params.barrio}) para sumar tu firma de adhesión en papel, pero nos quedó pendiente definir qué día y horario te viene bien.\n\n¿Te queda cómodo que pase 2 minutos por *${params.calleOCruce}* mañana *${manianaBA.nombreDia} ${manianaBA.ddmm}* o el *${pasadoBA.nombreDia} ${pasadoBA.ddmm}* (y en qué horario)${altCafe1B}?${posdataNombre}`,
      };
    }

    // 1C. Tiene fecha o mención de día en Col. G (ej: "Visita 22/10" o "Pidió que le escribiera el lunes 19/10"), pero FALTA la dirección o punto de encuentro
    if (!tieneDir && (tieneFechas || /visita|escribiera|semana/i.test(comLow))) {
      const refFecha = params.fechasMencionadas[0]
        ? `para el *${params.fechasMencionadas[0]}*`
        : 'para esta semana';
      const altCafe1C = incluirCafe
        ? ` O si preferís no esperar en casa, también podemos vernos en ${fraseCafe} (${horarioCafe}).`
        : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_SOLO_FECHA_FALTA_DIRECCION',
        etiquetaCorta: 'Col. G incompleta: tiene fecha, falta dirección/café',
        motivoDetallado: `En Columna G figura "${params.comentario}", pero no hay calle/altura ni café confirmado en ${params.barrio}.`,
        infoDisponibleResumen: `Nota temporal en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Calle/esquina en el barrio o confirmar encuentro en café',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo tal cual habíamos quedado (${refFecha}) para coordinar los 2 minutos de tu firma de adhesión en *${params.barrio}*.\n\nPara armar el recorrido, ¿me pasarías por qué *calle/altura o esquina* de ${params.barrio} te queda cómodo que pase y en qué horario?${altCafe1C}${posdataNombre}`,
      };
    }

    // 1D. Expresó preferencia por ir a un punto / fds / reunión de los miércoles, pero aún no confirmó a qué café ni en qué día/horario
    if (/punto|fds|fin de semana|mi[eé]rcoles|plaza/i.test(comLow)) {
      const mencionaMiercoles = /mi[eé]rcoles/i.test(comLow);
      const altCafe1D = incluirCafe
        ? `en ${fraseCafe}`
        : `pasando 2 minutos por tu cuadra en *${params.barrio}*`;
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_PREFIERE_PUNTO_FALTA_CONFIRMAR_HUB',
        etiquetaCorta: 'Col. G incompleta: falta confirmar punto / horario',
        motivoDetallado: `En Columna G figura "${params.comentario}", pero aún no se cerró el punto de encuentro ni el horario concreto.`,
        infoDisponibleResumen: `Preferencia en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Confirmar asistencia al café / Sede o pasar por domicilio',
        mensajePersonalizado48h: mencionaMiercoles
          ? `${saludo}, ¿cómo estás? Como me habías comentado que te interesaba acercarte a la reunión de los miércoles en *${profile.sedeCentral}*, te escribo para consultarte si este miércoles a las 18:30 hs te queda bien venir (así aprovechamos y firmamos tu ficha de adhesión en 2 minutos con el DNI físico), o si preferís que nos veamos en *${params.barrio}* (${altCafe1D}). ¿Qué te queda más cómodo?${posdataNombre}`
          : `${saludo}, ¿cómo estás? Como tenía anotado que preferías acercarte a un punto de encuentro por *${params.barrio}*, te cuento que vamos a estar juntándonos con varios vecinos de la zona ${
              incluirCafe ? `en ${fraseCafe} durante la franja de *${horarioCafe}*` : `por *${params.barrio}* (${horarioCafe})`
            }.\n\n¿Me confirmás si te queda cómodo pasar 2 minutos en esa ventana (acordate sólo de traer tu DNI físico con domicilio en CABA), o si preferís que pase yo un ratito por tu cuadra?${posdataNombre}`,
      };
    }

    // 1E. Pidió más información en Col. G ("Pidió más info. Se la compartí"), falta confirmar DNI CABA y encuentro
    if (/pidi[oó]\s+m[aá]s\s+info|mas\s+info/i.test(comLow)) {
      const opcionLugar1E = incluirCafe
        ? `¿preferís que nos crucemos un ratito en ${fraseCafe} o me pasás tu calle/esquina en *${params.barrio}* y paso yo 2 minutos?`
        : `¿me pasás tu calle o esquina en *${params.barrio}* y en qué horario te queda cómodo que pase 2 minutos?`;
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_PIDIO_MAS_INFO_FALTA_COORDINAR',
        etiquetaCorta: 'Col. G incompleta: recibió info, falta coordinar encuentro',
        motivoDetallado: `En Columna G figura "${params.comentario}", pero aún no confirmó dirección ni punto para firmar.`,
        infoDisponibleResumen: `Estado en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Verificar DNI CABA y definir dirección o café',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo cortito para saber si pudiste ver la información que te compartí sobre los 5 ejes de Popurrí en CABA y para ver si esta semana podemos coordinar los 2 minutos de tu firma de adhesión (recordá que es sólo un aval para constituir el partido *${profile.partidoLegal}* y no afilia a nada).\n\nSi el domicilio impreso en tu DNI es de CABA, ${opcionLugar1E}${posdataNombre}`,
      };
    }

    // 1F. Situación de salud o postergación en Col. G ("Su hija está enferma")
    if (/enferm|salud/i.test(comLow)) {
      const altCafe1F = incluirCafe ? ` o si te queda cómodo cruzarnos en ${fraseCafe}` : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_POSTERGO_SALUD_O_VIAJE',
        etiquetaCorta: 'Col. G en espera: seguimiento empático (salud)',
        motivoDetallado: `En Columna G figura "${params.comentario}". Requiere seguimiento empático para saber cómo siguen y reprogramar sin presión.`,
        infoDisponibleResumen: `Nota en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Consultar cómo siguen en casa y coordinar cuando les quede cómodo',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo muy cortito antes que nada para saber cómo siguen en casa de salud y ojalá esté todo mucho mejor.\n\nCero apuro con la firma: cuando estés más aliviado/a, avisame si preferís que pase 2 minutos por tu puerta en *${params.barrio}*${altCafe1F}.${posdataNombre}`,
      };
    }

    // Cualquier otro dato parcial en Col. G que no completó visita
    const altCafe1G = incluirCafe
      ? ` —ya sea encontrándonos en ${fraseCafe} o pasando por tu cuadra—`
      : ` pasando 2 minutos por tu cuadra`;
    return {
      aplica: true,
      subtipo: 'DATO_INSUFICIENTE_SOLO_DIRECCION_FALTA_DIA',
      etiquetaCorta: 'Col. G con dato parcial: falta cerrar lugar/horario',
      motivoDetallado: `Tiene nota en Columna G ("${params.comentario}") pero aún es insuficiente para concretar la visita o encuentro.`,
      infoDisponibleResumen: `Comentario en Col. G: "${params.comentario}" (${params.barrio})`,
      datoFaltanteResumen: 'Confirmar dirección/café y franja horaria',
      mensajePersonalizado48h: `${saludo}, ¿cómo estás? Estaba revisando las notas para organizar la recorrida por *${params.barrio}* y quería consultarte qué día y horario te queda más cómodo esta semana para que nos veamos 2 minutos${altCafe1G} y sumemos tu firma de adhesión con el DNI físico.${posdataNombre}`,
    };
  }

  // 2. CASO: No tiene datos en Columna G y RSP sigue en "No" tras +48h desde que se le escribió por primera vez
  // (AQUÍ SÍ se incluye quién soy: "Soy César, de Hacemos Popurrí", porque la persona no respondió al primer mensaje)
  if (params.rsp === 'No' && params.horasDesdeUltimoContacto >= 48) {
    const propuestaLugarSinRsp = incluirCafe
      ? `tanto encontrándonos con vecinos de la zona en ${fraseCafe} (${horarioCafe}) como haciendo pasadas rápidas de 2 minutos por domicilio`
      : `haciendo pasadas rápidas de 2 minutos por domicilio`;
    const preguntaFinalSinRsp = incluirCafe
      ? `¿Te queda bien pasar un ratito por el café o preferís que pase yo 2 minutos por tu cuadra?`
      : `¿Por qué esquina o cuadra de *${params.barrio}* te queda cómodo que pase 2 minutos y en qué horario?`;
    return {
      aplica: true,
      subtipo: 'SIN_RSP_DESDE_1ER_MSJ',
      etiquetaCorta: `Sin respuesta al 1er msj (+${params.horasDesdeUltimoContacto}h)`,
      motivoDetallado: `Se le envió el 1er mensaje hace ${params.horasDesdeUltimoContacto}h, la Columna E ("RSP") sigue en "No" y la Columna G está vacía.`,
      infoDisponibleResumen: `Barrio: ${params.barrio} · Col. E (RSP): No · Sin datos en Col. G`,
      datoFaltanteResumen: 'Respuesta inicial: coordinar encuentro en café del grupo o pasada de 2 min en puerta',
      mensajePersonalizado48h: `${saludo}, ¿cómo estás? Espero que estés bien. Soy ${profile.nombrePromotor}, de *${profile.espacioPolitico}*.\n\nTe escribo muy cortito por el mensaje que te dejé hace unos días sobre la firma de adhesión para constituir el partido (*${profile.partidoLegal}*). Para que sea práctico y no tengas que esperar en casa, esta semana vamos a estar en *${params.barrio}* ${propuestaLugarSinRsp}.\n\n${preguntaFinalSinRsp} Cualquier cosa avisame sin compromiso.${posdataNombre}`,
    };
  }

  // 3. CASO: Cambió RSP a "Sí", ya se le hizo un seguimiento (intentos >= 2) y pasaron +48h sin cargar datos en Columna G
  // (Ya respondió previamente, por lo que NO se vuelve a presentar con "Soy César...")
  if (params.rsp === 'Sí' && params.intentos >= 2 && params.horasDesdeUltimoContacto >= 48) {
    const preguntaRspSi = incluirCafe
      ? `¿te queda más cómodo acercarte 2 minutos a ${fraseCafe} o me pasás tu calle/esquina y qué horario te viene bien para que pase?`
      : `¿me pasás tu calle o esquina de referencia y qué horario te viene bien para que pase 2 minutos?`;
    return {
      aplica: true,
      subtipo: 'RSP_SI_SIN_AVANCE_48H',
      etiquetaCorta: `RSP: Sí sin datos en Col. G (+${params.horasDesdeUltimoContacto}h)`,
      motivoDetallado: `Respondió "Sí" en Columna E, pero tras ${params.horasDesdeUltimoContacto}h del seguimiento aún no pasó dirección ni horario para Columna G.`,
      infoDisponibleResumen: `Barrio: ${params.barrio} · Col. E (RSP): Sí · Col. G vacía`,
      datoFaltanteResumen: 'Confirmar DNI CABA y calle/esquina o café',
      mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo cortito para retomar lo que charlamos y organizarnos por *${params.barrio}*: si el último domicilio impreso en tu DNI es de CABA, ${preguntaRspSi}${posdataNombre}`,
    };
  }

  return undefined;
}

/**
 * Calcula automáticamente el resumen de las 6 tarjetas operativas en base a la información
 * sincronizada de Google Sheets y los datos ingresados a través de la app:
 * 1. SIN 1ER MSJ (`nuevosSinMensaje`): nuevos ingresos en Google Sheets (#167+ o filas nuevas) sin 1er mensaje enviado.
 * 2. PENDIENTES (`pendientesActivos`): personas en el Google Sheets que NO han adherido según la Columna "F" ("Adhirió" !== "Sí").
 * 3. RSP: SÍ (`cambioChip`): personas que respondieron según la Columna "E" ("RSP" = "Sí"), que NO han adherido aún,
 *    que NO tienen todavía ninguna nueva información cargada en la Columna "G" ("Comentario") y que NO se les ha enviado confirmación de encuentro.
 * 4. SIN RSP +48H (`sinRespuesta`): personas determinadas por marca temporal (+48h desde el 1er mensaje sin cambio en RSP,
 *    o con algún dato en la Columna "G" "Comentario" que es insuficiente para concretar un encuentro o convocarlo a un Café HUB).
 * 5. VISITAS / X2 (`visitasYRetiros`): visitas ya concretadas con todos los datos necesarios para hacerlas + pendientes para el retiro de fichas extras (X1/X2/X3).
 * 6. FIRMADAS (`adheridos`): cantidad determinada por el estatus "Sí" de la Columna "F" ("Adhirió"), sosteniendo su exclusión del mapa activo.
 */
export function calcularResumenKPIsPadron(contacts: Contact[]): ResumenKPIsPadron {
  const total = contacts.length;
  const adheridos = contacts.filter(
    (c) => c.adhirio === 'Sí' || c.procesoCompletadoSinMensajes
  ).length;
  const archivadosSinDniCabaCount = contacts.filter(
    (c) => c.esCerradoOArchivadoSinDniCaba
  ).length;
  // Regla del usuario: los pendientes se determinan en función del estatus de la columna "F" ("Adhirió"),
  // excluyendo a los que ya adhirieron y a los casos Sin DNI en CABA / Baja que ya fueron respondidos y archivados.
  const pendientesActivos = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  ).length;
  const pendientesCabaActivos = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba &&
      c.situacion !== 'DESCARTADO_NO_CABA'
  ).length;

  const nuevosSinMensaje = contacts.filter(
    (c) =>
      c.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  ).length;

  const cambioChip = contacts.filter(
    (c) =>
      c.esRspSiSinInfoColG &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  ).length;

  const sinRespuestaList = contacts.filter(
    (c) =>
      c.esSinRsp48h &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  );
  const sinRespuesta = sinRespuestaList.length;
  const sinRespuestaPuraCount = sinRespuestaList.filter(
    (c) => c.diagnostico48h?.subtipo === 'SIN_RSP_DESDE_1ER_MSJ'
  ).length;
  const datoInsuficienteColGCount = sinRespuestaList.filter(
    (c) => c.diagnostico48h?.subtipo !== 'SIN_RSP_DESDE_1ER_MSJ'
  ).length;

  const visitasConcretadasCount = contacts.filter(
    (c) => c.esVisitaConcretadaORetiro && c.situacion !== 'RETIRO_FICHAS'
  ).length;
  const retirosFichasCount = contacts.filter(
    (c) => c.situacion === 'RETIRO_FICHAS' || c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
  ).length;
  const visitasYRetiros = contacts.filter((c) => c.esVisitaConcretadaORetiro).length;

  const conDireccionEnColG = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.tieneDireccionRealEnComentario
  ).length;
  const conPuntoEncuentro = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.tienePuntoEncuentroDeterminado
  ).length;
  const alertasVencidosCount = contacts.filter((c) => Boolean(c.alertaVencido?.activa)).length;
  const barriosAutocorregidos = contacts.filter((c) => c.barrioCorregidoPorDireccion).length;
  const sinNombreCount = contacts.filter((c) => c.sinNombre).length;

  return {
    total,
    nuevosSinMensaje,
    pendientesActivos,
    pendientesCabaActivos,
    archivadosSinDniCabaCount,
    cambioChip,
    sinRespuesta,
    sinRespuestaPuraCount,
    datoInsuficienteColGCount,
    visitasYRetiros,
    visitasConcretadasCount,
    retirosFichasCount,
    adheridos,
    conDireccionEnColG,
    conPuntoEncuentro,
    alertasVencidosCount,
    barriosAutocorregidos,
    sinNombreCount,
  };
}

/**
 * Clasifica y enriquece un contacto crudo de la planilla o recién agregado
 */
export function procesarContacto(
  rawInput: RawContactRow,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now()
): Contact {
  const rawDesfasado = repararContactoDesfasado(rawInput);
  // Si la dirección en Columna G ("Comentario") no coincide con el barrio de la Columna C,
  // auto-corregir automáticamente al barrio real correspondiente a esa dirección/punto.
  const raw = sincronizarBarrioConDireccionComentario(rawDesfasado);

  const analisisNombre = analizarYCorregirNombreCompleto(raw.nombre);
  const sinNombre = analisisNombre.sinNombre && !raw.vocativoOverride?.trim();
  const primerNombre = raw.vocativoOverride?.trim()
    ? raw.vocativoOverride.trim()
    : analisisNombre.vocativo;
  const nombreCompletoCorregido =
    sinNombre && raw.vocativoOverride?.trim()
      ? raw.vocativoOverride.trim()
      : analisisNombre.nombreCompletoOrdenado;
  const telWA = normalizarTelefonoWA(raw.telRaw);
  const com = (raw.comentario || '').toLowerCase();
  const adh = (raw.adhirio || '').toLowerCase();
  const rsp = (raw.rsp || '').toLowerCase();
  const enSheets = raw.enSheets !== undefined ? raw.enSheets : raw.rsp !== 'Nuevo';

  const calleOCruce = extraerCalleOCruce(raw.comentario);
  const tieneDireccionRealEnComentario = calleOCruce.trim().length > 0;
  const fechasMencionadas = extraerFechasMencionadas(raw.comentario);
  const franjaHoraria = analizarFranjaHoraria(raw.comentario);
  const geo = geocodificarContactoLocal(calleOCruce, raw.barrio, raw.id);

  const adhirioPreviamente = yaAdhirioAntes(raw);
  const sinPrimerContacto = adhirioPreviamente ? false : esContactoSinPrimerContacto(raw);
  const primerContactoEnviado = adhirioPreviamente ? true : !sinPrimerContacto;

  const estadoFlujo = inferirEstadoFlujo(
    raw,
    sinNombre,
    calleOCruce,
    fechasMencionadas,
    franjaHoraria
  );
  const estadoFlujoEtiqueta = obtenerEtiquetaEstadoFlujo(estadoFlujo);

  const fechaRefStr = raw.ultimoContacto || raw.fechaAgregado || '2026-10-16';
  const fechaRefMs = new Date(fechaRefStr).getTime();
  const horasDesdeUltimoContacto = Number.isNaN(fechaRefMs)
    ? 72
    : Math.max(0, Math.round((ahoraMs - fechaRefMs) / (1000 * 60 * 60)));

  const tieneNuevaInfoEnColumnaG = tieneNuevaInformacionEnColumnaG(raw.comentario);
  const visitaCompleta = tieneVisitaConcretadaConDatosCompletos({
    adhirio: adhirioPreviamente ? 'Sí' : raw.adhirio,
    comentario: raw.comentario,
    calleOCruce,
    fechasMencionadas,
    estadoFlujo,
  });
  const esRetiroFichas =
    (adhirioPreviamente || adh === 'sí' || adh === 'si' || estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') &&
    (estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' || com.includes('buscar fichas') || /x\d/i.test(com));
  const esVisitaConcretadaORetiro = visitaCompleta || esRetiroFichas;

  const esCerradoOArchivadoSinDniCaba =
    !adhirioPreviamente &&
    (estadoFlujo === 'DESCARTADO_O_BAJA' || esSinDniCabaYaRespondidoOCerrado(raw));

  const procesoCompletadoSinMensajes =
    (adhirioPreviamente || estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') && !esRetiroFichas;

  let situacion: SituacionContacto = 'SEGUIMIENTO_CAMBIO_CHIP';
  let modalidadSugerida: Contact['modalidadSugerida'] = 'CAFE_HUB';
  let motivoEstrategico = '';
  let prioridadCorte = 3;

  // Reglas de clasificación basadas en el flujo real de César Rincón y EstadoFlujo
  // 1. PRIORIDAD ABSOLUTA: Si ya adhirió antes, marcar como proceso terminado (YA_ADHIRIO) o retiro de fichas extra,
  //    nunca como "Prefiere Punto (Convocar a Café Hub)" ni lista de envío.
  if (
    adhirioPreviamente ||
    adh === 'sí' ||
    adh === 'si' ||
    estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
  ) {
    if (esRetiroFichas) {
      situacion = 'RETIRO_FICHAS';
      modalidadSugerida = 'PUERTA_A_PUERTA';
      motivoEstrategico = `Ya adhirió y juntó fichas adicionales (${calleOCruce || raw.barrio}): coordinar retiro rápido en puerta.`;
      prioridadCorte = 2;
    } else {
      situacion = 'YA_ADHIRIO';
      modalidadSugerida = 'REMOTO_O_BAJA';
      motivoEstrategico = '✅ Proceso terminado (Ya adhirió): no incluir en listas de envío de mensajes.';
      prioridadCorte = 5;
    }
  } else if (esCerradoOArchivadoSinDniCaba || esComentarioDescartadoONoCaba(raw.comentario, estadoFlujo)) {
    situacion = 'DESCARTADO_NO_CABA';
    modalidadSugerida = 'REMOTO_O_BAJA';
    motivoEstrategico = esCerradoOArchivadoSinDniCaba
      ? 'Archivado / Ya respondido (Sin DNI en CABA o Baja): fuera de la lista de pendientes.'
      : 'Sin domicilio DNI en CABA (pendiente de enviar mensaje consultando referidos CABA).';
    prioridadCorte = 5;
  } else if (
    sinPrimerContacto ||
    estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
  ) {
    situacion = 'NUEVO_SIN_PRIMER_MENSAJE';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = sinNombre
      ? 'Teléfono en Sheets sin nombre y sin 1er contacto: enviar 1er mensaje con consulta sutil de nombre y apellido.'
      : `Sin 1er contacto (#${raw.id}): enviar 1er mensaje de presentación y actualizar estado automáticamente.`;
    prioridadCorte = 1;
  } else if (com.includes('enferm') || com.includes('salud') || estadoFlujo === 'POSTERGO_SALUD_O_VIAJE') {
    situacion = 'SITUACION_SALUD';
    modalidadSugerida = 'PUERTA_A_PUERTA';
    motivoEstrategico = 'Situación familiar/salud reportada: seguimiento empático sin presionar.';
    prioridadCorte = 3;
  } else if (
    com.includes('chile 1408') ||
    /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(com)
  ) {
    situacion = 'EVENTO_CHILE_1408';
    modalidadSugerida = 'PUNTO_ENCUENTRO';
    motivoEstrategico = 'Acordó acercarse a la reunión de los miércoles en la sede de Chile 1408.';
    prioridadCorte = 2;
  } else if (visitaCompleta) {
    situacion = 'VISITA_AGENDADA';
    modalidadSugerida = 'PUERTA_A_PUERTA';
    motivoEstrategico = `Visita concretada con datos completos (${calleOCruce || raw.barrio} · ${
      fechasMencionadas.join('/') || franjaHoraria
    }).`;
    prioridadCorte = 1;
  } else if (com.includes('pidió más info') || com.includes('mas info') || estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA') {
    situacion = 'PIDIO_MAS_INFO';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = 'Pidió información sobre Popurrí en Columna G: falta coordinar punto/dirección de firma.';
    prioridadCorte = 2;
  } else if (
    com.includes('punto') ||
    com.includes('fds') ||
    com.includes('plaza') ||
    estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
  ) {
    situacion = 'PREFIERE_PUNTO';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = 'Expresó en Columna G que prefiere ir a un punto (verificado que NO adhirió antes): proponer café del grupo barrial.';
    prioridadCorte = 2;
  } else if (rsp === 'sí' || rsp === 'si' || tieneNuevaInfoEnColumnaG) {
    situacion = 'SEGUIMIENTO_CAMBIO_CHIP';
    modalidadSugerida = calleOCruce ? 'PUERTA_A_PUERTA' : 'CAFE_HUB';
    motivoEstrategico = tieneNuevaInfoEnColumnaG
      ? `Pasó dato parcial en Columna G (${raw.comentario}) pero es insuficiente para concretar visita: enviar mensaje personalizado para cerrar ${
          calleOCruce ? 'día/hora' : 'dirección o café cercano'
        }.`
      : `Respondió Sí en Columna E pero aún no tiene información cargada en Columna G ni confirmación enviada.`;
    prioridadCorte = 1;
  } else {
    situacion = 'SEGUIMIENTO_SIN_RESPUESTA';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = sinNombre
      ? `1er mensaje enviado (esperando que responda su nombre y apellido + disponibilidad).`
      : `En Sheets sin respuesta tras ${horasDesdeUltimoContacto}h: hacer seguimiento suave proponiendo pasar por su zona o café cercano.`;
    prioridadCorte = 3;
  }

  const intentosEfectivos = raw.intentos ?? (primerContactoEnviado ? 1 : 0);
  const adhirioEfectivo: RawContactRow['adhirio'] =
    adhirioPreviamente || estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ? 'Sí' : raw.adhirio;

  // Regla Card 3 ("RSP: SÍ"): respondieron según Columna E ("RSP" = "Sí"), no adhirieron aún,
  // no tienen todavía ninguna nueva información cargada en Columna G ("Comentario") y no se les envió confirmación de encuentro.
  const esRspSiSinInfoColG =
    primerContactoEnviado &&
    !procesoCompletadoSinMensajes &&
    !esCerradoOArchivadoSinDniCaba &&
    adhirioEfectivo !== 'Sí' &&
    situacion !== 'DESCARTADO_NO_CABA' &&
    (rsp === 'sí' || rsp === 'si') &&
    !tieneNuevaInfoEnColumnaG &&
    estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
    estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO';

  // Regla Card 4 ("SIN RSP +48H"): marca temporal +48h sin respuesta en Col. E o con dato insuficiente en Col. G
  const diagnostico48h =
    procesoCompletadoSinMensajes || esCerradoOArchivadoSinDniCaba
      ? undefined
      : diagnosticarYGenerarMensajeSeguimiento48h(
          {
            sinNombre,
            primerNombre,
            barrio: raw.barrio,
            rsp: rsp === 'sí' || rsp === 'si' ? 'Sí' : sinPrimerContacto ? 'Nuevo' : 'No',
            adhirio: adhirioEfectivo === 'Sí' ? 'Sí' : 'Pendiente',
            comentario: raw.comentario,
            calleOCruce,
            franjaHoraria,
            fechasMencionadas,
            primerContactoEnviado,
            horasDesdeUltimoContacto,
            intentos: intentosEfectivos,
            situacion,
            estadoFlujo,
            esVisitaConcretadaORetiro,
            tieneNuevaInfoEnColumnaG,
            lat: geo.lat,
            lng: geo.lng,
          },
          profile,
          ahoraMs
        );

  const esSinRsp48h = Boolean(diagnostico48h?.aplica);
  const tieneDatoInsuficienteEnColG =
    tieneNuevaInfoEnColumnaG &&
    !esVisitaConcretadaORetiro &&
    !procesoCompletadoSinMensajes &&
    !esCerradoOArchivadoSinDniCaba &&
    adhirioEfectivo !== 'Sí' &&
    situacion !== 'DESCARTADO_NO_CABA';

  const tienePuntoEncuentroDeterminado = tienePuntoEncuentroODireccionDeterminada({
    adhirio: adhirioEfectivo,
    estadoFlujo,
    situacion,
    calleOCruce,
    tieneDireccionRealEnComentario,
    comentario: raw.comentario,
  });

  const alertaVencido =
    procesoCompletadoSinMensajes || esCerradoOArchivadoSinDniCaba
      ? undefined
      : detectarAlertaPendienteVencido(
          {
            sinNombre,
            primerNombre,
            barrio: raw.barrio,
            calleOCruce,
            comentario: raw.comentario,
            franjaHoraria,
            fechasMencionadas,
            situacion,
            estadoFlujo,
            adhirio: adhirioEfectivo,
            horasDesdeUltimoContacto,
            lat: geo.lat,
            lng: geo.lng,
          },
          profile,
          ahoraMs
        );

  if (alertaVencido?.activa) {
    motivoEstrategico = `⚠️ ${alertaVencido.titulo}: ${alertaVencido.motivo}`;
    prioridadCorte = 1;
  } else if (diagnostico48h?.aplica) {
    motivoEstrategico = `⏱️ ${diagnostico48h.etiquetaCorta}: ${diagnostico48h.motivoDetallado}`;
  }

  const msgObj = generarMensajeContextual(
    {
      sinNombre,
      primerNombre,
      barrio: raw.barrio,
      calleOCruce,
      comentario: raw.comentario,
      franjaHoraria,
      fechasMencionadas,
      situacion,
      estadoFlujo,
      lat: geo.lat,
      lng: geo.lng,
    },
    profile,
    alertaVencido?.activa ? 'disculpas_y_reprogramacion' : 'auto'
  );

  const mensajeSugeridoFinal = alertaVencido?.activa
    ? alertaVencido.mensajeDisculpasReprogramacion
    : diagnostico48h?.aplica
    ? diagnostico48h.mensajePersonalizado48h
    : msgObj.texto;

  const objetivoMensajeFinal = procesoCompletadoSinMensajes
    ? 'Proceso finalizado (Ya adhirió) — Botones de envío deshabilitados salvo cambio manual de estatus.'
    : esCerradoOArchivadoSinDniCaba
    ? 'Caso Sin DNI en CABA / Baja ya respondido y archivado — Fuera de la lista de pendientes.'
    : alertaVencido?.activa
    ? 'Disculpas / seguimiento de pendiente vencido y propuesta de reprogramación.'
    : diagnostico48h?.aplica
    ? `${diagnostico48h.etiquetaCorta} — Solicitar: ${diagnostico48h.datoFaltanteResumen}`
    : msgObj.objetivo;

  const barrioParaMaps = /chile\s+1408/i.test(calleOCruce || '')
    ? 'Monserrat'
    : raw.barrio || 'Palermo';
  const direccionMaps = calleOCruce
    ? `${calleOCruce}, ${barrioParaMaps ? barrioParaMaps + ', ' : ''}CABA, Argentina`
    : `${barrioParaMaps}, CABA, Argentina`;

  return {
    ...raw,
    adhirio: adhirioEfectivo,
    sinNombre,
    primerNombre,
    nombreCompletoCorregido,
    analisisNombre,
    estadoFlujo,
    estadoFlujoEtiqueta,
    telWA,
    enSheets,
    primerContactoEnviado,
    fechaPrimerContacto: raw.fechaPrimerContacto,
    fechaAgregado: raw.fechaAgregado || '2026-10-15',
    ultimoContacto: raw.ultimoContacto || '2026-10-15',
    horasDesdeUltimoContacto,
    intentos: intentosEfectivos,
    calleOCruce,
    tieneDireccionRealEnComentario,
    tienePuntoEncuentroDeterminado,
    tieneNuevaInfoEnColumnaG,
    tieneDatoInsuficienteEnColG,
    esRspSiSinInfoColG,
    esSinRsp48h,
    esVisitaConcretadaORetiro,
    esCerradoOArchivadoSinDniCaba,
    procesoCompletadoSinMensajes,
    diagnostico48h,
    direccionMaps,
    franjaHoraria,
    fechasMencionadas,
    lat: geo.lat,
    lng: geo.lng,
    tieneCoordenadasExactas: geo.exacta,
    situacion,
    modalidadSugerida,
    motivoEstrategico,
    prioridadCorte,
    tipoPlantillaSugerida: msgObj.tipoUsado,
    mensajeSugerido: mensajeSugeridoFinal,
    objetivoMensaje: objetivoMensajeFinal,
    alertaVencido,
  };
}

/**
 * Resuelve la fecha operativa objetivo (DD/MM) de un contacto respecto del día actual (`ahoraMs`):
 * - Si el contacto tiene varias fechas en Columna G (ej. "20 o 21/10", "21 o 22/10", "21 o 23/10"),
 *   prioriza HOY (`hoyBA.ddmm`) si está incluida, o la próxima fecha futura operativa más cercana.
 * - Si no tiene fecha numérica pero menciona días de la semana ("martes a jueves", "martes o jueves")
 *   sin postergación a otra semana futura, la vincula con el día operativo coincidente.
 */
export function resolverFechaObjetivoContacto(
  c: { fechasMencionadas: string[]; comentario: string },
  ahoraMs: number = Date.now()
): string | undefined {
  const diasProx = [0, 1, 2, 3, 4].map((offset) => sumarDiasAFechaBA(ahoraMs, offset));
  const diasSemanaCompleta = [0, 1, 2, 3, 4, 5, 6].map((offset) => sumarDiasAFechaBA(ahoraMs, offset));
  const hoyBA = diasProx[0];
  const comLow = (c.comentario || '').toLowerCase();

  // Las reuniones en Chile 1408 son los miércoles
  if (comLow.includes('chile 1408') || /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(comLow)) {
    const matchMiercoles = diasSemanaCompleta.find(
      (d) =>
        d.dayOfWeek === 3 ||
        ['miércoles', 'miercoles'].includes(d.nombreDia.toLowerCase())
    );
    if (matchMiercoles) return matchMiercoles.ddmm;
  }

  if (c.fechasMencionadas && c.fechasMencionadas.length > 0) {
    // 1. Si alguna de las fechas mencionadas es HOY, priorizar HOY sin excepción
    if (c.fechasMencionadas.includes(hoyBA.ddmm)) {
      return hoyBA.ddmm;
    }
    // 2. Si alguna coincide con los próximos días operativos (Mañana, Pasado, etc.), elegir la más próxima
    for (const d of diasProx.slice(1)) {
      if (c.fechasMencionadas.includes(d.ddmm)) {
        return d.ddmm;
      }
    }
    // 3. Si tiene alguna otra fecha futura respecto de hoy
    const futura = c.fechasMencionadas.find((f) => compararFechaDDMMConHoyBA(f, hoyBA) > 0);
    if (futura) return futura;
    // 4. Si sólo tiene fechas pasadas, devolver la más reciente
    return c.fechasMencionadas[c.fechasMencionadas.length - 1];
  }

  if (!comLow || comLow.includes('semana del ')) return undefined;

  const dispRango = analizarDisponibilidadColumnaG(c.comentario);
  const minActualHoy = hoyBA.hour * 60 + hoyBA.minute;
  const yaPasoVentanaHoy =
    dispRango.minFinVentana !== undefined
      ? minActualHoy >= dispRango.minFinVentana - 15
      : minActualHoy >= 18 * 60;
  const diasBusquedaRango = yaPasoVentanaHoy ? diasProx.slice(1, 4) : diasProx.slice(0, 3);

  if (comLow.includes('martes a jueves')) {
    const matchDia = diasBusquedaRango.find((d) =>
      ['martes', 'miércoles', 'miercoles', 'jueves'].includes(d.nombreDia.toLowerCase())
    );
    if (matchDia) return matchDia.ddmm;
  }
  if (comLow.includes('martes o jueves')) {
    const matchDia = diasBusquedaRango.find((d) =>
      ['martes', 'jueves'].includes(d.nombreDia.toLowerCase())
    );
    if (matchDia) return matchDia.ddmm;
  }
  return undefined;
}

export function obtenerRangoHorarioEfectivoContacto(c: Contact): {
  minIni: number;
  minFin: number;
  horaPuntualMin?: number;
  turno: 'AM' | 'PM' | 'FLEX';
} {
  const disp = analizarDisponibilidadColumnaG(c.comentario);
  if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
    const min = horaAMinutosDelDia(disp.horaPuntualPactada);
    return {
      minIni: Math.max(8 * 60, min - 60),
      minFin: Math.min(20 * 60 + 30, min + 75),
      horaPuntualMin: min,
      turno: min < 14 * 60 ? 'AM' : 'PM',
    };
  }
  if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
    const amplitud = disp.minFinVentana - disp.minInicioVentana;
    const turno =
      amplitud >= 360
        ? 'FLEX'
        : disp.minFinVentana <= 14 * 60 + 15
        ? 'AM'
        : disp.minInicioVentana >= 14 * 60
        ? 'PM'
        : 'FLEX';
    return {
      minIni: disp.minInicioVentana,
      minFin: disp.minFinVentana,
      turno,
    };
  }
  if (c.franjaHoraria === 'Mañana') {
    return { minIni: 8 * 60 + 30, minFin: 12 * 60 + 30, turno: 'AM' };
  }
  if (c.franjaHoraria === 'Mediodía') {
    return { minIni: 12 * 60, minFin: 14 * 60 + 30, turno: 'AM' };
  }
  if (c.franjaHoraria === 'Tarde') {
    return { minIni: 14 * 60 + 30, minFin: 18 * 60 + 30, turno: 'PM' };
  }
  if (c.franjaHoraria === 'Vespertino') {
    return { minIni: 17 * 60 + 30, minFin: 20 * 60 + 30, turno: 'PM' };
  }
  return { minIni: 9 * 60, minFin: 20 * 60, turno: 'FLEX' };
}

export function sonHorariosCompatiblesEnCircuito(
  miembrosExistentes: Contact[],
  candidato: Contact
): boolean {
  const rCand = obtenerRangoHorarioEfectivoContacto(candidato);
  let maxIni = rCand.minIni;
  let minFin = rCand.minFin;

  for (const m of miembrosExistentes) {
    const rM = obtenerRangoHorarioEfectivoContacto(m);
    if (rCand.turno !== 'FLEX' && rM.turno !== 'FLEX' && rCand.turno !== rM.turno) {
      return false;
    }
    // Si ambos tienen hora puntual fija, no deben estar separados por más de 90 minutos
    if (rCand.horaPuntualMin !== undefined && rM.horaPuntualMin !== undefined) {
      if (Math.abs(rCand.horaPuntualMin - rM.horaPuntualMin) > 90) {
        return false;
      }
    }
    maxIni = Math.max(maxIni, rM.minIni);
    minFin = Math.min(minFin, rM.minFin);
  }

  // Debe existir intersección real entre las ventanas horarias de todos los integrantes del circuito
  return maxIni <= minFin + 15;
}

export function obtenerTurnoMacroContacto(c: Contact): 'AM' | 'PM' | 'FLEX' {
  return obtenerRangoHorarioEfectivoContacto(c).turno;
}

/**
 * Algoritmo de Micro-Clustering Geoespacial + Fecha en Columna G + Franja Horaria Compatible
 * Reglas clave:
 * 1. SÓLO considera personas que AÚN NO HAN ADHERIDO (c.adhirio !== 'Sí') y no están archivadas/descartadas.
 * 2. SÓLO considera personas que tienen una DIRECCIÓN o PUNTO DE ENCUENTRO cargado en la Columna "G" ("Comentario")
 *    del Google Sheets (no contempla contactos que sólo tienen el barrio sin dirección en Columna G).
 * 3. Al agrupar, respeta las fechas contenidas en la Columna "G" ("Comentario") y separa turnos/ventanas incompatibles
 *    (Mañana/Mediodía vs Tarde/Vespertino) para que citas matutinas (ej: Laura Masson 10:00 hs) tengan su propio bloque.
 */
export function construirMicroClusters(
  contacts: Contact[],
  maxMinutosRadio: number = 15,
  filtroFranja: string = 'Todos',
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now()
): MicroCluster[] {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);

  const candidatos = contacts
    .filter((c) => {
      if (c.situacion === 'DESCARTADO_NO_CABA' || c.situacion === 'YA_ADHIRIO') return false;
      if (c.estadoFlujo === 'DESCARTADO_O_BAJA' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') return false;
      if (c.esCerradoOArchivadoSinDniCaba) return false;
      // Regla estricta 1: sólo personas que aún NO han adherido
      if (c.adhirio === 'Sí') return false;
      // Regla estricta 2: sólo personas que tienen dirección o punto de encuentro cargado en la Columna "G" ("Comentario")
      if (!c.tieneDireccionRealEnComentario || !c.calleOCruce || !c.calleOCruce.trim()) return false;
      if (filtroFranja !== 'Todos' && c.franjaHoraria !== filtroFranja && c.franjaHoraria !== 'Flexible') {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const fa = resolverFechaObjetivoContacto(a, ahoraMs) || '';
      const fb = resolverFechaObjetivoContacto(b, ahoraMs) || '';
      const aEsHoy = fa === hoyBA.ddmm ? 0 : 1;
      const bEsHoy = fb === hoyBA.ddmm ? 0 : 1;
      if (aEsHoy !== bEsHoy) return aEsHoy - bEsHoy;
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      if (fa !== fb) return fa.localeCompare(fb);
      // Dentro de la misma fecha, priorizar quienes tienen hora puntual pactada y horario más temprano
      const ra = obtenerRangoHorarioEfectivoContacto(a);
      const rb = obtenerRangoHorarioEfectivoContacto(b);
      const aTienePuntual = ra.horaPuntualMin !== undefined ? 0 : 1;
      const bTienePuntual = rb.horaPuntualMin !== undefined ? 0 : 1;
      const refA = ra.horaPuntualMin ?? ra.minIni;
      const refB = rb.horaPuntualMin ?? rb.minIni;
      if (Math.abs(refA - refB) <= 60 && aTienePuntual !== bTienePuntual) {
        return aTienePuntual - bTienePuntual;
      }
      if (refA !== refB) return refA - refB;
      return 0;
    });

  const gruposRaw: {
    centroLat: number;
    centroLng: number;
    barrioBase: string;
    miembros: Contact[];
    fechaExplicita?: string;
    turnoGrupo?: 'AM' | 'PM' | 'FLEX';
  }[] = [];

  for (const c of candidatos) {
    const fechaContacto = resolverFechaObjetivoContacto(c, ahoraMs);
    const turnoContacto = obtenerTurnoMacroContacto(c);
    const barrioContacto = (c.barrio || 'Palermo').trim();
    let mejorGrupo: (typeof gruposRaw)[number] | null = null;
    let menorMinutos = Infinity;

    for (const g of gruposRaw) {
      // No superar 6 paradas por circuito para que todo recorrido Puerta a Puerta sea realizable en 45-105 min reales
      if (g.miembros.length >= 6) {
        continue;
      }
      // Nunca mezclar barrios distantes (ej: Palermo con Saavedra) en un mismo circuito
      if (g.barrioBase.toLowerCase() !== barrioContacto.toLowerCase()) {
        continue;
      }
      // Si el contacto tiene fecha explícita y el grupo ya tiene otra fecha explícita distinta, no mezclarlos
      if (fechaContacto && g.fechaExplicita && fechaContacto !== g.fechaExplicita) {
        continue;
      }
      // Si uno tiene fecha de HOY y el otro no tiene fecha, sólo agrupar si comparten el mismo turno
      if (
        (fechaContacto === hoyBA.ddmm && g.fechaExplicita && g.fechaExplicita !== hoyBA.ddmm) ||
        (g.fechaExplicita === hoyBA.ddmm && fechaContacto && fechaContacto !== hoyBA.ddmm)
      ) {
        continue;
      }
      // No mezclar citas estrictas de la Mañana/Mediodía ('AM') con citas estrictas de la Tarde/Noche ('PM')
      // ni ventanas horarias que no tengan intersección real (ej: 10:00 hs o 9-16 hs con 17:30 hs)
      if (
        (turnoContacto !== 'FLEX' &&
          g.turnoGrupo &&
          g.turnoGrupo !== 'FLEX' &&
          turnoContacto !== g.turnoGrupo) ||
        !sonHorariosCompatiblesEnCircuito(g.miembros, c)
      ) {
        continue;
      }

      const est = estimarMinutosCaminandoCABA(c.lat, c.lng, g.centroLat, g.centroLng);
      if (est.minutosCaminando <= maxMinutosRadio && est.minutosCaminando < menorMinutos) {
        const n = g.miembros.length;
        const nuevoLat = (g.centroLat * n + c.lat) / (n + 1);
        const nuevoLng = (g.centroLng * n + c.lng) / (n + 1);
        const todosEntran = g.miembros.every(
          (m) =>
            estimarMinutosCaminandoCABA(m.lat, m.lng, nuevoLat, nuevoLng).minutosCaminando <=
            maxMinutosRadio + 3
        );
        if (todosEntran) {
          menorMinutos = est.minutosCaminando;
          mejorGrupo = g;
        }
      }
    }

    if (mejorGrupo) {
      mejorGrupo.miembros.push(c);
      if (!mejorGrupo.fechaExplicita && fechaContacto) {
        mejorGrupo.fechaExplicita = fechaContacto;
      }
      if ((!mejorGrupo.turnoGrupo || mejorGrupo.turnoGrupo === 'FLEX') && turnoContacto !== 'FLEX') {
        mejorGrupo.turnoGrupo = turnoContacto;
      }
      const n = mejorGrupo.miembros.length;
      mejorGrupo.centroLat = mejorGrupo.miembros.reduce((acc, x) => acc + x.lat, 0) / n;
      mejorGrupo.centroLng = mejorGrupo.miembros.reduce((acc, x) => acc + x.lng, 0) / n;
    } else {
      gruposRaw.push({
        centroLat: c.lat,
        centroLng: c.lng,
        barrioBase: barrioContacto,
        miembros: [c],
        fechaExplicita: fechaContacto,
        turnoGrupo: turnoContacto,
      });
    }
  }

  return gruposRaw
    .sort((a, b) => b.miembros.length - a.miembros.length)
    .map((g, idx) => {
      // Determinar dinámicamente el barrio principal (moda) y todos los barrios que integran el circuito
      const conteoBarrios: Record<string, number> = {};
      for (const m of g.miembros) {
        const b = (m.barrio || 'CABA').trim();
        conteoBarrios[b] = (conteoBarrios[b] || 0) + 1;
      }
      const barriosOrdenados = Object.entries(conteoBarrios)
        .sort((a, b) => b[1] - a[1])
        .map(([b]) => b);
      const barrioPrincipal = barriosOrdenados[0] || 'Palermo';
      const etiquetaCircuito =
        barriosOrdenados.length > 1
          ? `${barriosOrdenados.slice(0, 2).join(' / ')}`
          : barrioPrincipal;

      const cafeHubBarrio = profile.cafesPorBarrio[barrioPrincipal];

      // Buscar los Cafés HUB oficiales de la lista de Google Maps del usuario más cercanos al centroide real del circuito
      const cafesOficialesCercanos = listarCafesHubCercanos(g.centroLat, g.centroLng, 4, true);
      const cafeOficialPrincipal = cafesOficialesCercanos[0];

      // Buscar la intersección o Café HUB conocido más cercano al centroide
      let esquinaMasCercana = cafeOficialPrincipal
        ? `${cafeOficialPrincipal.nombre} (${cafeOficialPrincipal.direccion.split(',')[0]})`
        : cafeHubBarrio?.esquina || `Centro de ${barrioPrincipal}`;
      let minDistCentroide = cafeOficialPrincipal ? cafeOficialPrincipal.distanciaMetros : Infinity;
      for (const dir of COORDENADAS_DIRECCIONES_CABA) {
        const d = distanciaHaversineMetros(g.centroLat, g.centroLng, dir.lat, dir.lng);
        if (d < minDistCentroide && d <= 600) {
          minDistCentroide = d;
          esquinaMasCercana = dir.label;
        }
      }

      const refLat = cafeOficialPrincipal ? cafeOficialPrincipal.lat : g.centroLat;
      const refLng = cafeOficialPrincipal ? cafeOficialPrincipal.lng : g.centroLng;

      const miembrosDetalle = g.miembros.map((contact) => {
        const est = estimarMinutosCaminandoCABA(contact.lat, contact.lng, refLat, refLng);
        return {
          contact,
          minutosCaminando: est.minutosCaminando,
          cuadrasAprox: est.cuadrasAprox,
          distanciaMetros: est.distanciaMetros,
        };
      });

      const tiempos = miembrosDetalle.map((m) => m.minutosCaminando);
      const mediaMinutos =
        Math.round((tiempos.reduce((a, b) => a + b, 0) / Math.max(1, tiempos.length)) * 10) / 10;
      const maxMinutos = Math.round(Math.max(...tiempos, 0) * 10) / 10;

      // Fechas mencionadas en Columna G dentro de este circuito (priorizando fecha objetivo activa)
      const fechasResueltas = g.miembros
        .map((m) => resolverFechaObjetivoContacto(m, ahoraMs))
        .filter((f): f is string => Boolean(f));
      const fechasAgrupadas = Array.from(
        new Set([...fechasResueltas, ...g.miembros.flatMap((m) => m.fechasMencionadas).filter(Boolean)])
      );
      const fechaPrincipal = g.fechaExplicita || fechasAgrupadas[0] || '';
      const convieneCafeHub =
        g.miembros.length >= 2 && maxMinutos <= maxMinutosRadio + 6;

      const modalidadRecomendadaAgenda: ModalidadEncuentroAgenda = convieneCafeHub
        ? 'CAFE_HUB'
        : 'PUERTA_A_PUERTA';

      let etiquetaFechaGrupo = `Próximos días (${hoyBA.ddmm} - ${manianaBA.ddmm})`;
      if (fechaPrincipal) {
        if (fechaPrincipal === hoyBA.ddmm) {
          etiquetaFechaGrupo = `HOY ${fechaPrincipal} (Columna G)`;
        } else if (fechaPrincipal === manianaBA.ddmm) {
          etiquetaFechaGrupo = `MAÑANA ${fechaPrincipal} (Columna G)`;
        } else {
          etiquetaFechaGrupo = `Fecha ${fechaPrincipal} (Columna G)`;
        }
      }

      const esSugeridoProximosDias =
        convieneCafeHub || g.miembros.length >= 2 || Boolean(fechaPrincipal);

      const franjasSet = Array.from(new Set(g.miembros.map((m) => m.franjaHoraria)));
      const cafeRecomendadoNombre = cafeOficialPrincipal
        ? `${cafeOficialPrincipal.nombre} (${cafeOficialPrincipal.direccion.split(',')[0]})`
        : cafeHubBarrio?.nombre || `Café céntrico en ${esquinaMasCercana}`;
      const urlGoogleMapsCafe =
        cafeOficialPrincipal?.urlGoogleMaps ||
        cafeHubBarrio?.urlGoogleMaps ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `Cafetería cerca de ${esquinaMasCercana}, ${barrioPrincipal}, CABA, Argentina`
        )}`;

      const recomendacionAgendaTexto = convieneCafeHub
        ? `Recomendación Agenda Día por Día (${etiquetaFechaGrupo}): Conviene armar CAFÉ HUB en ${etiquetaCircuito} para ${g.miembros.length} vecino(s) (~${mediaMinutos} min a pie). Elegí abajo cuál de los Cafés HUB de tu lista de Google Maps definir para personalizar automáticamente los mensajes.`
        : `Recomendación Agenda Día por Día (${etiquetaFechaGrupo}): Conviene RECORRIDO PUERTA A PUERTA para ${g.miembros.length} vecino(s) en ${etiquetaCircuito} (o elegí un Café HUB de tu lista abajo si preferís convocarlo a un punto).`;

      return {
        id: `cluster-${idx + 1}`,
        numero: idx + 1,
        nombreNodo: `Circuito ${idx + 1} — ${etiquetaCircuito} · ${etiquetaFechaGrupo} (${cafeOficialPrincipal ? cafeOficialPrincipal.nombre : esquinaMasCercana.split(',')[0]})`,
        barrioPrincipal,
        esquinaCentrica: cafeOficialPrincipal
          ? `${cafeOficialPrincipal.nombre} · ${cafeOficialPrincipal.direccion.split(',')[0]}`
          : esquinaMasCercana,
        cafeRecomendado: cafeRecomendadoNombre,
        centroLat: Number(g.centroLat.toFixed(5)),
        centroLng: Number(g.centroLng.toFixed(5)),
        miembros: miembrosDetalle,
        mediaMinutos,
        maxMinutos,
        convieneCafeHub,
        franjasCompatibles: franjasSet,
        veredicto: convieneCafeHub
          ? `CAFÉ HUB SUGERIDO · ${etiquetaFechaGrupo} (${g.miembros.length} pendientes a ~${mediaMinutos} min a pie)`
          : `RECORRIDO CASA X CASA · ${etiquetaFechaGrupo} (${g.miembros.length} pendiente${g.miembros.length > 1 ? 's' : ''})`,
        explicacion: convieneCafeHub
          ? `${g.miembros.length} personas sin adherir con dirección en Columna G (${etiquetaFechaGrupo}) en ${etiquetaCircuito} están a un promedio de ${mediaMinutos} min caminando de "${cafeRecomendadoNombre}". Seleccioná un café de tu lista compartida para definir el punto y personalizar el mensaje a cada vecino.`
          : `Circuito de ${g.miembros.length} contacto/s sin adherir (${etiquetaFechaGrupo}) cerca de ${esquinaMasCercana}: en la Agenda conviene resolverlo Puerta a Puerta o elegir un Café HUB cercano para personalizar su mensaje.`,
        urlGoogleMapsCafe,
        cafesHubCercanos: cafesOficialesCercanos,
        fechasAgrupadas,
        etiquetaFechaGrupo,
        modalidadRecomendadaAgenda,
        esSugeridoProximosDias,
        recomendacionAgendaTexto,
      };
    });
}

function sumarMinutosAHora(horaHHMM: string, minutosASumar: number): string {
  const [hh, mm] = horaHHMM.split(':').map(Number);
  const totalMin = (hh || 0) * 60 + (mm || 0) + Math.round(minutosASumar);
  const normalized = ((totalMin % 1440) + 1440) % 1440;
  const finalH = Math.floor(normalized / 60);
  const finalM = normalized % 60;
  return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
}

function horaAMinutosDelDia(horaHHMM: string): number {
  const [hh, mm] = (horaHHMM || '00:00').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function esEventoVirtualCalendar(ev: CalendarEventItem): boolean {
  const texto = `${ev.summary || ''} ${ev.location || ''}`.toLowerCase();
  return /\b(virtual|zoom|meet|google\s*meet|teams|online|remota|videollamada|streaming|webinar)\b/i.test(
    texto
  );
}

/**
 * Geocodifica la dirección de un evento de Google Calendar para calcular traslados reales hacia/desde el evento
 */
export function geocodificarEventoCalendar(
  ev: CalendarEventItem,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): { lat: number; lng: number; label: string } {
  if (typeof ev.lat === 'number' && typeof ev.lng === 'number') {
    return { lat: ev.lat, lng: ev.lng, label: ev.location || ev.summary };
  }
  if (esEventoVirtualCalendar(ev)) {
    return {
      lat: profile.latPartida,
      lng: profile.lngPartida,
      label: 'Virtual (sin traslado físico)',
    };
  }
  const loc = `${ev.location || ''} ${ev.summary || ''}`
    .toLowerCase()
    .replace(/\bsta\.?\s*fe\b/g, 'santa fe')
    .replace(/\bcnel\.?\b/g, 'coronel')
    .replace(/\bgral\.?\b/g, 'general');
  const coordenadasOrdenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
    (a, b) => b.match.length - a.match.length
  );
  for (const d of coordenadasOrdenadas) {
    if (loc.includes(d.match)) {
      return { lat: d.lat, lng: d.lng, label: d.label };
    }
  }
  for (const [barrio, coords] of Object.entries(COORDENADAS_BARRIOS_CABA)) {
    if (loc.includes(barrio.toLowerCase())) {
      return { lat: coords.lat, lng: coords.lng, label: ev.location || `${barrio}, CABA` };
    }
  }
  if (loc.includes('santa fe 32') || loc.includes('santa fe 31') || loc.includes('santa fe 33')) {
    return { lat: -34.5882, lng: -58.4112, label: 'Av. Santa Fe 3242, Palermo, CABA' };
  }
  if (loc.includes('virrey arredondo') || loc.includes('loreto garden') || loc.includes('virrey loreto')) {
    return { lat: -34.5688, lng: -58.4512, label: 'Virrey Arredondo 2427, Colegiales, CABA' };
  }
  if (loc.includes('cabildo')) {
    return { lat: -34.5618, lng: -58.4565, label: 'Av. Cabildo 2040, Belgrano, CABA' };
  }
  if (loc.includes('chile 1408') || loc.includes('monserrat')) {
    return { lat: -34.6158, lng: -58.3862, label: 'Chile 1408, Monserrat, CABA' };
  }
  const partida = resolverCoordenadasPartidaPerfil(profile);
  return {
    lat: partida.lat,
    lng: partida.lng,
    label: ev.location || profile.direccionPartida,
  };
}

export function calcularMinutosTrasladoCABA(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { modo: 'WALKING' | 'TRANSIT'; minutos: number; distanciaMetros: number; cuadras: number } {
  const est = estimarMinutosCaminandoCABA(lat1, lng1, lat2, lng2);
  if (est.distanciaMetros <= 30) {
    return {
      modo: 'WALKING',
      minutos: 1,
      distanciaMetros: est.distanciaMetros,
      cuadras: 0,
    };
  }
  // En CABA hasta ~1350m (~13-14 cuadras, ~18-20 min) es más rápido o equivalente ir a pie
  // que esperar colectivo + caminar a las paradas; a partir de >1350m se usa Transporte Público
  // contemplando caminata a parada (~5 min) + espera promedio en CABA (~6 min) + viaje urbano + caminata final (~3 min).
  const modo: 'WALKING' | 'TRANSIT' = est.distanciaMetros <= 1350 ? 'WALKING' : 'TRANSIT';
  const minutosWalking = Math.ceil(est.minutosCaminando);
  const minutosTransit = Math.min(
    65,
    13 +
      Math.round(est.distanciaMetros / 230) +
      (est.distanciaMetros > 3500 ? 4 : 0) +
      (est.distanciaMetros > 6000 ? 4 : 0)
  );
  const minutos =
    modo === 'WALKING'
      ? minutosWalking
      : Math.max(16, Math.min(minutosWalking, minutosTransit));
  return {
    modo,
    minutos,
    distanciaMetros: est.distanciaMetros,
    cuadras: est.cuadrasAprox,
  };
}

const EVENTOS_FICTICIOS_LEGACY_IDS = new Set([
  'cal-hoy-1',
  'cal-hoy-2',
  'cal-man-1',
  'cal-man-2',
  'cal-pas-1',
]);

const EVENTOS_FICTICIOS_LEGACY_SUMMARIES = new Set([
  'reunión equipo comunal / zoom',
  'tramite personal en microcentro',
  'trámite personal en microcentro',
  'desayuno de trabajo en belgrano',
  'actividad barrial comuna 14',
  'almuerzo familiar',
]);

export function esEventoFicticioLegacyCalendar(ev?: CalendarEventItem | null): boolean {
  if (!ev) return true;
  const rawId = String(ev.id || '').trim().toLowerCase();
  for (const fakeId of EVENTOS_FICTICIOS_LEGACY_IDS) {
    if (rawId === fakeId || rawId.startsWith(`${fakeId}-`)) {
      return true;
    }
  }
  const summaryNorm = String(
    ev.summary || (ev as { title?: string; titulo?: string }).title || (ev as { titulo?: string }).titulo || ''
  )
    .trim()
    .toLowerCase();
  if (EVENTOS_FICTICIOS_LEGACY_SUMMARIES.has(summaryNorm)) {
    return true;
  }
  return false;
}

/**
 * Desduplica eventos de Google Calendar por (ID base / Resumen + Fecha + Hora de inicio),
 * descarta eventos ficticios legacy y normaliza `fecha` en formato DD/MM.
 */
export function deduplicarEventosCalendar(
  eventos: CalendarEventItem[] = []
): CalendarEventItem[] {
  const vistos = new Set<string>();
  const resultado: CalendarEventItem[] = [];

  for (let idx = 0; idx < eventos.length; idx++) {
    const ev = eventos[idx];
    if (!ev || esEventoFicticioLegacyCalendar(ev)) continue;

    let fechaDDMM = String(ev.fecha || '').trim();
    let fechaISO = String(ev.fechaISO || '').trim();

    const mIsoFromFecha = fechaDDMM.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIsoFromFecha) {
      if (!fechaISO) fechaISO = `${mIsoFromFecha[1]}-${mIsoFromFecha[2]}-${mIsoFromFecha[3]}`;
      fechaDDMM = `${mIsoFromFecha[3]}/${mIsoFromFecha[2]}`;
    } else if (!fechaDDMM && fechaISO) {
      const mIso = fechaISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (mIso) {
        fechaDDMM = `${mIso[3]}/${mIso[2]}`;
      }
    } else if (!fechaISO && /^\d{1,2}\/\d{1,2}$/.test(fechaDDMM)) {
      const [dStr, mStr] = fechaDDMM.split('/');
      fechaISO = `2026-${mStr.padStart(2, '0')}-${dStr.padStart(2, '0')}`;
      fechaDDMM = `${dStr.padStart(2, '0')}/${mStr.padStart(2, '0')}`;
    }

    const baseId = String(ev.id || ev.summary || `cal-ev-${idx}`).trim();
    const fechaKey = fechaISO || fechaDDMM;
    const horaKey = String(ev.startTime || ev.startIso || '').trim();
    const summaryKey = String(ev.summary || '').toLowerCase().trim();

    const dedupeKeyId = `${baseId}|${fechaKey}|${horaKey}`;
    const dedupeKeySummary = `${summaryKey}|${fechaKey}|${horaKey}`;
    if (vistos.has(dedupeKeyId) || (summaryKey && vistos.has(dedupeKeySummary))) {
      continue;
    }
    vistos.add(dedupeKeyId);
    if (summaryKey) vistos.add(dedupeKeySummary);

    const uniqueId =
      baseId.includes(fechaKey) && baseId.includes(horaKey)
        ? baseId
        : `${baseId}-${fechaKey || 'dia'}-${horaKey.replace(':', '') || idx}`;

    resultado.push({
      ...ev,
      id: uniqueId,
      fecha: fechaDDMM || ev.fecha,
      fechaISO: fechaISO || ev.fechaISO,
    });
  }

  return resultado;
}

/**
 * Filtra únicamente los eventos de Google Calendar que sigan vigentes respecto de `ahoraMs`:
 * - Descarta eventos de días anteriores a hoy.
 * - Descarta eventos del día de hoy cuya hora de finalización (`endTime`) ya pasó.
 */
export function filtrarEventosCalendarVigentes(
  eventos: CalendarEventItem[] = [],
  ahoraMs: number = Date.now()
): CalendarEventItem[] {
  const dedup = deduplicarEventosCalendar(eventos);
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;

  return dedup.filter((ev) => {
    const fechaEv = String(ev.fecha || '').trim();
    if (fechaEv && /^\d{1,2}\/\d{1,2}$/.test(fechaEv)) {
      const cmp = compararFechaDDMMConHoyBA(fechaEv, hoyBA);
      if (cmp < 0) return false;
      if (cmp === 0) {
        const minFin = horaAMinutosDelDia(ev.endTime || ev.startTime || '23:59');
        if (minutosActualesBA >= minFin) return false;
      }
      return true;
    }
    if (ev.fechaISO) {
      if (ev.fechaISO < hoyBA.isoDate) return false;
      if (ev.fechaISO === hoyBA.isoDate) {
        const minFin = horaAMinutosDelDia(ev.endTime || ev.startTime || '23:59');
        if (minutosActualesBA >= minFin) return false;
      }
      return true;
    }
    return true;
  });
}

/**
 * Analiza si la celda de la Columna "G" ("Comentario") expresa una FRANJA HORARIA AMPLIA
 * (por ejemplo: "entre 9 y 16:00", "de 10 a 18", "después de las 14", "luego de las 18:00")
 * o una HORA PUNTUAL PACTADA ("a las 11 hs", "cerca de las 17:30", "15:30 hs").
 *
 * REGLA ESTRATÉGICA:
 * Si la persona dejó una franja horaria amplia (ej. "entre 9 y 16:00") y un evento de Google Calendar
 * ocupa sólo una parte de esa franja (ej. 15:00-15:50), NO es un choque ni requiere cancelar/reprogramar:
 * el sistema debe elegir un horario conveniente libre dentro de su franja (o proponer el Café HUB del bloque)
 * y ordenarlo cronológicamente en la Hoja de Ruta en Terreno.
 */
export function analizarDisponibilidadColumnaG(comentario: string): {
  esVentanaAmplia: boolean;
  minInicioVentana?: number;
  minFinVentana?: number;
  etiquetaVentana?: string;
  horaPuntualPactada?: string;
} {
  if (!comentario) {
    return { esVentanaAmplia: false };
  }
  const texto = limpiarFechasDeTextoParaHorario(comentario);

  // 1. "antes de las 11:30 y 12:00", "antes de las 13", "hasta las 16"
  const mAntes = texto.match(
    /\b(?:antes\s+de\s+(?:las\s+)?|hasta\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?(?:\s*(?:y|o|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?)?\b/i
  );
  if (mAntes) {
    const h1 = Number(mAntes[1]);
    const min1 = mAntes[2] ? Number(mAntes[2]) : 0;
    const h2 = mAntes[3] ? Number(mAntes[3]) : h1;
    const min2 = mAntes[4] ? Number(mAntes[4]) : mAntes[3] ? 0 : min1;
    if (h1 >= 9 && h1 <= 21 && h2 >= h1 && h2 <= 22) {
      const ini = 9 * 60;
      const fin = h2 * 60 + min2;
      const etiq = mAntes[3]
        ? `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} y ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`
        : `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} hs`;
      return {
        esVentanaAmplia: fin - ini >= 90,
        minInicioVentana: ini,
        minFinVentana: fin,
        etiquetaVentana: etiq,
      };
    }
  }

  // 2. Rango explícito: "entre (las) 9 y (las) 16:00", "de 10 a 17 hs", "entre 13:30 y 18", "10 a 13 hs"
  const mRango = texto.match(
    /\b(?:(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:y|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?|(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h))\b/i
  );
  if (mRango) {
    const h1 = Number(mRango[1] || mRango[5]);
    const min1 = (mRango[2] || mRango[6]) ? Number(mRango[2] || mRango[6]) : 0;
    const h2 = Number(mRango[3] || mRango[7]);
    const min2 = (mRango[4] || mRango[8]) ? Number(mRango[4] || mRango[8]) : 0;
    if (h1 >= 6 && h1 <= 22 && h2 > h1 && h2 <= 23) {
      const ini = h1 * 60 + min1;
      const fin = h2 * 60 + min2;
      const etiq = `${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} a ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`;
      if (fin - ini >= 90) {
        return {
          esVentanaAmplia: true,
          minInicioVentana: ini,
          minFinVentana: fin,
          etiquetaVentana: etiq,
        };
      }
      return {
        esVentanaAmplia: false,
        minInicioVentana: ini,
        minFinVentana: fin,
        etiquetaVentana: etiq,
        horaPuntualPactada: `${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')}`,
      };
    }
  }

  // 3. Ventana abierta desde cierta hora: "después de las 15", "luego de las 18:00", "a partir de las 14"
  const mDespues = texto.match(
    /\b(?:despu[eé]s\s+de\s+las|luego\s+de\s+las|a\s+partir\s+de\s+las|desde\s+las)\s+(\d{1,2})(?::(\d{2}))?(?!\s*\/)\s*(?:hs|h)?\b/i
  );
  if (mDespues) {
    const h = Number(mDespues[1]);
    const min = mDespues[2] ? Number(mDespues[2]) : 0;
    if (h >= 7 && h <= 21) {
      const ini = h * 60 + min;
      const fin = Math.max(ini + 150, 20 * 60);
      return {
        esVentanaAmplia: true,
        minInicioVentana: ini,
        minFinVentana: fin,
        etiquetaVentana: `después de las ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 3. Hora puntual pactada: "a las 11hs", "a las 10", "a las 15", "cerca de las 17:30", "tipo 16 hs", "15:30 hs"
  const mHoraPrefijo = texto.match(
    /\b(?:a\s+las|cerca\s+de\s+las|alrededor\s+de\s+las|tipo)\s+([01]?\d|2[0-3])(?::([0-5]\d))?(?!\s*\/)\s*(?:hs|horas|h)?\b/i
  );
  if (mHoraPrefijo) {
    const hh = Number(mHoraPrefijo[1]);
    const mm = mHoraPrefijo[2] ? Number(mHoraPrefijo[2]) : 0;
    if (hh >= 7 && hh <= 22) {
      return {
        esVentanaAmplia: false,
        horaPuntualPactada: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      };
    }
  }
  const mHoraMin = texto.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:hs|h)?\b/i);
  if (mHoraMin) {
    const hh = Number(mHoraMin[1]);
    const mm = Number(mHoraMin[2]);
    if (hh >= 7 && hh <= 22) {
      return {
        esVentanaAmplia: false,
        horaPuntualPactada: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      };
    }
  }
  const mHoraHs = texto.match(
    /\b([01]?\d|2[0-3])\s*(?:hs|horas)\b/i
  );
  if (mHoraHs) {
    const hh = Number(mHoraHs[1]);
    if (hh >= 7 && hh <= 22) {
      return {
        esVentanaAmplia: false,
        horaPuntualPactada: `${String(hh).padStart(2, '0')}:00`,
      };
    }
  }

  // 4. Expresiones de turno explícito ("por la tarde", "a la tarde", "por la mañana", "al mediodía")
  if (/\b(?:por\s+la\s+tarde|a\s+la\s+tarde|durante\s+la\s+tarde|tarde)\b/i.test(texto)) {
    return {
      esVentanaAmplia: true,
      minInicioVentana: 14 * 60,
      minFinVentana: 19 * 60,
      etiquetaVentana: 'por la tarde',
    };
  }
  if (/\b(?:por\s+la\s+ma[ñn]ana|a\s+la\s+ma[ñn]ana|durante\s+la\s+ma[ñn]ana)\b/i.test(texto)) {
    return {
      esVentanaAmplia: true,
      minInicioVentana: 9 * 60,
      minFinVentana: 12 * 60 + 30,
      etiquetaVentana: 'por la mañana',
    };
  }
  if (/cualquier\s+hor(?:a|ario)|todo\s+el\s+d[ií]a|amplia\s+disponibilidad/i.test(texto)) {
    return {
      esVentanaAmplia: true,
      minInicioVentana: 9 * 60,
      minFinVentana: 19 * 60 + 30,
      etiquetaVentana: 'cualquier horario (09:00 a 19:30 hs)',
    };
  }

  return { esVentanaAmplia: false };
}

/**
 * Extrae una hora puntual pactada en la Columna G ("Comentario"), por ejemplo "11hs", "17:30", "a las 16".
 * Si la persona dejó una franja amplia (ej. "entre 9 y 16:00" o "luego de las 18:00"), devuelve `undefined`
 * para que el planificador elija un horario conveniente dentro de esa ventana sin asumir falso choque fijo.
 */
export function extraerHoraPactadaExplicita(comentario: string): string | undefined {
  const disp = analizarDisponibilidadColumnaG(comentario);
  if (disp.esVentanaAmplia) return undefined;
  return disp.horaPuntualPactada;
}

/**
 * Selecciona los mejores Cafés HUB de la lista oficial de Google Maps considerando:
 * 1) Cercanía geográfica (distancia y minutos a pie promedio) a las direcciones/puntos de los vecinos.
 * 2) El día compartido (`fechaClave`) y la franja horaria compartida (`franjaDominante`) del grupo.
 */
export function seleccionarCafesHubPorCercaniaYFranja(
  grupo: Contact[],
  barrioReferencia: string,
  fechaClave: string,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): {
  cafesRanking: CafeHubCercanoCluster[];
  franjaCompartidaResumen: string;
  mediaMinutosMejorCafe: number;
} {
  const coordsBarrio =
    COORDENADAS_BARRIOS_CABA[barrioReferencia] || COORDENADAS_BARRIOS_CABA.Palermo;
  const centroLat =
    grupo.length > 0
      ? grupo.reduce((acc, c) => acc + c.lat, 0) / grupo.length
      : coordsBarrio.lat;
  const centroLng =
    grupo.length > 0
      ? grupo.reduce((acc, c) => acc + c.lng, 0) / grupo.length
      : coordsBarrio.lng;

  // Analizar días y franjas horarias compartidas por el grupo
  const conteoFranjas: Record<string, number> = {};
  for (const c of grupo) {
    const f = c.franjaHoraria || 'Tarde';
    conteoFranjas[f] = (conteoFranjas[f] || 0) + 1;
  }
  const franjasOrdenadas = Object.entries(conteoFranjas)
    .sort((a, b) => b[1] - a[1])
    .map(([f, count]) => `${f} (${count})`);
  const franjaDominante =
    Object.entries(conteoFranjas).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Tarde';
  const franjaCompartidaResumen =
    franjasOrdenadas.length > 0
      ? `Día ${fechaClave} · Franja compartida: ${franjasOrdenadas.join(', ')}`
      : `Día ${fechaClave} · Franja ${franjaDominante}`;

  const candidatosCaba: CafeHubCurado[] = CATALOGO_CAFES_HUB_CABA.filter((cf) => cf.esCaba);
  const cafesMismoBarrio = candidatosCaba.filter(
    (cf) =>
      cf.barrio.toLowerCase() === barrioReferencia.toLowerCase() ||
      grupo.some((m) => m.barrio.toLowerCase() === cf.barrio.toLowerCase())
  );
  // Priorizar estrictamente los cafés del mismo barrio del circuito (si existen en el catálogo) para nunca mezclar cafés de Saavedra/Puerto Madero en un circuito de Palermo
  const poolCafes = cafesMismoBarrio.length >= 1 ? cafesMismoBarrio : candidatosCaba;

  const puntuados = poolCafes
    .map((cf: CafeHubCurado) => {
      // Calcular distancia promedio real a todos los miembros del grupo (no sólo al centroide)
      const distPromedioMetros =
        grupo.length > 0
          ? Math.round(
              grupo.reduce(
                (acc, m) =>
                  acc +
                  estimarMinutosCaminandoCABA(m.lat, m.lng, cf.lat, cf.lng).distanciaMetros,
                0
              ) / grupo.length
            )
          : estimarMinutosCaminandoCABA(centroLat, centroLng, cf.lat, cf.lng).distanciaMetros;

      const minPromedio =
        grupo.length > 0
          ? Math.max(
              2,
              Math.round(
                grupo.reduce(
                  (acc, m) =>
                    acc +
                    estimarMinutosCaminandoCABA(m.lat, m.lng, cf.lat, cf.lng).minutosCaminando,
                  0
                ) / grupo.length
              )
            )
          : Math.max(2, Math.round(estimarMinutosCaminandoCABA(centroLat, centroLng, cf.lat, cf.lng).minutosCaminando));
      const cuadrasPromedio = Math.max(1, Math.round(distPromedioMetros / 100));

      const mismoBarrio =
        cf.barrio.toLowerCase() === barrioReferencia.toLowerCase() ||
        grupo.some((m) => m.barrio.toLowerCase() === cf.barrio.toLowerCase());
      const cafeConfigBarrio = profile.cafesPorBarrio[cf.barrio];
      const coincideFranjaBarrio =
        cafeConfigBarrio &&
        cafeConfigBarrio.horariosSugeridos
          .toLowerCase()
          .includes(franjaDominante.toLowerCase().slice(0, 4));

      const score =
        distPromedioMetros -
        (mismoBarrio ? 2500 : 0) -
        (coincideFranjaBarrio ? 220 : 0);

      return {
        cafe: {
          id: cf.id,
          nombre: cf.nombre,
          direccion: cf.direccion,
          barrio: cf.barrio,
          urlGoogleMaps: cf.urlGoogleMaps,
          lat: cf.lat,
          lng: cf.lng,
          distanciaMetros: distPromedioMetros,
          minutosCaminando: minPromedio,
          cuadrasAprox: cuadrasPromedio,
        } satisfies CafeHubCercanoCluster,
        score,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const cafesRanking = puntuados.map((p) => p.cafe);
  const mediaMinutosMejorCafe = cafesRanking[0]?.minutosCaminando ?? 10;

  return {
    cafesRanking,
    franjaCompartidaResumen,
    mediaMinutosMejorCafe,
  };
}

/**
 * Determina si una persona ya confirmó su respuesta en la Lista 1-a-1 Unificada (o en la planilla)
 * para activar el envío del envío en terreno en la Pestaña 3 ("3. Hoja de Ruta en Terreno").
 */
export function esContactoConfirmadoEnLista1a1(contact: Contact): boolean {
  if (
    contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    contact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
  ) {
    return true;
  }
  const com = (contact.comentario || '').toLowerCase();
  if (
    /visita\s+confirmada|confirm[oó]\s+caf[eé]\s*hub|declin[oó]\s+caf[eé]\s*hub|pasa\s+a\s+puerta\s+a\s+puerta|prefiere\s+visita\s+puerta\s+a\s+puerta|prefiere\s+punto\s+de\s+encuentro\s+caf[eé]\s*hub/i.test(
      com
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Calcula una hoja de ruta secuencial optimizada sólo para NO adheridos,
 * verificando tiempos reales, eventos de Google Calendar y los TRASLADOS hacia/desde las direcciones de esos eventos.
 *
 * REGLAS CLAVE:
 * 1) Si un vecino dejó una FRANJA HORARIA AMPLIA en Columna G (ej. "entre 9 y 16:00"), el sistema NO asume
 *    que debe cancelar/reprogramar por un evento de Calendar de 50 min: define automáticamente un horario
 *    conveniente libre dentro de esa franja (o propone el Café HUB del bloque) y ordena las paradas por horario.
 * 2) Ninguna parada puede quedar superpuesta con ningún evento de Google Calendar (ni almuerzos, ni dentista,
 *    ni terapia, ni reuniones virtuales): si un evento bloquea el cursor, la ruta avanza automáticamente al
 *    finalizar la cadena de eventos de Calendar.
 * 3) Si una parada corresponde al día de HOY y su horario ya pasó sin que la persona haya adherido, se marca
 *    explícitamente con `vencidaSinAdherir: true` para alertar y reprogramar.
 */
export function calcularHojaDeRuta(
  paradas: Contact[],
  horaSalidaStr: string = '09:40',
  bufferMinutos: number = 20,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  eventosCalendar: CalendarEventItem[] = [],
  fechaRutaDDMM?: string,
  opcionesRuta?: {
    cafeHubBloque?: { nombre: string; direccion: string; lat?: number; lng?: number };
    modalidadBloque?: ModalidadEncuentroAgenda;
    idsConfirmados1a1?: Set<string>;
    contactosMismoDia?: Contact[];
    ahoraMs?: number;
  }
): ParadaRuta[] {
  // Regla: sólo considerar personas que aún NO han adherido y que tienen dirección o punto en Columna G ("Comentario")
  const paradasNoAdheridas = paradas.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      Boolean((c.calleOCruce && c.calleOCruce.trim().length > 0) || c.tienePuntoEncuentroDeterminado)
  );
  if (paradasNoAdheridas.length === 0) return [];

  const ahoraRefMs = opcionesRuta?.ahoraMs ?? Date.now();
  const hoyBA = obtenerPartesFechaHoraBA(ahoraRefMs);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;
  const esRutaDeHoy = !fechaRutaDDMM || fechaRutaDDMM === hoyBA.ddmm;

  const eventosUnicos = deduplicarEventosCalendar(eventosCalendar);
  const eventosDelDiaRuta = fechaRutaDDMM
    ? eventosUnicos.filter((ev) => !ev.fecha || ev.fecha === fechaRutaDDMM)
    : eventosUnicos.filter((ev) => !ev.fecha || ev.fecha === hoyBA.ddmm);
  const eventosParaEvaluar = [...eventosDelDiaRuta].sort(
    (a, b) => horaAMinutosDelDia(a.startTime) - horaAMinutosDelDia(b.startTime)
  );

  // Determinar el Café HUB único del bloque (para que coincida 100% entre Agenda Día por Día, recuadro amarillo y Mensaje WA)
  const barrioModa = paradasNoAdheridas[0]?.barrio || 'Palermo';
  const rankingCafesGrupo = seleccionarCafesHubPorCercaniaYFranja(
    paradasNoAdheridas,
    barrioModa,
    fechaRutaDDMM || hoyBA.ddmm,
    profile
  ).cafesRanking;
  const cafeDelBloque = opcionesRuta?.cafeHubBloque || (rankingCafesGrupo[0]
    ? {
        nombre: rankingCafesGrupo[0].nombre,
        direccion: rankingCafesGrupo[0].direccion,
        lat: rankingCafesGrupo[0].lat,
        lng: rankingCafesGrupo[0].lng,
      }
    : undefined);

  const partidaResuelta = resolverCoordenadasPartidaPerfil(profile);

  // Función auxiliar para resolver la ubicación real de encuentro de cada contacto
  // (si el vecino no tiene calle/altura propia y se reúne en Café HUB o Chile 1408, usa las coordenadas exactas del punto de encuentro)
  const obtenerUbicacionEncuentroContacto = (c: Contact): {
    lat: number;
    lng: number;
    destinoNombre: string;
    destinoDireccionMaps: string;
  } => {
    if (c.calleOCruce && c.calleOCruce.trim().length > 0) {
      const barrioMaps = /chile\s+1408/i.test(c.calleOCruce) ? 'Monserrat' : c.barrio || 'Palermo';
      return {
        lat: c.lat,
        lng: c.lng,
        destinoNombre: `${c.calleOCruce} (${barrioMaps})`,
        destinoDireccionMaps: `${c.calleOCruce}, ${barrioMaps}, CABA, Argentina`,
      };
    }
    if (c.situacion === 'EVENTO_CHILE_1408') {
      return {
        lat: -34.6158,
        lng: -58.3862,
        destinoNombre: 'Chile 1408 (Monserrat)',
        destinoDireccionMaps: 'Chile 1408, Monserrat, CABA, Argentina',
      };
    }
    if (cafeDelBloque && cafeDelBloque.lat !== undefined && cafeDelBloque.lng !== undefined) {
      const dirCortaCafe = cafeDelBloque.direccion.split(',')[0].trim();
      return {
        lat: cafeDelBloque.lat,
        lng: cafeDelBloque.lng,
        destinoNombre: `${cafeDelBloque.nombre} - ${dirCortaCafe} (${c.barrio || barrioModa})`,
        destinoDireccionMaps: /argentina/i.test(cafeDelBloque.direccion)
          ? cafeDelBloque.direccion
          : `${cafeDelBloque.direccion}, Argentina`,
      };
    }
    return {
      lat: c.lat,
      lng: c.lng,
      destinoNombre: `${c.barrio}, CABA`,
      destinoDireccionMaps: c.direccionMaps,
    };
  };

  // Ordenar inicialmente priorizando:
  // 1) Vecinos con hora puntual pactada más temprana (para cumplir horarios fijos como Laura 10:00 hs o Felipe 15:00 hs)
  // 2) Vecinos con ventana horaria más acotada/temprana y cercanía geográfica desde la ubicación previa
  const pendientes = [...paradasNoAdheridas];
  const ordenadas: Contact[] = [];
  let actualLat = partidaResuelta.lat;
  let actualLng = partidaResuelta.lng;

  while (pendientes.length > 0) {
    let mejorIdx = 0;
    let menorScore = Infinity;
    for (let i = 0; i < pendientes.length; i++) {
      const cand = pendientes[i];
      const ubiCand = obtenerUbicacionEncuentroContacto(cand);
      const d = distanciaHaversineMetros(actualLat, actualLng, ubiCand.lat, ubiCand.lng);
      const disp = analizarDisponibilidadColumnaG(cand.comentario);
      let refMinutos = 15 * 60;
      let bonusPuntual = 0;
      if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
        refMinutos = horaAMinutosDelDia(disp.horaPuntualPactada);
        bonusPuntual = -500; // Prioridad estricta a quien pactó una hora puntual exacta (ej. Laura 10:00 hs, Felipe 15:00 hs)
      } else if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
        refMinutos = Math.round(disp.minInicioVentana * 0.45 + disp.minFinVentana * 0.55);
      } else if (cand.franjaHoraria === 'Mañana') {
        refMinutos = 10 * 60 + 30;
      } else if (cand.franjaHoraria === 'Mediodía') {
        refMinutos = 13 * 60;
      } else if (cand.franjaHoraria === 'Vespertino') {
        refMinutos = 18 * 60;
      }
      const score = refMinutos * 2.5 + bonusPuntual + d * 0.04;
      if (score < menorScore) {
        menorScore = score;
        mejorIdx = i;
      }
    }
    const [elegido] = pendientes.splice(mejorIdx, 1);
    ordenadas.push(elegido);
    const ubiElegido = obtenerUbicacionEncuentroContacto(elegido);
    actualLat = ubiElegido.lat;
    actualLng = ubiElegido.lng;
  }

  const bufferEfectivo = bufferMinutos;

  const ejecutarPasadaSecuencial = (secuenciaContactos: Contact[]): ParadaRuta[] => {
    const paradasCrudas: ParadaRuta[] = [];
    let cursorHora = horaSalidaStr;
    let origenNombre = profile.direccionPartida;
    let origenDireccionMaps = partidaResuelta.direccionMaps;
    let origenLat = partidaResuelta.lat;
    let origenLng = partidaResuelta.lng;
    let finVisitaParadaAnteriorMin: number | null = null;

    for (let i = 0; i < secuenciaContactos.length; i++) {
      const c = secuenciaContactos[i];
      const ubiDestino = obtenerUbicacionEncuentroContacto(c);
      const destinoNombre = ubiDestino.destinoNombre;
      const destinoDireccionMaps = ubiDestino.destinoDireccionMaps;
      const destLat = ubiDestino.lat;
      const destLng = ubiDestino.lng;

      const dispColG = analizarDisponibilidadColumnaG(c.comentario);
      const horaPactadaExplicita = dispColG.esVentanaAmplia ? undefined : dispColG.horaPuntualPactada;

      let trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
      let minutosViaje = trasladoActual.minutos;
      let modoTraslado = trasladoActual.modo;

      let horaSalida = cursorHora;
      let notaHorarioConveniente: string | undefined;

      // Verificar si un tramo [iniSalidaMin, finVisitaMin] se superpone con algún evento de Google Calendar.
      // IMPORTANTE: No duplicar tiempos de traslado después del evento; cuando el evento termina en `evFin`,
      // el promotor parte de la ubicación del evento en `evFin` y suma `minutosViaje` hacia la parada `c`.
      const chequearChoqueTramoConCalendar = (
        iniSalidaMin: number,
        finVisitaMin: number,
        stopLat: number,
        stopLng: number
      ) => {
        for (const ev of eventosParaEvaluar) {
          const coincideDia =
            !ev.fecha ||
            !fechaRutaDDMM ||
            ev.fecha === fechaRutaDDMM ||
            c.fechasMencionadas.includes(ev.fecha);
          if (!coincideDia) continue;
          const evIni = horaAMinutosDelDia(ev.startTime);
          const evFin = horaAMinutosDelDia(ev.endTime);
          const esVirtual = esEventoVirtualCalendar(ev);
          const geoEv = geocodificarEventoCalendar(ev, profile);
          const trasladoHaciaEv = esVirtual
            ? { minutos: 0, modo: 'WALKING' as const, distanciaMetros: 0, cuadras: 0 }
            : calcularMinutosTrasladoCABA(stopLat, stopLng, geoEv.lat, geoEv.lng);
          const margenHaciaEv = esVirtual ? 5 : Math.min(25, trasladoHaciaEv.minutos + 2);
          const margenPostEv = esVirtual ? 2 : 0;

          if (iniSalidaMin < evFin + margenPostEv && finVisitaMin + margenHaciaEv > evIni) {
            return { ev, geoEv, trasladoEv: trasladoHaciaEv, evIni, evFin, esVirtual };
          }
        }
        return null;
      };

      const pactadaExactaMin = horaPactadaExplicita ? horaAMinutosDelDia(horaPactadaExplicita) : null;
      const ventanaColGYaVencidaHoy =
        esRutaDeHoy &&
        dispColG.minFinVentana !== undefined &&
        minutosActualesBA >= dispColG.minFinVentana + 5;
      const citaPuntualYaVencidaHoy =
        esRutaDeHoy &&
        ((pactadaExactaMin !== null && minutosActualesBA >= pactadaExactaMin + 5) ||
          ventanaColGYaVencidaHoy);

      // Si es la ruta de HOY y esta parada NO es una cita o ventana ya vencida en el pasado,
      // el promotor no puede salir hacia esta parada antes de la hora actual (`minutosActualesBA`).
      if (
        esRutaDeHoy &&
        !citaPuntualYaVencidaHoy &&
        minutosActualesBA >= 8 * 60 + 30 &&
        minutosActualesBA < 19 * 60 + 30 &&
        horaAMinutosDelDia(horaSalida) < minutosActualesBA
      ) {
        const salidaAhoraMin = Math.ceil(minutosActualesBA / 5) * 5;
        horaSalida = sumarMinutosAHora('00:00', salidaAhoraMin);
      }

      const salidaActualMin = horaAMinutosDelDia(horaSalida);
      const llegadaActualMin = salidaActualMin + minutosViaje;

      // 1. Posicionar inicialmente según hora puntual pactada o inicio de ventana (incluyendo "por la tarde" >= 14:00)
      if (horaPactadaExplicita && pactadaExactaMin !== null) {
        const salidaParaLlegarPuntualMin = Math.max(8 * 60, pactadaExactaMin - minutosViaje);
        if (citaPuntualYaVencidaHoy) {
          horaSalida = sumarMinutosAHora('00:00', salidaParaLlegarPuntualMin);
        } else if (i === 0 && Math.abs(llegadaActualMin - pactadaExactaMin) <= 60) {
          horaSalida = sumarMinutosAHora('00:00', salidaParaLlegarPuntualMin);
        } else if (i > 0 && llegadaActualMin < pactadaExactaMin) {
          horaSalida = sumarMinutosAHora('00:00', salidaParaLlegarPuntualMin);
        }
      } else if (ventanaColGYaVencidaHoy && dispColG.minFinVentana !== undefined) {
        const llegadaObjetivoVencida = Math.max(
          dispColG.minInicioVentana ?? 9 * 60,
          dispColG.minFinVentana - 20
        );
        const salidaVencidaMin = Math.max(8 * 60, llegadaObjetivoVencida - minutosViaje);
        horaSalida = sumarMinutosAHora('00:00', salidaVencidaMin);
      } else if (
        dispColG.minInicioVentana !== undefined &&
        llegadaActualMin < dispColG.minInicioVentana
      ) {
        const salidaAlInicioVentana = Math.max(
          salidaActualMin,
          dispColG.minInicioVentana - minutosViaje
        );
        horaSalida = sumarMinutosAHora('00:00', salidaAlInicioVentana);
      }

      // 2. Revisar si justo antes del cursor actual terminó un evento físico de Google Calendar
      //    (y sólo si dicho evento terminó DESPUÉS de la parada anterior visitada, para no pisar el origen secuencial)
      const cursorPreLoopMin = horaAMinutosDelDia(horaSalida);
      const eventoPrevioInmediato = [...eventosParaEvaluar]
        .reverse()
        .find((ev) => {
          if (esEventoVirtualCalendar(ev)) return false;
          const evFin = horaAMinutosDelDia(ev.endTime);
          const ocurrioDespuesDeParadaPrevia =
            finVisitaParadaAnteriorMin === null || evFin >= finVisitaParadaAnteriorMin;
          return (
            ocurrioDespuesDeParadaPrevia &&
            evFin <= cursorPreLoopMin &&
            cursorPreLoopMin - evFin <= 35 &&
            Boolean(ev.location)
          );
        });
      if (eventoPrevioInmediato) {
        const geoEv = geocodificarEventoCalendar(eventoPrevioInmediato, profile);
        const dirCortaEv = geoEv.label.split(',')[0].trim();
        origenNombre = `Evento Calendar: ${eventoPrevioInmediato.summary} (${dirCortaEv})`;
        origenDireccionMaps = /argentina/i.test(geoEv.label)
          ? geoEv.label
          : `${geoEv.label}, Argentina`;
        origenLat = geoEv.lat;
        origenLng = geoEv.lng;
        trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
        minutosViaje = trasladoActual.minutos;
        modoTraslado = trasladoActual.modo;
      }

      // 3. BUCLE ESTRICTO ANTI-CHOQUE CALENDAR:
      // Si el tramo [horaSalida, horaFinVisita] choca con CUALQUIER evento de Google Calendar (ej. Dentista 11:30-13:00,
      // Almuerzo con Frima 13:15-14:15, Terapia 14:30-15:20 o Reunión virtual 16:00-17:00), avanzar iterativamente
      // hasta el primer hueco libre posterior a todos los eventos encadenados.
      const eventosSaltados: CalendarEventItem[] = [];
      let guardIter = 0;
      while (guardIter < 12 && !citaPuntualYaVencidaHoy) {
        guardIter++;
        const salMin = horaAMinutosDelDia(horaSalida);
        const llegMin = salMin + minutosViaje;
        const finMin = llegMin + bufferEfectivo;
        const choque = chequearChoqueTramoConCalendar(salMin, finMin, destLat, destLng);
        if (!choque) break;

        if (!eventosSaltados.some((e) => e.id === choque.ev.id)) {
          eventosSaltados.push(choque.ev);
        }

        const nuevaSalidaMin = choque.evFin + (choque.esVirtual ? 2 : 0);
        if (nuevaSalidaMin + minutosViaje + bufferEfectivo > 20 * 60 + 15) {
          break;
        }

        if (!choque.esVirtual) {
          const dirCortaEv = choque.geoEv.label.split(',')[0].trim();
          origenNombre = `Evento Calendar: ${choque.ev.summary} (${dirCortaEv})`;
          origenDireccionMaps = /argentina/i.test(choque.geoEv.label)
            ? choque.geoEv.label
            : `${choque.geoEv.label}, Argentina`;
          origenLat = choque.geoEv.lat;
          origenLng = choque.geoEv.lng;
          trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
          minutosViaje = trasladoActual.minutos;
          modoTraslado = trasladoActual.modo;
        }

        horaSalida = sumarMinutosAHora('00:00', nuevaSalidaMin);
      }

      const horaLlegada = sumarMinutosAHora(horaSalida, minutosViaje);
      const horaFinVisita = sumarMinutosAHora(horaLlegada, bufferEfectivo);

      const llegadaVisitaMin = horaAMinutosDelDia(horaLlegada);
      const finVisitaMin = horaAMinutosDelDia(horaFinVisita);
      const pactadaMin = horaPactadaExplicita ? horaAMinutosDelDia(horaPactadaExplicita) : null;

      if (dispColG.esVentanaAmplia && dispColG.etiquetaVentana) {
        if (eventosSaltados.length > 0) {
          const resumenEvs = eventosSaltados
            .map((e) => `"${e.summary}" (${e.startTime}-${e.endTime})`)
            .join(', ');
          notaHorarioConveniente = `Franja amplia en Col. G (${dispColG.etiquetaVentana}): se reubicó automáticamente a las ${horaLlegada} hs para no superponerse con ${resumenEvs}.`;
        } else {
          notaHorarioConveniente = `Dentro de su franja de Col. G (${dispColG.etiquetaVentana}) · Horario conveniente asignado: ${horaLlegada} hs (sin choques con Calendar).`;
        }
      }

      const detalleTransporte =
        trasladoActual.distanciaMetros <= 30
          ? `En el mismo punto de encuentro (${destinoNombre.split(',')[0]})`
          : modoTraslado === 'WALKING'
          ? `A pie (${minutosViaje} min / ${trasladoActual.cuadras} cuadras desde ${origenNombre.split(',')[0]})`
          : `Transporte Público (~${minutosViaje} min desde ${origenNombre.split(',')[0]} hacia ${c.barrio})`;

      let conflictoCalendar: string | undefined;
      let alternativaOptimaSugerida: string | undefined;
      let mensajeReprogramacionCalendar: string | undefined;

      const tieneCafeGrupal =
        Boolean(cafeDelBloque) || paradasNoAdheridas.length >= 2;

      const cafeCercano = cafeDelBloque
        ? {
            nombre: cafeDelBloque.nombre,
            direccion: cafeDelBloque.direccion,
            lat: cafeDelBloque.lat ?? destLat,
            lng: cafeDelBloque.lng ?? destLng,
          }
        : tieneCafeGrupal
        ? buscarCafeHubMasCercano(destLat, destLng) || CATALOGO_CAFES_HUB_CABA[0]
        : undefined;

      const distAlCafe = cafeCercano
        ? estimarMinutosCaminandoCABA(destLat, destLng, cafeCercano.lat, cafeCercano.lng)
        : { minutosCaminando: 8, cuadrasAprox: 6, distanciaMetros: 600 };

      const nombreSaludo = c.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${c.primerNombre}, ¿cómo estás?`;
      const fraseCafeParada = cafeCercano
        ? `el café *${cafeCercano.nombre}* (${cafeCercano.direccion.split(',')[0]}, que está a unos ${Math.max(2, Math.round(distAlCafe.minutosCaminando))} minutos de ${destinoNombre})`
        : '';

      // 1. VERIFICAR SI EL HORARIO PACTADO O LA VENTANA DEL CONTACTO FUE DESPLAZADA POR UN EVENTO DE GOOGLE CALENDAR
      if (eventosSaltados.length > 0) {
        const evPrincipal = eventosSaltados[eventosSaltados.length - 1];
        const resumenTodosEvs = eventosSaltados
          .map((e) => `"${e.summary}" (${e.startTime}-${e.endTime})`)
          .join(' + ');
        const desfasajePactada =
          pactadaMin !== null && Math.abs(llegadaVisitaMin - pactadaMin) >= 15;
        const excedeVentanaColG =
          dispColG.minFinVentana !== undefined && llegadaVisitaMin > dispColG.minFinVentana + 15;

        if (desfasajePactada || excedeVentanaColG) {
          const horaOriginalTxt =
            horaPactadaExplicita || dispColG.etiquetaVentana || evPrincipal.startTime;
          const horarioConvenientePropuesto = `alrededor de las ${horaLlegada} hs`;

          alternativaOptimaSugerida = cafeCercano
            ? `Pasar por ${destinoNombre} hoy ${horarioConvenientePropuesto} (al finalizar ${resumenTodosEvs}), o encontrarnos en ${fraseCafeParada}.`
            : `Pasar por ${destinoNombre} hoy ${horarioConvenientePropuesto} (al finalizar ${resumenTodosEvs}).`;

          conflictoCalendar = `Horario en Col. G (${horaOriginalTxt}) coincide con tu agenda de Calendar (${resumenTodosEvs}). Se reubicó automáticamente a las ${horaLlegada} hs${cafeCercano ? ` o en ${cafeCercano.nombre}` : ''}.`;

          mensajeReprogramacionCalendar = cafeCercano
            ? `${nombreSaludo}\n\nTe pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${destinoNombre}* en el horario de las ${horaOriginalTxt}.\n\nPara adaptarme a lo que te quede más cómodo, te propongo dos opciones:\n1. Pasar 2 minutos por *${destinoNombre}* *${horarioConvenientePropuesto}*.\n2. O si preferís, encontrarnos unos minutos en ${fraseCafeParada}.\n\n¿Cuál de las dos opciones o qué otro horario te viene mejor? Gracias.`
            : `${nombreSaludo}\n\nTe pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${destinoNombre}* en el horario de las ${horaOriginalTxt}. ¿Te quedaría bien que pase 2 minutos por *${destinoNombre}* *${horarioConvenientePropuesto}*, o qué otro horario te resulta más cómodo? Gracias.`;
        }
      }

      // 2. VERIFICAR CHOQUE / SUPERPOSICIÓN CON EL HORARIO/DÍA FIJADO O CONFIRMADO POR OTRA PERSONA
      if (!conflictoCalendar && !dispColG.esVentanaAmplia) {
        const tieneRestriccionFija =
          pactadaMin !== null ||
          (dispColG.minInicioVentana !== undefined && dispColG.minFinVentana !== undefined) ||
          esContactoConfirmadoEnLista1a1(c);
        const cIniDeseado = pactadaMin ?? dispColG.minInicioVentana ?? llegadaVisitaMin;
        const cFinDeseado =
          pactadaMin !== null
            ? pactadaMin + bufferEfectivo
            : dispColG.minFinVentana ?? finVisitaMin;

        if (tieneRestriccionFija) {
          for (const prevP of paradasCrudas) {
            const ambosEnMismoCafeHub =
              c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' &&
              prevP.contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE';
            if (ambosEnMismoCafeHub) continue;

            const prevDisp = analizarDisponibilidadColumnaG(prevP.contact.comentario);
            const prevPactadaMin = prevDisp.esVentanaAmplia
              ? null
              : prevDisp.horaPuntualPactada
              ? horaAMinutosDelDia(prevDisp.horaPuntualPactada)
              : null;
            const prevFinMin = horaAMinutosDelDia(prevP.horaFinVisita);
            const trEntreAmbos = calcularMinutosTrasladoCABA(
              prevP.destinoLat,
              prevP.destinoLng,
              destLat,
              destLng
            );

            const chocaDirectoConPactadaPrevia =
              pactadaMin !== null &&
              prevPactadaMin !== null &&
              Math.abs(pactadaMin - prevPactadaMin) < bufferEfectivo + trEntreAmbos.minutos;

            const atrasoPorParadaPrevia =
              (pactadaMin !== null &&
                llegadaVisitaMin > pactadaMin + 10 &&
                prevFinMin + trEntreAmbos.minutos > pactadaMin) ||
              (dispColG.minFinVentana !== undefined &&
                llegadaVisitaMin + bufferEfectivo > dispColG.minFinVentana + 10);

            if (chocaDirectoConPactadaPrevia || atrasoPorParadaPrevia) {
              const horaLibrePostVecino = sumarMinutosAHora(
                prevP.horaFinVisita,
                trEntreAmbos.minutos
              );
              const horaConflictoTxt =
                horaPactadaExplicita || dispColG.etiquetaVentana || prevP.horaLlegada;
              const lugarPrevio = prevP.contact.calleOCruce || prevP.contact.barrio;

              alternativaOptimaSugerida = cafeCercano
                ? `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostVecino} hs (al finalizar el encuentro previo con #${prevP.contact.id} ${prevP.contact.nombreCompletoCorregido} en ${lugarPrevio}, contemplando ~${trEntreAmbos.minutos} min de traslado), o encontrarnos en ${fraseCafeParada}.`
                : `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostVecino} hs (al finalizar el encuentro previo con #${prevP.contact.id} ${prevP.contact.nombreCompletoCorregido} en ${lugarPrevio}, contemplando ~${trEntreAmbos.minutos} min de traslado).`;

              conflictoCalendar = `Horario fijado en Col. G (${horaConflictoTxt} hs) se superpone con el horario/día fijado o confirmado con #${prevP.contact.id} ${prevP.contact.nombreCompletoCorregido} (${prevP.horaLlegada}-${prevP.horaFinVisita} hs en ${lugarPrevio}, ~${trEntreAmbos.minutos} min de traslado). Se sugiere proponer pasar a las ${horaLibrePostVecino} hs${cafeCercano ? ` o en ${cafeCercano.nombre}` : ''}.`;

              mensajeReprogramacionCalendar = cafeCercano
                ? `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto.\n\nQuería proponerte dos opciones para reprogramarlo:\n1. Pasar 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostVecino} hs*.\n2. O bien encontrarnos unos minutos en ${fraseCafeParada}.\n\n¿Cuál te queda más cómoda? Gracias.`
                : `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto. ¿Te queda bien que pase 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostVecino} hs*, o en qué otro horario preferís? Gracias.`;
              break;
            }
          }

          if (!conflictoCalendar && opcionesRuta?.contactosMismoDia) {
            const idsEnParadasCrudas = new Set(paradasCrudas.map((p) => p.contact.id));
            for (const otro of opcionesRuta.contactosMismoDia) {
              if (otro.id === c.id || idsEnParadasCrudas.has(otro.id)) continue;
              if (otro.adhirio === 'Sí' || otro.situacion === 'DESCARTADO_NO_CABA') continue;

              const ambosEnMismoCafeHub =
                c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' &&
                otro.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' &&
                c.barrio === otro.barrio;
              if (ambosEnMismoCafeHub) continue;

              const dispOtro = analizarDisponibilidadColumnaG(otro.comentario);
              if (dispOtro.esVentanaAmplia) continue;
              const otroPactadaMin = dispOtro.horaPuntualPactada
                ? horaAMinutosDelDia(dispOtro.horaPuntualPactada)
                : null;
              const otroIniMin = otroPactadaMin ?? dispOtro.minInicioVentana ?? null;
              if (otroIniMin === null) continue;
              const otroFinMin =
                otroPactadaMin !== null
                  ? otroPactadaMin + bufferEfectivo
                  : dispOtro.minFinVentana ?? otroIniMin + bufferEfectivo;

              let compartenDia = false;
              if (fechaRutaDDMM) {
                const cEsDeFechaRuta =
                  c.fechasMencionadas.length === 0 || c.fechasMencionadas.includes(fechaRutaDDMM);
                const otroEsDeFechaRuta =
                  otro.fechasMencionadas.includes(fechaRutaDDMM) ||
                  (otro.fechasMencionadas.length === 0 && esContactoConfirmadoEnLista1a1(otro));
                compartenDia = cEsDeFechaRuta && otroEsDeFechaRuta;
              } else {
                compartenDia =
                  c.fechasMencionadas.length > 0 &&
                  c.fechasMencionadas.some((f) => otro.fechasMencionadas.includes(f));
              }
              if (!compartenDia) continue;

              const ubiOtro = obtenerUbicacionEncuentroContacto(otro);
              const trVecinos = calcularMinutosTrasladoCABA(ubiOtro.lat, ubiOtro.lng, destLat, destLng);

              if (
                cIniDeseado < otroFinMin + trVecinos.minutos &&
                cFinDeseado + trVecinos.minutos > otroIniMin
              ) {
                const horaLibrePostOtro = sumarMinutosAHora(
                  sumarMinutosAHora('00:00', otroFinMin),
                  trVecinos.minutos + 5
                );
                const horaConflictoTxt =
                  horaPactadaExplicita || dispColG.etiquetaVentana || sumarMinutosAHora('00:00', cIniDeseado);
                const horaOtroTxt =
                  dispOtro.horaPuntualPactada ||
                  dispOtro.etiquetaVentana ||
                  sumarMinutosAHora('00:00', otroIniMin);
                const lugarOtro = otro.calleOCruce || otro.barrio;

                alternativaOptimaSugerida = cafeCercano
                  ? `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostOtro} hs (contemplando el encuentro de las ${horaOtroTxt} hs con #${otro.id} ${otro.nombreCompletoCorregido} en ${lugarOtro} y ~${trVecinos.minutos} min de traslado), o encontrarnos en ${fraseCafeParada}.`
                  : `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostOtro} hs (contemplando el encuentro de las ${horaOtroTxt} hs con #${otro.id} ${otro.nombreCompletoCorregido} en ${lugarOtro} y ~${trVecinos.minutos} min de traslado).`;

                conflictoCalendar = `Horario fijado en Col. G (${horaConflictoTxt} hs) se superpone con el horario/día fijado o confirmado con #${otro.id} ${otro.nombreCompletoCorregido} (${horaOtroTxt} hs en ${lugarOtro}, ~${trVecinos.minutos} min de traslado). Se sugiere coordinar a las ${horaLibrePostOtro} hs${cafeCercano ? ` o en ${cafeCercano.nombre}` : ''}.`;

                mensajeReprogramacionCalendar = cafeCercano
                  ? `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto.\n\nQuería proponerte dos opciones:\n1. Pasar 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostOtro} hs*.\n2. O bien encontrarnos unos minutos en ${fraseCafeParada}.\n\n¿Cuál de las dos te queda mejor? Gracias.`
                  : `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto. ¿Te queda bien que pase 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostOtro} hs*, o en qué otro horario te resulta más cómodo? Gracias.`;
                break;
              }
            }
          }
        }
      }

      if (!mensajeReprogramacionCalendar) {
        const altCafeTxt = cafeCercano
          ? `o encontrarnos 2 minutos en ${fraseCafeParada}`
          : `o coordinar en otro horario que te quede cómodo`;
        alternativaOptimaSugerida = cafeCercano
          ? `Pasar en el horario conveniente de las ${horaLlegada} hs por ${destinoNombre} o en ${fraseCafeParada}.`
          : `Pasar en el horario conveniente de las ${horaLlegada} hs por ${destinoNombre}.`;
        mensajeReprogramacionCalendar = `${nombreSaludo}\n\nTe pido disculpas porque hoy no voy a poder cumplir con nuestro compromiso de pasar por *${destinoNombre}* en el horario que teníamos previsto.\n\nPara adaptarme a lo que te quede más cómodo esta semana en ${c.barrio}, ¿preferís que reprogramemos la pasada de 2 minutos por *${destinoNombre}* para mañana, ${altCafeTxt}? Avisame qué día y franja te viene mejor.`;
      }

      // Exclusivo para el botón "🚪 No estaba / Reprogramar" de la pestaña 3 ("3. Hoja de Ruta en Terreno")
      const mensajeNoEstabaReprogramar = cafeCercano
        ? `${nombreSaludo}\n\nRecién pasé un ratito por *${destinoNombre}* dentro del recorrido por ${c.barrio} para los 2 minutos de la firma de adhesión, pero imagino que nos desencuentramos por unos minutos.\n\nNo hay problema. Para reprogramarlo fácil en estos días: ¿preferís que vuelva a pasar 2 minutos por *${destinoNombre}* en otro día y horario puntual, o te queda más cómodo pasar por ${fraseCafeParada}? Avisame cuando puedas y lo agendamos.`
        : `${nombreSaludo}\n\nRecién pasé un ratito por *${destinoNombre}* dentro del recorrido por ${c.barrio} para los 2 minutos de la firma de adhesión, pero imagino que nos desencuentramos por unos minutos.\n\nNo hay problema. ¿Qué otro día y horario te queda cómodo para reprogramar y volver a pasar 2 minutos por *${destinoNombre}*? Avisame cuando puedas y lo agendamos.`;

      // Mensaje de disculpas asumiendo la responsabilidad por no haber podido cumplir el compromiso
      const mensajeDisculpasPorCompromisoIncumplido = cafeCercano
        ? `${nombreSaludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${destinoNombre}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para mañana o el día de esta semana que te quede más cómodo, pasando un ratito por *${destinoNombre}* o bien encontrándonos unos minutos en ${fraseCafeParada}. ¿Qué día y franja horaria te viene mejor?`
        : `${nombreSaludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${destinoNombre}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para mañana o el día de esta semana que te quede más cómodo para pasar 2 minutos por *${destinoNombre}*. ¿Qué día y franja horaria te viene mejor?`;

      const urlGoogleMapsTramo = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origenDireccionMaps
      )}&destination=${encodeURIComponent(
        destinoDireccionMaps
      )}&travelmode=${modoTraslado.toLowerCase()}`;

      const confirmado1a1 =
        esContactoConfirmadoEnLista1a1(c) ||
        Boolean(opcionesRuta?.idsConfirmados1a1?.has(c.id));

      // Detectar si esta parada en la ruta de HOY ya venció respecto de la hora actual (`ahoraRefMs`) sin haber adherido
      const vencioVentanaHoyPorCalendar =
        esRutaDeHoy &&
        dispColG.minFinVentana !== undefined &&
        minutosActualesBA >= dispColG.minFinVentana - 30 &&
        llegadaVisitaMin > dispColG.minFinVentana + 15;

      const yaPasoHoraParadaHoy =
        esRutaDeHoy &&
        c.adhirio !== 'Sí' &&
        (Boolean(c.alertaVencido?.activa) ||
          citaPuntualYaVencidaHoy ||
          vencioVentanaHoyPorCalendar ||
          minutosActualesBA >= finVisitaMin);

      const motivoVencimiento = yaPasoHoraParadaHoy
        ? c.alertaVencido?.motivo ||
          `El horario previsto hoy (${horaPactadaExplicita || dispColG.etiquetaVentana || horaLlegada} hs) ya pasó siendo las ${hoyBA.hhmm} hs y aún figura sin adherir — reprogramar encuentro o marcar "Ya Adhirió".`
        : undefined;

      const mensajeDisculpasVencido = yaPasoHoraParadaHoy
        ? c.alertaVencido?.mensajeDisculpasReprogramacion || mensajeDisculpasPorCompromisoIncumplido
        : undefined;

      const paradaObj: ParadaRuta = {
        orden: i + 1,
        contact: c,
        origenNombre,
        origenLat,
        origenLng,
        destinoNombre,
        destinoLat: destLat,
        destinoLng: destLng,
        modoTraslado,
        distanciaMetros: trasladoActual.distanciaMetros,
        cuadrasAprox: trasladoActual.cuadras,
        minutosViaje,
        minutosEncuentro: bufferEfectivo,
        horaSalida,
        horaLlegada,
        horaFinVisita,
        detalleTransporte,
        conflictoCalendar,
        alternativaOptimaSugerida,
        mensajeReprogramacionCalendar,
        mensajeNoEstabaReprogramar,
        horaPactadaExplicita,
        ventanaColumnaG: dispColG.etiquetaVentana,
        notaHorarioConveniente,
        cafeHubAsignado: cafeCercano
          ? { nombre: cafeCercano.nombre, direccion: cafeCercano.direccion }
          : undefined,
        confirmadoEnLista1a1: confirmado1a1,
        vencidaSinAdherir: yaPasoHoraParadaHoy,
        motivoVencimiento,
        mensajeDisculpasVencido,
        urlGoogleMapsTramo,
      };

      const cafeTextoBloque = cafeCercano
        ? `${cafeCercano.nombre} (${cafeCercano.direccion.split(',')[0]})`
        : undefined;

      paradaObj.mensajeTerrenoSugerido = generarMensajeTerrenoParadaRuta(
        paradaObj,
        yaPasoHoraParadaHoy ? 'DISCULPAS_CANCELACION_REPROGRAMAR' : 'EN_CAMINO_HORA_CALC',
        profile,
        cafeTextoBloque
      );

      paradasCrudas.push(paradaObj);

      // Si esta parada de hoy era una cita puntual que ya venció en el pasado (ej. Laura 10:00 hs siendo las 10:18 hs),
      // la siguiente parada activa parte desde la hora actual (`ahoraSalMin`) y desde la base / ubicación actual.
      if (esRutaDeHoy && citaPuntualYaVencidaHoy && finVisitaMin < minutosActualesBA) {
        const salidaAhoraMin = Math.ceil(minutosActualesBA / 5) * 5;
        cursorHora = sumarMinutosAHora('00:00', salidaAhoraMin);
        origenNombre = profile.direccionPartida;
        origenDireccionMaps = partidaResuelta.direccionMaps;
        origenLat = partidaResuelta.lat;
        origenLng = partidaResuelta.lng;
        finVisitaParadaAnteriorMin = null;
      } else {
        cursorHora = horaFinVisita;
        origenNombre = destinoNombre;
        origenDireccionMaps = destinoDireccionMaps;
        origenLat = destLat;
        origenLng = destLng;
        finVisitaParadaAnteriorMin = finVisitaMin;
      }
    }

    return paradasCrudas;
  };

  let paradasCalculadas = ejecutarPasadaSecuencial(ordenadas);

  // Ordenar estrictamente por horario de llegada ascendente; si el orden cronológico cambió respecto del orden inicial,
  // recalcular la pasada secuencial en ese orden cronológico para que los orígenes y tiempos de traslado entre paradas
  // coincidan 100% con la secuencia real de la tabla.
  let paradasOrdenadasPorHora = [...paradasCalculadas].sort(
    (a, b) => horaAMinutosDelDia(a.horaLlegada) - horaAMinutosDelDia(b.horaLlegada)
  );
  const cambioOrdenSecuencia = paradasOrdenadasPorHora.some(
    (p, idx) => p.contact.id !== paradasCalculadas[idx]?.contact.id
  );
  if (cambioOrdenSecuencia) {
    paradasCalculadas = ejecutarPasadaSecuencial(
      paradasOrdenadasPorHora.map((p) => p.contact)
    );
    paradasOrdenadasPorHora = [...paradasCalculadas].sort(
      (a, b) => horaAMinutosDelDia(a.horaLlegada) - horaAMinutosDelDia(b.horaLlegada)
    );
  }

  return paradasOrdenadasPorHora.map((p, idx) => ({
    ...p,
    orden: idx + 1,
  }));
}

/**
 * Genera el mensaje en vivo según la situación en terreno para cada parada de la Hoja de Ruta Casa x Casa y Café.
 * Garantiza que el café mencionado coincida siempre con el café asignado al bloque (`p.cafeHubAsignado` o `cafeHubActivoEnRuta`),
 * sin repetir quién es el remitente ni usar lenguaje artificial ("Café HUB" / exceso de signos de exclamación).
 */
export function generarMensajeTerrenoParadaRuta(
  p: ParadaRuta,
  modo: ModoMensajeTerrenoRuta = 'EN_CAMINO_HORA_CALC',
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  cafeHubActivoEnRuta?: string
): string {
  const c = p.contact;
  const nombreSaludo = c.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${c.primerNombre}, ¿cómo estás?`;
  const dir = p.destinoNombre;
  const posdataNombre = c.sinNombre
    ? '\n\n_(De paso, cuando nos veamos o por acá recordame tu nombre y apellido así te agendo bien en la planilla)_.'
    : '';

  const tieneCafe = Boolean(cafeHubActivoEnRuta || p.cafeHubAsignado);
  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: c.barrio,
      calleOCruce: c.calleOCruce || dir,
      lat: c.lat,
      lng: c.lng,
    },
    profile,
    {
      incluirCafe: tieneCafe,
      cafeNombre: p.cafeHubAsignado?.nombre,
      cafeDireccion: p.cafeHubAsignado?.direccion,
      cafeTexto: cafeHubActivoEnRuta,
    }
  );

  const prefiereCafeConfirmado =
    c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    /confirm[oó]\s+caf[eé]|prefiere\s+punto\s+de\s+encuentro/i.test(
      c.comentario || ''
    );

  const construirTextoTerreno = (): string => {
    switch (modo) {
      case 'RECORDATORIO_MANIANA_ANTES_SALIR':
        if (prefiereCafeConfirmado && infoCafe.incluirCafe) {
          return `${nombreSaludo} Te escribo antes de salir para recordarte que hoy nos vemos en ${infoCafe.fraseCafe} alrededor de las *${p.horaLlegada} hs* para los 2 minutos de la firma de adhesión (acordate de llevar tu DNI físico con domicilio en CABA). Te voy avisando por acá cuando ya esté instalado ahí.${posdataNombre}`;
        }
        return infoCafe.incluirCafe
          ? `${nombreSaludo} Te escribo antes de arrancar el recorrido de hoy por ${c.barrio} para recordarte que hoy paso 2 minutos por *${dir}* alrededor de las *${p.horaLlegada} hs* (o si preferís, también voy a estar en ${infoCafe.fraseCafe}). Te voy avisando cuando ya esté en camino; acordate de tener a mano el DNI físico con domicilio en CABA.${posdataNombre}`
          : `${nombreSaludo} Te escribo antes de arrancar el recorrido de hoy por ${c.barrio} para recordarte que hoy paso 2 minutos por *${dir}* alrededor de las *${p.horaLlegada} hs* para la firma de adhesión. Te voy avisando cuando ya esté en camino; acordate de tener a mano el DNI físico con domicilio en CABA.${posdataNombre}`;

      case 'DISCULPAS_CANCELACION_REPROGRAMAR':
        return (
          p.mensajeDisculpasVencido ||
          p.mensajeReprogramacionCalendar ||
          (infoCafe.incluirCafe
            ? `${nombreSaludo} Te pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${dir}* en el horario previsto. ¿Preferís que reprogramemos la pasada de 2 minutos por *${dir}* para mañana o que nos encontremos en ${infoCafe.fraseCafe}?${posdataNombre}`
            : `${nombreSaludo} Te pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${dir}* en el horario previsto. ¿Qué día y horario te queda bien para reprogramar los 2 minutos por *${dir}*?${posdataNombre}`)
        );

      case 'NO_ESTABA_REPROGRAMAR':
        return (
          p.mensajeNoEstabaReprogramar ||
          (infoCafe.incluirCafe
            ? `${nombreSaludo} Recién pasé por *${dir}* para los 2 minutos de la firma de adhesión y no llegamos a cruzarnos. No hay problema, ¿preferís que reprogramemos para pasar por *${dir}* en otro día y horario, o encontrarnos en ${infoCafe.fraseCafe}?${posdataNombre}`
            : `${nombreSaludo} Recién pasé por *${dir}* para los 2 minutos de la firma de adhesión y no llegamos a cruzarnos. No hay problema, ¿qué otro día y horario te queda bien para reprogramar?${posdataNombre}`)
        );

      case 'DEMORADO_10_MIN':
        return infoCafe.incluirCafe
          ? `${nombreSaludo} Te aviso que vengo con unos 15 minutos de demora del encuentro anterior; calculo estar llegando por *${dir}* cerca de las *${p.horaLlegada} hs*. Si se te complica ese horario avisame con confianza y lo reprogramamos o nos vemos en ${infoCafe.fraseCafe}. Disculpá la demora y gracias por esperarme.${posdataNombre}`
          : `${nombreSaludo} Te aviso que vengo con unos 15 minutos de demora del encuentro anterior; calculo estar llegando por *${dir}* cerca de las *${p.horaLlegada} hs*. Si se te complica ese horario avisame con confianza y lo reprogramamos. Disculpá la demora y gracias por esperarme.${posdataNombre}`;

      case 'LLEGANDO_2_MIN':
        return `${nombreSaludo} Ya estoy a 2 minutos de *${dir}*. Acordate de tener a mano el DNI físico con domicilio en CABA así lo hacemos en un minuto.${posdataNombre}`;

      case 'YA_EN_CAFE_HUB':
        return `${nombreSaludo} Ya estoy con las fichas de adhesión en ${infoCafe.fraseCafe}. Cuando andes por acá acercate tranquilo/a (toma apenas 2 minutos con el DNI físico de CABA) y avisame por acá así nos ubicamos enseguida.${posdataNombre}`;

      case 'CONFIRMACION_HOY':
        if (p.conflictoCalendar && p.mensajeReprogramacionCalendar) {
          return p.mensajeReprogramacionCalendar;
        }
        if (prefiereCafeConfirmado && infoCafe.incluirCafe) {
          return `${nombreSaludo} Te escribo para confirmar nuestro encuentro de hoy en ${infoCafe.fraseCafe} alrededor de las *${p.horaLlegada} hs* (son 2 minutos con tu DNI físico de CABA). Nos vemos ahí.${posdataNombre}`;
        }
        return infoCafe.incluirCafe
          ? `${nombreSaludo} Estoy organizando el recorrido de hoy por ${c.barrio}: calculo estar pasando por *${dir}* alrededor de las *${p.horaLlegada} hs* (o si te queda más cómodo, podemos encontrarnos en ${infoCafe.fraseCafe}). ¿Te viene bien ese horario?${posdataNombre}`
          : `${nombreSaludo} Estoy organizando el recorrido de hoy por ${c.barrio}: calculo estar pasando por *${dir}* alrededor de las *${p.horaLlegada} hs*. ¿Te viene bien ese horario?${posdataNombre}`;

      case 'EN_CAMINO_HORA_CALC':
      default:
        if (p.conflictoCalendar && p.mensajeReprogramacionCalendar) {
          return p.mensajeReprogramacionCalendar;
        }
        if (prefiereCafeConfirmado && infoCafe.incluirCafe) {
          return `${nombreSaludo} Ya estoy yendo para ${infoCafe.fraseCafe}: calculo estar ahí desde las *${p.horaLlegada} hs* con las fichas de adhesión (acordate de traer tu DNI físico con domicilio en CABA). Nos vemos en un ratito.${posdataNombre}`;
        }
        return `${nombreSaludo} Ya estoy en camino por la zona: calculo estar pasando por *${dir}* alrededor de las *${p.horaLlegada} hs* (acordate de tener a mano el DNI físico con domicilio en CABA, nos toma 2 minutos). Nos vemos en un ratito.${posdataNombre}`;
    }
  };

  return corregirPelonesDiaSemanaEnTexto(construirTextoTerreno());
}

function filtrarEventosCalendarParaDia(
  eventosCalendar: CalendarEventItem[],
  diaBA: { ddmm: string; isoDate: string },
  ahoraMs?: number
): CalendarEventItem[] {
  const base =
    ahoraMs !== undefined
      ? filtrarEventosCalendarVigentes(eventosCalendar, ahoraMs)
      : deduplicarEventosCalendar(eventosCalendar);
  return base.filter((ev) => {
    if (ev.fechaISO && ev.fechaISO === diaBA.isoDate) return true;
    if (ev.fecha && ev.fecha === diaBA.ddmm) return true;
    if (ev.startIso && ev.startIso.startsWith(diaBA.isoDate)) return true;
    return false;
  });
}

/**
 * Motor "Hacer un Corte": Revisa toda la información cargada, toma en cuenta la FECHA Y HORA ACTUAL
 * en Buenos Aires, detecta visitas/encuentros pendientes vencidos (sin cambio a "Ya adhirió"),
 * descarta a todas las personas ya adheridas y arma la Agenda Recomendada Día por Día
 * SÓLO con quienes tienen dirección, punto de encuentro o lugar determinado en Google Sheets / Sección 1,
 * contemplando los eventos de Google Calendar, sus traslados, el cálculo real de ruta y los Cafés HUB óptimos.
 */
export function generarCorteEstrategicoLocal(
  contactsInput: Contact[],
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  filtroBarrio: string = 'Todos',
  eventosCalendarInput: CalendarEventItem[] = INITIAL_CALENDAR_EVENTS,
  ahoraMs: number = Date.now()
): CorteResultado {
  const eventosCalendar = filtrarEventosCalendarVigentes(eventosCalendarInput, ahoraMs);
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const dia2BA = sumarDiasAFechaBA(ahoraMs, 2);
  const dia3BA = sumarDiasAFechaBA(ahoraMs, 3);
  const dia4BA = sumarDiasAFechaBA(ahoraMs, 4);

  // Recalcular alertas vencidas y diagnóstico +48h tomando exactamente `ahoraMs`
  const contacts: Contact[] = contactsInput.map((c): Contact => {
    const reprocesado = procesarContacto(c, profile, ahoraMs);
    return {
      ...reprocesado,
      enviadoEnSesion: c.enviadoEnSesion,
    };
  });

  const filtrados =
    filtroBarrio === 'Todos'
      ? contacts
      : contacts.filter((c) => c.barrio.toLowerCase() === filtroBarrio.toLowerCase());

  const kpisCorte = calcularResumenKPIsPadron(filtrados);
  const nuevosPrimerContacto = kpisCorte.nuevosSinMensaje;
  const cambioChipSinConcretar = kpisCorte.cambioChip;
  const sinRespuestaSeguimiento = kpisCorte.sinRespuesta;
  const visitasAgendadas = kpisCorte.visitasConcretadasCount;
  const retirosPendientes = kpisCorte.retirosFichasCount;
  const adheridosTotales = kpisCorte.adheridos;

  // REGLA ESTRICTA:
  // 1) Descartar siempre a quienes YA están adheridos (c.adhirio === 'Sí' / YA_ADHIRIO_FIRMA_OK) o dados de baja.
  // 2) Para la Agenda Recomendada Día por Día, tomar en cuenta ÚNICAMENTE a quienes YA tienen
  //    algún punto de encuentro, dirección, esquina o lugar determinado en Google Sheets o en la Sección 1.
  const noAdheridosTotales = filtrados.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      c.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK' &&
      c.estadoFlujo !== 'DESCARTADO_O_BAJA' &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.situacion !== 'YA_ADHIRIO'
  );

  const elegiblesAgendaConLugar = noAdheridosTotales.filter(
    (c) => c.tienePuntoEncuentroDeterminado
  );

  // Detectar todas las personas con visitas/encuentros pendientes vencidos o sin confirmar
  const alertasPendientesVencidos = elegiblesAgendaConLugar.filter((c) =>
    Boolean(c.alertaVencido?.activa)
  );

  // Agrupar diagnóstico por barrio (priorizando personas con punto/dirección determinada sin adherir)
  const mapaBarrios: Record<
    string,
    { pendientes: number; conPuntoDeterminado: number; conRespuestaSi: number; sinRespuesta: number }
  > = {};
  for (const c of noAdheridosTotales) {
    const b = (c.barrio || 'Palermo').trim();
    if (!mapaBarrios[b]) {
      mapaBarrios[b] = { pendientes: 0, conPuntoDeterminado: 0, conRespuestaSi: 0, sinRespuesta: 0 };
    }
    mapaBarrios[b].pendientes++;
    if (c.tienePuntoEncuentroDeterminado) mapaBarrios[b].conPuntoDeterminado++;
    if (c.rsp === 'Sí') mapaBarrios[b].conRespuestaSi++;
    else mapaBarrios[b].sinRespuesta++;
  }

  const recomendacionesBarrio = Object.entries(mapaBarrios)
    .sort((a, b) => b[1].conPuntoDeterminado - a[1].conPuntoDeterminado || b[1].pendientes - a[1].pendientes)
    .map(([barrio, stats]) => {
      const cafe = profile.cafesPorBarrio[barrio];
      const convieneHub = stats.conPuntoDeterminado >= 3 || stats.pendientes >= 4;
      return {
        barrio,
        pendientes: stats.pendientes,
        conRespuestaSi: stats.conRespuestaSi,
        sinRespuesta: stats.sinRespuesta,
        estrategia: convieneHub
          ? `Hacer CAFÉ HUB en ${cafe?.nombre || `centro de ${barrio}`} (${stats.conPuntoDeterminado} con punto/dirección en ${barrio}) + Puerta a Puerta para quienes declinen el café.`
          : `Hacer RECORRIDO PUERTA A PUERTA puntual (${stats.conPuntoDeterminado} con dirección en ${barrio}).`,
        cafeHubSugerido: cafe ? `${cafe.nombre} (${cafe.esquina})` : `Café céntrico de ${barrio}`,
      };
    });

  // Barrios con más personas elegibles (con dirección/punto de encuentro determinado y no adheridas)
  const conteoPorBarrioElegibles: Record<string, number> = {};
  for (const c of elegiblesAgendaConLugar) {
    const b = (c.barrio || 'Palermo').trim();
    conteoPorBarrioElegibles[b] = (conteoPorBarrioElegibles[b] || 0) + 1;
  }
  const barriosElegiblesOrdenados = Object.entries(conteoPorBarrioElegibles)
    .sort((a, b) => b[1] - a[1])
    .map(([b]) => b);

  const topBarrio = barriosElegiblesOrdenados[0] || recomendacionesBarrio[0]?.barrio || 'Saavedra';
  const segundoBarrio =
    barriosElegiblesOrdenados[1] ||
    recomendacionesBarrio.find((r) => r.barrio !== topBarrio)?.barrio ||
    'Palermo';

  // Eventos de Google Calendar para los próximos días
  const diasOperativos = [
    {
      diaBA: hoyBA,
      prefijo: 'HOY',
      esHoy: true,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, hoyBA),
    },
    {
      diaBA: manianaBA,
      prefijo: 'MAÑANA',
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, manianaBA),
    },
    {
      diaBA: dia2BA,
      prefijo: dia2BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia2BA),
    },
    {
      diaBA: dia3BA,
      prefijo: dia3BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia3BA),
    },
    {
      diaBA: dia4BA,
      prefijo: dia4BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia4BA),
    },
  ];

  // Buscador inteligente de ventana horaria DIURNA REALISTA (09:30 a 20:00 hs, jamás de madrugada ni cruzando medianoche)
  // que evita choques con los eventos de Google Calendar de ese día dejando margen de traslado hacia/desde el evento.
  const intervalosOcupadosPorDia: Record<string, { ini: number; fin: number }[]> = {};
  for (const d of diasOperativos) {
    intervalosOcupadosPorDia[d.diaBA.ddmm] = [];
  }

  const encontrarVentanaDiurnaSinChoqueCalendar = (params: {
    diaInfo: (typeof diasOperativos)[number];
    duracionMin: number;
    franjaPreferida: FranjaHoraria;
    latBarrio: number;
    lngBarrio: number;
    ventanaColumnaG?: { minIni: number; minFin: number };
    horaPuntualPreferida?: string;
  }): { horaInicio: string; notaCalendar: string; chocaForzado: boolean } => {
    const {
      diaInfo,
      duracionMin,
      franjaPreferida,
      latBarrio,
      lngBarrio,
      ventanaColumnaG,
      horaPuntualPreferida,
    } = params;
    const { diaBA, esHoy, eventos } = diaInfo;

    const trasladoDesdeBase = calcularMinutosTrasladoCABA(
      profile.latPartida,
      profile.lngPartida,
      latBarrio,
      lngBarrio
    ).minutos;

    const tieneRestriccionMatutinaOPuntual =
      Boolean(horaPuntualPreferida) ||
      Boolean(ventanaColumnaG && ventanaColumnaG.minIni < 14 * 60) ||
      franjaPreferida === 'Mañana' ||
      franjaPreferida === 'Mediodía';

    const minInicioOperativo = tieneRestriccionMatutinaOPuntual
      ? 8 * 60 + 30
      : esHoy && hoyBA.hour >= 9 && hoyBA.hour < 16
      ? Math.min(15 * 60, Math.ceil((hoyBA.hour * 60 + hoyBA.minute + 25) / 15) * 15)
      : 9 * 60 + 30;
    const maxFinOperativo = 20 * 60; // Tope estricto 20:00 hs (nunca de noche ni madrugada)

    // Determinar hora ideal de salida desde la base según hora puntual pactada (descontando traslado), ventana de Columna G o franja horaria
    const horaBasePreferidaMin = horaPuntualPreferida
      ? Math.max(8 * 60 + 15, horaAMinutosDelDia(horaPuntualPreferida) - trasladoDesdeBase)
      : ventanaColumnaG
      ? Math.max(minInicioOperativo, ventanaColumnaG.minIni - Math.min(20, trasladoDesdeBase))
      : franjaPreferida === 'Mañana'
      ? 9 * 60 + 45
      : franjaPreferida === 'Mediodía'
      ? 12 * 60 + 15
      : franjaPreferida === 'Vespertino'
      ? 17 * 60 + 30
      : 15 * 60;

    // Construir grilla completa de candidatos cada 15 min ordenada por cercanía a horaBasePreferidaMin
    // e incluir horaBasePreferidaMin explícitamente para respetar citas puntuales (ej. 10:00 hs -> salida ~09:41 hs)
    const setCandidatos = new Set<number>();
    if (
      horaBasePreferidaMin >= minInicioOperativo &&
      horaBasePreferidaMin <= maxFinOperativo - 35
    ) {
      setCandidatos.add(horaBasePreferidaMin);
    }
    for (let m = minInicioOperativo; m <= maxFinOperativo - 35; m += 15) {
      setCandidatos.add(m);
    }
    const todosLosCandidatosMin = Array.from(setCandidatos);
    todosLosCandidatosMin.sort((a, b) => {
      // Si el circuito tiene preferencia vespertina/tarde (horaBasePreferidaMin >= 14:30), jamás mandarlo a la mañana (08:30-12:30)
      const penalTardeAMananaA = horaBasePreferidaMin >= 14 * 60 + 30 && a < 12 * 60 + 30 ? 720 : 0;
      const penalTardeAMananaB = horaBasePreferidaMin >= 14 * 60 + 30 && b < 12 * 60 + 30 ? 720 : 0;
      if (penalTardeAMananaA !== penalTardeAMananaB) {
        return penalTardeAMananaA - penalTardeAMananaB;
      }
      if (!horaPuntualPreferida && ventanaColumnaG) {
        const aEnVentana =
          a + trasladoDesdeBase >= ventanaColumnaG.minIni &&
          a + duracionMin <= ventanaColumnaG.minFin + 20
            ? 0
            : 1;
        const bEnVentana =
          b + trasladoDesdeBase >= ventanaColumnaG.minIni &&
          b + duracionMin <= ventanaColumnaG.minFin + 20
            ? 0
            : 1;
        if (aEnVentana !== bEnVentana) return aEnVentana - bEnVentana;
      }
      return Math.abs(a - horaBasePreferidaMin) - Math.abs(b - horaBasePreferidaMin);
    });

    const ocupadosAgenda = intervalosOcupadosPorDia[diaBA.ddmm] || [];

    const evaluarCandidato = (iniMin: number, durMinEfectiva: number) => {
      const finMin = iniMin + durMinEfectiva;
      if (finMin > maxFinOperativo + 45) return null;

      // Verificar que NO se solape con ningún otro bloque ya agendado ese mismo día (dejando 15 min de traslado entre bloques)
      const chocaConOtroBloque = ocupadosAgenda.some(
        (b) => iniMin < b.fin + 15 && finMin + 15 > b.ini
      );
      if (chocaConOtroBloque) return null;

      // Verificar que NO choque con ningún evento de Google Calendar de ese día (incluyendo tiempo de traslado)
      for (const ev of eventos) {
        const evIni = horaAMinutosDelDia(ev.startTime);
        const evFin = horaAMinutosDelDia(ev.endTime);
        const esVirt = esEventoVirtualCalendar(ev);
        const geoEv = geocodificarEventoCalendar(ev, profile);
        const trasladoEv = esVirt
          ? { minutos: 0, modo: 'WALKING' as const }
          : calcularMinutosTrasladoCABA(latBarrio, lngBarrio, geoEv.lat, geoEv.lng);
        const margenAntes = esVirt ? 5 : Math.min(25, trasladoEv.minutos + 4);
        const margenDespues = esVirt ? 2 : Math.min(20, trasladoEv.minutos);
        if (iniMin < evFin + margenDespues && finMin + margenAntes > evIni) {
          return null;
        }
      }
      return { iniMin, finMin };
    };

    // Si el circuito tiene una cita puntual pactada (ej. Laura 10:00 hs), evaluar primero si al menos la 1ra parada
    // entra en su horario puntual; el resto de las paradas se adaptarán dinámicamente en calcularHojaDeRuta.
    if (horaPuntualPreferida) {
      const okPuntual = evaluarCandidato(horaBasePreferidaMin, Math.min(duracionMin, 28));
      if (okPuntual) {
        const horaElegida = sumarMinutosAHora('00:00', okPuntual.iniMin);
        const evRef = eventos[0];
        return {
          horaInicio: horaElegida,
          notaCalendar: evRef
            ? `✓ Horario coordinado contemplando tus eventos de Google Calendar del ${diaBA.ddmm}.`
            : `✓ Ventana diurna libre de compromisos en tu Google Calendar para el ${diaBA.ddmm}.`,
          chocaForzado: false,
        };
      }
    }

    for (const candMin of todosLosCandidatosMin) {
      const ok = evaluarCandidato(candMin, duracionMin);
      if (ok) {
        const horaElegida = sumarMinutosAHora('00:00', ok.iniMin);
        const evRef = eventos[0];
        if (evRef) {
          const geoEv = geocodificarEventoCalendar(evRef, profile);
          const trasladoEv = calcularMinutosTrasladoCABA(
            latBarrio,
            lngBarrio,
            geoEv.lat,
            geoEv.lng
          );
          return {
            horaInicio: horaElegida,
            notaCalendar: `✓ Horario coordinado sin choques con tu evento Calendar "${evRef.summary}" (${evRef.startTime}-${evRef.endTime} en ${geoEv.label.split(',')[0]}), contemplando ~${trasladoEv.minutos} min de traslado (${trasladoEv.modo === 'WALKING' ? 'a pie' : 'en transporte'}).`,
            chocaForzado: false,
          };
        }
        return {
          horaInicio: horaElegida,
          notaCalendar: `✓ Ventana diurna libre de compromisos en tu Google Calendar para el ${diaBA.ddmm}.`,
          chocaForzado: false,
        };
      }
    }

    // Si con la duración completa no entró pero con duración compacta (30 min) sí entra sin superponerse:
    for (const candMin of todosLosCandidatosMin) {
      const okCompacto = evaluarCandidato(candMin, Math.min(duracionMin, 30));
      if (okCompacto) {
        const horaElegida = sumarMinutosAHora('00:00', okCompacto.iniMin);
        const evRef = eventos[0];
        return {
          horaInicio: horaElegida,
          notaCalendar: evRef
            ? `✓ Horario coordinado tras tu evento Calendar "${evRef.summary}" (${evRef.startTime}-${evRef.endTime}) sin superponerse con otros bloques.`
            : `✓ Bloque ubicado en hueco disponible del ${diaBA.ddmm} sin superponerse con otros bloques ni eventos.`,
          chocaForzado: false,
        };
      }
    }

    // Si todos los huecos chocaban con Calendar, al menos garantizar que NO se superponga con otro bloque del mismo día
    let iniSinSolaparBloque = horaBasePreferidaMin;
    for (const candMin of todosLosCandidatosMin) {
      const chocaBloque = ocupadosAgenda.some(
        (b) => candMin < b.fin + 15 && candMin + Math.min(duracionMin, 35) + 15 > b.ini
      );
      if (!chocaBloque) {
        iniSinSolaparBloque = candMin;
        break;
      }
    }
    const fallbackHora = sumarMinutosAHora('00:00', iniSinSolaparBloque);
    const evRef = eventos[0];
    return {
      horaInicio: fallbackHora,
      notaCalendar: evRef
        ? `Contempla tu evento Calendar "${evRef.summary}" (${evRef.startTime}-${evRef.endTime} en ${(evRef.location || 'CABA').split(',')[0]}).`
        : `Verificado contra tu Google Calendar para el ${diaBA.ddmm}.`,
      chocaForzado: Boolean(evRef),
    };
  };

  // Función constructora que calcula la Hoja de Ruta REAL y la selección inteligente de Café HUB
  // (por cercanía geográfica + mismo barrio + día + franja horaria compartida) para cada bloque de la Agenda Día por Día
  const construirBloqueAgendaSincronizado = (params: {
    id: string;
    clusterIdVinculado?: string;
    numeroCircuito: number;
    diaEtiqueta: string;
    fechaClave: string;
    fechaISO: string;
    horaSalidaBase: string;
    barrioDefault: string;
    modalidadPreferida: ModalidadEncuentroAgenda;
    contactosGrupo: Contact[];
    eventosDelDia: CalendarEventItem[];
    notaCalendarBase: string;
    esSeguimientoVencidos?: boolean;
  }): BloqueAgendaRecomendado => {
    const {
      id,
      clusterIdVinculado,
      numeroCircuito,
      diaEtiqueta,
      fechaClave,
      fechaISO,
      horaSalidaBase,
      barrioDefault,
      modalidadPreferida,
      contactosGrupo,
      eventosDelDia,
      notaCalendarBase,
      esSeguimientoVencidos,
    } = params;

    // Determinar barrio principal real de los vecinos del circuito (sin mezclar barrios distantes)
    const conteoB: Record<string, number> = {};
    for (const c of contactosGrupo) {
      conteoB[c.barrio] = (conteoB[c.barrio] || 0) + 1;
    }
    const barrioPrincipal =
      Object.entries(conteoB).sort((a, b) => b[1] - a[1])[0]?.[0] || barrioDefault;
    const etiquetaBarrios = barrioPrincipal;

    // 1. Seleccionar café de la zona SÓLO cuando el bloque agrupa a varias personas ya contactadas (>= 2)
    const esSede =
      modalidadPreferida === 'EVENTO_SEDE' || modalidadPreferida === 'ENCUENTRO_SEDE';
    const agrupaVariasPersonas = !esSede && contactosGrupo.length >= 2;

    const seleccionCafes = seleccionarCafesHubPorCercaniaYFranja(
      contactosGrupo,
      barrioPrincipal,
      fechaClave,
      profile
    );
    const cafesRanking = agrupaVariasPersonas ? seleccionCafes.cafesRanking : [];
    const franjaCompartidaResumen = seleccionCafes.franjaCompartidaResumen;
    const mediaMinutosMejorCafe = seleccionCafes.mediaMinutosMejorCafe;
    const mejorCafe = cafesRanking[0];
    const nombreMejorCafe = mejorCafe
      ? `${mejorCafe.nombre} (${mejorCafe.direccion.split(',')[0]})`
      : profile.cafesPorBarrio[barrioPrincipal]?.nombre || `Café de ${barrioPrincipal}`;

    // Si es el encuentro de los miércoles en Chile 1408, no tratar el propio evento "Hagamos Popurrí (Chile 1408)" como choque
    const eventosParaCalculoRuta = esSede
      ? eventosDelDia.filter(
          (ev) => !/chile\s*1408|hagamos\s*popurr[ií]/i.test(`${ev.summary || ''} ${ev.location || ''}`)
        )
      : eventosDelDia;

    // 2. Calcular la Hoja de Ruta Casa x Casa REAL para las direcciones de este circuito,
    //    pasando explícitamente el `mejorCafe` del bloque (sólo si agrupa >= 2 personas) y los `contactosMismoDia`
    const bufferPorParada = contactosGrupo.length >= 5 ? 15 : 20;
    const contactosMismoDiaRef = elegiblesAgendaConLugar.filter(
      (c) =>
        resolverFechaObjetivoContacto(c, ahoraMs) === fechaClave ||
        c.fechasMencionadas.includes(fechaClave)
    );
    const opcionesCalculoRuta = {
      cafeHubBloque: mejorCafe
        ? {
            nombre: mejorCafe.nombre,
            direccion: mejorCafe.direccion,
            lat: mejorCafe.lat,
            lng: mejorCafe.lng,
          }
        : undefined,
      modalidadBloque: modalidadPreferida,
      contactosMismoDia: contactosMismoDiaRef,
      ahoraMs,
    };

    let paradasRutaSugerida = calcularHojaDeRuta(
      contactosGrupo,
      horaSalidaBase,
      bufferPorParada,
      profile,
      eventosParaCalculoRuta,
      fechaClave,
      opcionesCalculoRuta
    );

    let horaInicioReal = esSede
      ? '18:30'
      : paradasRutaSugerida[0]?.horaSalida || horaSalidaBase;

    const calcularDuracionActivaRuta = (paradas: ParadaRuta[]) =>
      paradas.length > 0
        ? Math.max(
            25,
            paradas.reduce((acc, p) => acc + p.minutosViaje + p.minutosEncuentro, 0)
          )
        : Math.max(30, contactosGrupo.length * 20);

    const duracionCafeHubMin = Math.max(
      60,
      Math.min(90, 45 + contactosGrupo.length * 10)
    );

    let duracionTotalMinutos = esSede
      ? 120
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? calcularDuracionActivaRuta(paradasRutaSugerida)
      : duracionCafeHubMin;

    const calcularFinReal = (iniStr: string, paradas: ParadaRuta[], durMin: number): string =>
      esSede
        ? '20:30'
        : modalidadPreferida === 'PUERTA_A_PUERTA' && paradas.length > 0
        ? paradas[paradas.length - 1].horaFinVisita
        : sumarMinutosAHora(iniStr, durMin);

    let horaFinReal = calcularFinReal(horaInicioReal, paradasRutaSugerida, duracionTotalMinutos);

    // Garantizar que el intervalo real [horaInicioReal, horaFinReal] jamás se superponga con otro bloque del mismo día
    const ocupadosHoy = intervalosOcupadosPorDia[fechaClave] || [];
    const chocaConOcupados = (iniM: number, finM: number) =>
      ocupadosHoy.some((oc) => iniM < oc.fin + 5 && finM + 5 > oc.ini);

    let iniMinReal = horaAMinutosDelDia(horaInicioReal);
    let finMinReal = Math.max(iniMinReal + 25, horaAMinutosDelDia(horaFinReal));

    if (!esSede && chocaConOcupados(iniMinReal, finMinReal)) {
      const basePrefMin = horaAMinutosDelDia(horaSalidaBase);
      const spanNecesario = Math.max(duracionTotalMinutos, finMinReal - iniMinReal);
      const candsOrdenados: number[] = [];
      for (let cand = 8 * 60 + 30; cand <= 20 * 60 + 30; cand += 15) {
        candsOrdenados.push(cand);
      }
      candsOrdenados.sort((a, b) => {
        const penalA = basePrefMin >= 14 * 60 + 30 && a < 12 * 60 + 30 ? 480 : 0;
        const penalB = basePrefMin >= 14 * 60 + 30 && b < 12 * 60 + 30 ? 480 : 0;
        return Math.abs(a - basePrefMin) + penalA - (Math.abs(b - basePrefMin) + penalB);
      });

      let encontrado = false;
      for (const cand of candsOrdenados) {
        if (chocaConOcupados(cand, cand + duracionTotalMinutos)) continue;
        const candStr = sumarMinutosAHora('00:00', cand);
        const paradasCand = calcularHojaDeRuta(
          contactosGrupo,
          candStr,
          bufferPorParada,
          profile,
          eventosParaCalculoRuta,
          fechaClave,
          opcionesCalculoRuta
        );
        const durCand =
          modalidadPreferida === 'PUERTA_A_PUERTA'
            ? calcularDuracionActivaRuta(paradasCand)
            : duracionCafeHubMin;
        const iniCandStr = paradasCand[0]?.horaSalida || candStr;
        const finCandStr = calcularFinReal(iniCandStr, paradasCand, durCand);
        const iniCandM = horaAMinutosDelDia(iniCandStr);
        const finCandM = Math.max(iniCandM + 25, horaAMinutosDelDia(finCandStr));
        if (!chocaConOcupados(iniCandM, finCandM) && finCandM <= 21 * 60 + 30) {
          horaInicioReal = iniCandStr;
          horaFinReal = finCandStr;
          paradasRutaSugerida = paradasCand;
          duracionTotalMinutos = durCand;
          iniMinReal = iniCandM;
          finMinReal = finCandM;
          encontrado = true;
          break;
        }
      }

      // Si una parada interna con horario fijo estiró el bloque sobre otro bloque ocupado, acotar el bloque al hueco libre
      if (!encontrado) {
        for (const cand of candsOrdenados) {
          const finCompacto = cand + Math.max(30, Math.min(spanNecesario, 60));
          if (!chocaConOcupados(cand, finCompacto)) {
            iniMinReal = cand;
            finMinReal = finCompacto;
            horaInicioReal = sumarMinutosAHora('00:00', iniMinReal);
            horaFinReal = sumarMinutosAHora('00:00', finMinReal);
            duracionTotalMinutos = finMinReal - iniMinReal;
            break;
          }
        }
      }
    }

    // Registrar el intervalo completo del bloque en este día para que ningún bloque posterior se superponga con él
    if (!intervalosOcupadosPorDia[fechaClave]) {
      intervalosOcupadosPorDia[fechaClave] = [];
    }
    intervalosOcupadosPorDia[fechaClave].push({
      ini: horaAMinutosDelDia(horaInicioReal),
      fin: horaAMinutosDelDia(horaFinReal),
    });

    // Franja horaria limpia para que sea 100% legible y apta para mensajes sin textos internos
    const franjaHorariaLimpia = esSede
      ? '18:30 a 20:30 hs'
      : `${horaInicioReal} a ${horaFinReal} hs`;

    const resumenOperativoRuta =
      modalidadPreferida === 'PUERTA_A_PUERTA'
        ? `${paradasRutaSugerida.length} parada${paradasRutaSugerida.length === 1 ? '' : 's'} · ~${duracionTotalMinutos} min efectivos de recorrido`
        : esSede
        ? `Sede ${profile.sedeCentral.split(',')[0]} (miércoles)`
        : `Encuentro en café · ${duracionTotalMinutos} min (~${mediaMinutosMejorCafe} min a pie)`;

    // Distinguir entre horas puntuales fijas que chocan (con Calendar o con otra persona) y franjas amplias donde se asignó un horario conveniente
    const choquesEnRuta = paradasRutaSugerida.filter((p) => Boolean(p.conflictoCalendar));
    const paradasConHorarioConveniente = paradasRutaSugerida.filter((p) => Boolean(p.notaHorarioConveniente));
    const resumenEventosDelDia =
      eventosDelDia.length > 0
        ? `Eventos Calendar del ${fechaClave} contemplados: ${eventosDelDia
            .map((e) => `"${e.summary}" (${e.startTime}-${e.endTime})`)
            .join(', ')}`
        : notaCalendarBase;
    const notaCalendarConChoques =
      choquesEnRuta.length > 0
        ? `⚠️ ${choquesEnRuta.length} visita(s) con superposición horaria detectada (${choquesEnRuta[0].conflictoCalendar}). ${resumenEventosDelDia}.`
        : paradasConHorarioConveniente.length > 0
        ? `✓ ${resumenEventosDelDia} · Cronograma adaptado automáticamente (${paradasRutaSugerida
            .map((p) => `${p.contact.primerNombre}: ${p.horaLlegada} hs${p.vencidaSinAdherir ? ' [vencida]' : ''}`)
            .join(' → ')}).`
        : `✓ ${resumenEventosDelDia}`;

    // Ordenar contactosIncluidos exactamente en el orden cronológico de paradasRutaSugerida
    const contactosOrdenadosCronologicamente =
      paradasRutaSugerida.length > 0
        ? paradasRutaSugerida.map((p) => p.contact)
        : contactosGrupo;

    const alertasCount = contactosOrdenadosCronologicamente.filter((c) => Boolean(c.alertaVencido?.activa)).length;
    const confirmadosCount = contactosOrdenadosCronologicamente.filter((c) => esContactoConfirmadoEnLista1a1(c)).length;

    const puntoEncuentroODireccion = esSede
      ? profile.sedeCentral
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? `Ruta Casa x Casa en ${barrioPrincipal} (${
          paradasRutaSugerida
            .map(
              (p) =>
                `${p.horaLlegada} ${p.contact.primerNombre} (${p.contact.calleOCruce || p.contact.barrio})`
            )
            .join(' → ') || nombreMejorCafe
        })`
      : `${nombreMejorCafe} — ${mejorCafe?.barrio || barrioPrincipal}`;

    const puntoCentricoResumen = esSede
      ? `Reunión de los miércoles en ${profile.sedeCentral} · 18:30 a 20:30 hs`
      : mejorCafe
      ? `Circuito ${numeroCircuito} (${barrioPrincipal}) · Punto céntrico: ${mejorCafe.nombre} (${mejorCafe.direccion.split(',')[0]}) · ~${mediaMinutosMejorCafe} min a pie`
      : `Circuito ${numeroCircuito} (${barrioPrincipal}) · ${franjaCompartidaResumen}`;

    const sufijoConfirmados =
      confirmadosCount > 0
        ? ` · ✓ ${confirmadosCount}/${contactosOrdenadosCronologicamente.length} confirmado(s) en Lista 1-a-1 (mensajes activos en Pestaña 3 Hoja de Ruta).`
        : '';

    const motivoClaro = esSede
      ? `Reunión semanal de los miércoles en ${profile.sedeCentral} (${franjaHorariaLimpia}), sincronizada con el evento "Hagamos Popurrí" de tu Google Calendar.${sufijoConfirmados}`
      : alertasCount > 0 && esSeguimientoVencidos
      ? `⚠️ Incluye ${alertasCount} vecino(s) de ${barrioPrincipal} con encuentro pendiente de fecha anterior sin cambio a "Ya adhirió". Ruta calculada de ${horaInicioReal} a ${horaFinReal} hs (${resumenOperativoRuta})${mejorCafe ? ` y café grupal sugerido en ${nombreMejorCafe} (~${mediaMinutosMejorCafe} min a pie)` : ''}.${sufijoConfirmados}`
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? `Opción óptima Casa x Casa en ${barrioPrincipal} sincronizada por orden de horarios de ${horaInicioReal} a ${horaFinReal} hs (${resumenOperativoRuta})${mejorCafe ? `. Café grupal alternativo del bloque: ${nombreMejorCafe} (~${mediaMinutosMejorCafe} min a pie)` : ''}.${sufijoConfirmados}`
      : `Encuentro grupal en café de ${barrioPrincipal}: se propone encontrarnos en ${nombreMejorCafe} de ${franjaHorariaLimpia} (~${mediaMinutosMejorCafe} min a pie). Si una persona prefiere que pasemos por su dirección, al consolidarlo en la Lista 1-a-1 se adapta automáticamente su horario en la Hoja de Ruta.${sufijoConfirmados}`;

    const cafesCandidatosCurados = cafesRanking.map((cf) => ({
      nombre: cf.nombre,
      direccion: cf.direccion,
      barrio: cf.barrio,
      distanciaPromedioMetros: cf.distanciaMetros,
      coincidenciaFranjaYDia: `${diaEtiqueta} · ${franjaHorariaLimpia} (${cf.minutosCaminando} min / ${cf.cuadrasAprox} cuadras a pie)`,
      urlGoogleMaps: cf.urlGoogleMaps,
    }));

    return {
      id,
      clusterIdVinculado,
      diaEtiqueta,
      fechaClave,
      fechaISO,
      franjaHoraria: franjaHorariaLimpia,
      resumenOperativoRuta,
      horaInicioCalculada: horaInicioReal,
      horaFinCalculada: horaFinReal,
      duracionTotalMinutos,
      duracionEstimadaMin: duracionTotalMinutos,
      modalidad: modalidadPreferida,
      barrio: etiquetaBarrios,
      puntoEncuentroODireccion,
      puntoCentricoResumen,
      franjaCompartidaResumen,
      mediaMinutosAlCafe: mediaMinutosMejorCafe,
      motivoClaro,
      trasladoCalendarNota: notaCalendarConChoques,
      esSeguimientoVencidos,
      alertasIncluidasCount: alertasCount,
      cafesHubOpciones: cafesRanking,
      cafesCandidatosCurados,
      paradasRutaSugerida,
      contactosIncluidos: contactosOrdenadosCronologicamente,
    };
  };

  // UNIFICACIÓN INTELIGENTE ENTRE "CIRCUITOS Y PUNTOS CÉNTRICOS" Y "AGENDA RECOMENDADA DÍA POR DÍA":
  // Construimos bloques horarios NO SUPERPUESTOS para cada día, ofreciendo la opción más óptima por bloque
  // y adaptándola dinámicamente a las confirmaciones de los vecinos (si prefieren ir al café o que pasemos Puerta a Puerta).
  const contactosSedeChile = elegiblesAgendaConLugar.filter(
    (c) => c.situacion === 'EVENTO_CHILE_1408'
  );
  const contactosTerritorio = elegiblesAgendaConLugar.filter(
    (c) => c.situacion !== 'EVENTO_CHILE_1408'
  );

  const microClustersUnificados = construirMicroClusters(
    contactosTerritorio,
    15,
    'Todos',
    profile,
    ahoraMs
  );

  const idsEnMicroClusters = new Set(
    microClustersUnificados.flatMap((cl) => cl.miembros.map((m) => m.contact.id))
  );
  const remanentesConPunto = contactosTerritorio.filter(
    (c) => !idsEnMicroClusters.has(c.id)
  );
  const gruposPorBarrioRemanentes: Record<string, Contact[]> = {};
  for (const c of remanentesConPunto) {
    const b = (c.barrio || 'Palermo').trim();
    if (!gruposPorBarrioRemanentes[b]) gruposPorBarrioRemanentes[b] = [];
    gruposPorBarrioRemanentes[b].push(c);
  }

  interface CircuitoParaAgendar {
    clusterId: string;
    barrio: string;
    miembros: Contact[];
    centroLat: number;
    centroLng: number;
    convieneCafeHub: boolean;
    modalidadAdaptadaPorConfirmacion?: ModalidadEncuentroAgenda;
    fechaExplicita?: string;
    tieneAlertaVencido: boolean;
    franjaDominante: FranjaHoraria;
    ventanaColumnaGComun?: { minIni: number; minFin: number };
    horaPuntualMasTemprana?: string;
  }

  // Helper que calcula metadatos horarios precisos de un grupo de contactos (incluyendo hora puntual más temprana y ventana común)
  const calcularMetadatosCircuito = (
    subId: string,
    barrio: string,
    miembrosSub: Contact[],
    convieneCafeDefault: boolean,
    modalidadForzada?: ModalidadEncuentroAgenda,
    fechaExp?: string
  ): CircuitoParaAgendar => {
    const conteoF: Record<string, number> = {};
    let minIniComun: number | undefined;
    let minFinComun: number | undefined;
    let horaPuntual: string | undefined;

    for (const c of miembrosSub) {
      conteoF[c.franjaHoraria] = (conteoF[c.franjaHoraria] || 0) + 1;
      const disp = analizarDisponibilidadColumnaG(c.comentario);
      if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
        if (
          !horaPuntual ||
          horaAMinutosDelDia(disp.horaPuntualPactada) < horaAMinutosDelDia(horaPuntual)
        ) {
          horaPuntual = disp.horaPuntualPactada;
        }
      } else if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
        minIniComun =
          minIniComun === undefined
            ? disp.minInicioVentana
            : Math.max(minIniComun, disp.minInicioVentana);
        minFinComun =
          minFinComun === undefined
            ? disp.minFinVentana
            : Math.min(minFinComun, disp.minFinVentana);
      }
    }
    if (minIniComun !== undefined && minFinComun !== undefined && minIniComun >= minFinComun) {
      minIniComun = undefined;
      minFinComun = undefined;
    }

    let franjaDom: FranjaHoraria =
      (Object.entries(conteoF).sort((a, b) => b[1] - a[1])[0]?.[0] as FranjaHoraria) || 'Tarde';

    if (horaPuntual) {
      const minP = horaAMinutosDelDia(horaPuntual);
      franjaDom =
        minP < 12 * 60
          ? 'Mañana'
          : minP < 14 * 60 + 30
          ? 'Mediodía'
          : minP < 18 * 60
          ? 'Tarde'
          : 'Vespertino';
    } else if (minIniComun !== undefined && minFinComun !== undefined) {
      const mid = Math.round((minIniComun + minFinComun) / 2);
      if (minFinComun <= 12 * 60 + 30 || mid < 11 * 60 + 45) {
        franjaDom = 'Mañana';
      } else if (minFinComun <= 14 * 60 + 30 || mid < 14 * 60) {
        franjaDom = 'Mediodía';
      } else if (minIniComun >= 17 * 60 + 30) {
        franjaDom = 'Vespertino';
      } else {
        franjaDom = 'Tarde';
      }
    }

    // Un café sólo se propone como modalidad de bloque cuando agrupa al menos a 2 personas contactadas
    const convieneCafe =
      miembrosSub.length < 2
        ? false
        : modalidadForzada === 'CAFE_HUB'
        ? true
        : modalidadForzada === 'PUERTA_A_PUERTA'
        ? false
        : convieneCafeDefault && miembrosSub.length >= 2;

    // Resolver fecha objetivo priorizando HOY si algún miembro está pautado para HOY
    const fechasMiembros = miembrosSub
      .map((c) => resolverFechaObjetivoContacto(c, ahoraMs))
      .filter((f): f is string => Boolean(f));
    const fechaEfectivaSub =
      fechasMiembros.includes(hoyBA.ddmm)
        ? hoyBA.ddmm
        : fechaExp || fechasMiembros[0] || miembrosSub.flatMap((c) => c.fechasMencionadas)[0];

    const n = Math.max(1, miembrosSub.length);
    const cLat = miembrosSub.reduce((acc, x) => acc + x.lat, 0) / n;
    const cLng = miembrosSub.reduce((acc, x) => acc + x.lng, 0) / n;

    return {
      clusterId: subId,
      barrio,
      miembros: miembrosSub,
      centroLat: cLat,
      centroLng: cLng,
      convieneCafeHub: convieneCafe,
      modalidadAdaptadaPorConfirmacion:
        miembrosSub.length < 2 && modalidadForzada === 'CAFE_HUB'
          ? 'PUERTA_A_PUERTA'
          : modalidadForzada,
      fechaExplicita: fechaEfectivaSub,
      tieneAlertaVencido: miembrosSub.some((c) => Boolean(c.alertaVencido?.activa)),
      franjaDominante: franjaDom,
      ventanaColumnaGComun:
        minIniComun !== undefined && minFinComun !== undefined
          ? { minIni: minIniComun, minFin: minFinComun }
          : undefined,
      horaPuntualMasTemprana: horaPuntual,
    };
  };

  // Helper que analiza las respuestas ya cargadas en la Lista 1-a-1 para adaptar o dividir un grupo en sub-bloques óptimos (Café vs Puerta a Puerta)
  const construirCircuitosAdaptadosSegunConfirmacion = (
    clusterIdBase: string,
    barrio: string,
    contactosOrig: Contact[],
    _centroLat: number,
    _centroLng: number,
    convieneCafeDefault: boolean,
    fechaExp?: string
  ): CircuitoParaAgendar[] => {
    const pidieronPuertaAPuerta: Contact[] = [];
    const pidieronCafeHub: Contact[] = [];
    const sinPreferenciaForzada: Contact[] = [];

    for (const c of contactosOrig) {
      const comLow = (c.comentario || '').toLowerCase();
      const declinoCafe =
        comLow.includes('declinó café') ||
        comLow.includes('declino cafe') ||
        comLow.includes('pasa a puerta a puerta') ||
        comLow.includes('visita puerta a puerta');
      const pidioCafe =
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
        comLow.includes('prefiere punto de encuentro') ||
        comLow.includes('prefiere café hub') ||
        (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' && comLow.includes('café'));
      const confirmoDomicilio =
        c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' && !pidioCafe && (declinoCafe || Boolean(c.calleOCruce));

      if (declinoCafe || confirmoDomicilio) {
        pidieronPuertaAPuerta.push(c);
      } else if (pidioCafe) {
        pidieronCafeHub.push(c);
      } else {
        sinPreferenciaForzada.push(c);
      }
    }

    const armarSubCircuito = (
      subId: string,
      miembrosSub: Contact[],
      modalidadForzada?: ModalidadEncuentroAgenda
    ): CircuitoParaAgendar =>
      calcularMetadatosCircuito(
        subId,
        barrio,
        miembrosSub,
        convieneCafeDefault,
        modalidadForzada,
        fechaExp
      );

    const grupoCafeCandidato = [...pidieronCafeHub, ...sinPreferenciaForzada];
    // Sólo separar en un sub-bloque de café si ese sub-bloque agrupa al menos a 2 personas contactadas
    if (
      pidieronPuertaAPuerta.length > 0 &&
      grupoCafeCandidato.length >= 2 &&
      (pidieronCafeHub.length > 0 || sinPreferenciaForzada.length >= 3)
    ) {
      return [
        armarSubCircuito(`${clusterIdBase}-cafe`, grupoCafeCandidato, 'CAFE_HUB'),
        armarSubCircuito(`${clusterIdBase}-pap`, pidieronPuertaAPuerta, 'PUERTA_A_PUERTA'),
      ];
    }

    if (pidieronPuertaAPuerta.length > 0) {
      return [armarSubCircuito(clusterIdBase, contactosOrig, 'PUERTA_A_PUERTA')];
    }

    if (pidieronCafeHub.length > 0 && contactosOrig.length >= 2) {
      return [armarSubCircuito(clusterIdBase, contactosOrig, 'CAFE_HUB')];
    }

    return [armarSubCircuito(clusterIdBase, contactosOrig, undefined)];
  };

  const circuitosCrudos: CircuitoParaAgendar[] = [];

  for (const cl of microClustersUnificados) {
    const contactosCl = cl.miembros.map((m) => m.contact);
    circuitosCrudos.push(
      ...construirCircuitosAdaptadosSegunConfirmacion(
        cl.id,
        cl.barrioPrincipal,
        contactosCl,
        cl.centroLat,
        cl.centroLng,
        cl.convieneCafeHub,
        cl.fechasAgrupadas?.[0]
      )
    );
  }

  for (const [barrioRem, listaRem] of Object.entries(gruposPorBarrioRemanentes)) {
    for (let i = 0; i < listaRem.length; i += 5) {
      const lote = listaRem.slice(i, i + 5);
      const coordsB = COORDENADAS_BARRIOS_CABA[barrioRem] || COORDENADAS_BARRIOS_CABA.Palermo;
      circuitosCrudos.push(
        ...construirCircuitosAdaptadosSegunConfirmacion(
          `cluster-extra-${barrioRem.toLowerCase()}-${i}`,
          barrioRem,
          lote,
          coordsB.lat,
          coordsB.lng,
          lote.length >= 2,
          lote.map((c) => resolverFechaObjetivoContacto(c, ahoraMs)).find(Boolean)
        )
      );
    }
  }

  // CONSOLIDACIÓN ANTI-SUPERPOSICIÓN POR DÍA, BARRIO Y COMPATIBILIDAD HORARIA REAL:
  // 1) Si en un mismo día explícito hay múltiples micro-circuitos del mismo barrio y misma modalidad,
  //    los unificamos si sus ventanas/horas son compatibles.
  // 2) Si un contacto quedó aislado en un circuito de 1 persona y ya existe otro circuito del mismo barrio
  //    compatible en día y horario (< 6 personas), lo sumamos a ese grupo barrial para facilitar la recolección.
  const circuitosParaAgendar: CircuitoParaAgendar[] = [];

  for (const circ of circuitosCrudos) {
    const modCirc = circ.modalidadAdaptadaPorConfirmacion || (circ.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
    const compatibleExistente = circuitosParaAgendar.find((ex) => {
      if (ex.barrio.toLowerCase() !== circ.barrio.toLowerCase()) return false;
      if (ex.miembros.length + circ.miembros.length > 6) return false;

      if (circ.fechaExplicita && ex.fechaExplicita && ex.fechaExplicita !== circ.fechaExplicita) {
        return false;
      }
      if (
        (circ.fechaExplicita === hoyBA.ddmm && ex.fechaExplicita !== hoyBA.ddmm) ||
        (ex.fechaExplicita === hoyBA.ddmm && circ.fechaExplicita !== hoyBA.ddmm)
      ) {
        return false;
      }

      const modEx = ex.modalidadAdaptadaPorConfirmacion || (ex.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
      const esRemanenteIndividual = circ.miembros.length === 1 || ex.miembros.length === 1;
      if (modEx !== modCirc && !esRemanenteIndividual) return false;

      if (circ.fechaExplicita === hoyBA.ddmm && modCirc === 'PUERTA_A_PUERTA' && modEx === 'PUERTA_A_PUERTA') {
        return true;
      }
      return circ.miembros.every((m) => sonHorariosCompatiblesEnCircuito(ex.miembros, m));
    });

    if (compatibleExistente) {
      const idsExistentes = new Set(compatibleExistente.miembros.map((m) => m.id));
      const miembrosUnificados = [...compatibleExistente.miembros];
      for (const m of circ.miembros) {
        if (!idsExistentes.has(m.id)) miembrosUnificados.push(m);
      }
      const recalculado = calcularMetadatosCircuito(
        compatibleExistente.clusterId,
        compatibleExistente.barrio,
        miembrosUnificados,
        compatibleExistente.convieneCafeHub || circ.convieneCafeHub || miembrosUnificados.length >= 2,
        compatibleExistente.modalidadAdaptadaPorConfirmacion || circ.modalidadAdaptadaPorConfirmacion,
        compatibleExistente.fechaExplicita || circ.fechaExplicita
      );
      Object.assign(compatibleExistente, recalculado);
      continue;
    }

    circuitosParaAgendar.push(circ);
  }

  // Ordenar circuitos priorizando estrictamente:
  // 1) Fecha explícita de HOY (ej. 21/10) — prioridad absoluta para nunca desplazar citas pautadas para hoy
  // 2) Fecha explícita de MAÑANA (ej. 22/10)
  // 3) Otra fecha explícita de los próximos días operativos (ej. 23/10, 24/10)
  // 4) Alertas de encuentros vencidos de días anteriores a reprogramar
  // 5) Hora puntual pactada más temprana en Columna G y ventana horaria más temprana
  const fechasOperativasSet = new Set(diasOperativos.map((d) => d.diaBA.ddmm));
  const prioridadFechaCircuito = (c: CircuitoParaAgendar): number => {
    if (c.fechaExplicita === hoyBA.ddmm) return 0;
    if (c.fechaExplicita === manianaBA.ddmm) return 1;
    if (c.fechaExplicita && fechasOperativasSet.has(c.fechaExplicita)) return 2;
    if (c.tieneAlertaVencido) return 3;
    return 4;
  };

  const minReferenciaOrdenCircuito = (c: CircuitoParaAgendar): number => {
    if (c.horaPuntualMasTemprana) {
      return horaAMinutosDelDia(c.horaPuntualMasTemprana);
    }
    if (c.ventanaColumnaGComun) {
      return Math.round(c.ventanaColumnaGComun.minIni * 0.55 + c.ventanaColumnaGComun.minFin * 0.45);
    }
    if (c.franjaDominante === 'Mañana') return 10 * 60 + 30;
    if (c.franjaDominante === 'Mediodía') return 13 * 60;
    if (c.franjaDominante === 'Vespertino') return 18 * 60;
    return 15 * 60 + 30;
  };

  circuitosParaAgendar.sort((a, b) => {
    const pa = prioridadFechaCircuito(a);
    const pb = prioridadFechaCircuito(b);
    if (pa !== pb) return pa - pb;
    const minA = minReferenciaOrdenCircuito(a);
    const minB = minReferenciaOrdenCircuito(b);
    const aPuntual = Boolean(a.horaPuntualMasTemprana);
    const bPuntual = Boolean(b.horaPuntualMasTemprana);
    if (Math.abs(minA - minB) <= 45 && aPuntual !== bPuntual) {
      return aPuntual ? -1 : 1;
    }
    if (Math.abs(minA - minB) >= 15) return minA - minB;
    return b.miembros.length - a.miembros.length;
  });

  const agendaSugeridaDias: BloqueAgendaRecomendado[] = [];
  const conteoCircuitosPorDia: Record<string, number> = {};

  // Las reuniones en Chile 1408 son los miércoles (18:30 a 20:30 hs, según Google Calendar "Hagamos Popurrí")
  const diaMiercolesSede =
    diasOperativos.find(
      (d) =>
        d.diaBA.dayOfWeek === 3 ||
        ['miércoles', 'miercoles'].includes(d.diaBA.nombreDia.toLowerCase())
    ) || diasOperativos[0];

  if (contactosSedeChile.length > 0) {
    if (!intervalosOcupadosPorDia[diaMiercolesSede.diaBA.ddmm]) {
      intervalosOcupadosPorDia[diaMiercolesSede.diaBA.ddmm] = [];
    }
    intervalosOcupadosPorDia[diaMiercolesSede.diaBA.ddmm].push({
      ini: 18 * 60 + 30,
      fin: 20 * 60 + 30,
    });
  }

  circuitosParaAgendar.slice(0, 16).forEach((circ, idx) => {
    const matchDiaExplicito = circ.fechaExplicita
      ? diasOperativos.find((d) => d.diaBA.ddmm === circ.fechaExplicita)
      : undefined;

    const diasFuturosPreferidos = diasOperativos.slice(1).length > 0 ? diasOperativos.slice(1) : diasOperativos;

    let diaElegido =
      matchDiaExplicito
        ? matchDiaExplicito
        : diasFuturosPreferidos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 1) ||
          diasFuturosPreferidos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 2) ||
          diasOperativos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 2) ||
          diasFuturosPreferidos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 3) ||
          diasFuturosPreferidos[idx % diasFuturosPreferidos.length];

    conteoCircuitosPorDia[diaElegido.diaBA.ddmm] =
      (conteoCircuitosPorDia[diaElegido.diaBA.ddmm] || 0) + 1;

    const modalidadCirc: ModalidadEncuentroAgenda =
      circ.modalidadAdaptadaPorConfirmacion ||
      (circ.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
    const duracionEst =
      modalidadCirc === 'PUERTA_A_PUERTA'
        ? Math.max(35, circ.miembros.length * 22)
        : Math.max(60, Math.min(90, 45 + circ.miembros.length * 10));

    const slot = encontrarVentanaDiurnaSinChoqueCalendar({
      diaInfo: diaElegido,
      duracionMin: duracionEst,
      franjaPreferida: circ.franjaDominante,
      latBarrio: circ.centroLat,
      lngBarrio: circ.centroLng,
      ventanaColumnaG: circ.ventanaColumnaGComun,
      horaPuntualPreferida: circ.horaPuntualMasTemprana,
    });

    const etiquetaDiaLimpia =
      diaElegido.prefijo === 'HOY' || diaElegido.prefijo === 'MAÑANA'
        ? `${diaElegido.prefijo} (${diaElegido.diaBA.nombreDia} ${diaElegido.diaBA.ddmm})`
        : `${diaElegido.diaBA.nombreDia.toUpperCase()} ${diaElegido.diaBA.ddmm}`;

    agendaSugeridaDias.push(
      construirBloqueAgendaSincronizado({
        id: `agenda-circuito-${idx + 1}-${circ.barrio.toLowerCase().replace(/\s+/g, '-')}`,
        clusterIdVinculado: circ.clusterId,
        numeroCircuito: idx + 1,
        diaEtiqueta: etiquetaDiaLimpia,
        fechaClave: diaElegido.diaBA.ddmm,
        fechaISO: diaElegido.diaBA.isoDate,
        horaSalidaBase: slot.horaInicio,
        barrioDefault: circ.barrio,
        modalidadPreferida: modalidadCirc,
        contactosGrupo: circ.miembros,
        eventosDelDia: diaElegido.eventos,
        notaCalendarBase: slot.notaCalendar,
        esSeguimientoVencidos: circ.tieneAlertaVencido && !matchDiaExplicito,
      })
    );
  });

  if (contactosSedeChile.length > 0) {
    const etiqMiercoles = diaMiercolesSede.esHoy
      ? `HOY (${diaMiercolesSede.diaBA.nombreDia} ${diaMiercolesSede.diaBA.ddmm}) · Reunión en Chile 1408`
      : `ENCUENTRO SEMANAL SEDE (${diaMiercolesSede.diaBA.nombreDia} ${diaMiercolesSede.diaBA.ddmm})`;
    agendaSugeridaDias.push(
      construirBloqueAgendaSincronizado({
        id: 'agenda-sede-chile-1408',
        numeroCircuito: agendaSugeridaDias.length + 1,
        diaEtiqueta: etiqMiercoles,
        fechaClave: diaMiercolesSede.diaBA.ddmm,
        fechaISO: diaMiercolesSede.diaBA.isoDate,
        horaSalidaBase: '18:30',
        barrioDefault: 'Monserrat',
        modalidadPreferida: 'EVENTO_SEDE',
        contactosGrupo: contactosSedeChile,
        eventosDelDia: diaMiercolesSede.eventos,
        notaCalendarBase: `Coincide con la reunión de los miércoles en la Sede de Chile 1408 (18:30 a 20:30 hs, evento "Hagamos Popurrí" en Calendar).`,
      })
    );
  }

  // Ordenar los bloques de la Agenda Recomendada Día por Día por fecha ascendente y por hora de inicio ascendente
  // para que los bloques horarios de cada día se vean en secuencia cronológica limpia y sin superposiciones
  agendaSugeridaDias.sort((a, b) => {
    const fA = a.fechaISO || '';
    const fB = b.fechaISO || '';
    if (fA !== fB) return fA.localeCompare(fB);
    return (
      horaAMinutosDelDia(a.horaInicioCalculada || '09:00') -
      horaAMinutosDelDia(b.horaInicioCalculada || '09:00')
    );
  });
  agendaSugeridaDias.forEach((b, i) => {
    b.puntoCentricoResumen = (b.puntoCentricoResumen || '').replace(
      /^Circuito\s+\d+/,
      `Bloque ${i + 1}`
    );
    // Si alguna parada del bloque de HOY tenía compromiso explícito para hoy y quedó vencida sin adherir respecto de la hora actual,
    // asegurar que el contacto tenga `alertaVencido` activa y figure en `alertasPendientesVencidos`
    if (b.fechaClave === hoyBA.ddmm && b.paradasRutaSugerida) {
      for (const p of b.paradasRutaSugerida) {
        const teniaCompromisoHoy =
          p.contact.fechasMencionadas.includes(hoyBA.ddmm) ||
          Boolean(p.contact.alertaVencido?.activa);
        if (p.vencidaSinAdherir && p.contact.adhirio !== 'Sí' && teniaCompromisoHoy) {
          if (!p.contact.alertaVencido?.activa) {
            const horaVenc = p.horaPactadaExplicita || p.ventanaColumnaG || `${p.horaLlegada} hs`;
            p.contact.alertaVencido = {
              activa: true,
              tipo: 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION',
              titulo: `Encuentro / Visita de hoy vencida (${hoyBA.ddmm} · ${horaVenc}) sin cambio a "Ya adhirió"`,
              motivo:
                p.motivoVencimiento ||
                `Tenía visita prevista hoy (${hoyBA.ddmm} · ${horaVenc}) en ${p.destinoNombre}, y siendo las ${hoyBA.hhmm} hs ya pasó el horario sin cambiar a "Adhirió: Sí".`,
              fechaVencida: `${hoyBA.ddmm} (${horaVenc})`,
              propuestaReprogramacion: `Reprogramar pasada Puerta a Puerta por ${p.destinoNombre} (${p.contact.barrio}) para mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}${
                p.cafeHubAsignado ? ` o en ${p.cafeHubAsignado.nombre} (${p.cafeHubAsignado.direccion})` : ''
              }`,
              mensajeDisculpasReprogramacion: p.mensajeDisculpasVencido || '',
            };
          }
          if (!alertasPendientesVencidos.some((a) => a.id === p.contact.id)) {
            alertasPendientesVencidos.push(p.contact);
          }
        }
      }
      b.alertasIncluidasCount = b.contactosIncluidos.filter((c) =>
        Boolean(c.alertaVencido?.activa)
      ).length;
    }
  });

  // SINCRONIZACIÓN DE CAFÉS GRUPALES ENTRE AGENDA / CIRCUITOS Y TODOS LOS MENSAJES WA:
  // Si un contacto pertenece a un bloque o barrio que agrupa a >= 2 personas ya contactadas,
  // el café propuesto en sus mensajes coincide exactamente con el café gestionado por la app para ese grupo.
  // Si en ese grupo/barrio hay 1 sola persona contactada, no se propone café (se propone pasar 2 minutos por su dirección).
  const cafeGrupalPorContactoId = new Map<string, OpcionesCafeMensaje>();
  const cafeGrupalPorBarrio = new Map<string, OpcionesCafeMensaje>();

  for (const b of agendaSugeridaDias) {
    if (b.modalidad === 'EVENTO_SEDE' || b.modalidad === 'ENCUENTRO_SEDE') continue;
    const cf = b.cafesHubOpciones?.[0];
    if (b.contactosIncluidos.length >= 2 && cf) {
      const opt: OpcionesCafeMensaje = {
        incluirCafe: true,
        cafeNombre: cf.nombre,
        cafeDireccion: cf.direccion,
        cafeLat: cf.lat,
        cafeLng: cf.lng,
        horarioTexto: `${b.diaEtiqueta.toLowerCase()} de ${b.franjaHoraria}`,
      };
      if (!cafeGrupalPorBarrio.has(b.barrio.toLowerCase())) {
        cafeGrupalPorBarrio.set(b.barrio.toLowerCase(), opt);
      }
      for (const c of b.contactosIncluidos) {
        cafeGrupalPorContactoId.set(c.id, opt);
      }
    }
  }

  for (const cl of microClustersUnificados) {
    const cf = cl.cafesHubCercanos?.[0];
    if (cl.miembros.length >= 2 && cf) {
      const opt: OpcionesCafeMensaje = {
        incluirCafe: true,
        cafeNombre: cf.nombre,
        cafeDireccion: cf.direccion,
        cafeLat: cf.lat,
        cafeLng: cf.lng,
      };
      if (!cafeGrupalPorBarrio.has(cl.barrioPrincipal.toLowerCase())) {
        cafeGrupalPorBarrio.set(cl.barrioPrincipal.toLowerCase(), opt);
      }
      for (const m of cl.miembros) {
        if (!cafeGrupalPorContactoId.has(m.contact.id)) {
          cafeGrupalPorContactoId.set(m.contact.id, opt);
        }
      }
    }
  }

  // Para barrios con >= 2 personas ya contactadas pendientes que aún no tenían bloque asignado,
  // calcular su café céntrico grupal para mantener correspondencia total en toda la app
  const contactadosPendientesPorBarrio: Record<string, Contact[]> = {};
  for (const c of noAdheridosTotales) {
    if (!c.primerContactoEnviado) continue;
    const bKey = (c.barrio || 'Palermo').trim();
    if (!contactadosPendientesPorBarrio[bKey]) contactadosPendientesPorBarrio[bKey] = [];
    contactadosPendientesPorBarrio[bKey].push(c);
  }
  for (const [barrioNombre, grupoBarrio] of Object.entries(contactadosPendientesPorBarrio)) {
    const bLow = barrioNombre.toLowerCase();
    if (grupoBarrio.length >= 2 && !cafeGrupalPorBarrio.has(bLow)) {
      const sel = seleccionarCafesHubPorCercaniaYFranja(
        grupoBarrio,
        barrioNombre,
        hoyBA.ddmm,
        profile
      );
      const cf = sel.cafesRanking[0];
      if (cf) {
        cafeGrupalPorBarrio.set(bLow, {
          incluirCafe: true,
          cafeNombre: cf.nombre,
          cafeDireccion: cf.direccion,
          cafeLat: cf.lat,
          cafeLng: cf.lng,
        });
      }
    }
  }

  const resolverOpcionesCafeContacto = (c: Contact): OpcionesCafeMensaje => {
    const porId = cafeGrupalPorContactoId.get(c.id);
    if (porId) return porId;
    const porBarrio = cafeGrupalPorBarrio.get((c.barrio || '').trim().toLowerCase());
    if (porBarrio) return porBarrio;
    return { incluirCafe: false };
  };

  for (const c of filtrados) {
    if (c.procesoCompletadoSinMensajes || c.esCerradoOArchivadoSinDniCaba) continue;
    const optCafe = resolverOpcionesCafeContacto(c);
    if (c.alertaVencido?.activa && c.alertaVencido.tipo !== 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION') {
      const recalcAlerta = detectarAlertaPendienteVencido(
        {
          sinNombre: c.sinNombre,
          primerNombre: c.primerNombre,
          barrio: c.barrio,
          calleOCruce: c.calleOCruce,
          comentario: c.comentario,
          franjaHoraria: c.franjaHoraria,
          fechasMencionadas: c.fechasMencionadas,
          situacion: c.situacion,
          estadoFlujo: c.estadoFlujo,
          adhirio: c.adhirio,
          horasDesdeUltimoContacto: c.horasDesdeUltimoContacto,
          lat: c.lat,
          lng: c.lng,
        },
        profile,
        ahoraMs,
        optCafe
      );
      if (recalcAlerta?.activa) {
        c.alertaVencido = recalcAlerta;
      }
    } else if (c.alertaVencido?.activa) {
      const recalcAlerta = detectarAlertaPendienteVencido(
        {
          sinNombre: c.sinNombre,
          primerNombre: c.primerNombre,
          barrio: c.barrio,
          calleOCruce: c.calleOCruce,
          comentario: c.comentario,
          franjaHoraria: c.franjaHoraria,
          fechasMencionadas: c.fechasMencionadas,
          situacion: c.situacion,
          estadoFlujo: c.estadoFlujo,
          adhirio: c.adhirio,
          horasDesdeUltimoContacto: c.horasDesdeUltimoContacto,
          lat: c.lat,
          lng: c.lng,
        },
        profile,
        ahoraMs,
        optCafe
      );
      if (recalcAlerta?.activa) {
        c.alertaVencido = recalcAlerta;
      }
    }

    if (c.diagnostico48h?.aplica) {
      const recalcDiag = diagnosticarYGenerarMensajeSeguimiento48h(
        {
          sinNombre: c.sinNombre,
          primerNombre: c.primerNombre,
          barrio: c.barrio,
          rsp: c.rsp,
          adhirio: c.adhirio,
          comentario: c.comentario,
          calleOCruce: c.calleOCruce,
          franjaHoraria: c.franjaHoraria,
          fechasMencionadas: c.fechasMencionadas,
          primerContactoEnviado: c.primerContactoEnviado,
          horasDesdeUltimoContacto: c.horasDesdeUltimoContacto,
          intentos: c.intentos,
          situacion: c.situacion,
          estadoFlujo: c.estadoFlujo,
          esVisitaConcretadaORetiro: c.esVisitaConcretadaORetiro,
          tieneNuevaInfoEnColumnaG: c.tieneNuevaInfoEnColumnaG,
          lat: c.lat,
          lng: c.lng,
        },
        profile,
        ahoraMs,
        optCafe
      );
      if (recalcDiag?.aplica) {
        c.diagnostico48h = recalcDiag;
      }
    }

    const msgSync = generarMensajeContextual(
      c,
      profile,
      c.alertaVencido?.activa ? 'disculpas_y_reprogramacion' : 'auto',
      optCafe
    );
    c.mensajeSugerido = c.alertaVencido?.activa
      ? c.alertaVencido.mensajeDisculpasReprogramacion
      : c.diagnostico48h?.aplica
      ? c.diagnostico48h.mensajePersonalizado48h
      : msgSync.texto;
  }

  // Construir la cola de envío en 1 clic priorizando alertas vencidas/reprogramación
  // Reglas estrictas:
  // 1. Excluir casos "6. Sin DNI en CABA" que ya fueron respondidos/archivados (< #167 o mensaje ya enviado).
  // 2. Verificar que nadie que ya haya adherido antes aparezca en ninguna lista para enviarles un mensaje
  //    (especialmente antes de agregar a "3. Prefiere Punto (Convocar a Café Hub)").
  const candidatosCola = filtrados
    .filter((c) => {
      if (
        c.esCerradoOArchivadoSinDniCaba ||
        c.estadoFlujo === 'DESCARTADO_O_BAJA' ||
        c.referidosCabaYaEnviado === true
      ) {
        return false;
      }
      if (
        c.procesoCompletadoSinMensajes ||
        c.situacion === 'YA_ADHIRIO' ||
        c.adhirio === 'Sí' ||
        c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
      ) {
        return false;
      }
      if (c.situacion === 'DESCARTADO_NO_CABA') {
        return c.rsp === 'Sí' && c.telWA.length > 0 && !c.esCerradoOArchivadoSinDniCaba;
      }
      return c.telWA.length > 0;
    })
    .sort((a, b) => {
      const aAlerta = a.alertaVencido?.activa ? 0 : 1;
      const bAlerta = b.alertaVencido?.activa ? 0 : 1;
      if (aAlerta !== bAlerta) return aAlerta - bAlerta;
      return a.prioridadCorte - b.prioridadCorte;
    });

  const colaMensajes: ItemColaCorte[] = candidatosCola.map((contact) => {
    let categoriaCorte = 'Seguimiento General';
    let tipoPlantilla: TipoPlantillaWA = 'auto';

    if (contact.alertaVencido?.activa) {
      categoriaCorte = '0. ⚠️ Pendiente Vencido / Sin Confirmar (Disculpas + Reprogramar)';
      tipoPlantilla = 'disculpas_y_reprogramacion';
    } else if (
      (contact.situacion === 'PREFIERE_PUNTO' ||
        contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') &&
      contact.adhirio !== 'Sí' &&
      !contact.procesoCompletadoSinMensajes
    ) {
      categoriaCorte = '3. Prefiere Punto (Convocar a Café Hub)';
      tipoPlantilla = 'convocatoria_cafe_hub';
    } else if (contact.esRspSiSinInfoColG) {
      categoriaCorte = '3. RSP: Sí (Sin info en Col. G y sin confirmación enviada)';
      tipoPlantilla = 'seguimiento_cambio_chip';
    } else if (contact.esSinRsp48h && contact.diagnostico48h) {
      categoriaCorte = `5. Sin Rsp +48h · ${contact.diagnostico48h.etiquetaCorta}`;
      tipoPlantilla = 'seguimiento_sin_respuesta';
    } else {
      switch (contact.situacion) {
        case 'NUEVO_SIN_PRIMER_MENSAJE':
          categoriaCorte = '1. Nuevo Contacto (Enviar 1er Mensaje)';
          tipoPlantilla = 'primer_contacto';
          break;
        case 'VISITA_AGENDADA':
        case 'EVENTO_CHILE_1408':
          categoriaCorte = '2. Visita Concretada (Confirmar / En camino)';
          tipoPlantilla = 'confirmacion_visita';
          break;
        case 'PREFIERE_PUNTO':
          categoriaCorte = '3. Prefiere Punto (Convocar a Café Hub)';
          tipoPlantilla = 'convocatoria_cafe_hub';
          break;
        case 'RETIRO_FICHAS':
          categoriaCorte = '4. Retiro de Fichas Extra (X1/X2/X3 ya firmadas)';
          tipoPlantilla = 'retiro_fichas';
          break;
        case 'DESCARTADO_NO_CABA':
          categoriaCorte = '6. Sin DNI en CABA (Consultar referidos CABA)';
          tipoPlantilla = 'no_caba_referidos';
          break;
        default:
          categoriaCorte = '3. Seguimiento Activo';
          tipoPlantilla = 'seguimiento_cambio_chip';
      }
    }

    const optCafeCola = resolverOpcionesCafeContacto(contact);
    const gen = generarMensajeContextual(contact, profile, tipoPlantilla, optCafeCola);
    const mensajePersonalizado = contact.alertaVencido?.activa
      ? contact.alertaVencido.mensajeDisculpasReprogramacion
      : contact.situacion === 'PREFIERE_PUNTO' ||
        contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
      ? gen.texto
      : contact.diagnostico48h?.aplica
      ? contact.diagnostico48h.mensajePersonalizado48h
      : gen.texto;

    return {
      contact,
      categoriaCorte,
      razonRecomendacion: contact.motivoEstrategico,
      tipoPlantilla: gen.tipoUsado,
      mensajePersonalizado,
      enviado: Boolean(contact.enviadoEnSesion),
    };
  });

  // REGLA FIN DEL DÍA:
  // Una vez terminado el día operativo de HOY (>= 20:15 hs, o cuando el bloque de HOY ya terminó y todas sus paradas
  // quedaron con `vencidaSinAdherir`), la planificación de HOY desaparece de `agendaSugeridaDias`.
  // Quedan pendientes en `alertasPendientesVencidos` (y en la cola de reprogramación), en caso de no haberles escrito,
  // todas las personas de HOY que quedaron con "⚠️ Horario vencido sin adherir — Reprogramar".
  const minutosActualesCierre = hoyBA.hour * 60 + hoyBA.minute;
  const agendaSugeridaDiasVigente = agendaSugeridaDias.filter((b) => {
    const esBloqueHoy = b.fechaClave === hoyBA.ddmm || /^HOY\b/i.test(b.diaEtiqueta || '');
    if (!esBloqueHoy) return true;

    const paradasHoy = b.paradasRutaSugerida || [];
    const minFinBloque = horaAMinutosDelDia(b.horaFinCalculada || '20:00');
    const todasParadasVencidas =
      paradasHoy.length > 0 && paradasHoy.every((p) => Boolean(p.vencidaSinAdherir));
    const finDelDiaHoy =
      minutosActualesCierre >= 20 * 60 + 15 ||
      (minutosActualesCierre >= minFinBloque && todasParadasVencidas);

    for (const p of paradasHoy) {
      if (p.vencidaSinAdherir && p.contact.adhirio !== 'Sí' && !p.contact.enviadoEnSesion) {
        if (!p.contact.alertaVencido?.activa) {
          const horaVenc = p.horaPactadaExplicita || p.ventanaColumnaG || `${p.horaLlegada} hs`;
          p.contact.alertaVencido = {
            activa: true,
            tipo: 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION',
            titulo: `⚠️ Horario vencido sin adherir — Reprogramar (${hoyBA.ddmm} · ${horaVenc})`,
            motivo:
              p.motivoVencimiento ||
              `Horario vencido hoy (${hoyBA.ddmm} · ${horaVenc}) en ${p.destinoNombre} sin cambio a "Adhirió: Sí".`,
            fechaVencida: `${hoyBA.ddmm} (${horaVenc})`,
            propuestaReprogramacion: `Reprogramar pasada Puerta a Puerta por ${p.destinoNombre} (${p.contact.barrio}) para mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}${
              p.cafeHubAsignado ? ` o en ${p.cafeHubAsignado.nombre} (${p.cafeHubAsignado.direccion})` : ''
            }`,
            mensajeDisculpasReprogramacion:
              p.mensajeDisculpasVencido || p.mensajeReprogramacionCalendar || p.contact.mensajeSugerido,
          };
        }
        if (!alertasPendientesVencidos.some((a) => a.id === p.contact.id)) {
          alertasPendientesVencidos.push(p.contact);
        }
      }
    }

    if (finDelDiaHoy) {
      return false;
    }
    return true;
  });

  const resumenEjecutivo = `Agenda calculada en vivo (${hoyBA.etiquetaCompleta}) sobre ${filtrados.length} contactos: se descartaron automáticamente los ${adheridosTotales} ya adheridos (Col. F = Sí) y se seleccionaron únicamente las ${elegiblesAgendaConLugar.length} personas pendientes que ya tienen dirección, esquina o punto de encuentro determinado en Google Sheets / Sección 1. Los bloques diarios se organizaron sin superposiciones horarias y se adaptan automáticamente a las confirmaciones 1-a-1 (Café vs Puerta a Puerta).`;

  return {
    timestamp: hoyBA.hhmm,
    fechaHoraActualEtiqueta: hoyBA.etiquetaCompleta,
    totalAnalizados: filtrados.length,
    resumenEjecutivo,
    metricas: {
      nuevosPrimerContacto,
      cambioChipSinConcretar,
      sinRespuestaSeguimiento,
      visitasAgendadas,
      retirosPendientes,
      adheridosTotales,
      alertasVencidasReprogramar: alertasPendientesVencidos.length,
      conPuntoEncuentroDeterminado: elegiblesAgendaConLugar.length,
    },
    alertasPendientesVencidos,
    agendaSugeridaDias: agendaSugeridaDiasVigente,
    recomendacionesBarrio,
    colaMensajes,
  };
}

/**
 * Genera el mensaje personalizado 1-a-1 para consultar y pedir confirmación de la propuesta
 * sugerida en un bloque de la Agenda Recomendada Día por Día, adaptándose dinámicamente
 * a la modalidad elegida/confirmada (encuentro en café, recorrido Puerta a Puerta o reunión de los miércoles en Chile 1408)
 * y garantizando correspondencia 100% con el café sugerido en el bloque y en la Hoja de Ruta en Terreno.
 */
export function generarMensajePropuestaBloqueAgenda(
  contact: Contact,
  bloque: BloqueAgendaRecomendado,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  opcionesOverride?: {
    modalidad?: ModalidadEncuentroAgenda;
    cafeHubNombre?: string;
    cafeHubDireccion?: string;
    franjaHoraria?: string;
  }
): string {
  const saludo = contact.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${contact.primerNombre}, ¿cómo estás?`;

  const comLow = (contact.comentario || '').toLowerCase();
  const declinoCafe =
    comLow.includes('declinó café') ||
    comLow.includes('declino cafe') ||
    comLow.includes('pasa a puerta a puerta');
  const pidioCafe =
    contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    comLow.includes('prefiere punto de encuentro') ||
    comLow.includes('prefiere café hub');

  const modalidadEfectiva: ModalidadEncuentroAgenda =
    opcionesOverride?.modalidad ||
    bloque.modalidadElegidaUsuario ||
    (declinoCafe
      ? 'PUERTA_A_PUERTA'
      : pidioCafe
      ? 'CAFE_HUB'
      : bloque.modalidad);

  // Parada calculada en la Hoja de Ruta de este bloque para este vecino
  const paradaVecino = bloque.paradasRutaSugerida?.find((p) => p.contact.id === contact.id);

  // UNIFICACIÓN ESTRICTA DE CAFÉ DEL GRUPO:
  // Sólo se propone café si el bloque agrupa a varias personas contactadas (>= 2) o si se indicó un café explícito
  const cafePrincipalBloque = bloque.cafesHubOpciones?.[0];
  const tieneCafeGrupal =
    Boolean(
      opcionesOverride?.cafeHubNombre ||
        bloque.cafeElegidoUsuario ||
        cafePrincipalBloque ||
        paradaVecino?.cafeHubAsignado
    ) &&
    (bloque.contactosIncluidos.length >= 2 ||
      Boolean(opcionesOverride?.cafeHubNombre || bloque.cafeElegidoUsuario));

  const nombreCafeSeleccionado =
    opcionesOverride?.cafeHubNombre ||
    bloque.cafeElegidoUsuario ||
    cafePrincipalBloque?.nombre ||
    paradaVecino?.cafeHubAsignado?.nombre;

  const direccionCafeSeleccionada =
    opcionesOverride?.cafeHubDireccion ||
    cafePrincipalBloque?.direccion ||
    paradaVecino?.cafeHubAsignado?.direccion;

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: contact.barrio,
      calleOCruce: contact.calleOCruce,
      lat: contact.lat,
      lng: contact.lng,
    },
    profile,
    {
      incluirCafe: tieneCafeGrupal,
      cafeNombre: nombreCafeSeleccionado,
      cafeDireccion: direccionCafeSeleccionada,
      cafeLat: cafePrincipalBloque?.lat,
      cafeLng: cafePrincipalBloque?.lng,
    }
  );

  const dirVecino = contact.calleOCruce || `${contact.barrio}`;

  // Limpiar cualquier metadato interno de la etiqueta de día y franja horaria antes de armar el mensaje para el vecino
  const diaLimpio = (bloque.diaEtiqueta || '')
    .replace(/\s*[—–-]\s*Actualizado[^)]*/gi, '')
    .replace(/\s*\(Recorrido[^)]*\)/gi, '')
    .replace(/\s*\(Confirmación[^)]*\)/gi, '')
    .replace(/\s*·\s*Reunión en Chile 1408/gi, '')
    .trim();

  const franjaLimpia = (opcionesOverride?.franjaHoraria || bloque.franjaHoraria || '')
    .replace(/\s*\(\d+\s*parada[^)]*\)/gi, '')
    .replace(/\s*\(Mesa\s*Caf[eé]\s*HUB[^)]*\)/gi, '')
    .replace(/\s*\(Encuentro\s*en\s*caf[eé][^)]*\)/gi, '')
    .replace(/\s*\(Sede[^)]*\)/gi, '')
    .trim();

  // Si es Puerta a Puerta y tenemos la parada calculada para este vecino, ofrecer su horario conveniente calculado según la agenda del día
  const dispColG = analizarDisponibilidadColumnaG(contact.comentario);
  const detalleHoraPuntual =
    paradaVecino && modalidadEfectiva === 'PUERTA_A_PUERTA'
      ? dispColG.esVentanaAmplia && dispColG.etiquetaVentana
        ? ` alrededor de las *${paradaVecino.horaLlegada} hs* (dentro de tu disponibilidad ${dispColG.etiquetaVentana})`
        : ` cerca de las *${paradaVecino.horaLlegada} hs*`
      : '';

  const notaFichas =
    contact.situacion === 'RETIRO_FICHAS'
      ? ' Además te llevo las fichas extras en blanco que me pediste para tus contactos de CABA.'
      : '';

  const introDisculpas = contact.alertaVencido?.activa
    ? `Te pido disculpas antes que nada porque no pude cumplir con nuestro compromiso anterior para los 2 minutos de tu firma de adhesión. `
    : '';

  // Si tenía una HORA PUNTUAL RÍGIDA en Columna G que verdaderamente chocó con Google Calendar
  if (paradaVecino?.conflictoCalendar && paradaVecino.mensajeReprogramacionCalendar) {
    return paradaVecino.mensajeReprogramacionCalendar;
  }

  if (modalidadEfectiva === 'EVENTO_SEDE' || modalidadEfectiva === 'ENCUENTRO_SEDE') {
    return `${saludo}\n\n${introDisculpas}Te escribo por la reunión de los miércoles en *${profile.sedeCentral}* para *${diaLimpio}* (${franjaLimpia}), así charlamos y sumamos tu firma de adhesión en 2 minutos con tu DNI físico de CABA.${notaFichas}\n\n¿Me confirmás si podés acercarte el miércoles en ese horario o preferís que coordinemos pasar 2 minutos por *${dirVecino}*?`;
  }

  if (
    (modalidadEfectiva === 'CAFE_HUB' ||
      modalidadEfectiva === 'PUNTO_ADHESION' ||
      modalidadEfectiva === 'SEGUIMIENTO_PUNTO_ADHESION') &&
    infoCafe.incluirCafe
  ) {
    const sugerenciaHorarioDomicilio = paradaVecino?.horaLlegada
      ? ` (por ejemplo pasando cerca de las *${paradaVecino.horaLlegada} hs*)`
      : '';
    return `${saludo}\n\n${introDisculpas}Para *${diaLimpio}* entre las *${franjaLimpia}* voy a estar por *${contact.barrio}* y quería proponerte si te queda cómodo que nos encontremos 2 minutos en ${infoCafe.fraseCafe}, para firmar la ficha de adhesión en papel (acordate de traer tu DNI físico con domicilio en CABA).${notaFichas}\n\n¿Me confirmás si te viene bien pasar por *${infoCafe.cafeNombre}* en esa franja, o preferís que pase 2 minutos por *${dirVecino}*${sugerenciaHorarioDomicilio}? Gracias.`;
  }

  // Modalidad PUERTA_A_PUERTA: propone el horario conveniente según la agenda del día en orden cronológico,
  // y sólo menciona el café alternativo si el bloque agrupa a varias personas ya contactadas (>= 2)
  return infoCafe.incluirCafe
    ? `${saludo}\n\n${introDisculpas}Estoy organizando el recorrido por *${contact.barrio}* para *${diaLimpio}*${
        detalleHoraPuntual || ` en la franja de *${franjaLimpia}*`
      }, y quería proponerte pasar 2 minutos por *${dirVecino}* para firmar la ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en ese horario, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.`
    : `${saludo}\n\n${introDisculpas}Estoy organizando el recorrido por *${contact.barrio}* para *${diaLimpio}*${
        detalleHoraPuntual || ` en la franja de *${franjaLimpia}*`
      }, y quería proponerte pasar 2 minutos por *${dirVecino}* para firmar la ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en ese horario? Gracias.`;
}

/**
 * Genera el mensaje personalizado 1-a-1 desde la pestaña "3. Mapa Pendientes" (Circuitos y Puntos Céntricos),
 * adaptándose automáticamente al café elegido de la lista de Google Maps, a la fecha contenida en la Columna "G"
 * y a la recomendación de la Agenda Día por Día, sin repetir quién es el remitente ni hablar de "Café HUB" como evento.
 */
export function generarMensajePersonalizadoCircuitoMapa(
  contact: Contact,
  cluster: MicroCluster,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  opciones?: {
    modalidad?: ModalidadEncuentroAgenda;
    cafeSeleccionado?: { nombre: string; direccion: string };
    fechaPropuesta?: string;
    franjaPropuesta?: string;
  }
): string {
  const saludo = contact.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${contact.primerNombre}, ¿cómo estás?`;
  const agrupaVariasPersonas =
    cluster.miembros.length >= 2 || Boolean(opciones?.cafeSeleccionado);

  const modalidad: ModalidadEncuentroAgenda =
    opciones?.modalidad ||
    cluster.modalidadRecomendadaAgenda ||
    (cluster.convieneCafeHub && agrupaVariasPersonas ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');

  const cafePrincipalCluster = cluster.cafesHubCercanos?.[0];
  const cafeNombre =
    opciones?.cafeSeleccionado?.nombre ||
    cafePrincipalCluster?.nombre ||
    cluster.cafeRecomendado;
  const cafeDir =
    opciones?.cafeSeleccionado?.direccion ||
    cafePrincipalCluster?.direccion ||
    cluster.esquinaCentrica;

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: contact.barrio,
      calleOCruce: contact.calleOCruce,
      lat: contact.lat,
      lng: contact.lng,
    },
    profile,
    {
      incluirCafe: agrupaVariasPersonas,
      cafeNombre,
      cafeDireccion: cafeDir,
      cafeLat: cafePrincipalCluster?.lat,
      cafeLng: cafePrincipalCluster?.lng,
    }
  );

  const fechaTexto =
    opciones?.fechaPropuesta ||
    contact.fechasMencionadas[0] ||
    cluster.fechasAgrupadas?.[0] ||
    'estos próximos días';
  const franjaTexto =
    opciones?.franjaPropuesta ||
    (contact.franjaHoraria !== 'Flexible'
      ? `por la ${contact.franjaHoraria.toLowerCase()}`
      : 'entre las 15:00 y las 19:00 hs');
  const dirVecino = contact.calleOCruce || `tu domicilio en ${contact.barrio}`;
  const notaFichas =
    contact.situacion === 'RETIRO_FICHAS'
      ? ' Además te llevo las fichas extras que me pediste.'
      : '';

  if (modalidad === 'EVENTO_SEDE' || modalidad === 'ENCUENTRO_SEDE') {
    return `${saludo}\n\nTe escribo por la reunión de los miércoles en la sede de *${profile.sedeCentral}* (${fechaTexto} · ${franjaTexto}) así compartimos un rato y firmás tu ficha de adhesión en papel con tu DNI físico de CABA.${notaFichas}\n\n¿Te viene bien acercarte el miércoles a Chile 1408 o preferís que coordinemos por *${contact.barrio}*?`;
  }

  if (modalidad === 'PUERTA_A_PUERTA' || !infoCafe.incluirCafe) {
    return infoCafe.incluirCafe
      ? `${saludo}\n\nSiguiendo lo que conversamos (${fechaTexto}), estoy armando el recorrido por *${contact.barrio}* (${franjaTexto}) para pasar 2 minutos por *${dirVecino}* y que firmemos tu ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en esa franja, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.`
      : `${saludo}\n\nSiguiendo lo que conversamos (${fechaTexto}), estoy armando el recorrido por *${contact.barrio}* (${franjaTexto}) para pasar 2 minutos por *${dirVecino}* y que firmemos tu ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en esa franja? Gracias.`;
  }

  return `${saludo}\n\nPara *${fechaTexto}* (${franjaTexto}) voy a estar por *${contact.barrio}* y quería proponerte pasar o encontrarnos 2 minutos en ${infoCafe.fraseCafe}, para recibir tu firma de adhesión en papel (acordate de traer tu DNI físico con domicilio en CABA).${notaFichas}\n\n¿Me confirmás si te queda cómodo acercarte a *${infoCafe.cafeNombre}* en esa franja, o preferís que pase 2 minutos por *${dirVecino}*? Gracias.`;
}


/**
 * Devuelve una fecha sugerida vigente (DD/MM) para confirmar o reprogramar un encuentro:
 * - Si el contacto tiene una fecha futura en `fechasMencionadas`, la prioriza.
 * - Si `fallbackFecha` es futura (o es hoy y el contacto NO está vencido), la usa.
 * - Si la fecha anterior ya venció (ej. 21/10 vencido), sugiere automáticamente mañana (ej. 22/10).
 */
export function obtenerFechaSugeridaReprogramacionContacto(
  contact: { fechasMencionadas?: string[]; alertaVencido?: { activa?: boolean } },
  fallbackFecha?: string,
  ahoraMs: number = Date.now()
): string {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);

  const fechasCandidatas = [
    ...(contact.fechasMencionadas || []),
    ...(fallbackFecha ? [fallbackFecha] : []),
  ];

  for (const fRaw of fechasCandidatas) {
    const f = String(fRaw || '').trim();
    if (!/^\d{1,2}\/\d{1,2}$/.test(f)) continue;
    const cmp = compararFechaDDMMConHoyBA(f, hoyBA);
    if (cmp > 0) return f;
    if (cmp === 0 && !contact.alertaVencido?.activa) return f;
  }

  return manianaBA.ddmm;
}

/**
 * Procesa y consolida en la app y para Google Sheets la respuesta de una persona a la propuesta de la Agenda Diaria:
 * - Si confirma la propuesta -> pasa a ENCUENTRO_CONFIRMADO en el día/turno elegido y activa su mensaje en la Pestaña 3.
 * - Si se le propuso Café HUB y lo declina -> pasa automáticamente a un recorrido PUERTA_A_PUERTA confirmado en su dirección, día y turno.
 * - Si no puede en domicilio y prefiere punto -> pasa a PREFIERE_CAFE_HUB_O_SEDE con el Café HUB del bloque, día y turno.
 * - Si pide reprogramar día/hora -> actualiza la fecha, el turno/franja y el lugar en Columna G.
 * - Si avisa que ya firmó -> pasa a YA_ADHIRIO_FIRMA_OK (Adhirió: Sí) y sale de los pendientes.
 */
export function aplicarRespuestaPropuestaAgenda(
  raw: RawContactRow,
  bloque: BloqueAgendaRecomendado,
  respuesta: TipoRespuestaPropuestaAgenda,
  opciones?: {
    nuevaDireccion?: string;
    nuevaFecha?: string;
    nuevaFranja?: FranjaHoraria;
    nuevoHorarioPuntual?: string;
    notaAdicional?: string;
    confirmarEncuentro?: boolean;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): RawContactRow {
  const calleExistente = extraerCalleOCruce(raw.comentario);
  const direccionEfectiva =
    opciones?.nuevaDireccion?.trim() ||
    calleExistente ||
    `Domicilio en ${raw.barrio || 'CABA'}`;

  const hoyBA = obtenerPartesFechaHoraBA();
  const manianaBA = sumarDiasAFechaBA(Date.now(), 1);
  const fechaCandidata = opciones?.nuevaFecha?.trim() || bloque.fechaClave || manianaBA.ddmm;
  // Si no se pasó nuevaFecha explícita y la fecha del bloque ya quedó en el pasado, usar mañana por defecto
  const fechaEfectiva =
    !opciones?.nuevaFecha?.trim() &&
    /^\d{1,2}\/\d{1,2}$/.test(fechaCandidata) &&
    compararFechaDDMMConHoyBA(fechaCandidata, hoyBA) < 0
      ? manianaBA.ddmm
      : fechaCandidata;

  const franjaEfectiva = opciones?.nuevaFranja || analizarFranjaHoraria(raw.comentario);
  const horarioPuntualLimpio = opciones?.nuevoHorarioPuntual?.trim() || '';
  const notaExtra = opciones?.notaAdicional?.trim() ? ` · ${opciones.notaAdicional.trim()}` : '';

  // Traducir la franja elegida a una expresión clara para que analizarFranjaHoraria y analizarDisponibilidadColumnaG la detecten
  const etiquetaFranjaElegida = (franja?: FranjaHoraria): string => {
    switch (franja) {
      case 'Mañana':
        return 'por la mañana (9 a 12:30)';
      case 'Mediodía':
        return 'al mediodía (12:30 a 15)';
      case 'Tarde':
        return 'por la tarde (15 a 18)';
      case 'Vespertino':
        return 'después de las 18:00';
      case 'Fin de Semana':
        return 'el fin de semana';
      default:
        return '';
    }
  };

  const textoTurnoElegido = horarioPuntualLimpio
    ? `a las ${horarioPuntualLimpio.replace(/\s*hs$/i, '')} hs`
    : opciones?.nuevaFranja && opciones.nuevaFranja !== 'Sin definir'
    ? etiquetaFranjaElegida(opciones.nuevaFranja)
    : '';

  // Preservar cualquier franja horaria amplia original de Columna G si el usuario no eligió una nueva franja/hora
  const dispOrig = analizarDisponibilidadColumnaG(raw.comentario);
  const ventanaConservada =
    !textoTurnoElegido && dispOrig.esVentanaAmplia && dispOrig.etiquetaVentana
      ? ` ${dispOrig.etiquetaVentana}`
      : '';

  // Café HUB unificado del bloque (fuente única de verdad entre Pestaña 2 y Pestaña 3)
  const cafePrincipalBloque = bloque.cafesHubOpciones?.[0];
  const cafeUnificadoTexto =
    bloque.cafeElegidoUsuario ||
    (cafePrincipalBloque
      ? `${cafePrincipalBloque.nombre} (${cafePrincipalBloque.direccion.split(',')[0]})`
      : profile.cafesPorBarrio[raw.barrio]?.nombre || bloque.puntoEncuentroODireccion);

  // Limpiar fechas antiguas vencidas cuando se consolida o reprograma una nueva fecha
  const comentarioSinFechasViejas = (raw.comentario || '')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, '')
    .replace(/\[Confirmado[^\]]*\]/gi, '')
    .replace(/\[Reprogramado[^\]]*\]/gi, '')
    .replace(/\[Pasó a Puerta a Puerta[^\]]*\]/gi, '')
    .replace(/\[Declinó Café[^\]]*\]/gi, '')
    .replace(/\[Pasó a Café Hub[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  switch (respuesta) {
    case 'CONFIRMO_PROPUESTA': {
      const lugarConfirmado =
        opciones?.nuevaDireccion?.trim()
          ? opciones.nuevaDireccion.trim()
          : bloque.modalidad === 'PUERTA_A_PUERTA'
          ? direccionEfectiva
          : cafeUnificadoTexto;
      const paradaVecino = bloque.paradasRutaSugerida?.find((p) => p.contact.id === raw.id);
      const horarioIndividualConfirmado =
        textoTurnoElegido ||
        (dispOrig.horaPuntualPactada
          ? `a las ${dispOrig.horaPuntualPactada} hs`
          : dispOrig.etiquetaVentana
          ? `${dispOrig.etiquetaVentana}`
          : paradaVecino?.horaLlegada && bloque.modalidad === 'PUERTA_A_PUERTA'
          ? `a las ${paradaVecino.horaLlegada} hs`
          : `${bloque.franjaHoraria}`);
      const nuevoComentario = `${lugarConfirmado} (el ${fechaEfectiva} ${horarioIndividualConfirmado}) [Confirmado 1-a-1]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA': {
      // La persona declinó ir al Café HUB y confirmó que pasemos Puerta a Puerta por su domicilio/esquina
      const franjaTxt =
        textoTurnoElegido ||
        ventanaConservada ||
        `(${bloque.franjaHoraria})`;
      const nuevoComentario = `Visita confirmada Puerta a Puerta el ${fechaEfectiva} ${franjaTxt} (${direccionEfectiva}) [Declinó Café Hub -> Pasa a Puerta a Puerta]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'PASA_A_CAFE_HUB': {
      const turnoCafeTxt = textoTurnoElegido || `(${bloque.franjaHoraria})`;
      const cafeDestino =
        opciones?.nuevaDireccion?.trim() && /caf[eé]|bar|havanna|starbucks|martinez|bonafide/i.test(opciones.nuevaDireccion)
          ? opciones.nuevaDireccion.trim()
          : cafeUnificadoTexto;
      const nuevoComentario = `Prefiere punto de encuentro Café Hub confirmado el ${fechaEfectiva} ${turnoCafeTxt} (${direccionEfectiva} -> ${cafeDestino}) [Confirmado 1-a-1]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: 'PREFIERE_CAFE_HUB_O_SEDE',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'REPROGRAMAR_DIA_HORA': {
      const franjaTxt =
        textoTurnoElegido ||
        etiquetaFranjaElegida(franjaEfectiva) ||
        'entre 15:30 y 18';
      const baseLugar = direccionEfectiva ? `(${direccionEfectiva})` : '';
      const tagConfirmacion = opciones?.confirmarEncuentro ? ' [Confirmado 1-a-1]' : '';
      const nuevoComentario = `Visita reprogramada para el ${fechaEfectiva} ${franjaTxt} ${baseLugar}${
        comentarioSinFechasViejas && !comentarioSinFechasViejas.includes(direccionEfectiva)
          ? ` — ${comentarioSinFechasViejas}`
          : ''
      }${tagConfirmacion}${notaExtra}`.trim();
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: opciones?.confirmarEncuentro ? 'ENCUENTRO_CONFIRMADO' : 'PASO_DATOS_FALTA_CONFIRMAR',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'YA_ADHIRIO': {
      const nuevoComentario = `${raw.comentario ? raw.comentario + ' · ' : ''}[Adhesión firmada OK]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Sí',
        estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'POSTERGO_O_BAJA':
    default: {
      const esBaja = /baja|no quiere|descartar/i.test(opciones?.notaAdicional || '');
      const nuevoComentario = `${raw.comentario ? raw.comentario + ' · ' : ''}[${
        esBaja ? 'Solicitó baja' : 'Postergó para más adelante'
      }${notaExtra}]`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: esBaja ? 'No' : 'Pendiente',
        estadoFlujo: esBaja ? 'DESCARTADO_O_BAJA' : 'POSTERGO_SALUD_O_VIAJE',
        comentario: nuevoComentario,
      }).actualizado;
    }
  }
}

/**
 * Parsea un archivo o feed iCal (.ics) de Google Calendar y extrae con máxima precisión
 * todos los eventos dentro de la ventana operativa (desde 1 día atrás hasta 14 días adelante),
 * incluyendo soporte de eventos recurrentes semanales/diarios (RRULE) y conversión exacta a hora de Buenos Aires.
 */
export function parsearICalEventosCalendar(
  icsText: string,
  ahoraMs: number = Date.now(),
  calendarNameOverride?: string
): CalendarEventItem[] {
  if (!icsText || !icsText.includes('BEGIN:VCALENDAR')) return [];

  // Desplegar líneas continuadas según RFC 5545 (CRLF o LF seguido de espacio o tab)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let calendarName = calendarNameOverride || 'Mi Google Calendar';
  for (const line of lines) {
    if (line.startsWith('X-WR-CALNAME:')) {
      calendarName = line.slice('X-WR-CALNAME:'.length).trim() || calendarName;
      break;
    }
  }

  const unescapeIcsText = (val: string) =>
    val
      .replace(/\\n/gi, ' ')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();

  const parseIcsDateToMs = (rawKey: string, rawVal: string): { ms: number; isAllDay: boolean } | null => {
    const val = rawVal.trim();
    // Formato sólo fecha: YYYYMMDD
    if (/^\d{8}$/.test(val)) {
      const y = Number(val.slice(0, 4));
      const m = Number(val.slice(4, 6)) - 1;
      const d = Number(val.slice(6, 8));
      // 09:00 hora Buenos Aires (12:00 UTC)
      return { ms: Date.UTC(y, m, d, 12, 0, 0), isAllDay: true };
    }
    const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const min = Number(m[5]);
    const sec = Number(m[6]);
    const isUtc = Boolean(m[7]) || /TZID=UTC/i.test(rawKey);
    if (isUtc) {
      return { ms: Date.UTC(year, month, day, hour, min, sec), isAllDay: false };
    }
    // Si está en hora local de Argentina (UTC-3), convertir a UTC sumando 3 horas
    return { ms: Date.UTC(year, month, day, hour + 3, min, sec), isAllDay: false };
  };

  const minWindowMs = ahoraMs - 24 * 3600 * 1000;
  const maxWindowMs = ahoraMs + 14 * 86400 * 1000;

  const events: CalendarEventItem[] = [];
  let inEvent = false;
  let currentProps: Record<string, { key: string; value: string }> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentProps = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      const status = currentProps.STATUS?.value?.toUpperCase();
      if (status === 'CANCELLED') continue;

      const dtStartProp = currentProps.DTSTART;
      if (!dtStartProp) continue;
      const parsedStart = parseIcsDateToMs(dtStartProp.key, dtStartProp.value);
      if (!parsedStart) continue;

      const dtEndProp = currentProps.DTEND;
      const parsedEnd = dtEndProp ? parseIcsDateToMs(dtEndProp.key, dtEndProp.value) : null;
      const durationMs =
        parsedEnd && parsedEnd.ms > parsedStart.ms
          ? parsedEnd.ms - parsedStart.ms
          : parsedStart.isAllDay
          ? 2 * 3600 * 1000
          : 3600 * 1000;

      const summary = unescapeIcsText(currentProps.SUMMARY?.value || 'Compromiso en Calendar');
      const location = unescapeIcsText(currentProps.LOCATION?.value || '');
      const uid = currentProps.UID?.value || `ics-${events.length + 1}`;
      const rrule = currentProps.RRULE?.value || '';

      const candidateStarts: number[] = [];
      if (parsedStart.ms >= minWindowMs && parsedStart.ms <= maxWindowMs) {
        candidateStarts.push(parsedStart.ms);
      } else if (rrule && parsedStart.ms < maxWindowMs) {
        // Proyectar eventos recurrentes semanales o diarios dentro de la ventana actual
        const untilMatch = rrule.match(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i);
        const untilParsed = untilMatch ? parseIcsDateToMs('UNTIL', untilMatch[1]) : null;
        const maxAllowedMs = untilParsed ? Math.min(maxWindowMs, untilParsed.ms) : maxWindowMs;

        if (/FREQ=WEEKLY/i.test(rrule)) {
          let cursor = parsedStart.ms;
          while (cursor <= maxAllowedMs) {
            if (cursor >= minWindowMs) candidateStarts.push(cursor);
            cursor += 7 * 86400 * 1000;
          }
        } else if (/FREQ=DAILY/i.test(rrule)) {
          let cursor = parsedStart.ms;
          while (cursor <= maxAllowedMs) {
            if (cursor >= minWindowMs) candidateStarts.push(cursor);
            cursor += 86400 * 1000;
          }
        }
      }

      for (const startMs of candidateStarts) {
        const endMs = startMs + durationMs;
        const startBA = obtenerPartesFechaHoraBA(startMs);
        const endBA = obtenerPartesFechaHoraBA(endMs);
        events.push({
          id: `${uid}-${startBA.isoDate}-${startBA.hhmm}`,
          summary,
          location: location || 'CABA',
          fecha: startBA.ddmm,
          fechaISO: startBA.isoDate,
          startTime: parsedStart.isAllDay ? '09:00' : startBA.hhmm,
          endTime: parsedStart.isAllDay ? '18:00' : endBA.hhmm,
          startIso: new Date(startMs).toISOString(),
          endIso: new Date(endMs).toISOString(),
          calendarName,
          source: 'ical',
        });
      }
      continue;
    }

    if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const fullKey = line.slice(0, colonIdx);
        const baseKey = fullKey.split(';')[0].toUpperCase();
        const val = line.slice(colonIdx + 1);
        currentProps[baseKey] = { key: fullKey, value: val };
      }
    }
  }

  return deduplicarEventosCalendar(events).sort((a, b) =>
    (a.startIso || '').localeCompare(b.startIso || '')
  );
}

/**
 * Parsea texto libre copiado de Google Calendar (vista Agenda/Semana) y extrae eventos con fecha, hora y lugar.
 * Ejemplos soportados:
 * - "21/10 11:00 - 12:30 Reunión equipo | Av. Cabildo 2040, Belgrano"
 * - "Miércoles 21/10 18:30 a 20:00 Encuentro Chile 1408, Monserrat"
 */
export function parsearTextoAgendaCalendar(
  texto: string,
  ahoraMs: number = Date.now()
): CalendarEventItem[] {
  if (!texto || !texto.trim()) return [];
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const resultados: CalendarEventItem[] = [];
  let fechaActivaDDMM = hoyBA.ddmm;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const mFecha = linea.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (mFecha) {
      fechaActivaDDMM = `${String(Number(mFecha[1])).padStart(2, '0')}/${String(
        Number(mFecha[2])
      ).padStart(2, '0')}`;
    }

    const mHora = linea.match(
      /\b(\d{1,2}:\d{2})\s*(?:[-–a]|hasta)?\s*(\d{1,2}:\d{2})?\b/i
    );
    if (!mHora) continue;

    const padHHMM = (hStr: string) => {
      const [h, m] = hStr.split(':').map(Number);
      return `${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
    };

    const startTime = padHHMM(mHora[1]);
    const endTime = mHora[2] ? padHHMM(mHora[2]) : sumarMinutosAHora(startTime, 60);

    let resto = linea
      .replace(mHora[0], '')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, '')
      .replace(
        /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[ñn]ana)\b/gi,
        ''
      )
      .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
      .trim();

    if (!resto) resto = 'Compromiso en Calendar';

    let summary = resto;
    let location = 'CABA';

    if (resto.includes('|')) {
      const partes = resto.split('|').map((p) => p.trim());
      summary = partes[0] || 'Compromiso';
      location = partes.slice(1).join(', ') || 'CABA';
    } else {
      const mParen = resto.match(/\(([^)]+)\)\s*$/);
      if (mParen) {
        location = mParen[1].trim();
        summary = resto.replace(mParen[0], '').trim() || location;
      } else if (/\b en \b/i.test(resto)) {
        const idxEn = resto.toLowerCase().lastIndexOf(' en ');
        summary = resto.slice(0, idxEn).trim();
        location = resto.slice(idxEn + 4).trim();
      }
    }

    const [dd, mm] = fechaActivaDDMM.split('/');
    const fechaISO = `${hoyBA.year}-${mm}-${dd}`;

    resultados.push({
      id: `manual-txt-${Date.now()}-${i}`,
      summary,
      location,
      fecha: fechaActivaDDMM,
      fechaISO,
      startTime,
      endTime,
      startIso: `${fechaISO}T${startTime}:00-03:00`,
      endIso: `${fechaISO}T${endTime}:00-03:00`,
      source: 'manual',
    });
  }

  return resultados;
}

/**
 * Construye el enlace de envío en 1 clic a WhatsApp (wa.me) con el texto codificado
 */
export function crearEnlaceWhatsApp(rawTel: string, mensaje: string): string {
  const num = normalizarTelefonoWA(rawTel);
  if (!num) return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Divide una línea TSV o CSV respetando comillas dobles RFC-4180 y SIN recortar tabs iniciales
 * (para que una Columna A vacía jamás desplace la Columna B hacia la izquierda).
 */
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
export function migrarContactosDesde167SinPrimerContacto(
  rows: RawContactRow[],
  controlEnviadosKeys: Set<string> = new Set()
): RawContactRow[] {
  // Construir índices de personas que ya adhirieron previamente (por teléfono normalizado o nombre completo)
  // para garantizar que si una persona ya adhirió antes, nunca quede como "Prefiere Punto" ni en cola de mensajes.
  const adheridosPorTel = new Set<string>();
  const adheridosPorNombre = new Set<string>();
  for (const r of rows) {
    if (yaAdhirioAntes(r)) {
      const t = normalizarTelefonoWA(r.telRaw);
      if (t) adheridosPorTel.add(t);
      const nom = (r.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (nom.length >= 5 && !esCeldaSinNombre(r.nombre)) adheridosPorNombre.add(nom);
    }
  }

  const IDS_ENVIADOS_FALSO_TIMEOUT = new Set([170, 186, 189]);
  const IDS_CERRADOS_ANTES_DE_ENVIAR = new Set([190, 191]);

  const migrados: RawContactRow[] = rows.map((raw, idx): RawContactRow => {
    const reparado = sincronizarBarrioConDireccionComentario(repararContactoDesfasado(raw, idx));
    const numId = extraerNumeroIdContacto(reparado.id);
    const telKey = normalizarTelefonoWA(reparado.telRaw);
    const nomKey = (reparado.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const comRaw = (reparado.comentario || '').trim();

    // 0a. Corregir contactos que SÍ recibieron el 1er mensaje automático pero quedaron anotados con el falso error
    // "[Intento auto fallido ... Tiempo de espera agotado al abrir el chat]"
    if (
      /\[Intento auto fallido[^\]]*Tiempo de espera agotado al abrir el chat\]/i.test(comRaw) ||
      (IDS_ENVIADOS_FALSO_TIMEOUT.has(numId) && /Intento auto fallido/i.test(comRaw))
    ) {
      const comCorregido = comRaw
        .replace(
          /\[Intento auto fallido[^\]]*Tiempo de espera agotado al abrir el chat\]/gi,
          '[1er msj auto enviado 21/10]'
        )
        .trim();
      return {
        ...reparado,
        rsp: 'No',
        adhirio: 'Pendiente',
        primerContactoEnviado: true,
        comentario: comCorregido || '[1er msj auto enviado 21/10]',
        estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP'),
      };
    }

    // 0b. Corregir contactos donde el navegador se cerró antes de enviar ("Target page, context or browser has been closed")
    // pero habían quedado marcados como primerContactoEnviado: true (#190, #191)
    if (
      /\[Intento auto fallido[^\]]*(?:Target page, context or browser has been closed|browser has been closed)[^\]]*\]/i.test(
        comRaw
      ) ||
      (IDS_CERRADOS_ANTES_DE_ENVIAR.has(numId) && (!comRaw || /Intento auto fallido/i.test(comRaw)))
    ) {
      const comLimpio = comRaw.replace(/\[Intento auto fallido[^\]]*\]/gi, '').trim();
      const sinNom = esCeldaSinNombre(reparado.nombre);
      const estadoInicial: EstadoFlujo = sinNom
        ? 'FALTA_NOMBRE_Y_APELLIDO'
        : 'SIN_CONTACTAR_1ER_MSJ';
      return {
        ...reparado,
        rsp: 'Nuevo',
        adhirio: 'Pendiente',
        primerContactoEnviado: false,
        intentos: 0,
        ultimoContacto: '',
        comentario: comLimpio,
        estadoFlujo: estadoInicial,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
      };
    }

    // 1. Verificar si esta persona ya adhirió antes (directamente o en un registro previo)
    if (
      yaAdhirioAntes(reparado) ||
      (Boolean(telKey) && adheridosPorTel.has(telKey)) ||
      (nomKey.length >= 5 && adheridosPorNombre.has(nomKey))
    ) {
      const comLow = (reparado.comentario || '').toLowerCase();
      const esRetiro =
        reparado.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        comLow.includes('buscar fichas') ||
        /x\d/i.test(comLow);
      const estadoAdherido: EstadoFlujo = esRetiro
        ? 'PENDIENTE_RETIRO_FICHAS'
        : 'YA_ADHIRIO_FIRMA_OK';
      return {
        ...reparado,
        adhirio: 'Sí',
        rsp: 'Sí',
        primerContactoEnviado: true,
        estadoFlujo: estadoAdherido,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoAdherido),
      };
    }

    // 2. Verificar si es un caso "Sin DNI en CABA" + "No tiene domicilio en CABA" + Adhirió="No" ya respondido (< #167 o enviado)
    if (esSinDniCabaYaRespondidoOCerrado(reparado)) {
      return {
        ...reparado,
        adhirio: 'No',
        primerContactoEnviado: true,
        referidosCabaYaEnviado: true,
        estadoFlujo: 'DESCARTADO_O_BAJA',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      };
    }

    const yaEnviadoEnControl =
      controlEnviadosKeys.has(`id:${reparado.id}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`));

    if (yaEnviadoEnControl) {
      const nextEstado =
        reparado.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        reparado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
        !reparado.estadoFlujo
          ? '1ER_MSJ_ENVIADO_SIN_RSP'
          : reparado.estadoFlujo;
      return {
        ...reparado,
        primerContactoEnviado: true,
        rsp: reparado.rsp === 'Nuevo' ? 'No' : reparado.rsp,
        estadoFlujo: nextEstado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(nextEstado),
      };
    }

    // Si el contacto ya fue modificado en la app o ya tiene un estado explícito posterior al 1er contacto,
    // jamás resetearlo a "SIN_CONTACTAR_1ER_MSJ" al recargar la página o actualizar la app
    const tieneEstadoPosteriorExplicito =
      Boolean(reparado.actualizadoEnAppAt) ||
      reparado.primerContactoEnviado === true ||
      Boolean(reparado.ultimoMensajeCorteEnviadoAt) ||
      (Boolean(reparado.estadoFlujo) &&
        reparado.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
        reparado.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO');

    if (tieneEstadoPosteriorExplicito) {
      const estadoEfectivo =
        reparado.estadoFlujo ||
        (reparado.rsp === 'Sí' ? 'RESPONDIO_FALTA_DNI_O_ZONA' : '1ER_MSJ_ENVIADO_SIN_RSP');
      const rspCorregido =
        estadoEfectivo === '1ER_MSJ_ENVIADO_SIN_RSP' &&
        /^\[1er msj auto enviado[^\]]*\]$/i.test(comRaw)
          ? 'No'
          : reparado.rsp;
      return {
        ...reparado,
        rsp: rspCorregido,
        primerContactoEnviado:
          reparado.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
          reparado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
            ? false
            : true,
        estadoFlujo: estadoEfectivo,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoEfectivo),
      };
    }

    if (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO) {
      const rspLow = (reparado.rsp || '').toLowerCase();
      const adhLow = (reparado.adhirio || '').toLowerCase();
      const tieneInfoG = tieneNuevaInformacionEnColumnaG(reparado.comentario);
      const esDesc = esComentarioDescartadoONoCaba(reparado.comentario, reparado.estadoFlujo);
      if (
        rspLow !== 'sí' &&
        rspLow !== 'si' &&
        adhLow !== 'sí' &&
        adhLow !== 'si' &&
        !tieneInfoG &&
        !esDesc
      ) {
        const sinNom = esCeldaSinNombre(reparado.nombre);
        const estadoInicial: EstadoFlujo = sinNom
          ? 'FALTA_NOMBRE_Y_APELLIDO'
          : 'SIN_CONTACTAR_1ER_MSJ';
        return {
          ...reparado,
          rsp: 'Nuevo',
          adhirio: 'Pendiente',
          primerContactoEnviado: false,
          intentos: 0,
          ultimoContacto: '',
          estadoFlujo: estadoInicial,
          estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
        };
      }
    }

    return reparado;
  });

  // 3. Garantizar que el padrón siempre incluya los contactos nuevos sin 1er mensaje de INITIAL_RAW_CONTACTS (#197 en adelante)
  // para que la pestaña "1. Cola y 7 Reglas" del Automatizador siempre tenga personas sin contactar por primera vez.
  const idsPresentes = new Set(migrados.map((r) => extraerNumeroIdContacto(r.id)));
  const telsPresentes = new Set(
    migrados.map((r) => normalizarTelefonoWA(r.telRaw)).filter(Boolean)
  );
  for (const candidatoNuevo of INITIAL_RAW_CONTACTS) {
    const numIdCand = extraerNumeroIdContacto(candidatoNuevo.id);
    if (numIdCand < 197) continue;
    const telCand = normalizarTelefonoWA(candidatoNuevo.telRaw);
    if (!idsPresentes.has(numIdCand) && (!telCand || !telsPresentes.has(telCand))) {
      migrados.push({ ...candidatoNuevo });
      idsPresentes.add(numIdCand);
      if (telCand) telsPresentes.add(telCand);
    }
  }

  return asegurarIdsUnicosContactos(migrados);
}

/**
 * Adaptador inteligente local para el botón "Adaptar IA" y "Acortar aún más".
 * Permite refinar o acortar el mensaje actual integrando la respuesta/instrucción del vecino
 * de forma inmediata y natural (voz de César, concisa, sin clichés robóticos),
 * funcionando tanto de respaldo del endpoint Gemini como de motor determinístico.
 */
export function adaptarMensajeConRespuestaVecinoLocal(
  contact: Contact,
  respuestaVecinoOInstruccion: string,
  mensajeActual?: string,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): string {
  const instruccion = (respuestaVecinoOInstruccion || '').trim();
  const baseMsg = (mensajeActual || contact.mensajeSugerido || '').trim();
  const saludo = contact.sinNombre
    ? 'Hola, ¿cómo estás?'
    : `Hola, ${contact.primerNombre}, ¿cómo estás?`;
  const lugar = contact.calleOCruce || contact.barrio || 'tu zona';
  const infoCafe = describirCafeConDistanciaDesdeContacto(contact, profile);
  const posdataNombre = contact.sinNombre
    ? '\n\n_(De paso, recordame por acá tu nombre y apellido así te agendo bien en la planilla)_.'
    : '';

  // 1) Si pide acortar en 2-3 líneas directas
  if (/acort[aá]r|m[aá]s\s+corto|2-3\s+l[ií]neas|2\s+oraciones|breves|resum/i.test(instruccion)) {
    if (contact.alertaVencido?.activa) {
      return `${saludo} Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}*. ¿Qué día y franja horaria de esta semana te queda cómodo para reprogramar esos 2 minutos con tu DNI físico de CABA?${posdataNombre}`;
    }
    if (contact.tienePuntoEncuentroDeterminado) {
      return infoCafe.incluirCafe
        ? `${saludo} Estoy organizando el recorrido por ${contact.barrio}: ¿te queda bien que pase 2 minutos por *${lugar}* o preferís que nos veamos en ${infoCafe.fraseCafe}? Recordá tener a mano el DNI físico de CABA.${posdataNombre}`
        : `${saludo} Estoy organizando el recorrido por ${contact.barrio}: ¿en qué día y horario te queda cómodo que pase 2 minutos por *${lugar}* para la firma de adhesión con tu DNI físico de CABA?${posdataNombre}`;
    }
    return `${saludo} Soy ${profile.nombrePromotor} (${profile.espacioPolitico}). Para coordinar los 2 minutos de tu firma de adhesión en ${contact.barrio} con DNI físico de CABA, ¿por qué calle/esquina y en qué franja horaria te queda más cómodo?${posdataNombre}`;
  }

  // 2) Analizar qué respondió o pidió la persona en `instruccion`
  const disp = analizarDisponibilidadColumnaG(instruccion);
  const fechasEncontradas = Array.from(
    new Set((instruccion.match(/\b(\d{1,2}\/\d{1,2})\b/g) || []).map((f) => f.trim()))
  );
  const mencionaManiana = /\bma[ñn]ana\b/i.test(instruccion);
  const mencionaJueves = /\bjueves\b/i.test(instruccion);
  const mencionaViernes = /\bviernes\b/i.test(instruccion);
  const mencionaSabado = /\bs[aá]bado\b/i.test(instruccion);
  const mencionaLunes = /\blunes\b/i.test(instruccion);
  const prefiereDomicilio = /\b(casa|domicilio|puerta|ac[aá]|edificio|timbre|pasar\s+por)\b/i.test(instruccion);
  const prefiereCafe = /\b(caf[eé]|bar|confiter[ií]a|punto\s+de\s+encuentro)\b/i.test(instruccion);
  const pideDisculpasCompromiso = /\b(disculp|responsabilidad|compromiso|no\s+pude|reprogram)\b/i.test(instruccion);

  const diaTexto =
    fechasEncontradas.length > 0
      ? `el *${fechasEncontradas[0]}*`
      : mencionaManiana
      ? '*mañana*'
      : mencionaJueves
      ? 'el *jueves*'
      : mencionaViernes
      ? 'el *viernes*'
      : mencionaSabado
      ? 'el *sábado*'
      : mencionaLunes
      ? 'el *lunes*'
      : 'en estos días';

  const horarioTexto = disp.horaPuntualPactada
    ? `alrededor de las *${disp.horaPuntualPactada} hs*`
    : disp.etiquetaVentana
    ? `dentro de la franja de *${disp.etiquetaVentana}*`
    : /\btarde\b/i.test(instruccion)
    ? 'por la *tarde*'
    : /\bma[ñn]ana\b/i.test(instruccion) && !mencionaManiana
    ? 'por la *mañana*'
    : /\bmediod[ií]a\b/i.test(instruccion)
    ? 'al *mediodía*'
    : '';

  if (pideDisculpasCompromiso) {
    return infoCafe.incluirCafe && !prefiereDomicilio
      ? `${saludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}* como teníamos previsto.\n\nPara adaptarme a tu disponibilidad, ¿te queda bien que lo reprogramemos para ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''} pasando 2 minutos por *${lugar}*, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.${posdataNombre}`
      : `${saludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}* como teníamos previsto.\n\nPara adaptarme a tu disponibilidad, ¿te queda bien que pase 2 minutos por *${lugar}* ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''}? Gracias.${posdataNombre}`;
  }

  if (prefiereCafe && infoCafe.incluirCafe) {
    return `${saludo}\n\nPerfecto, gracias por avisarme. Agendamos entonces para vernos ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''} en ${infoCafe.fraseCafe} (son sólo 2 minutos con tu DNI físico con domicilio en CABA). Te escribo un ratito antes de estar ahí. Gracias.${posdataNombre}`;
  }

  if (
    prefiereDomicilio ||
    disp.horaPuntualPactada ||
    disp.esVentanaAmplia ||
    fechasEncontradas.length > 0 ||
    mencionaManiana ||
    mencionaJueves ||
    mencionaViernes ||
    mencionaSabado ||
    mencionaLunes
  ) {
    return `${saludo}\n\nBuenísimo, gracias por confirmarme. Te agendo entonces para pasar 2 minutos por *${lugar}* ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''} (acordate de tener a mano tu DNI físico con domicilio en CABA). Te aviso por acá un ratito antes de llegar. Gracias.${posdataNombre}`;
  }

  if (instruccion) {
    return `${saludo}\n\nGracias por responderme (${instruccion}). Te propongo entonces pasar 2 minutos por *${lugar}* en el día y horario que te quede más cómodo con tu DNI físico con domicilio en CABA${infoCafe.incluirCafe ? `, o bien vernos en ${infoCafe.fraseCafe}` : ''}. Avisame qué te resulta mejor y lo dejamos agendado.${posdataNombre}`;
  }

  return baseMsg;
}

/**
 * Al sincronizar o importar desde Google Sheets:
 * 1. Toda persona del #167 en adelante o toda persona NUEVA que se haya incluido en el Google Sheets
 *    y que no figure en el registro de control de primer contacto queda marcada automáticamente
 *    como pendiente de 1er mensaje (`SIN_CONTACTAR_1ER_MSJ` o `FALTA_NOMBRE_Y_APELLIDO`).
 * 2. Toda persona cuyo estatus, comentario o envío ya fue actualizado en la app conserva sus cambios
 *    sin ser pisada por datos más viejos del Google Sheets de sólo lectura.
 * 3. Si la dirección en Columna G ("Comentario") no coincide con el barrio del Sheet, se corrige automáticamente al barrio real.
 */
export function fusionarContactosDesdeSheetsConControl(
  nuevosDesdeSheets: RawContactRow[],
  previosEnApp: RawContactRow[],
  controlEnviadosKeys: Set<string> = new Set()
): { contactosFusionados: RawContactRow[]; nuevosParaPrimerContactoCount: number } {
  const mapaPreviosPorId = new Map<string, RawContactRow>();
  const mapaPreviosPorTel = new Map<string, RawContactRow>();
  const adheridosPorTel = new Set<string>();
  const adheridosPorNombre = new Set<string>();

  for (const prev of previosEnApp) {
    mapaPreviosPorId.set(String(prev.id).trim(), prev);
    const t = normalizarTelefonoWA(prev.telRaw);
    if (t) mapaPreviosPorTel.set(t, prev);
    if (yaAdhirioAntes(prev)) {
      if (t) adheridosPorTel.add(t);
      const nom = (prev.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (nom.length >= 5 && !esCeldaSinNombre(prev.nombre)) adheridosPorNombre.add(nom);
    }
  }
  for (const nuevo of nuevosDesdeSheets) {
    if (yaAdhirioAntes(nuevo)) {
      const t = normalizarTelefonoWA(nuevo.telRaw);
      if (t) adheridosPorTel.add(t);
      const nom = (nuevo.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (nom.length >= 5 && !esCeldaSinNombre(nuevo.nombre)) adheridosPorNombre.add(nom);
    }
  }

  let nuevosParaPrimerContactoCount = 0;
  const idsVistosEnSheet = new Set<string>();
  const telsVistosEnSheet = new Set<string>();

  const contactosFusionados = nuevosDesdeSheets.map((item, idx) => {
    const row = sincronizarBarrioConDireccionComentario(repararContactoDesfasado(item, idx));
    const idKey = String(row.id).trim();
    const telKey = normalizarTelefonoWA(row.telRaw);
    const nomKey = (row.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (idKey) idsVistosEnSheet.add(idKey);
    if (telKey) telsVistosEnSheet.add(telKey);

    const previo = mapaPreviosPorId.get(idKey) || (telKey ? mapaPreviosPorTel.get(telKey) : undefined);

    // Si el contacto fue editado explícitamente en la app (`actualizadoEnAppAt`), priorizar el comentario y estatus de la app
    const editadoEnApp = Boolean(previo?.actualizadoEnAppAt);

    const fueEnviadoEnApp =
      editadoEnApp ||
      controlEnviadosKeys.has(`id:${idKey}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`)) ||
      Boolean(previo?.primerContactoEnviado === true) ||
      Boolean(previo?.ultimoMensajeCorteEnviadoAt);

    const numId = extraerNumeroIdContacto(row.id);
    const esPersonaNuevaEnSheet = !previo && previosEnApp.length > 0;
    const comentarioEfectivo =
      editadoEnApp && previo?.comentario
        ? previo.comentario
        : tieneNuevaInformacionEnColumnaG(row.comentario)
          ? row.comentario
          : tieneNuevaInformacionEnColumnaG(previo?.comentario || '')
            ? previo!.comentario
            : row.comentario || previo?.comentario || '';
    const referidosCabaYaEnviado =
      previo?.referidosCabaYaEnviado ?? row.referidosCabaYaEnviado;
    const metadatosPreservados = {
      actualizadoEnAppAt: previo?.actualizadoEnAppAt || row.actualizadoEnAppAt,
      ultimoMensajeCorteEnviadoAt:
        previo?.ultimoMensajeCorteEnviadoAt || row.ultimoMensajeCorteEnviadoAt,
      alertaVencidoOcultaFecha:
        previo?.alertaVencidoOcultaFecha || row.alertaVencidoOcultaFecha,
    };

    // 1. Si en el Google Sheet actual o en la App la persona figura como Adhirió = Sí, marcar como proceso terminado (YA_ADHIRIO_FIRMA_OK)
    const adhirioEnSheetOApp =
      row.adhirio === 'Sí' ||
      previo?.adhirio === 'Sí' ||
      yaAdhirioAntes(row) ||
      (previo ? yaAdhirioAntes(previo) : false) ||
      (Boolean(telKey) && adheridosPorTel.has(telKey)) ||
      (nomKey.length >= 5 && adheridosPorNombre.has(nomKey));

    if (adhirioEnSheetOApp) {
      const comLow = comentarioEfectivo.toLowerCase();
      const esRetiro =
        row.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        previo?.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        comLow.includes('buscar fichas') ||
        /x\d/i.test(comLow);
      const estadoAdherido: EstadoFlujo = esRetiro
        ? 'PENDIENTE_RETIRO_FICHAS'
        : 'YA_ADHIRIO_FIRMA_OK';
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        adhirio: 'Sí',
        rsp: 'Sí',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        estadoFlujo: estadoAdherido,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoAdherido),
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado,
        ultimoContacto: previo?.ultimoContacto || row.ultimoContacto,
        intentos: Math.max(previo?.intentos || 1, row.intentos || 1),
      });
    }

    // 1b. Si es un caso "Sin DNI en CABA" + "No tiene domicilio en CABA" + Adhirió="No" ya respondido (< #167 o enviado)
    const candidatoConRef: RawContactRow = {
      ...row,
      ...metadatosPreservados,
      comentario: comentarioEfectivo,
      referidosCabaYaEnviado,
      estadoFlujo: previo?.estadoFlujo === 'DESCARTADO_O_BAJA' ? 'DESCARTADO_O_BAJA' : row.estadoFlujo,
    };
    if (esSinDniCabaYaRespondidoOCerrado(candidatoConRef)) {
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        adhirio: 'No',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        referidosCabaYaEnviado: true,
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
        ultimoContacto: previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
        intentos: Math.max(previo?.intentos || 1, row.intentos || 1),
        estadoFlujo: 'DESCARTADO_O_BAJA',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      });
    }

    // 1c. Si fue editado explícitamente en la app (`actualizadoEnAppAt`), preservar íntegramente su estado actualizado en la app
    if (editadoEnApp && previo) {
      const estadoApp = previo.estadoFlujo || row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...previo,
        ...metadatosPreservados,
        nombre: previo.nombre || row.nombre,
        barrio: previo.barrio || row.barrio,
        email: previo.email || row.email,
        telRaw: previo.telRaw || row.telRaw,
        comentario: comentarioEfectivo,
        estadoFlujo: estadoApp,
        estadoFlujoEtiqueta: estadoApp ? obtenerEtiquetaEstadoFlujo(estadoApp) : undefined,
      });
    }

    // 2. Si la persona respondió Sí en el Sheet (Columna E = Sí) o en la App, o ya tiene información real cargada en Columna G ("Comentario")
    const tieneInfoRealEnColG = tieneNuevaInformacionEnColumnaG(comentarioEfectivo);
    if (row.rsp === 'Sí' || previo?.rsp === 'Sí' || tieneInfoRealEnColG) {
      const estadoPreservado =
        previo?.estadoFlujo &&
        previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
        previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO' &&
        previo.estadoFlujo !== '1ER_MSJ_ENVIADO_SIN_RSP'
          ? previo.estadoFlujo
          : row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        rsp: 'Sí',
        adhirio: esComentarioDescartadoONoCaba(comentarioEfectivo, estadoPreservado)
          ? 'No'
          : previo?.adhirio || 'Pendiente',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        referidosCabaYaEnviado,
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
        ultimoContacto: previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
        intentos: previo?.intentos !== undefined ? previo.intentos : row.intentos || 1,
        estadoFlujo: estadoPreservado,
        estadoFlujoEtiqueta: estadoPreservado
          ? obtenerEtiquetaEstadoFlujo(estadoPreservado)
          : undefined,
      });
    }

    // 3. Si en la app ya hicimos clic en "Enviar WA" para esta persona, preservar su estado de contactado
    if (fueEnviadoEnApp) {
      const estadoPreservado: EstadoFlujo =
        previo?.estadoFlujo &&
        previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
        previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO'
          ? previo.estadoFlujo
          : '1ER_MSJ_ENVIADO_SIN_RSP';
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        nombre: row.nombre || previo?.nombre || '',
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        rsp: String(previo?.rsp || '') === 'Sí' ? 'Sí' : 'No',
        adhirio: previo?.adhirio || 'Pendiente',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        referidosCabaYaEnviado,
        fechaPrimerContacto:
          previo?.fechaPrimerContacto || new Date().toISOString().slice(0, 10),
        ultimoContacto: previo?.ultimoContacto || new Date().toISOString().slice(0, 10),
        intentos: Math.max(1, previo?.intentos || 1),
        estadoFlujo: estadoPreservado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoPreservado),
      });
    }

    // 4. Si está desde el #167 en adelante O es una persona nueva que se acaba de incluir en el Google Sheets (sin info en Col. G)
    if (
      !tieneInfoRealEnColG &&
      (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO ||
        esPersonaNuevaEnSheet ||
        esContactoSinPrimerContacto(row))
    ) {
      const sinNom = esCeldaSinNombre(row.nombre);
      const estadoNuevo: EstadoFlujo = sinNom
        ? 'FALTA_NOMBRE_Y_APELLIDO'
        : 'SIN_CONTACTAR_1ER_MSJ';
      nuevosParaPrimerContactoCount++;
      const filaNueva: RawContactRow = {
        ...row,
        ...metadatosPreservados,
        rsp: 'Nuevo',
        adhirio: 'Pendiente',
        primerContactoEnviado: false,
        ultimoContacto: '',
        intentos: 0,
        estadoFlujo: estadoNuevo,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoNuevo),
      };
      return filaNueva;
    }

    return sincronizarBarrioConDireccionComentario({
      ...row,
      ...metadatosPreservados,
      adhirio: esComentarioDescartadoONoCaba(comentarioEfectivo, row.estadoFlujo || previo?.estadoFlujo)
        ? 'No'
        : previo?.adhirio || 'Pendiente',
      comentario: comentarioEfectivo,
      primerContactoEnviado: true,
      referidosCabaYaEnviado,
      vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
      fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
      ultimoContacto: previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
      intentos: previo?.intentos !== undefined ? previo.intentos : row.intentos || 1,
      estadoFlujo: previo?.estadoFlujo || row.estadoFlujo,
      estadoFlujoEtiqueta:
        (previo?.estadoFlujo ? obtenerEtiquetaEstadoFlujo(previo.estadoFlujo) : undefined) ||
        row.estadoFlujoEtiqueta,
    });
  });

  // Preservar también cualquier contacto agregado manualmente en la app que aún no figure en la exportación CSV de Sheets
  for (const prev of previosEnApp) {
    const idKey = String(prev.id).trim();
    const telKey = normalizarTelefonoWA(prev.telRaw);
    const yaIncluido =
      (idKey && idsVistosEnSheet.has(idKey)) ||
      (Boolean(telKey) && telsVistosEnSheet.has(telKey));
    if (!yaIncluido) {
      contactosFusionados.push(sincronizarBarrioConDireccionComentario(prev));
    }
  }

  return {
    contactosFusionados: migrarContactosDesde167SinPrimerContacto(
      contactosFusionados,
      controlEnviadosKeys
    ),
    nuevosParaPrimerContactoCount,
  };
}

/**
 * Fusiona determinísticamente las listas de contactos entre múltiples dispositivos/sesiones
 * (por ejemplo PC de escritorio vs. notebook/compu vs. servidor), garantizando que siempre prevalezca
 * el cambio más reciente (`actualizadoEnAppAt`) o el estado más avanzado de cada contacto.
 */
export function fusionarContactosMultiDispositivo(
  locales: RawContactRow[],
  remotos: RawContactRow[],
  controlEnviadosKeys: Set<string> = new Set()
): RawContactRow[] {
  if (!remotos || remotos.length === 0) {
    return migrarContactosDesde167SinPrimerContacto(locales, controlEnviadosKeys);
  }
  if (!locales || locales.length === 0) {
    return migrarContactosDesde167SinPrimerContacto(remotos, controlEnviadosKeys);
  }

  const mapaRemotosPorId = new Map<string, RawContactRow>();
  const mapaRemotosPorTel = new Map<string, RawContactRow>();
  for (const r of remotos) {
    const idK = String(r.id || '').trim();
    if (idK) mapaRemotosPorId.set(idK, r);
    const tK = normalizarTelefonoWA(r.telRaw);
    if (tK) mapaRemotosPorTel.set(tK, r);
  }

  const idsProcesados = new Set<string>();
  const telsProcesados = new Set<string>();

  const puntajeAvanceContacto = (c: RawContactRow): number => {
    let score = 0;
    if (c.actualizadoEnAppAt) score += 100;
    if (c.ultimoMensajeCorteEnviadoAt) score += 50;
    if (c.adhirio === 'Sí') score += 80;
    if (c.estadoFlujo === 'DESCARTADO_O_BAJA' && c.referidosCabaYaEnviado) score += 70;
    if (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' || c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO') score += 60;
    if (c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' || c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') score += 45;
    if (c.rsp === 'Sí') score += 30;
    if (c.primerContactoEnviado === true) score += 20;
    if (tieneNuevaInformacionEnColumnaG(c.comentario || '')) score += 15;
    score += Math.min(10, c.intentos || 0);
    return score;
  };

  const elegirMasReciente = (loc: RawContactRow, rem: RawContactRow): RawContactRow => {
    const tLoc = loc.actualizadoEnAppAt ? Date.parse(loc.actualizadoEnAppAt) : 0;
    const tRem = rem.actualizadoEnAppAt ? Date.parse(rem.actualizadoEnAppAt) : 0;
    if (tLoc > 0 && tRem > 0 && tLoc !== tRem) {
      const ganador = tRem > tLoc ? rem : loc;
      const perdedor = tRem > tLoc ? loc : rem;
      return {
        ...perdedor,
        ...ganador,
        ultimoMensajeCorteEnviadoAt:
          ganador.ultimoMensajeCorteEnviadoAt || perdedor.ultimoMensajeCorteEnviadoAt,
        alertaVencidoOcultaFecha:
          ganador.alertaVencidoOcultaFecha || perdedor.alertaVencidoOcultaFecha,
      };
    }
    if (tRem > 0 && tLoc === 0) return { ...loc, ...rem };
    if (tLoc > 0 && tRem === 0) return { ...rem, ...loc };

    const scoreLoc = puntajeAvanceContacto(loc);
    const scoreRem = puntajeAvanceContacto(rem);
    const ganador = scoreRem > scoreLoc ? rem : loc;
    const perdedor = scoreRem > scoreLoc ? loc : rem;
    return {
      ...perdedor,
      ...ganador,
      ultimoMensajeCorteEnviadoAt:
        ganador.ultimoMensajeCorteEnviadoAt || perdedor.ultimoMensajeCorteEnviadoAt,
      alertaVencidoOcultaFecha:
        ganador.alertaVencidoOcultaFecha || perdedor.alertaVencidoOcultaFecha,
    };
  };

  const resultado: RawContactRow[] = [];
  for (const loc of locales) {
    const idK = String(loc.id || '').trim();
    const tK = normalizarTelefonoWA(loc.telRaw);
    if (idK) idsProcesados.add(idK);
    if (tK) telsProcesados.add(tK);

    const rem = mapaRemotosPorId.get(idK) || (tK ? mapaRemotosPorTel.get(tK) : undefined);
    if (!rem) {
      resultado.push(loc);
    } else {
      resultado.push(elegirMasReciente(loc, rem));
    }
  }

  for (const rem of remotos) {
    const idK = String(rem.id || '').trim();
    const tK = normalizarTelefonoWA(rem.telRaw);
    const visto = (idK && idsProcesados.has(idK)) || (Boolean(tK) && telsProcesados.has(tK));
    if (!visto) {
      resultado.push(rem);
    }
  }

  return migrarContactosDesde167SinPrimerContacto(resultado, controlEnviadosKeys);
}

/**
 * Permite modificar o agregar cualquier dato de un contacto seleccionado en "1. Contacto y Respuestas"
 * (Nombre, Barrio, Teléfono, Email, RSP, Adhirió, Comentario/Dirección en Columna G, Estado),
 * corrigiendo automáticamente el Barrio si la dirección introducida en la Columna G ("Comentario")
 * pertenece a otro barrio de CABA, y dejando el registro listo para sincronizar con Google Sheets.
 */
export function actualizarDatosContactoEnApp(
  rawActual: RawContactRow,
  cambios: Partial<RawContactRow>
): {
  actualizado: RawContactRow;
  barrioAutocorregido: boolean;
  barrioAnterior?: string;
  barrioFinal: string;
} {
  const ahoraISO = new Date().toISOString();
  const combinado: RawContactRow = {
    ...rawActual,
    ...cambios,
    enSheets: true,
    actualizadoEnAppAt: cambios.actualizadoEnAppAt || ahoraISO,
  };

  // Si se modificó el comentario (Columna G) o ya tiene dirección en Columna G, verificar si corresponde auto-corregir el barrio
  const barrioAntesDeCheck = (combinado.barrio || 'Palermo').trim();
  const conBarrioSincronizado = sincronizarBarrioConDireccionComentario(combinado);
  const barrioAutocorregido =
    conBarrioSincronizado.barrio.toLowerCase() !== barrioAntesDeCheck.toLowerCase();

  let estadoFinal = conBarrioSincronizado.estadoFlujo;

  // Si el usuario cambió manualmente el estatus en el selector de Estado:
  if (cambios.estadoFlujo !== undefined) {
    estadoFinal = cambios.estadoFlujo;
    if (
      cambios.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
      cambios.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      conBarrioSincronizado.primerContactoEnviado = false;
      if (cambios.rsp === undefined) {
        conBarrioSincronizado.rsp = 'Nuevo';
      }
    } else {
      conBarrioSincronizado.primerContactoEnviado = true;
      if (conBarrioSincronizado.rsp === 'Nuevo' && cambios.rsp === undefined) {
        conBarrioSincronizado.rsp = 'No';
      }
    }

    if (cambios.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
      conBarrioSincronizado.adhirio = 'Sí';
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
    } else if (
      rawActual.adhirio === 'Sí' &&
      cambios.adhirio === undefined &&
      cambios.estadoFlujo !== 'PENDIENTE_RETIRO_FICHAS'
    ) {
      // Si ya había adherido (ficha verde con botón de mensaje deshabilitado) y el usuario cambia manualmente
      // el estatus para poder volver a escribirle, pasa `adhirio` a 'Pendiente' para habilitar el envío.
      conBarrioSincronizado.adhirio = 'Pendiente';
    }

    if (cambios.estadoFlujo === 'DESCARTADO_O_BAJA') {
      conBarrioSincronizado.adhirio = 'No';
      conBarrioSincronizado.referidosCabaYaEnviado = true;
    } else if (cambios.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS') {
      conBarrioSincronizado.referidosCabaYaEnviado = false;
    }
  } else if (cambios.adhirio !== undefined) {
    if (cambios.adhirio === 'Sí') {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      const comLow = (conBarrioSincronizado.comentario || '').toLowerCase();
      estadoFinal =
        comLow.includes('buscar fichas') || /x\d/i.test(comLow)
          ? 'PENDIENTE_RETIRO_FICHAS'
          : 'YA_ADHIRIO_FIRMA_OK';
    } else if (
      rawActual.adhirio === 'Sí' &&
      conBarrioSincronizado.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
    ) {
      const sinNom =
        esCeldaSinNombre(conBarrioSincronizado.nombre) &&
        !conBarrioSincronizado.vocativoOverride?.trim();
      const calle = extraerCalleOCruce(conBarrioSincronizado.comentario);
      const fechas = extraerFechasMencionadas(conBarrioSincronizado.comentario);
      const franja = analizarFranjaHoraria(conBarrioSincronizado.comentario);
      estadoFinal = inferirEstadoFlujo(
        { ...conBarrioSincronizado, estadoFlujo: undefined },
        sinNom,
        calle,
        fechas,
        franja
      );
    }
  } else {
    const sinNom = esCeldaSinNombre(conBarrioSincronizado.nombre) && !conBarrioSincronizado.vocativoOverride?.trim();
    const calle = extraerCalleOCruce(conBarrioSincronizado.comentario);
    const fechas = extraerFechasMencionadas(conBarrioSincronizado.comentario);
    const franja = analizarFranjaHoraria(conBarrioSincronizado.comentario);
    // Si cargó dirección o día en Comentario y estaba en sin respuesta, pasar a PASO_DATOS_FALTA_CONFIRMAR y RSP = Sí
    if (
      cambios.comentario !== undefined &&
      (calle.length > 0 || fechas.length > 0) &&
      conBarrioSincronizado.adhirio !== 'Sí' &&
      conBarrioSincronizado.adhirio !== 'No'
    ) {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      estadoFinal = 'PASO_DATOS_FALTA_CONFIRMAR';
    } else if (
      cambios.nombre !== undefined &&
      !sinNom &&
      conBarrioSincronizado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      estadoFinal = conBarrioSincronizado.primerContactoEnviado
        ? '1ER_MSJ_ENVIADO_SIN_RSP'
        : 'SIN_CONTACTAR_1ER_MSJ';
    } else {
      estadoFinal = inferirEstadoFlujo(
        { ...conBarrioSincronizado, estadoFlujo: undefined },
        sinNom,
        calle,
        fechas,
        franja
      );
    }
  }

  const actualizado: RawContactRow = {
    ...conBarrioSincronizado,
    actualizadoEnAppAt: conBarrioSincronizado.actualizadoEnAppAt || ahoraISO,
    estadoFlujo: estadoFinal,
    estadoFlujoEtiqueta: estadoFinal ? obtenerEtiquetaEstadoFlujo(estadoFinal) : undefined,
  };

  return {
    actualizado,
    barrioAutocorregido,
    barrioAnterior: barrioAutocorregido ? barrioAntesDeCheck : undefined,
    barrioFinal: actualizado.barrio,
  };
}

/**
 * Registra el clic en el botón de enviar mensaje (WhatsApp) y calcula automáticamente
 * el nuevo estado del contacto para actualizar tanto la app como la tabla de Excel / Google Sheets.
 */
export function registrarEnvioMensajeContacto(
  raw: RawContactRow,
  plantillaEnviada: TipoPlantillaWA = 'auto',
  fechaHoyISO: string = new Date().toISOString().slice(0, 10)
): {
  actualizado: RawContactRow;
  estadoAnteriorEtiqueta: string;
  estadoNuevo: EstadoFlujo;
  estadoNuevoEtiqueta: string;
  eraPrimerContacto: boolean;
} {
  const procActual = procesarContacto(raw);
  const estadoAnteriorEtiqueta = procActual.estadoFlujoEtiqueta;
  const tplEfectiva =
    plantillaEnviada === 'auto' ? procActual.tipoPlantillaSugerida : plantillaEnviada;

  const eraPrimerContacto =
    esContactoSinPrimerContacto(raw) ||
    procActual.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    procActual.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
    tplEfectiva === 'primer_contacto';

  let estadoNuevo: EstadoFlujo = procActual.estadoFlujo;
  let rspNuevo: RawContactRow['rsp'] = raw.rsp === 'Nuevo' ? 'No' : raw.rsp;
  let adhirioNuevo: RawContactRow['adhirio'] = raw.adhirio;
  let referidosCabaYaEnviado = raw.referidosCabaYaEnviado;

  if (eraPrimerContacto) {
    estadoNuevo = '1ER_MSJ_ENVIADO_SIN_RSP';
    rspNuevo = raw.rsp === 'Sí' ? 'Sí' : 'No';
  } else if (tplEfectiva === 'disculpas_y_reprogramacion') {
    estadoNuevo =
      procActual.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
        ? 'PREFIERE_CAFE_HUB_O_SEDE'
        : 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'en_camino' ||
    tplEfectiva === 'llegando' ||
    tplEfectiva === 'demorado' ||
    tplEfectiva === 'recordatorio_maniana_encuentro'
  ) {
    estadoNuevo = 'RECORDATORIO_DIA_ENVIADO';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'esperado_no_estaba_reprogramar') {
    estadoNuevo = 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'seguimiento_24h_falta_dato') {
    estadoNuevo = 'RESPONDIO_FALTA_DNI_O_ZONA';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'seguimiento_24h_falta_confirmar') {
    estadoNuevo = 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'confirmacion_visita' ||
    procActual.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR'
  ) {
    estadoNuevo = 'ENCUENTRO_CONFIRMADO';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'convocatoria_cafe_hub') {
    estadoNuevo =
      raw.rsp === 'Sí' ? 'PREFIERE_CAFE_HUB_O_SEDE' : '1ER_MSJ_ENVIADO_SIN_RSP';
  } else if (tplEfectiva === 'mas_info') {
    estadoNuevo = 'PIDIO_MAS_INFO_ENVIADA';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'agradecimiento_post_firma') {
    estadoNuevo = 'YA_ADHIRIO_FIRMA_OK';
    adhirioNuevo = 'Sí';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'no_caba_referidos' ||
    procActual.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    procActual.situacion === 'DESCARTADO_NO_CABA'
  ) {
    // Una vez enviado el mensaje de consulta de referidos en CABA, cambiar estatus a Archivado/Cerrado
    // para sacarlo automáticamente de la lista de pendientes y de la cola de mensajes.
    estadoNuevo = 'DESCARTADO_O_BAJA';
    adhirioNuevo = 'No';
    referidosCabaYaEnviado = true;
  } else if (
    tplEfectiva === 'baja_respetuosa' ||
    tplEfectiva === 'baja_amable_sin_respuesta'
  ) {
    estadoNuevo = 'DESCARTADO_O_BAJA';
    adhirioNuevo = 'No';
    referidosCabaYaEnviado = true;
  }

  const estadoNuevoEtiqueta = obtenerEtiquetaEstadoFlujo(estadoNuevo);
  const ahoraISO = new Date().toISOString();

  const actualizado: RawContactRow = sincronizarBarrioConDireccionComentario({
    ...raw,
    enSheets: true,
    primerContactoEnviado: true,
    referidosCabaYaEnviado,
    fechaPrimerContacto: raw.fechaPrimerContacto || fechaHoyISO,
    ultimoContacto: fechaHoyISO,
    ultimoMensajeCorteEnviadoAt: ahoraISO,
    actualizadoEnAppAt: ahoraISO,
    intentos: (raw.intentos || 0) + 1,
    rsp: rspNuevo,
    adhirio: adhirioNuevo,
    estadoFlujo: estadoNuevo,
    estadoFlujoEtiqueta: estadoNuevoEtiqueta,
  });

  return {
    actualizado,
    estadoAnteriorEtiqueta,
    estadoNuevo,
    estadoNuevoEtiqueta,
    eraPrimerContacto,
  };
}

/**
 * Exporta el padrón actualizado a formato CSV (con BOM UTF-8 para Excel y Google Sheets)
 * Incluye la columna de Estado detallado del usuario y el control de 1er Contacto.
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
export const TOPE_MAXIMO_ANTI_BLOQUEO_WA = 44;

/**
 * Devuelve el rango recomendado de cupo diario según el nivel de calentamiento (Warm-up) de la línea.
 * Siempre garantiza un tope estrictamente menor a 45 mensajes.
 */
export function obtenerRangoWarmup(nivel: NivelWarmupWA): {
  minCupo: number;
  maxCupo: number;
  etiqueta: string;
  descripcion: string;
} {
  switch (nivel) {
    case 'DIA_1_MAX_10':
      return {
        minCupo: 7,
        maxCupo: 10,
        etiqueta: 'Día 1 (Calentamiento inicial: 7 a 10 msjs)',
        descripcion: 'Ideal si el número es nuevo o primera vez que automatizás.',
      };
    case 'DIA_2_MAX_15':
      return {
        minCupo: 11,
        maxCupo: 15,
        etiqueta: 'Día 2 (Calentamiento leve: 11 a 15 msjs)',
        descripcion: 'Segundo día de actividad progresiva sin despertar alertas.',
      };
    case 'DIA_3_MAX_25':
      return {
        minCupo: 18,
        maxCupo: 25,
        etiqueta: 'Día 3 (Calentamiento medio: 18 a 25 msjs)',
        descripcion: 'Tercer día de progresión gradual con pausas de café.',
      };
    case 'DIA_4_MAX_35':
      return {
        minCupo: 26,
        maxCupo: 35,
        etiqueta: 'Día 4 (Calentamiento avanzado: 26 a 35 msjs)',
        descripcion: 'Cuarto día con ritmo orgánico consolidado.',
      };
    case 'DIA_5_MADURO_MENOS_45':
    default:
      return {
        minCupo: 28,
        maxCupo: TOPE_MAXIMO_ANTI_BLOQUEO_WA,
        etiqueta: 'Día 5+ (Cuenta activa — Tope seguro < 45 msjs: 28 a 44)',
        descripcion: 'Número personal con historial activo, siempre por debajo de 45 mensajes.',
      };
  }
}

/**
 * Sortea un cupo aleatorio de mensajes estrictamente menor a 45 (entre minCupo y <= 44).
 */
export function sortearCupoSeguroAntiBloqueo(
  minCupo = 28,
  maxCupo = TOPE_MAXIMO_ANTI_BLOQUEO_WA,
  randomFn: () => number = Math.random,
  cupoActualParaEvitar?: number
): number {
  const maxSeguro = Math.min(TOPE_MAXIMO_ANTI_BLOQUEO_WA, Math.max(1, Math.floor(maxCupo)));
  const minSeguro = Math.min(maxSeguro, Math.max(1, Math.floor(minCupo)));
  let sorteado = Math.floor(randomFn() * (maxSeguro - minSeguro + 1)) + minSeguro;
  if (
    cupoActualParaEvitar !== undefined &&
    maxSeguro > minSeguro &&
    sorteado === cupoActualParaEvitar
  ) {
    sorteado = sorteado < maxSeguro ? sorteado + 1 : sorteado - 1;
  }
  return sorteado;
}

/**
 * Elimina cualquier URL o acortador (http, https, www, bit.ly, wa.me) del primer mensaje
 * para evitar disparar las alertas de phishing/spam de Meta en contactos que no te tienen agendado.
 */
export function limpiarUrlsDePrimerMensaje(texto: string): string {
  return texto
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\b(?:www\.|bit\.ly\/|wa\.me\/|t\.me\/)[^\s)]+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Calcula el tiempo de lectura/escritura humana proporcional a la longitud del mensaje
 * (1 segundo cada 15 a 20 caracteres, promedio ~17.5 caracteres/seg).
 */
export function calcularSegundosEscrituraHumana(
  texto: string,
  randomFn: () => number = Math.random
): number {
  const charsPorSegundo = 15 + randomFn() * 5; // entre 15 y 20 chars por segundo
  return Math.max(4, Math.round((texto || '').length / charsPorSegundo));
}

/**
 * Genera una variante polimórfica de PRIMER CONTACTO (Motor Spintax Rioplatense + Anti-Spam):
 * 1. Varía el saludo ("Hola Juan", "¿Qué tal Juan?", "Buen día Juan", "¡Buenas Juan!").
 * 2. Cambia el orden de las frases y alterna sutilmente el uso de emojis (ningún mensaje idéntico al anterior).
 * 3. Cero enlaces/URLs en el primer mensaje.
 * 4. Incluye pregunta sutil anti-desconfianza si falta el nombre en Google Sheets.
 * 5. Incluye frase amigable de Salida Fácil (Opt-Out: "respondé Baja") para evitar que toquen "Reportar spam".
 */
export function generarVariantePolimorficaPrimerContacto(
  contact: {
    sinNombre?: boolean;
    primerNombre: string;
    barrio: string;
    calleOCruce?: string;
  },
  indiceVariante: number,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  incluirOptOutBaja = false,
  modoRompehieloCorto = true
): { saludoUsado: string; texto: string; varianteIndice: number } {
  const esSinNombre = Boolean(contact.sinNombre) || !contact.primerNombre?.trim();
  const nombre = esSinNombre ? '' : contact.primerNombre.trim();
  const promotor = `${profile.nombrePromotor} ${profile.apellidoPromotor}`.trim();
  const espacio = profile.espacioPolitico || 'Hacemos Popurrí';
  const partido = profile.partidoLegal || 'Regeneración';
  const zona = contact.barrio || 'CABA';
  const v = Math.abs(indiceVariante) % 8;

  const saludosConNombre = [
    `Hola, ${nombre}, buen día. ¿Cómo te va?`,
    `Hola, ${nombre}, ¿cómo estás?`,
    `Hola, ${nombre}, buen día, ¿cómo andás?`,
    `Hola, ${nombre}, ¿qué tal? ¿Cómo va?`,
    `Hola, ${nombre}, buenas, ¿cómo estás?`,
    `Hola, ${nombre}, ¿cómo te va?`,
    `Hola, ${nombre}, ¿cómo andás?`,
    `Hola, ${nombre}, muy buen día, ¿cómo estás?`,
  ];

  const saludosSinNombre = [
    `Hola, muy buen día, ¿cómo te va?`,
    `Hola, ¿cómo estás?`,
    `Hola, buen día, ¿cómo andás?`,
    `Hola, ¿qué tal? ¿Cómo va?`,
    `Hola, buenas, ¿cómo estás?`,
    `Hola, ¿cómo te va?`,
    `Hola, ¿cómo andás?`,
    `Hola, buen día, ¿cómo estás?`,
  ];

  const saludoUsado = esSinNombre ? saludosSinNombre[v] : saludosConNombre[v];

  const clausulasOptOut = [
    `\n\n_(Si preferís no recibir más mensajes, respondé "Baja" con confianza)._`,
    `\n\n_(Cualquier cosa, si preferís que no te contacte por acá, respondé "Baja" y te retiro del listado)._`,
  ];
  const textoOptOut = incluirOptOutBaja ? clausulasOptOut[v % clausulasOptOut.length] : '';

  // MODO ROMPEHIELO CORTO CONVERSACIONAL (< 250 caracteres) CON LA VOZ REAL DE CÉSAR:
  // Sin emojis artificiales ni signos de exclamación forzados; tono directo, cálido y rioplatense.
  if (modoRompehieloCorto) {
    if (esSinNombre) {
      const cortosSinNombre = [
        `Soy ${profile.nombrePromotor}, de ${espacio}. Vi tu contacto en el formulario para apoyarnos con la firma de adhesión en ${zona} (no es afiliación). ¿Me recordarías tu nombre así coordinamos 2 min?`,
        `Soy ${profile.nombrePromotor}, del equipo de ${espacio}. Dejaste tu teléfono para acompañar con tu adhesión en ${zona} pero me quedó en blanco tu nombre en la planilla, ¿cómo te llamás así te agendo?`,
        `Te escribe ${profile.nombrePromotor}, de ${espacio} (${partido}). Estoy armando la recorrida por ${zona} para la firma de adhesión (son 2 min, no afiliación). ¿Me dirías tu nombre y apellido para agendarte?`,
        `Soy ${profile.nombrePromotor} de ${espacio}. Te escribo porque te anotaste en el formulario por ${zona} para sumar tu adhesión en papel (2 min). ¿Me recordarías tu nombre y si tenés DNI en CABA?`,
      ];
      return {
        saludoUsado,
        texto: corregirPelonesDiaSemanaEnTexto(
          limpiarUrlsDePrimerMensaje(
            `${saludoUsado} ${cortosSinNombre[v % cortosSinNombre.length]}${textoOptOut}`
          )
        ),
        varianteIndice: v + 1,
      };
    }

    const cortosConNombre = [
      `Soy ${profile.nombrePromotor}, del equipo de ${espacio}. Te escribo porque completaste el formulario para apoyarnos con tu adhesión en ${zona} (no es afiliación, toma 2 min). ¿Preferís que pase por tu cuadra o vernos en un café?`,
      `Soy ${profile.nombrePromotor}, de ${espacio} (${partido}). Esta semana voy a estar recorriendo ${zona} para juntar las firmas de adhesión en papel (son 2 min con DNI de CABA). ¿Qué día y horario te queda cómodo?`,
      `Te escribe ${profile.nombrePromotor}, del equipo de ${espacio}. Vimos que te anotaste para apoyar la creación del partido en ${zona} (es sólo adhesión, no afiliación). ¿Andás por ${zona} esta semana para coordinar 2 minutos?`,
      `Soy ${profile.nombrePromotor} de ${espacio}. Primero gracias por sumarte en el formulario desde ${zona}; lo que firmamos es sólo una adhesión en papel (2 min, no te afilia). ¿Por qué esquina o café de ${zona} te queda cómodo cruzarnos?`,
      `Soy ${profile.nombrePromotor}, del equipo de ${espacio} (${partido}). Estoy organizando la recorrida por ${zona} para las firmas de adhesión (lleva 2 min). ¿Tenés domicilio de CABA en el DNI y qué franja te viene bien?`,
      `Te habla ${profile.nombrePromotor}, de ${espacio}. Te contacto porque dejaste tus datos para acompañar con tu firma de adhesión por ${zona} (no es afiliación). ¿Preferís que pase 2 min por tu puerta o vernos en algún café?`,
      `Soy ${profile.nombrePromotor}, de ${espacio} en CABA. Estamos relevando por ${zona} las firmas de adhesión de quienes completaron el formulario (son 2 min con DNI físico de CABA). ¿Cómo venís de horarios esta semana?`,
      `Soy ${profile.nombrePromotor}, del equipo de ${espacio}. Te escribo para coordinar los 2 minutos de la firma de adhesión en ${zona} (es sólo un aval inicial, no afiliación). ¿Qué día y franja te resulta más práctico?`,
    ];
    return {
      saludoUsado,
      texto: corregirPelonesDiaSemanaEnTexto(
        limpiarUrlsDePrimerMensaje(`${saludoUsado} ${cortosConNombre[v]}${textoOptOut}`)
      ),
      varianteIndice: v + 1,
    };
  }

  if (esSinNombre) {
    const cuerposSinNombre = [
      `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Te escribo porque dejaste tu número en nuestro formulario para acompañar la conformación del partido en ${zona}.\n\nAntes que nada quería darte total tranquilidad: es únicamente una *adhesión* (no es afiliación) para que el espacio pueda presentarse.\n\nAl pasar los teléfonos a mi planilla me quedó en blanco la casilla de tu nombre: ¿me recordarías tu *nombre y apellido* y si tenés domicilio en CABA en el DNI? Así coordinamos 2 minutos por ${zona} cuando te quede cómodo.`,
      `Te escribe ${promotor}, del equipo de *${espacio}* (${partido}). Vi tu contacto registrado en nuestra planilla de vecinos de ${zona} que se anotaron para apoyar con su firma de adhesión.\n\nTe paso el dato rápido para que te quedes tranquilo/a: la firma es sólo una *adhesión ciudadana* (no implica afiliación) y toma apenas 2 minutos en papel.\n\nComo en la fila de la planilla me figuraba sólo tu celular sin el nombre cargado, ¿me dirías tu *nombre y apellido* para agendarte bien y vemos qué día andás por ${zona}?`,
      `Soy ${promotor} del equipo de *${espacio}* (${partido} en CABA). Te contacto a raíz del formulario que completaste para sumar tu firma de adhesión por la zona de ${zona}.\n\nSe hace en 2 minutos con DNI físico de CABA y es 100% una *adhesión* (no es afiliación política). Al descargar el listado se me borró el campo de tu nombre: ¿me contarías tu *nombre y apellido* así te agendo como corresponde y combinamos por ${zona}?`,
      `Soy ${promotor}, parte de *${espacio}* (${partido}). Me comunico porque te anotaste para dar una mano con la firma de la ficha de adhesión en ${zona}.\n\nRecién revisando la planilla noté que quedó tu teléfono cargado pero sin el nombre: ¿me pasarías tu *nombre y apellido* para actualizarlo? Te recuerdo que es sólo una *adhesión* en papel (no afiliación) y lleva 2 minutos con DNI en CABA.`,
    ];
    const cuerpo = cuerposSinNombre[v % cuerposSinNombre.length];
    return {
      saludoUsado,
      texto: corregirPelonesDiaSemanaEnTexto(
        limpiarUrlsDePrimerMensaje(`${saludoUsado} ${cuerpo}${textoOptOut}`)
      ),
      varianteIndice: v + 1,
    };
  }

  const cuerposConNombre = [
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Te escribo porque te anotaste en nuestro formulario para acompañar con tu firma de adhesión en ${zona}.\n\nEs un trámite de 2 minutos en papel (es sólo *adhesión*, no afiliación, y requiere tener domicilio de CABA en el DNI físico). ¿Por qué esquina o punto de ${zona} te queda cómodo que pasemos esta semana y en qué franja horaria?`,
    `Te habla ${promotor} de *${espacio}* (partido en formación *${partido}*). Te contacto porque dejaste tus datos para sumar tu firma de adhesión por ${zona}.\n\nPara tu tranquilidad, firmar la ficha no es afiliarse, sino únicamente avalar que el espacio pueda presentarse en CABA. Toma 2 minutos con DNI físico. ¿Qué día y horario te viene bien por ${zona} para acercarme?`,
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Estoy organizando el recorrido de esta semana por ${zona} para juntar las firmas de quienes completaron el formulario.\n\nLa firma es presencial en papel, lleva 2 minutos y es sólo una *adhesión* (no afiliación), con DNI de CABA. ¿Andás por ${zona} estos días como para coordinar un ratito?`,
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Primero que nada gracias por anotarte para apoyar la conformación del espacio en ${zona}.\n\nComo la Justicia Electoral pide la firma en ficha de papel (con DNI físico en CABA, siendo sólo *adhesión* y no afiliación), esta semana voy a estar pasando por ${zona}. ¿Qué franja horaria y qué calle o café céntrico te quedan más a mano?`,
    `Te escribo de parte de *${espacio}* (${partido}), mi nombre es ${promotor}. Vi que te sumaste en el formulario desde ${zona} para acompañar con tu adhesión.\n\nSon apenas 2 minutos para completar la ficha en papel (no es afiliación, sólo adhesión con DNI en CABA). ¿Cómo venís de horarios esta semana por ${zona} así me organizo y paso?`,
    `Soy ${promotor} de *${espacio}* (${partido}). Te contacto para coordinar los 2 minutos de la firma de adhesión que nos dejaste en el formulario por la zona de ${zona}.\n\nTe recuerdo que es únicamente una *adhesión* ciudadana (no implica afiliación) y necesitamos corroborar domicilio en CABA con el DNI físico. ¿Qué día te queda más cómodo que nos crucemos un minuto por ${zona}?`,
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Esta semana vamos a estar relevando las firmas de adhesión pendientes en ${zona}.\n\nEs súper rápido (2 minutos en papel, sólo *adhesión* y no afiliación). ¿Contás con domicilio de CABA en tu DNI y qué franja horaria te resulta más práctica por ${zona}?`,
    `Te saluda ${promotor}, de *${espacio}* (${partido}). Te escribo a raíz de tu registro para acompañar con tu firma de adhesión en ${zona}.\n\nNo te quita más de 2 minutos (es *adhesión*, no afiliación, con DNI físico de CABA). ¿Preferís que pasemos por alguna esquina cerca de tu casa en ${zona} o encontrarnos en un café de la zona?`,
  ];

  const cuerpo = cuerposConNombre[v];
  return {
    saludoUsado,
    texto: corregirPelonesDiaSemanaEnTexto(
      limpiarUrlsDePrimerMensaje(`${saludoUsado} ${cuerpo}${textoOptOut}`)
    ),
    varianteIndice: v + 1,
  };
}

/**
 * Determina si un contacto procesado es elegible para el envío automatizado de PRIMER CONTACTO.
 * Regla estricta: SÓLO personas que aún NO recibieron el primer mensaje (y tienen un teléfono válido).
 */
export function esContactoElegiblePrimerContactoAuto(c: Contact): boolean {
  const telNorm = c.telWA || normalizarTelefonoWA(c.telRaw);
  if (!telNorm || telNorm.length < 8) return false;
  if (c.adhirio === 'Sí' || c.adhirio === 'No') return false;
  if (c.situacion === 'DESCARTADO_NO_CABA') return false;
  if (c.primerContactoEnviado === true) return false;
  return (
    c.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    c.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
    c.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' ||
    c.rsp === 'Nuevo'
  );
}

/**
 * Limpia notas de error falsas generadas cuando WhatsApp Web cerró la sesión vinculada
 * (ej. en contactos #168, #169, #170 tras el corte de sesión) para que queden limpios en "1. Sin contactar".
 */
export function limpiarErroresFalsosRestriccionWA(
  rows: RawContactRow[]
): { actualizados: RawContactRow[]; limpiadosCount: number } {
  let limpiadosCount = 0;
  const regexErrorFalso =
    /\[(?:Intento auto fallido|Reintentar envío WA)[^\]]*\]/gi;
  const actualizados = rows.map((r) => {
    const com = r.comentario || '';
    const etq = r.estadoFlujoEtiqueta || '';
    if (
      /\[(?:Intento auto fallido|Reintentar envío WA)[^\]]*\]/i.test(com) ||
      /Reintentar envío/i.test(etq)
    ) {
      limpiadosCount++;
      const limpio = com.replace(regexErrorFalso, '').trim();
      const sinNom = esCeldaSinNombre(r.nombre);
      const estado: EstadoFlujo = sinNom ? 'FALTA_NOMBRE_Y_APELLIDO' : 'SIN_CONTACTAR_1ER_MSJ';
      return {
        ...r,
        rsp: 'Nuevo' as const,
        primerContactoEnviado: false,
        comentario: limpio,
        estadoFlujo: estado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estado),
      };
    }
    return r;
  });
  return { actualizados, limpiadosCount };
}

function hhmmASegundos(hhmm: string, fallbackHora = 10, fallbackMin = 30): number {
  const partes = (hhmm || '').split(':').map((n) => parseInt(n, 10));
  const h = Number.isFinite(partes[0]) ? partes[0] : fallbackHora;
  const m = Number.isFinite(partes[1]) ? partes[1] : fallbackMin;
  return h * 3600 + m * 60;
}

function sumarSegundosAHoraHHMM(horaInicioHHMM: string, segundosTotales: number): string {
  const baseSeg = hhmmASegundos(horaInicioHHMM, 10, 30);
  const segDesdeMedianoche = (baseSeg + Math.max(0, Math.round(segundosTotales))) % 86400;
  const hh = Math.floor(segDesdeMedianoche / 3600);
  const mm = Math.floor((segDesdeMedianoche % 3600) / 60);
  const ss = segDesdeMedianoche % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Construye una campaña programada para el envío automatizado de PRIMEROS MENSAJES con las 8 capas Stealth v2.0:
 * 1. Navegación interna SPA sin page.goto() (evita recargar WhatsApp Web y desconectar el WebSocket en cada chat).
 * 2. Modo Rompehielo Corto (< 220 caracteres, sin frases de bot como "respondé Baja" que disparan el filtro ML de Meta).
 * 3. Filtro de seguridad para números internacionales (+34 España, etc.) en dispositivos vinculados.
 * 4. Intervalos humanos no lineales (65s–150s) + "Pausa de Café" de 12–22 min cada 8–12 mensajes.
 * 5. Límite diario estricto (< 45 mensajes) y niveles de Calentamiento (Warm-up Día 1 a Día 5+).
 * 6. Tiempo de escritura simulada proporcional + tipeo con cadencia variable.
 * 7. Ventana horaria diurna estricta (>= 09:30 a 19:00, prohibido enviar de madrugada como a las 05:30 AM).
 * 8. Circuit Breaker inmediato ante cierre de sesión o restricción + control SQLite idempotente.
 */
export function generarColaEnvioAutomaticoPrimerContacto(
  contacts: Contact[],
  configPartial?: Partial<AutoFirstMessageConfig> & { semillaSorteo?: number },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  randomFn: () => number = Math.random
): AutoFirstMessageCampaign {
  const nivelWarmup: NivelWarmupWA = configPartial?.nivelWarmup || 'DIA_1_MAX_10';
  const rangoWarmup = obtenerRangoWarmup(nivelWarmup);
  const semilla = configPartial?.semillaSorteo ?? 0;

  const minCupo = Math.min(
    TOPE_MAXIMO_ANTI_BLOQUEO_WA,
    Math.max(1, configPartial?.minCupo ?? rangoWarmup.minCupo)
  );
  const maxCupo = Math.min(
    TOPE_MAXIMO_ANTI_BLOQUEO_WA,
    Math.max(minCupo, configPartial?.maxCupo ?? rangoWarmup.maxCupo)
  );
  const cupoSorteado = Math.min(
    TOPE_MAXIMO_ANTI_BLOQUEO_WA,
    Math.max(
      1,
      configPartial?.cupoSorteado
        ? Math.min(TOPE_MAXIMO_ANTI_BLOQUEO_WA, configPartial.cupoSorteado)
        : sortearCupoSeguroAntiBloqueo(minCupo, maxCupo, randomFn)
    )
  );

  const minIntervaloSeg = Math.max(45, configPartial?.minIntervaloSeg ?? 65);
  const maxIntervaloSeg = Math.max(minIntervaloSeg + 15, configPartial?.maxIntervaloSeg ?? 145);
  const lotePausaCafeCada = Math.min(15, Math.max(6, configPartial?.lotePausaCafeCada ?? 8));
  const minPausaCafeMinutos = Math.max(8, configPartial?.minPausaCafeMinutos ?? 12);
  const maxPausaCafeMinutos = Math.max(
    minPausaCafeMinutos,
    configPartial?.maxPausaCafeMinutos ?? 22
  );
  const pausaExtraCada10Seg =
    configPartial?.pausaExtraCada10Seg ?? Math.round(((minPausaCafeMinutos + maxPausaCafeMinutos) / 2) * 60);

  const horaInicio = configPartial?.horaInicio || '10:30';
  const horaVentanaInicio = configPartial?.horaVentanaInicio || '09:30';
  const horaVentanaFin = configPartial?.horaVentanaFin || '19:00';
  // Por defecto desactivamos el pie "respondé Baja" y activamos el Rompehielo Corto (<220 chars)
  // porque en dispositivos vinculados de WhatsApp la frase "respondé Baja" + >500 caracteres activa el filtro anti-bot.
  const incluirOptOutBaja = configPartial?.incluirOptOutBaja ?? false;
  const modoRompehieloCorto = configPartial?.modoRompehieloCorto ?? true;
  const soloNumerosArgentina = configPartial?.soloNumerosArgentina ?? true;
  const usarVariabilidadIAGemini = configPartial?.usarVariabilidadIAGemini ?? true;
  const barrioFiltro = configPartial?.barrioFiltro || 'Todos';
  const modoCola: ModoColaAutomatizacionWA = configPartial?.modoCola || 'PRIMER_CONTACTO';

  const elegiblesBase = contacts.filter((c) => {
    const telNorm = c.telWA || normalizarTelefonoWA(c.telRaw);
    if (!telNorm || telNorm.length < 8) return false;
    if (barrioFiltro !== 'Todos' && c.barrio !== barrioFiltro) return false;
    if (soloNumerosArgentina && !telNorm.startsWith('54')) return false;

    if (modoCola === 'RECORDATORIO_MANIANA_HOY') {
      if (c.adhirio === 'Sí' || c.adhirio === 'No') return false;
      return (
        c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
        c.situacion === 'VISITA_AGENDADA' ||
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
      );
    }

    if (modoCola === 'SEGUIMIENTO_24H_48H_BAJA') {
      if (c.adhirio === 'Sí' || c.adhirio === 'No') return false;
      if (c.situacion === 'DESCARTADO_NO_CABA' || c.estadoFlujo === 'DESCARTADO_O_BAJA') return false;
      return (
        c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ||
        c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
        c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
        Boolean(c.seguimiento48h?.aplica)
      );
    }

    if (modoCola === 'AGRADECIMIENTO_POST_FIRMA') {
      if (c.adhirio !== 'Sí') return false;
      return !/agradec|gracias enviada/i.test(c.comentario || '');
    }

    return esContactoElegiblePrimerContactoAuto(c);
  });

  // Si el usuario presionó "Sortear Nuevo Cupo Aleatorio" (`semilla > 0`), rotar la selección dentro de los grupos prioritarios
  let elegibles = elegiblesBase;
  if (semilla > 0 && elegiblesBase.length > 1) {
    const conNombre = elegiblesBase.filter((c) => !c.sinNombre);
    const sinNombre = elegiblesBase.filter((c) => c.sinNombre);
    const rotarGrupo = (arr: Contact[], offset: number): Contact[] => {
      if (arr.length <= 1) return arr;
      const shift = offset % arr.length;
      return [...arr.slice(shift), ...arr.slice(0, shift)];
    };
    elegibles = [
      ...rotarGrupo(conNombre, semilla),
      ...rotarGrupo(sinNombre, Math.max(1, Math.floor(semilla / 2))),
    ];
  }

  const seleccionados = elegibles.slice(0, cupoSorteado);
  let segundosAcumulados = 0;
  const segInicioBase = hhmmASegundos(horaInicio, 10, 30);
  const segVentanaFin = hhmmASegundos(horaVentanaFin, 19, 0);

  const items: AutoFirstMessageQueueItem[] = seleccionados.map((c, idx) => {
    let intervaloSeg = 0;
    let esPausaCafeAntes = false;

    if (idx > 0) {
      const u1 = randomFn();
      const u2 = randomFn();
      const factorNoLineal = (u1 + u2) / 2;
      const baseRandom =
        Math.floor(factorNoLineal * (maxIntervaloSeg - minIntervaloSeg + 1)) + minIntervaloSeg;

      if (idx % lotePausaCafeCada === 0) {
        esPausaCafeAntes = true;
        const pausaCafeSeg =
          Math.floor(
            randomFn() * ((maxPausaCafeMinutos - minPausaCafeMinutos) * 60 + 1)
          ) +
          minPausaCafeMinutos * 60;
        intervaloSeg = baseRandom + pausaCafeSeg;
      } else {
        intervaloSeg = baseRandom;
      }
      segundosAcumulados += intervaloSeg;
    }

    let textoMensajeCola = '';
    let saludoUsadoCola = '';
    let varianteIndiceCola = (idx % 8) + 1;

    if (modoCola === 'RECORDATORIO_MANIANA_HOY') {
      const gen = generarMensajeContextual(c, profile, 'recordatorio_maniana_encuentro');
      textoMensajeCola = gen.texto;
      saludoUsadoCola = 'Recordatorio Mañana (Conversación activa)';
    } else if (modoCola === 'SEGUIMIENTO_24H_48H_BAJA') {
      const plantillaSeg: TipoPlantillaWA =
        (c.intentos || 0) >= 2 && c.rsp === 'No'
          ? 'baja_amable_sin_respuesta'
          : c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP'
          ? 'seguimiento_sin_respuesta'
          : c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' && /\[Propuesta/i.test(c.comentario || '')
          ? 'seguimiento_24h_falta_confirmar'
          : 'seguimiento_24h_falta_dato';
      const gen = generarMensajeContextual(c, profile, plantillaSeg);
      textoMensajeCola = gen.texto;
      saludoUsadoCola = gen.asunto;
    } else if (modoCola === 'AGRADECIMIENTO_POST_FIRMA') {
      const gen = generarMensajeContextual(c, profile, 'agradecimiento_post_firma');
      textoMensajeCola = gen.texto;
      saludoUsadoCola = 'Agradecimiento Post-Adhesión';
    } else {
      const polimorfico = generarVariantePolimorficaPrimerContacto(
        c,
        idx + semilla,
        profile,
        incluirOptOutBaja,
        modoRompehieloCorto
      );
      textoMensajeCola = polimorfico.texto;
      saludoUsadoCola = polimorfico.saludoUsado;
      varianteIndiceCola = polimorfico.varianteIndice;
    }

    const segundosEscritura = calcularSegundosEscrituraHumana(textoMensajeCola, randomFn);
    segundosAcumulados += idx > 0 ? segundosEscritura : 0;

    const segAbsoluto = segInicioBase + segundosAcumulados;
    const fueraDeVentana = segAbsoluto > segVentanaFin;

    return {
      orden: idx + 1,
      contactId: c.id,
      nombre: c.nombreCompletoCorregido || c.nombre || `Sin nombre (${c.telRaw})`,
      primerNombre: c.primerNombre || '',
      sinNombre: Boolean(c.sinNombre),
      barrio: c.barrio,
      telRaw: c.telRaw,
      telefonoNorm: c.telWA || normalizarTelefonoWA(c.telRaw),
      mensajePrimerContacto: textoMensajeCola,
      saludoUsado: saludoUsadoCola,
      varianteIndice: varianteIndiceCola,
      intervaloSegundos: intervaloSeg,
      segundosEscrituraSimulada: segundosEscritura,
      esPausaCafeAntes,
      horaProgramada: sumarSegundosAHoraHHMM(horaInicio, segundosAcumulados),
      fueraDeVentanaHoraria: fueraDeVentana,
      resultado: 'PENDIENTE',
      detalleResultado: fueraDeVentana
        ? `Supera las ${horaVentanaFin} (se pausará y reanudará al día siguiente a las ${horaVentanaInicio})`
        : esPausaCafeAntes
        ? `Incluye Pausa de Café (${Math.round(intervaloSeg / 60)} min) antes de enviar`
        : 'En cola esperando hora programada (Stealth SPA sin recarga)',
      sincronizadoSheets: false,
    };
  });

  return {
    campaignId: `auto-1er-msj-${Date.now()}`,
    creadaEnISO: new Date().toISOString(),
    config: {
      horaInicio,
      horaVentanaInicio,
      horaVentanaFin,
      nivelWarmup,
      minCupo,
      maxCupo,
      cupoSorteado,
      minIntervaloSeg,
      maxIntervaloSeg,
      lotePausaCafeCada,
      minPausaCafeMinutos,
      maxPausaCafeMinutos,
      pausaExtraCada10Seg,
      incluirOptOutBaja,
      modoRompehieloCorto,
      soloNumerosArgentina,
      usarVariabilidadIAGemini,
      barrioFiltro,
      modoCola,
    },
    totalElegiblesEnBase: elegibles.length,
    items,
    estadoCampana: 'LISTA_PARA_EJECUTAR',
  };
}

/**
 * Actualiza automáticamente el contacto en la App y prepara su fila para Google Sheets
 * según el resultado real del envío automatizado (Enviado con éxito, Número inexistente en WhatsApp, o Error de envío).
 */
export function aplicarResultadoEnvioAutoAContacto(
  raw: RawContactRow,
  resultado: ResultadoEnvioAuto,
  detalle?: string,
  fechaHoraISO?: string
): RawContactRow {
  const ahora = fechaHoraISO ? new Date(fechaHoraISO) : new Date();
  const hoyBA = obtenerPartesFechaHoraBA(ahora.getTime());
  const selloFecha = `${hoyBA.ddmm} ${hoyBA.hhmm}`;
  const comentarioSinFallosPrevios = (raw.comentario || '')
    .replace(/\[Intento auto fallido[^\]]*\]/gi, '')
    .trim();

  // Si un envío reportó "Tiempo de espera agotado al abrir el chat" tras haber tipeado, tratarlo como ENVIADO_OK
  const resultadoEfectivo: ResultadoEnvioAuto =
    resultado === 'ERROR_ENVIO' &&
    /Tiempo de espera agotado al abrir el chat/i.test(detalle || '')
      ? 'ENVIADO_OK'
      : resultado;

  if (resultadoEfectivo === 'ENVIADO_OK') {
    const notaAuto = `[1er msj auto enviado ${selloFecha}]`;
    const nuevoComentario = comentarioSinFallosPrevios.includes('[1er msj')
      ? comentarioSinFallosPrevios
      : comentarioSinFallosPrevios
      ? `${comentarioSinFallosPrevios} ${notaAuto}`
      : notaAuto;

    return sincronizarBarrioConDireccionComentario({
      ...raw,
      rsp: raw.rsp === 'Sí' && tieneNuevaInformacionEnColumnaG(comentarioSinFallosPrevios) ? 'Sí' : 'No',
      adhirio: raw.adhirio === 'Sí' ? 'Sí' : 'Pendiente',
      primerContactoEnviado: true,
      fechaPrimerContacto: ahora.toISOString().slice(0, 10),
      ultimoContacto: ahora.toISOString().slice(0, 10),
      intentos: Math.max(1, (raw.intentos || 0) + 1),
      estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP'),
      comentario: nuevoComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  }

  if (resultadoEfectivo === 'NUMERO_INEXISTENTE') {
    const notaInexistente = `No existe en WhatsApp (Detectado auto ${selloFecha})`;
    const nuevoComentario = comentarioSinFallosPrevios.toLowerCase().includes('no existe en whatsapp')
      ? comentarioSinFallosPrevios
      : comentarioSinFallosPrevios
      ? `${comentarioSinFallosPrevios} — ${notaInexistente}`
      : notaInexistente;

    return sincronizarBarrioConDireccionComentario({
      ...raw,
      rsp: 'No',
      adhirio: 'No',
      primerContactoEnviado: true,
      fechaPrimerContacto: ahora.toISOString().slice(0, 10),
      estadoFlujo: 'DESCARTADO_O_BAJA',
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      comentario: nuevoComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  }

  if (resultadoEfectivo === 'ERROR_ENVIO' || resultadoEfectivo === 'SESION_RESTRINGIDA_ABORTAR') {
    const sinNom = esCeldaSinNombre(raw.nombre);
    const estadoInicial: EstadoFlujo = sinNom
      ? 'FALTA_NOMBRE_Y_APELLIDO'
      : 'SIN_CONTACTAR_1ER_MSJ';

    return sincronizarBarrioConDireccionComentario({
      ...raw,
      rsp: 'Nuevo',
      adhirio: 'Pendiente',
      primerContactoEnviado: false,
      estadoFlujo: estadoInicial,
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
      comentario: comentarioSinFallosPrevios,
    });
  }

  return raw;
}

/**
 * Exporta el reporte de auditoría de una campaña de envío automático en CSV compatible con Excel.
 */
export function exportarReporteAuditoriaAutoWA(campaign: AutoFirstMessageCampaign): string {
  const header = [
    'Orden',
    '# ID',
    'Nombre',
    'Barrio',
    'Teléfono',
    'Variante Polimórfica',
    'Hora Programada',
    'Intervalo Aleatorio (seg)',
    'Tiempo Escritura Simulada (seg)',
    'Pausa de Café Previa',
    'Resultado del Envío',
    'Detalle / Diagnóstico WhatsApp',
    'Estado Actualizado en Sheets',
    'Fecha/Hora Real',
  ];
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = campaign.items.map((item) => {
    const etiquetaEstado =
      item.resultado === 'ENVIADO_OK'
        ? '2. 1er contacto enviado (Sin respuesta)'
        : item.resultado === 'NUMERO_INEXISTENTE'
        ? '10. Descartado / Baja / N° inexistente'
        : item.resultado === 'ERROR_ENVIO'
        ? '1. Sin contactar (Reintentar envío)'
        : 'En cola';
    return [
      item.orden,
      item.contactId,
      item.nombre,
      item.barrio,
      item.telRaw,
      `Variante #${item.varianteIndice || 1} (${item.saludoUsado || 'Saludo variado'})`,
      item.horaProgramada,
      item.intervaloSegundos,
      item.segundosEscrituraSimulada || 10,
      item.esPausaCafeAntes ? 'Sí (10-20 min)' : 'No',
      item.resultado,
      item.detalleResultado,
      etiquetaEstado,
      item.fechaHoraResultadoISO || '',
    ]
      .map(esc)
      .join(',');
  });
  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}

/**
 * Genera el script completo en Python 3 (`automatizador_wa_popurri.py` STEALTH v2.0) que corrige de raíz
 * las causas por las que WhatsApp restringió el dispositivo vinculado ("Your account on linked devices is restricted right now"):
 * 1. NAVEGACIÓN SPA SIN RECARGA (CERO page.goto por contacto):
 *    En lugar de llamar a `page.goto("https://web.whatsapp.com/send?phone=...")` (que recargaba toda la página,
 *    cortaba el WebSocket y disparaba la alerta de scraping de URLs de Meta), inyecta un enlace interno `<a href="https://wa.me/...">`
 *    dentro del DOM ya abierto para que el router interno de WhatsApp abra el chat en 0.2s SIN recargar la pestaña.
 * 2. STEALTH CHROME REAL (Oculta `navigator.webdriver` y `--enable-automation`):
 *    Usa el navegador Google Chrome real instalado en Windows (`channel="chrome"`) con `--disable-blink-features=AutomationControlled`
 *    y borra la huella `navigator.webdriver`.
 * 3. CIRCUIT BREAKER INMEDIATO (Freno de Emergencia):
 *    Si detecta desconexión, redirección a QR o cartel de restricción de dispositivo vinculado, ABORTA EN EL ACTO
 *    sin intentar los contactos siguientes (#168, #169, #170...) ni ensuciar Google Sheets.
 * 4. BLOQUEO DE MADRUGADA (< 09:00 AM), GUARDIA DE NÚMEROS INTERNACIONALES (+34) Y ENFRIAMIENTO POST-QR:
 *    Impide enviar en horarios de madrugada (como las 05:32 AM) y exige que la sesión vinculada tenga reposo.
 */
export function generarScriptPythonAutomatizador(
  campaign: AutoFirstMessageCampaign,
  appBaseUrl: string,
  sheetUrlOrId: string,
  appsScriptUrl: string
): string {
  const queueJsonString = JSON.stringify(campaign.items, null, 2);
  const safeAppUrl = (appBaseUrl || 'http://localhost:3000').replace(/\/+$/, '');

  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
AUTOMATIZADOR STEALTH v2.0 ANTI-RESTRICCIÓN WHATSAPP — RUTAS POPURRÍ (CABA)
================================================================================
Novedades críticas de seguridad Stealth v2.0 (Corrige restricción de dispositivos vinculados):
1. CERO RECARGA DE PÁGINA (Sin page.goto en el bucle):
   Abre cada conversación mediante el router interno SPA de WhatsApp Web inyectando un
   clic en <a href="https://wa.me/..."> dentro del DOM activo. Nunca recarga la web ni
   interrumpe el WebSocket de sesión.
2. NAVEGADOR CHROME REAL + STEALTH (Sin huella de bot):
   Inicia Google Chrome / Edge nativo con '--disable-blink-features=AutomationControlled',
   elimina '--enable-automation' y anula 'navigator.webdriver'.
3. CIRCUIT BREAKER (Freno de Emergencia Instantáneo):
   Si WhatsApp Web cierra la sesión, pide QR o muestra aviso de restricción temporal,
   detiene el script en el acto SIN intentar los contactos siguientes ni marcar falsos errores.
4. MENSAJE ROMPEHIELO CORTO (< 220 caracteres) + FILTRO INTERNACIONAL (+54):
   Evita textos largos con pinta de campaña masiva o envíos de madrugada (< 09:00 hs).

INSTALACIÓN (una sola vez):
  pip install playwright requests
  playwright install chromium

EJECUCIÓN:
  python automatizador_wa_popurri.py
  python automatizador_wa_popurri.py --empezar-ya
================================================================================
"""

import argparse
import csv
import datetime
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

try:
    import requests
except ImportError:
    print("Falta la librería 'requests'. Instalala con: pip install requests playwright")
    sys.exit(1)

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("Falta la librería 'playwright'. Instalala con:")
    print("  pip install playwright requests")
    print("  playwright install chromium")
    sys.exit(1)

# ------------------------------------------------------------------------------
# CONFIGURACIÓN PRECARGADA DESDE LA APP RUTAS POPURRÍ (STEALTH v2.0)
# ------------------------------------------------------------------------------
APP_BASE_URL = "${safeAppUrl}"
GOOGLE_SHEET_ID_OR_URL = "${sheetUrlOrId || ''}"
APPS_SCRIPT_WEBHOOK_URL = "${appsScriptUrl || ''}"

HORA_INICIO_PROGRAMADA = "${campaign.config.horaInicio}"
VENTANA_HORARIA_INICIO = "${campaign.config.horaVentanaInicio}"
VENTANA_HORARIA_FIN = "${campaign.config.horaVentanaFin}"

MIN_CUPO_MENSAJES = ${campaign.config.minCupo}
MAX_CUPO_MENSAJES = min(44, ${campaign.config.maxCupo})  # NUNCA >= 45
CUPO_SORTEADO_ESTA_TANDA = min(44, ${campaign.config.cupoSorteado})

MIN_INTERVALO_SEG = max(55, ${campaign.config.minIntervaloSeg})
MAX_INTERVALO_SEG = max(MIN_INTERVALO_SEG + 25, ${campaign.config.maxIntervaloSeg})
LOTE_PAUSA_CAFE_CADA = ${campaign.config.lotePausaCafeCada}
MIN_PAUSA_CAFE_MIN = ${campaign.config.minPausaCafeMinutos}
MAX_PAUSA_CAFE_MIN = ${campaign.config.maxPausaCafeMinutos}
USAR_REESCRITURA_IA_GEMINI = ${campaign.config.usarVariabilidadIAGemini ? 'True' : 'False'}
INCLUIR_OPT_OUT_BAJA = ${campaign.config.incluirOptOutBaja ? 'True' : 'False'}
SOLO_NUMEROS_ARGENTINA_54 = ${campaign.config.soloNumerosArgentina !== false ? 'True' : 'False'}

ARCHIVO_SQLITE_CONTROL = "control_enviados_popurri.db"
ARCHIVO_REPORTE_JSON = "reporte_envios_popurri.json"
ARCHIVO_REPORTE_CSV = "reporte_envios_popurri.csv"
DIRECTORIO_SESION_WA = str(Path(__file__).resolve().parent / "sesion_whatsapp_popurri")
ARCHIVO_SELLO_VINCULACION = str(Path(DIRECTORIO_SESION_WA) / "vinculacion_timestamp.txt")

# Cola de contactos pendientes de 1er mensaje generada por la App (< 45 contactos)
COLA_PRIMER_CONTACTO = json.loads(r'''${queueJsonString}''')


# ------------------------------------------------------------------------------
# CAPA 7: CONTROL PERSISTENTE EN SQLITE + JSON PARA NO REENVIAR JAMÁS
# ------------------------------------------------------------------------------
def inicializar_db_control() -> sqlite3.Connection:
    conn = sqlite3.connect(ARCHIVO_SQLITE_CONTROL)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS envios_primer_contacto (
            telefono_norm TEXT PRIMARY KEY,
            contact_id TEXT,
            nombre TEXT,
            barrio TEXT,
            enviado TEXT,
            resultado TEXT,
            detalle TEXT,
            mensaje_enviado TEXT,
            fecha_hora_iso TEXT
        )
        """
    )
    conn.commit()
    return conn


def ya_fue_procesado_en_db(conn: sqlite3.Connection, contact_id: str, telefono_norm: str) -> tuple:
    cur = conn.cursor()
    cur.execute(
        "SELECT resultado, fecha_hora_iso FROM envios_primer_contacto WHERE telefono_norm = ? OR contact_id = ?",
        (str(telefono_norm), str(contact_id)),
    )
    fila = cur.fetchone()
    if fila and fila[0] in ("ENVIADO_OK", "NUMERO_INEXISTENTE"):
        return (True, fila[0], fila[1])
    return (False, None, None)


def registrar_en_db_control(
    conn: sqlite3.Connection,
    item: dict,
    resultado: str,
    detalle: str,
    mensaje_final: str,
):
    ahora_iso = datetime.datetime.now().isoformat()
    enviado_si_no = "Sí" if resultado == "ENVIADO_OK" else "No"
    conn.execute(
        """
        INSERT OR REPLACE INTO envios_primer_contacto
        (telefono_norm, contact_id, nombre, barrio, enviado, resultado, detalle, mensaje_enviado, fecha_hora_iso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(item.get("telefonoNorm", "")),
            str(item.get("contactId", "")),
            str(item.get("nombre", "")),
            str(item.get("barrio", "")),
            enviado_si_no,
            resultado,
            detalle,
            mensaje_final,
            ahora_iso,
        ),
    )
    conn.commit()


# ------------------------------------------------------------------------------
# CAPA 1: VARIABILIDAD POLIMÓRFICA Y SANITIZACIÓN ANTI-FILTRO META
# ------------------------------------------------------------------------------
def sanitizar_sin_urls(texto: str) -> str:
    """Elimina cualquier enlace http/https/bit.ly del primer mensaje."""
    sin_links = re.sub(r"https?://\\S+", "", texto, flags=re.IGNORECASE)
    sin_links = re.sub(r"\\b(?:www\\.|bit\\.ly/|wa\\.me/)\\S+", "", sin_links, flags=re.IGNORECASE)
    return re.sub(r"[ \\t]{2,}", " ", sin_links).strip()


def obtener_mensaje_unico_ia_o_spintax(item: dict, indice_iteracion: int) -> str:
    mensaje_base = item.get("mensajePrimerContacto", "")
    if not USAR_REESCRITURA_IA_GEMINI:
        return sanitizar_sin_urls(mensaje_base)

    try:
        resp = requests.post(
            f"{APP_BASE_URL}/api/gemini/variante-primer-contacto",
            json={
                "nombre": item.get("primerNombre") or item.get("nombre") or "",
                "sinNombre": bool(item.get("sinNombre")),
                "barrio": item.get("barrio") or "CABA",
                "mensajeBase": mensaje_base,
                "iteracion": indice_iteracion,
                "incluirOptOutBaja": INCLUIR_OPT_OUT_BAJA,
            },
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            if data.get("ok") and data.get("mensaje"):
                return sanitizar_sin_urls(data["mensaje"])
    except Exception:
        pass

    return sanitizar_sin_urls(mensaje_base)


# ------------------------------------------------------------------------------
# CAPA 5: VALIDACIÓN DE VENTANA HORARIA DIURNA ESTRICTA (PROHIBIDO MADRUGADA)
# ------------------------------------------------------------------------------
def parsear_hora_hhmm(hhmm_str: str) -> datetime.time:
    partes = [int(p) for p in hhmm_str.strip().split(":")]
    return datetime.time(hour=partes[0], minute=partes[1], second=0)


def esta_dentro_de_ventana_comercial() -> tuple:
    ahora = datetime.datetime.now().time()
    # Protección anti-ban: nunca permitir menos de las 09:00 AM (enviar a las 05:32 AM dispara bloqueo inmediato)
    t_inicio_cfg = parsear_hora_hhmm(VENTANA_HORARIA_INICIO)
    t_min_seguro = datetime.time(hour=9, minute=0, second=0)
    t_inicio = max(t_inicio_cfg, t_min_seguro)
    t_fin = parsear_hora_hhmm(VENTANA_HORARIA_FIN)
    if ahora < t_inicio:
        return (False, "ANTES_DE_APERTURA", t_inicio.strftime("%H:%M"))
    if ahora >= t_fin:
        return (False, "DESPUES_DE_CIERRE", t_fin.strftime("%H:%M"))
    return (True, "OK", "")


def esperar_hasta_hora_inicio(hora_objetivo_str: str):
    partes = [int(p) for p in hora_objetivo_str.strip().split(":")]
    # Si programaron antes de las 09:00 AM, proteger la cuenta pasando a las 09:30 AM
    if partes[0] < 9:
        print(f"\\n⚠️ [PROTECCIÓN ANTI-BLOQUEO] La hora {hora_objetivo_str} es de madrugada.")
        print("   Enviar primeros mensajes a desconocidos antes de las 09:00 AM activa la restricción de dispositivos vinculados.")
        print("   Se ajusta automáticamente el inicio a las 09:30 hs.")
        partes = [9, 30]

    ahora = datetime.datetime.now()
    objetivo = ahora.replace(hour=partes[0], minute=partes[1], second=0, microsecond=0)

    if objetivo <= ahora:
        return

    segundos_espera = int((objetivo - ahora).total_seconds())
    print(f"[RELOJ] Esperando hasta las {partes[0]:02d}:{partes[1]:02d} ({segundos_espera // 60} min {segundos_espera % 60} seg)...")
    while datetime.datetime.now() < objetivo:
        restante = int((objetivo - datetime.datetime.now()).total_seconds())
        if restante <= 0:
            break
        sys.stdout.write(f"\\r  -> Iniciando en {restante // 60:02d}m {restante % 60:02d}s... ")
        sys.stdout.flush()
        time.sleep(min(5, restante))
    print("\\n[OK] ¡Hora de inicio alcanzada!")


def reportar_resultado_en_vivo(item: dict, resultado: str, detalle: str):
    ahora_iso = datetime.datetime.now().isoformat()
    item["resultado"] = resultado
    item["detalleResultado"] = detalle
    item["fechaHoraResultadoISO"] = ahora_iso

    payload_item = {
        "campaignId": "${campaign.campaignId}",
        "contactId": item["contactId"],
        "telefonoNorm": item["telefonoNorm"],
        "nombre": item["nombre"],
        "barrio": item["barrio"],
        "resultado": resultado,
        "detalleResultado": detalle,
        "fechaHoraResultadoISO": ahora_iso,
        "appsScriptUrl": APPS_SCRIPT_WEBHOOK_URL,
    }

    try:
        resp = requests.post(
            f"{APP_BASE_URL}/api/auto-wa/report-item",
            json=payload_item,
            timeout=10,
        )
        if resp.ok:
            item["sincronizadoSheets"] = True
            print(f"  [SYNC APP] Estado actualizado en la App para #{item['contactId']} ({resultado}).")
    except Exception as exc:
        print(f"  [AVISO] Guardado en SQLite/JSON local ({exc}).")

    if APPS_SCRIPT_WEBHOOK_URL and APPS_SCRIPT_WEBHOOK_URL.startswith("https://script.google.com/"):
        estado_etiqueta = (
            "2. 1er contacto enviado (Sin respuesta)"
            if resultado == "ENVIADO_OK"
            else "10. Descartado / Baja / N° inexistente"
            if resultado == "NUMERO_INEXISTENTE"
            else "1. Sin contactar (Reintentar envío)"
        )
        try:
            requests.post(
                APPS_SCRIPT_WEBHOOK_URL,
                json={
                    "action": "updateAutoFirstContact",
                    "payload": {
                        "id": item["contactId"],
                        "telefonoNorm": item["telefonoNorm"],
                        "resultado": resultado,
                        "estado": estado_etiqueta,
                        "detalle": detalle,
                        "fechaHoraISO": ahora_iso,
                    },
                },
                timeout=12,
            )
            print(f"  [SYNC SHEETS] Fila #{item['contactId']} actualizada en Google Sheets -> {estado_etiqueta}")
        except Exception as exc:
            print(f"  [AVISO SHEETS] No se pudo notificar al Apps Script directamente: {exc}")


def guardar_reportes_locales(items: list):
    with open(ARCHIVO_REPORTE_JSON, "w", encoding="utf-8") as f_json:
        json.dump(
            {
                "campaignId": "${campaign.campaignId}",
                "actualizadoEnISO": datetime.datetime.now().isoformat(),
                "items": items,
            },
            f_json,
            ensure_ascii=False,
            indent=2,
        )

    with open(ARCHIVO_REPORTE_CSV, "w", encoding="utf-8-sig", newline="") as f_csv:
        writer = csv.writer(f_csv)
        writer.writerow([
            "Orden", "ID", "Nombre", "Barrio", "Telefono", "Enviado",
            "Hora_Programada", "Resultado", "Detalle", "Fecha_Hora_Real"
        ])
        for it in items:
            enviado_str = "Sí" if it.get("resultado") == "ENVIADO_OK" else "No"
            writer.writerow([
                it.get("orden"),
                it.get("contactId"),
                it.get("nombre"),
                it.get("barrio"),
                it.get("telRaw"),
                enviado_str,
                it.get("horaProgramada"),
                it.get("resultado"),
                it.get("detalleResultado"),
                it.get("fechaHoraResultadoISO", ""),
            ])


# ------------------------------------------------------------------------------
# CIRCUIT BREAKER + NAVEGACIÓN SPA SIN RECARGAR PÁGINA (STEALTH v2.0)
# ------------------------------------------------------------------------------
def detectar_restriccion_o_cierre_sesion(page) -> tuple:
    """
    Verifica si WhatsApp Web cerró la sesión vinculada, volvió a la pantalla de QR
    o mostró el cartel 'Your account on linked devices is restricted right now'.
    """
    try:
        texto_body = page.locator("body").inner_text(timeout=1500).lower()
        frases_restriccion = [
            "your account on linked devices is restricted",
            "tu cuenta en dispositivos vinculados está restringida",
            "dispositivos vinculados está restringida",
            "recent activity on your account may be a sign of spam",
            "actividad reciente en tu cuenta",
            "use whatsapp on your computer",
            "usa whatsapp en tu computadora",
            "para usar whatsapp en tu computadora",
            "log in to whatsapp web",
        ]
        for frase in frases_restriccion:
            if frase in texto_body:
                return (True, f"WhatsApp cerró la sesión o restringió el dispositivo vinculado ('{frase}')")
        # También verificar si apareció el canvas del código QR y desapareció #pane-side
        qr_visible = page.locator('canvas[aria-label*="QR"], [data-testid="qrcode"]').first.is_visible()
        pane_visible = page.locator('#pane-side').first.is_visible()
        if qr_visible and not pane_visible:
            return (True, "La sesión de WhatsApp Web se desconectó (apareció pantalla de código QR).")
    except Exception:
        pass
    return (False, "")


def abrir_chat_spa_sin_recargar(page, telefono_norm: str):
    """
    CLAVE ANTI-BLOQUEO STEALTH v2.0:
    NUNCA usa page.goto("https://web.whatsapp.com/send?phone=...") porque eso recarga toda la SPA,
    corta el WebSocket y dispara el bloqueo de dispositivos vinculados de Meta.
    En su lugar, inyecta un enlace <a href="https://wa.me/..."> dentro del DOM ya cargado
    y le hace clic para que el router interno de WhatsApp Web abra el chat instantáneamente SIN recargar.
    """
    page.evaluate(
        """(phone) => {
            let link = document.getElementById('popurri-spa-link');
            if (!link) {
                link = document.createElement('a');
                link.id = 'popurri-spa-link';
                link.style.display = 'none';
                document.body.appendChild(link);
            }
            link.setAttribute('href', 'https://wa.me/' + phone);
            link.click();
        }""",
        telefono_norm,
    )


def enviar_mensaje_whatsapp_web_stealth(page, telefono_norm: str, texto_mensaje: str) -> tuple:
    """
    Abre el chat sin recargar la página (SPA click), verifica que no haya restricción,
    detecta números inexistentes y simula escritura humana con cadencia variable.
    """
    restringido_antes, motivo_antes = detectar_restriccion_o_cierre_sesion(page)
    if restringido_antes:
        return ("SESION_RESTRINGIDA_ABORTAR", motivo_antes)

    abrir_chat_spa_sin_recargar(page, telefono_norm)
    time.sleep(random.uniform(1.8, 3.0))

    tiempo_max_carga = 28
    inicio = time.time()

    while time.time() - inicio < tiempo_max_carga:
        restringido, motivo_rest = detectar_restriccion_o_cierre_sesion(page)
        if restringido:
            return ("SESION_RESTRINGIDA_ABORTAR", motivo_rest)

        contenido_visible = ""
        try:
            contenido_visible = page.locator("body").inner_text(timeout=1500).lower()
        except Exception:
            pass

        frases_inexistente = [
            "el número de teléfono compartido a través de la dirección url no es válido",
            "phone number shared via url is invalid",
            "el número de teléfono no está en whatsapp",
            "no es un número válido",
            "isn't on whatsapp",
        ]
        if any(frase in contenido_visible for frase in frases_inexistente):
            try:
                boton_ok = page.locator('[data-animate-modal-popup="true"] button, div[role="dialog"] button').first
                if boton_ok.is_visible():
                    time.sleep(random.uniform(0.6, 1.2))
                    boton_ok.click()
            except Exception:
                pass
            return ("NUMERO_INEXISTENTE", "El número no existe en WhatsApp")

        caja_mensaje = page.locator(
            '#main footer div[contenteditable="true"], '
            'div[contenteditable="true"][data-tab="10"], '
            'footer div[contenteditable="true"][role="textbox"]'
        ).first
        try:
            if caja_mensaje.is_visible():
                # Pausa natural de lectura antes de tocar la caja de texto
                time.sleep(random.uniform(1.2, 2.5))
                caja_mensaje.click()

                segundos_escritura = max(4.5, len(texto_mensaje) / random.uniform(15.0, 19.0))
                print(f"  [ESCRITURA HUMANA] Redactando durante {segundos_escritura:.1f}s ({len(texto_mensaje)} caracteres)...")

                parrafos = texto_mensaje.split("\\n")
                for p_idx, parrafo in enumerate(parrafos):
                    if parrafo:
                        # Tipear palabra por palabra con micro-pausas variables como un humano real
                        palabras = parrafo.split(" ")
                        for w_idx, palabra in enumerate(palabras):
                            fragmento = palabra + (" " if w_idx < len(palabras) - 1 else "")
                            delay_tecla = random.randint(35, 85)
                            page.keyboard.type(fragmento, delay=delay_tecla)
                            if w_idx % 6 == 0 and w_idx > 0:
                                time.sleep(random.uniform(0.15, 0.45))
                    if p_idx < len(parrafos) - 1:
                        page.keyboard.down("Shift")
                        page.keyboard.press("Enter")
                        page.keyboard.up("Shift")
                        time.sleep(random.uniform(0.3, 0.7))

                # Pausa de revisión antes de presionar Enter
                time.sleep(random.uniform(1.6, 3.4))
                page.keyboard.press("Enter")

                # Respaldo: si el botón Enviar sigue visible tras Enter, hacer clic
                try:
                    time.sleep(0.6)
                    btn_send = page.locator('#main footer button[aria-label="Enviar"], #main footer span[data-icon="send"]').first
                    if btn_send.is_visible():
                        btn_send.click()
                except Exception:
                    pass

                # Una vez disparado el envío, JAMÁS marcar como timeout de apertura de chat
                try:
                    time.sleep(random.uniform(2.5, 4.0))
                    restringido_post, motivo_post = detectar_restriccion_o_cierre_sesion(page)
                    if restringido_post:
                        return ("SESION_RESTRINGIDA_ABORTAR", motivo_post)
                except Exception:
                    pass

                return ("ENVIADO_OK", f"Primer mensaje enviado con éxito (Stealth SPA, {segundos_escritura:.1f}s)")
        except Exception as e_type:
            print(f"  [AVISO COMPOSER] Reintentando foco en caja de mensaje: {e_type}")

        time.sleep(1.0)

    restringido_fin, motivo_fin = detectar_restriccion_o_cierre_sesion(page)
    if restringido_fin:
        return ("SESION_RESTRINGIDA_ABORTAR", motivo_fin)

    return ("ERROR_ENVIO", "Tiempo de espera agotado al abrir el chat")


def lanzar_navegador_stealth(p):
    """
    Intenta abrir el navegador Google Chrome real instalado en la PC (o Microsoft Edge)
    desactivando las banderas 'AutomationControlled' y 'navigator.webdriver' para que
    WhatsApp Web no detecte Playwright.
    """
    argumentos_stealth = [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--disable-infobars",
    ]
    for canal in ["chrome", "msedge", None]:
        try:
            kwargs = {
                "user_data_dir": DIRECTORIO_SESION_WA,
                "headless": False,
                "viewport": {"width": 1280, "height": 840},
                "args": argumentos_stealth,
                "ignore_default_args": ["--enable-automation"],
            }
            if canal:
                kwargs["channel"] = canal
            ctx = p.chromium.launch_persistent_context(**kwargs)
            ctx.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            )
            print(f"[STEALTH] Navegador iniciado en modo humano real (canal: {canal or 'chromium-stealth'}).")
            return ctx
        except Exception:
            continue
    raise RuntimeError("No se pudo iniciar Chrome/Edge/Chromium.")


def main():
    parser = argparse.ArgumentParser(description="Automatizador Stealth v2.0 Anti-Restricción — Rutas POPURRÍ")
    parser.add_argument("--hora", type=str, default=HORA_INICIO_PROGRAMADA, help="Hora de inicio en formato HH:MM (>= 09:00)")
    parser.add_argument("--empezar-ya", action="store_true", help="Comenzar inmediatamente (siempre que sea >= 09:00)")
    parser.add_argument("--max-mensajes", type=int, default=CUPO_SORTEADO_ESTA_TANDA, help="Tope de mensajes (< 45)")
    parser.add_argument("--permitir-internacionales", action="store_true", help="Permitir números fuera de Argentina (+54)")
    args = parser.parse_args()

    conn = inicializar_db_control()

    cupo_seguro = min(44, max(1, args.max_mensajes))
    cola_activa = COLA_PRIMER_CONTACTO[:cupo_seguro]

    print("=" * 78)
    print("  RUTAS POPURRÍ — AUTOMATIZADOR STEALTH v2.0 (CERO RECARGA SPA + CHROME REAL)")
    print("=" * 78)
    print(f"  * Contactos en cola (sólo 1er mensaje): {len(cola_activa)} (Tope estricto < 45)")
    print(f"  * Navegación interna SPA              : ACTIVA (Sin page.goto por contacto)")
    print(f"  * Ventana horaria diurna segura       : >= 09:00 a {VENTANA_HORARIA_FIN} (Prohibido madrugada)")
    print(f"  * Intervalo no lineal entre mensajes  : {MIN_INTERVALO_SEG}s a {MAX_INTERVALO_SEG}s")
    print(f"  * Pausa de café cada {LOTE_PAUSA_CAFE_CADA} mensajes       : {MIN_PAUSA_CAFE_MIN} a {MAX_PAUSA_CAFE_MIN} minutos")
    print(f"  * Base SQLite anti-duplicados         : {ARCHIVO_SQLITE_CONTROL}")
    print("=" * 78)

    if len(cola_activa) == 0:
        print("[FIN] No hay contactos pendientes de primer mensaje en la cola actual.")
        return

    es_primera_vinculacion = not Path(ARCHIVO_SELLO_VINCULACION).exists()

    with sync_playwright() as p:
        print("\\n[PASO 1] Abriendo navegador Stealth con sesión persistente de WhatsApp Web...")
        context = lanzar_navegador_stealth(p)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

        print("[ESPERA] Verificando que WhatsApp Web esté vinculado...")
        page.wait_for_selector('#pane-side, [aria-label="Lista de chats"]', timeout=180000)
        print("[OK] ¡WhatsApp Web vinculado y listo!")

        if es_primera_vinculacion:
            Path(ARCHIVO_SELLO_VINCULACION).write_text(datetime.datetime.now().isoformat(), encoding="utf-8")
            print("\\n🛡️ [PROTECCIÓN DE REPOSO POST-QR] Es la primera vez que se vincula esta sesión.")
            print("   Esperando 90 segundos de reposo orgánico antes del primer envío para no disparar alertas de sesión recién vinculada...")
            time.sleep(90)

        if not args.empezar_ya:
            esperar_hasta_hora_inicio(args.hora)

        enviados_ok = 0
        inexistentes = 0
        errores = 0
        omitidos_previos = 0
        enviados_en_esta_sesion = 0
        proximo_lote_cafe = random.randint(7, 11)

        for idx, item in enumerate(cola_activa):
            orden = idx + 1
            contact_id = str(item.get("contactId", ""))
            nombre = item.get("nombre", "Contacto")
            tel = str(item.get("telefonoNorm", ""))

            # 1. Control idempotente: saltar si ya fue enviado en una corrida anterior
            ya_procesado, res_previo, fecha_previa = ya_fue_procesado_en_db(conn, contact_id, tel)
            if ya_procesado:
                omitidos_previos += 1
                item["resultado"] = res_previo
                item["detalleResultado"] = f"Saltado automáticamente: ya figuraba como {res_previo} ({fecha_previa})"
                print(f"\\n[{orden}/{len(cola_activa)}] ⏭️ SALTANDO #{contact_id} ({nombre}): ya fue procesado antes ({res_previo}).")
                continue

            # 2. Guardia contra números internacionales en frío (ej. +34 España como #167)
            if SOLO_NUMEROS_ARGENTINA_54 and not args.permitir_internacionales and not tel.startswith("54"):
                print(f"\\n[{orden}/{len(cola_activa)}] 🛡️ SALTANDO N° INTERNACIONAL #{contact_id} ({nombre} - +{tel}):")
                print("   Enviar en frío desde un dispositivo vinculado a números de otro país (+34, etc.) dispara bloqueo en Meta.")
                print("   Enviale a este contacto manualmente desde tu celular principal con 1 clic.")
                continue

            # 3. Verificar ventana horaria diurna (>= 09:00 a 19:00)
            en_ventana, motivo_ventana, hora_ref = esta_dentro_de_ventana_comercial()
            if not en_ventana and motivo_ventana == "DESPUES_DE_CIERRE":
                print(f"\\n[PROTECCIÓN HORARIA] Son más de las {VENTANA_HORARIA_FIN}. Se pausa la tanda y se guarda el progreso para mañana.")
                guardar_reportes_locales(cola_activa)
                break
            elif not en_ventana and motivo_ventana == "ANTES_DE_APERTURA":
                print(f"\\n[PROTECCIÓN ANTI-MADRUGADA] Aún no son las {hora_ref}. Esperando horario diurno seguro...")
                esperar_hasta_hora_inicio(hora_ref)

            # 4. Pausas humanas no lineales + "Pausa de Café"
            if enviados_en_esta_sesion > 0:
                if enviados_en_esta_sesion >= proximo_lote_cafe:
                    pausa_cafe_seg = int(random.uniform(MIN_PAUSA_CAFE_MIN * 60, MAX_PAUSA_CAFE_MIN * 60))
                    print(f"\\n☕ [PAUSA DE CAFÉ HUMANA] Ya se enviaron {enviados_en_esta_sesion} mensajes.")
                    print(f"   Descansando {pausa_cafe_seg // 60} min {pausa_cafe_seg % 60} seg antes de seguir...")
                    for seg in range(pausa_cafe_seg, 0, -1):
                        sys.stdout.write(f"\\r   -> Reanudando luego del café en {seg // 60:02d}m {seg % 60:02d}s... ")
                        sys.stdout.flush()
                        time.sleep(1)
                    print()
                    proximo_lote_cafe = enviados_en_esta_sesion + random.randint(7, 11)
                else:
                    modo_central = (MIN_INTERVALO_SEG + MAX_INTERVALO_SEG) / 2.0
                    pausa_no_lineal = int(random.triangular(MIN_INTERVALO_SEG, MAX_INTERVALO_SEG, modo_central))
                    print(f"\\n[INTERVALO HUMANO NO LINEAL] Esperando {pausa_no_lineal}s antes del contacto #{orden}...")
                    for seg in range(pausa_no_lineal, 0, -1):
                        sys.stdout.write(f"\\r  -> Próximo envío a {nombre} en {seg}s...   ")
                        sys.stdout.flush()
                        time.sleep(1)
                    print()

            # 5. Generar variante única de texto
            mensaje_unico = obtener_mensaje_unico_ia_o_spintax(item, orden)
            item["mensajePrimerContacto"] = mensaje_unico

            print(f"\\n[{orden}/{len(cola_activa)}] Enviando 1er mensaje único (Stealth SPA) a #{contact_id} - {nombre} ({tel})...")
            try:
                resultado, detalle = enviar_mensaje_whatsapp_web_stealth(page, tel, mensaje_unico)
            except PlaywrightTimeoutError:
                resultado, detalle = ("ERROR_ENVIO", "Timeout en WhatsApp Web")
            except Exception as exc:
                msg_exc = str(exc)
                if "interrupted by another navigation" in msg_exc.lower():
                    resultado, detalle = ("SESION_RESTRINGIDA_ABORTAR", "WhatsApp Web cerró la sesión vinculada.")
                else:
                    resultado, detalle = ("ERROR_ENVIO", f"Error inesperado: {exc}")

            # CIRCUIT BREAKER INMEDIATO: Si la sesión se cerró o restringió, frenar en seco SIN ensuciar #168, #169, #170
            if resultado == "SESION_RESTRINGIDA_ABORTAR":
                print("\\n" + "!" * 78)
                print("  🛑 FRENO DE EMERGENCIA (CIRCUIT BREAKER ACTIVADO)")
                print("!" * 78)
                print(f"  Motivo: {detalle}")
                print("  Se detiene el programa inmediatamente para proteger tu cuenta y NO marcar")
                print("  falsos errores en los contactos siguientes.")
                print("  👉 IMPORTANTE: No vuelvas a escanear el código QR durante 24 horas.")
                print("     Mientras dure la restricción en PC, podés enviar desde tu celular principal.")
                print("!" * 78)
                guardar_reportes_locales(cola_activa)
                break

            enviados_en_esta_sesion += 1
            if resultado == "ENVIADO_OK":
                enviados_ok += 1
                print(f"  ✅ ÉXITO: {detalle}")
            elif resultado == "NUMERO_INEXISTENTE":
                inexistentes += 1
                print(f"  🚫 NÚMERO INEXISTENTE: {detalle}")
            else:
                errores += 1
                print(f"  ⚠️ FALLÓ EL ENVÍO: {detalle}")

            registrar_en_db_control(conn, item, resultado, detalle, mensaje_unico)
            reportar_resultado_en_vivo(item, resultado, detalle)
            guardar_reportes_locales(cola_activa)

        print("\\n" + "=" * 78)
        print("  RESUMEN FINAL DE LA TANDA STEALTH v2.0")
        print("=" * 78)
        print(f"  * Total en cola (< 45)      : {len(cola_activa)}")
        print(f"  * ✅ Enviados con éxito      : {enviados_ok}")
        print(f"  * 🚫 N° WA inexistentes      : {inexistentes}")
        print(f"  * ⚠️ No enviados / Error     : {errores}")
        print(f"  * ⏭️ Saltados (ya enviados)  : {omitidos_previos}")
        print("=" * 78)
        time.sleep(4)
        context.close()
        conn.close()


if __name__ == "__main__":
    main()
`;
}

/**
 * Clasifica el estatus de una persona para la App de Estatus diaria (Adhirió, Encuentro Confirmado,
 * En conversación, Número inválido, Sin DNI en CABA, No vive en CABA, Baja).
 */
export function clasificarEstatusParaAppExterna(c: Contact): EstatusReporteApp {
  const com = (c.comentario || '').toLowerCase();
  if (c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
    return 'Adhirió';
  }
  if (
    /no\s+existe\s+en\s+whatsapp|n[uú]mero\s+inv[aá]lido|tel[eé]fono\s+incorrecto|equivocado/i.test(com)
  ) {
    return 'Número inválido / No existe WA';
  }
  if (
    /no\s+vive\s+en\s+caba|vive\s+en\s+provincia|se\s+mud[oó]|vive\s+afuera|interior|extranjero/i.test(com)
  ) {
    return 'No vive en CABA';
  }
  if (
    c.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    c.situacion === 'DESCARTADO_NO_CABA' ||
    /sin\s+dni\s+en\s+caba|dni\s+en\s+provincia|domicilio\s+en\s+pba|no\s+tiene\s+dni\s+caba/i.test(com)
  ) {
    return 'Sin DNI en CABA';
  }
  if (c.estadoFlujo === 'DESCARTADO_O_BAJA' || c.adhirio === 'No') {
    return 'Baja / No contactar';
  }
  if (
    c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    c.situacion === 'VISITA_AGENDADA'
  ) {
    return 'Encuentro Confirmado';
  }
  return 'En conversación (Falta dato/confirmar)';
}

/**
 * Motor del PANEL DE TAREAS DIARIAS + CIERRE DIARIO (Google Forms + App Adhesiones + App Estatus):
 * Procesa toda la información cargada en cada usuario y determina qué hay que hacer HOY
 * a lo largo de las 7 etapas del proceso territorial + los seguimientos temporales (24h, 48h y baja amable).
 */
export function generarPanelTareasDiarias(
  contacts: Contact[],
  corte: CorteResultado,
  controlEnvios: ControlEnvioRegistro[] = [],
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  modoSaludo: ModoSaludoMismoDia = 'AUTO_MISMO_DIA'
): PanelTareasDiariasResultado {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const conteoPorEtapa: Record<EtapaProcesoTerritorial, number> = {
    ETAPA_1_PRIMER_CONTACTO: 0,
    ETAPA_2_VALIDAR_DNI_CABA: 0,
    ETAPA_3_PEDIR_DIRECCION_Y_FRANJA: 0,
    ETAPA_4_PROPONER_ENCUENTRO_O_CAFE: 0,
    ETAPA_5_CONFIRMAR_ENCUENTRO: 0,
    ETAPA_6_TERRENO_HOY_Y_RECORDATORIO: 0,
    ETAPA_7_AGRADECIMIENTO_POST_FIRMA: 0,
    SEGUIMIENTO_48H_SIN_RSP: 0,
    SEGUIMIENTO_24H_FALTA_DATO: 0,
    SEGUIMIENTO_24H_FALTA_CONFIRMAR: 0,
    ULTIMO_MSJ_BAJA_AMABLE: 0,
  };

  // Identificar contactos que están hoy en la ruta / bloques de HOY
  const bloquesHoy = (corte?.agendaSugeridaDias || []).filter(
    (b) => b.fechaClave === hoyBA.ddmm || /^HOY\b/i.test(b.diaEtiqueta || '')
  );
  const idsEnRutaHoy = new Set<string>(
    bloquesHoy.flatMap((b) => (b.contactosIncluidos || []).map((c) => c.id))
  );

  const tareas: TareaDiariaItem[] = [];

  for (const c of contacts) {
    const habloHoy = yaSeHabloConContactoHoy(c, ahoraMs);
    const msUltimo = c.ultimoMensajeCorteEnviadoAt
      ? Date.parse(c.ultimoMensajeCorteEnviadoAt)
      : c.actualizadoEnAppAt
      ? Date.parse(c.actualizadoEnAppAt)
      : c.ultimoContacto
      ? Date.parse(`${c.ultimoContacto}T12:00:00-03:00`)
      : NaN;
    const horasDesdeUltimo = Number.isFinite(msUltimo)
      ? Math.max(0, Math.round((ahoraMs - msUltimo) / 3600000))
      : undefined;

    // ETAPA 7: Ya adhirió -> enviar agradecimiento post-firma si aún no se le agradeció
    if (c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
      if (!/agradec|gracias enviada|\[agradecimiento/i.test(c.comentario || '')) {
        conteoPorEtapa.ETAPA_7_AGRADECIMIENTO_POST_FIRMA++;
        const gen = generarMensajeContextual(c, profile, 'agradecimiento_post_firma', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-7-${c.id}`,
          contact: c,
          etapaNumero: 7,
          etapaCodigo: 'ETAPA_7_AGRADECIMIENTO_POST_FIRMA',
          etapaTitulo: 'Etapa 7 · Agradecer adhesión y pedir referidos CABA',
          prioridad: 'CIERRE_O_BAJA',
          motivoTarea: 'Ya firmó su ficha de adhesión y falta enviarle el mensaje de agradecimiento.',
          accionConcreta: 'Enviar mensaje de agradecimiento por bancar el proyecto.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'agradecimiento_post_firma',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      }
      continue;
    }

    // Descartados o bajas ya cerradas no generan tarea pendiente
    if (
      c.adhirio === 'No' ||
      c.estadoFlujo === 'DESCARTADO_O_BAJA' ||
      c.situacion === 'DESCARTADO_NO_CABA' ||
      c.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
    ) {
      continue;
    }

    // ETAPA 6: Encuentro Hoy / Recordatorio de la Mañana antes de salir / Avisos en Terreno
    const tieneFechaHoy = (c.fechasMencionadas || []).includes(hoyBA.ddmm) || idsEnRutaHoy.has(c.id);
    if (
      c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
      c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
      c.situacion === 'VISITA_AGENDADA' ||
      tieneFechaHoy
    ) {
      conteoPorEtapa.ETAPA_6_TERRENO_HOY_Y_RECORDATORIO++;
      const plantillaEtapa6: TipoPlantillaWA =
        c.alertaVencido?.activa
          ? 'disculpas_y_reprogramacion'
          : c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
          ? 'en_camino'
          : 'recordatorio_maniana_encuentro';
      const gen = generarMensajeContextual(c, profile, plantillaEtapa6, {
        modoSaludo,
        ahoraMs,
      });
      tareas.push({
        id: `tarea-6-${c.id}`,
        contact: c,
        etapaNumero: 6,
        etapaCodigo: 'ETAPA_6_TERRENO_HOY_Y_RECORDATORIO',
        etapaTitulo: 'Etapa 6 · Encuentro Hoy / Recordatorio de la Mañana y Terreno',
        prioridad: 'URGENTE_HOY',
        motivoTarea: c.alertaVencido?.activa
          ? `Horario vencido sin adherir (${c.alertaVencido.motivo}) — Reprogramar hoy.`
          : `Encuentro agendado (${c.calleOCruce || c.barrio} · ${c.fechasMencionadas[0] || hoyBA.ddmm}).`,
        accionConcreta:
          c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
            ? 'Avisar "En camino", "En la puerta (2 min)" o marcar "¡Ya adhirió!"'
            : 'Enviar recordatorio de la mañana antes de salir al recorrido',
        horasDesdeUltimoContacto: horasDesdeUltimo,
        yaSeHabloHoy: habloHoy,
        tipoPlantillaSugerida: plantillaEtapa6,
        mensajeListo: gen.texto,
        automatizableSinRiesgo: true,
      });
      continue;
    }

    // ETAPA 1: Sin contactar (1er mensaje en frío)
    if (esContactoElegiblePrimerContactoAuto(c)) {
      conteoPorEtapa.ETAPA_1_PRIMER_CONTACTO++;
      const gen = generarMensajeContextual(c, profile, 'primer_contacto', {
        modoSaludo: 'SIEMPRE_SALUDAR',
        ahoraMs,
      });
      tareas.push({
        id: `tarea-1-${c.id}`,
        contact: c,
        etapaNumero: 1,
        etapaCodigo: 'ETAPA_1_PRIMER_CONTACTO',
        etapaTitulo: 'Etapa 1 · Enviar 1er Mensaje (Cupo diario seguro < 45)',
        prioridad: 'AVANCE_PROCESO',
        motivoTarea: c.sinNombre
          ? 'Teléfono nuevo sin nombre en planilla: enviar 1er mensaje consultando nombre y DNI CABA.'
          : 'Vecino nuevo sin primer contacto enviado.',
        accionConcreta: 'Enviar 1er mensaje (manual o con el Bot Stealth < 45/día).',
        yaSeHabloHoy: false,
        tipoPlantillaSugerida: 'primer_contacto',
        mensajeListo: gen.texto,
        automatizableSinRiesgo: true,
      });
      continue;
    }

    // SEGUIMIENTO 48H SIN RESPUESTA O ÚLTIMO MENSAJE DE BAJA AMABLE
    if (c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' || c.rsp === 'No') {
      const intentos = c.intentos || 1;
      const supero48h =
        Boolean(c.seguimiento48h?.aplica) ||
        (horasDesdeUltimo !== undefined ? horasDesdeUltimo >= 48 : true);

      if (intentos >= 2 && supero48h) {
        conteoPorEtapa.ULTIMO_MSJ_BAJA_AMABLE++;
        const gen = generarMensajeContextual(c, profile, 'baja_amable_sin_respuesta', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-baja-${c.id}`,
          contact: c,
          etapaNumero: 2,
          etapaCodigo: 'ULTIMO_MSJ_BAJA_AMABLE',
          etapaTitulo: 'Cierre Amable · Sin respuesta tras seguimiento (Dar de baja)',
          prioridad: 'CIERRE_O_BAJA',
          motivoTarea: `Ya se le escribió ${intentos} veces sin respuesta (+48 hs).`,
          accionConcreta: 'Enviar último mensaje amable de baja para no molestar y marcar Baja.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'baja_amable_sin_respuesta',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      } else if (supero48h) {
        conteoPorEtapa.SEGUIMIENTO_48H_SIN_RSP++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_sin_respuesta', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-48h-${c.id}`,
          contact: c,
          etapaNumero: 2,
          etapaCodigo: 'SEGUIMIENTO_48H_SIN_RSP',
          etapaTitulo: 'Seguimiento +48 hs · No respondió al 1er mensaje',
          prioridad: 'SEGUIMIENTO_24H_48H',
          motivoTarea: 'Pasaron más de 48 hs desde el primer contacto sin respuesta.',
          accionConcreta: 'Enviar mensaje breve de seguimiento recordando quiénes somos.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_sin_respuesta',
          mensajeListo: c.seguimiento48h?.mensajePersonalizado48h
            ? aplicarReglaSaludoMismoDia(c.seguimiento48h.mensajePersonalizado48h, c, modoSaludo, ahoraMs)
            : gen.texto,
          automatizableSinRiesgo: true,
        });
      }
      continue;
    }

    // PERSONAS QUE RESPONDIERON (RSP === 'Sí'): Etapas 2, 3, 4, 5 y Seguimientos de 24h
    const tienePropuestaEnviada = /\[Propuesta/i.test(c.comentario || '');
    const tieneDireccion = Boolean(c.calleOCruce && c.calleOCruce.trim().length > 2);
    const tieneFranjaODia =
      (c.fechasMencionadas && c.fechasMencionadas.length > 0) ||
      (c.franjaHoraria && c.franjaHoraria !== 'Sin definir' && c.franjaHoraria !== 'Flexible');
    const paso24h = horasDesdeUltimo === undefined ? true : horasDesdeUltimo >= 24;

    if (tienePropuestaEnviada) {
      if (paso24h && !habloHoy) {
        conteoPorEtapa.SEGUIMIENTO_24H_FALTA_CONFIRMAR++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_24h_falta_confirmar', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-24conf-${c.id}`,
          contact: c,
          etapaNumero: 5,
          etapaCodigo: 'SEGUIMIENTO_24H_FALTA_CONFIRMAR',
          etapaTitulo: 'Seguimiento +24 hs · Falta confirmar propuesta de encuentro',
          prioridad: 'SEGUIMIENTO_24H_48H',
          motivoTarea: 'Ya le compartimos propuesta de día/franja hace +24 hs y aún no confirmó.',
          accionConcreta: 'Consultar si le queda bien el encuentro propuesto o prefiere otro horario.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_24h_falta_confirmar',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      } else {
        conteoPorEtapa.ETAPA_5_CONFIRMAR_ENCUENTRO++;
        const gen = generarMensajeContextual(c, profile, 'confirmacion_visita', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-5-${c.id}`,
          contact: c,
          etapaNumero: 5,
          etapaCodigo: 'ETAPA_5_CONFIRMAR_ENCUENTRO',
          etapaTitulo: 'Etapa 5 · Confirmar encuentro (Tipo, dirección, día y hora)',
          prioridad: 'URGENTE_HOY',
          motivoTarea: `Propuesta en curso en ${c.calleOCruce || c.barrio} — falta dejar cerrado el compromiso.`,
          accionConcreta: 'Confirmar día, hora y dirección/café o marcar Confirmado.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'confirmacion_visita',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: false,
        });
      }
      continue;
    }

    if (tieneDireccion && tieneFranjaODia) {
      conteoPorEtapa.ETAPA_4_PROPONER_ENCUENTRO_O_CAFE++;
      const gen = generarMensajeContextual(c, profile, 'propuesta_bloque_agenda', {
        modoSaludo,
        ahoraMs,
      });
      tareas.push({
        id: `tarea-4-${c.id}`,
        contact: c,
        etapaNumero: 4,
        etapaCodigo: 'ETAPA_4_PROPONER_ENCUENTRO_O_CAFE',
        etapaTitulo: 'Etapa 4 · Proponer encuentro con fecha/franja o Café HUB',
        prioridad: 'URGENTE_HOY',
        motivoTarea: `Ya tenemos dirección (*${c.calleOCruce}*) y disponibilidad (${c.fechasMencionadas[0] || c.franjaHoraria}).`,
        accionConcreta: 'Enviar propuesta concreta de día y horario (visita 2 min o Café cercano).',
        horasDesdeUltimoContacto: horasDesdeUltimo,
        yaSeHabloHoy: habloHoy,
        tipoPlantillaSugerida: 'propuesta_bloque_agenda',
        mensajeListo: gen.texto,
        automatizableSinRiesgo: false,
      });
      continue;
    }

    if (!tieneDireccion || !tieneFranjaODia) {
      if (paso24h && !habloHoy && c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR') {
        conteoPorEtapa.SEGUIMIENTO_24H_FALTA_DATO++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_24h_falta_dato', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-24dato-${c.id}`,
          contact: c,
          etapaNumero: 3,
          etapaCodigo: 'SEGUIMIENTO_24H_FALTA_DATO',
          etapaTitulo: 'Seguimiento +24 hs · Falta dirección o franja horaria',
          prioridad: 'SEGUIMIENTO_24H_48H',
          motivoTarea: !tieneDireccion
            ? 'Respondió hace +24 hs pero aún no nos pasó esquina/dirección.'
            : 'Nos pasó dirección pero hace +24 hs falta definir día/franja horaria.',
          accionConcreta: 'Pedir el dato faltante para sumarlo a la hoja de ruta o Café HUB.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_24h_falta_dato',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      } else if (c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA') {
        conteoPorEtapa.ETAPA_2_VALIDAR_DNI_CABA++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_cambio_chip', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-2-${c.id}`,
          contact: c,
          etapaNumero: 2,
          etapaCodigo: 'ETAPA_2_VALIDAR_DNI_CABA',
          etapaTitulo: 'Etapa 2 · Confirmar DNI con domicilio en CABA y pedir esquina',
          prioridad: 'AVANCE_PROCESO',
          motivoTarea: 'Respondió al mensaje inicial: confirmar que su DNI físico tenga domicilio en CABA y pedir esquina/franja.',
          accionConcreta: 'Consultar DNI CABA + esquina o punto cómodo y franja horaria.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_cambio_chip',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: false,
        });
      } else {
        conteoPorEtapa.ETAPA_3_PEDIR_DIRECCION_Y_FRANJA++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_24h_falta_dato', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-3-${c.id}`,
          contact: c,
          etapaNumero: 3,
          etapaCodigo: 'ETAPA_3_PEDIR_DIRECCION_Y_FRANJA',
          etapaTitulo: 'Etapa 3 · Obtener dirección/punto y días/franja (u ofrecer Café)',
          prioridad: 'AVANCE_PROCESO',
          motivoTarea: !tieneDireccion
            ? `Falta esquina o dirección en ${c.barrio} para ubicarlo en el recorrido.`
            : `Ya tenemos dirección (*${c.calleOCruce}*), falta acordar días y franja horaria.`,
          accionConcreta: 'Pedir esquina/dirección y franja o proponer Café céntrico del barrio.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_24h_falta_dato',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: false,
        });
      }
    }
  }

  const ordenPrioridad: Record<TareaDiariaItem['prioridad'], number> = {
    URGENTE_HOY: 1,
    SEGUIMIENTO_24H_48H: 2,
    AVANCE_PROCESO: 3,
    CIERRE_O_BAJA: 4,
  };

  tareas.sort((a, b) => {
    const diffP = ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad];
    if (diffP !== 0) return diffP;
    if (a.yaSeHabloHoy !== b.yaSeHabloHoy) return a.yaSeHabloHoy ? 1 : -1;
    return b.etapaNumero - a.etapaNumero;
  });

  // CALCULAR RESUMEN DIARIO PARA GOOGLE FORMS + APP DE ADHESIONES + APP DE ESTATUS
  const idsContactadosHoy = new Set<string>();
  const mapaHoraPorContacto = new Map<string, string>();

  for (const reg of controlEnvios) {
    if (reg.fechaHora && reg.fechaHora.includes(hoyBA.ddmm)) {
      idsContactadosHoy.add(String(reg.contactId));
      mapaHoraPorContacto.set(String(reg.contactId), reg.fechaHora);
    }
  }

  for (const c of contacts) {
    if (yaSeHabloConContactoHoy(c, ahoraMs)) {
      idsContactadosHoy.add(c.id);
      if (!mapaHoraPorContacto.has(c.id)) {
        mapaHoraPorContacto.set(c.id, hoyBA.hhmm);
      }
    }
  }

  const adhesionesTotales = contacts.filter((c) => c.adhirio === 'Sí');
  const adhesionesHoy = adhesionesTotales.filter((c) => {
    if (idsContactadosHoy.has(c.id)) return true;
    const com = c.comentario || '';
    if (com.includes(hoyBA.ddmm) || com.includes(hoyBA.isoDate)) return true;
    if (c.actualizadoEnAppAt && c.actualizadoEnAppAt.startsWith(hoyBA.isoDate)) return true;
    return false;
  });

  const estatusPersonasHabladasHoy: EstatusHabladoHoyItem[] = [];
  const conteoPorEstatusHoy: Record<EstatusReporteApp, number> = {
    'Adhirió': 0,
    'Encuentro Confirmado': 0,
    'En conversación (Falta dato/confirmar)': 0,
    'Número inválido / No existe WA': 0,
    'Sin DNI en CABA': 0,
    'No vive en CABA': 0,
    'Baja / No contactar': 0,
  };

  for (const c of contacts) {
    const tocadoHoy =
      idsContactadosHoy.has(c.id) ||
      Boolean(c.actualizadoEnAppAt && c.actualizadoEnAppAt.startsWith(hoyBA.isoDate));
    if (!tocadoHoy) continue;

    const est = clasificarEstatusParaAppExterna(c);
    conteoPorEstatusHoy[est] = (conteoPorEstatusHoy[est] || 0) + 1;
    estatusPersonasHabladasHoy.push({
      contactId: c.id,
      nombre: c.nombreCompletoCorregido || c.nombre || `Sin nombre (${c.telRaw})`,
      telRaw: c.telRaw,
      barrio: c.barrio,
      direccion: c.calleOCruce || c.barrio,
      estatusApp: est,
      detalleComentario: c.comentario || c.estadoFlujoEtiqueta,
      horaAccion: mapaHoraPorContacto.get(c.id) || hoyBA.hhmm,
    });
  }

  const clustersActivos = (corte?.agendaSugeridaDias || []).filter(
    (b) => b.contactosIncluidos.length >= 2 && (b.cafesHubOpciones?.length || 0) > 0
  );
  const contactosEnClusters = clustersActivos.reduce(
    (acc, b) => acc + b.contactosIncluidos.length,
    0
  );
  const contactosPuertaAPuerta = (corte?.agendaSugeridaDias || [])
    .filter((b) => b.contactosIncluidos.length === 1 || (b.cafesHubOpciones?.length || 0) === 0)
    .reduce((acc, b) => acc + b.contactosIncluidos.length, 0);

  return {
    fechaReferenciaBA: `${hoyBA.nombreDia} ${hoyBA.ddmm} (${hoyBA.hhmm} hs)`,
    tareasPriorizadas: tareas,
    conteoPorEtapa,
    resumenFormsYApps: {
      fechaHoyEtiqueta: `${hoyBA.nombreDia} ${hoyBA.ddmm}`,
      personasContactadasHoy: idsContactadosHoy.size,
      adhesionesConseguidasHoy: adhesionesHoy.length,
      adhesionesTotalesAcumuladas: adhesionesTotales.length,
      adhesionesHoyDetalle: (adhesionesHoy.length > 0 ? adhesionesHoy : adhesionesTotales.slice(0, 8)).map(
        (c) => ({
          id: c.id,
          nombre: c.nombreCompletoCorregido || c.nombre,
          telRaw: c.telRaw,
          barrio: c.barrio,
          direccion: c.calleOCruce || c.barrio,
          comentario: c.comentario,
        })
      ),
      estatusPersonasHabladasHoy,
      conteoPorEstatusHoy,
    },
    recomendacionEstrategiaCafeHub: {
      titulo: 'Método Híbrido: Café Ancla (≥2 vecinos a ≤12 min) + Satélites Puerta a Puerta',
      explicacionCorta:
        'En lugar de esperar a juntar muchas direcciones (lo que enfría a quienes responden rápido), apenas 2 o más vecinos caen a ≤12 min a pie en la misma franja se activa un Café Ancla de tu lista oficial y se les ofrece la doble opción en el mismo mensaje: acercarse al Café en esa ventana de 90 min o que pases 2 minutos por su puerta al terminar el café.',
      clustersActivosHoy: clustersActivos.length,
      contactosEnClusters,
      contactosPuertaAPuerta,
    },
  };
}






