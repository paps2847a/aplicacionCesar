import { AnalisisNombre } from '../../types';
import { esBarrioDeCABA, esEmailValido } from '../geo/cabaLocations';

// Diccionario de restitución de tildes y grafía correcta para nombres de pila (clave en minúscula sin/con tilde -> forma canónica)
export const DICCIONARIO_NOMBRES_CANONICOS: Record<string, { canonico: string; peso: number }> = {
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
export const DICCIONARIO_APELLIDOS_CANONICOS: Record<string, string> = {
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

export const CONECTORES_ONOMASTICOS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'di', 'van', 'von']);

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

export function formatearTokenOnomastico(
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

export function obtenerPesoNombre(palabraRaw: string): number {
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


export function construirVocativoNatural(tokensNombrePila: string[]): string {
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


