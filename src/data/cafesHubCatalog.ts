export interface RawGoogleMapsCafeItem {
  Title: string;
  URL: string;
  List: string[];
  Address: string | null;
  Coordinates: {
    lat: number;
    lng: number;
  };
  AddressComponents?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  } | null;
}

export interface CafeHubCurado {
  id: string;
  nombre: string;
  urlGoogleMaps: string;
  direccion: string;
  barrio: string;
  esCaba: boolean;
  lat: number;
  lng: number;
}

/**
 * Lista oficial de lugares descargada del Google Maps compartido del usuario ("Café de especialidad")
 * que deben ser considerados para todos los Cafés HUB de la aplicación.
 */
export const RAW_GOOGLE_MAPS_CAFES_HUB: RawGoogleMapsCafeItem[] = [
  {
    Title: 'Cori',
    URL: 'https://www.google.com/maps?cid=12821727039494484744',
    List: ['Café de especialidad'],
    Address: 'Paroissien 3999, C1430CCG Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5531678, lng: -58.4849799 },
    AddressComponents: null,
  },
  {
    Title: 'AYRA CAFÉ',
    URL: 'https://www.google.com/maps?cid=5189301700358765408',
    List: ['Café de especialidad'],
    Address: 'José A. Cabrera 5040, C1414BGR Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5898884, lng: -58.4325409 },
    AddressComponents: null,
  },
  {
    Title: 'Marmi Coffee House',
    URL: 'https://www.google.com/maps?cid=15230514226399799040',
    List: ['Café de especialidad'],
    Address: 'Juana Manso 1814, C1107CBA Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.6201578, lng: -58.361108699999996 },
    AddressComponents: null,
  },
  {
    Title: 'La Reconquista',
    URL: 'https://www.google.com/maps?cid=11543025953835775369',
    List: ['Café de especialidad'],
    Address: 'Reconquista 984, C1003 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5964435, lng: -58.3731728 },
    AddressComponents: null,
  },
  {
    Title: 'Cuervo café',
    URL: 'https://www.google.com/maps?cid=14621735921890247238',
    List: ['Café de especialidad'],
    Address: 'Azcuénaga 1507, C1115AAO Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5914748, lng: -58.3978828 },
    AddressComponents: null,
  },
  {
    Title: 'Querida Estefi',
    URL: 'https://www.google.com/maps?cid=7898299817058967181',
    List: ['Café de especialidad'],
    Address: 'Ricardo Gutiérrez 1298, B1636FXH Vicente López, Provincia de Buenos Aires',
    Coordinates: { lat: -34.5104554, lng: -58.4881867 },
    AddressComponents: null,
  },
  {
    Title: 'La balada cafe-bar',
    URL: 'https://www.google.com/maps?cid=1324033843026582536',
    List: ['Café de especialidad'],
    Address: 'Teodoro García 2902, C1426DND C1426DND, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5744354, lng: -58.4488351 },
    AddressComponents: null,
  },
  {
    Title: 'Café Razo',
    URL: 'https://www.google.com/maps?cid=18190076535355627350',
    List: ['Café de especialidad'],
    Address: 'Quesada 2347, C1429 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.55397, lng: -58.462870599999995 },
    AddressComponents: null,
  },
  {
    Title: 'Terracota',
    URL: 'https://www.google.com/maps?cid=15691269739881840877',
    List: ['Café de especialidad'],
    Address: 'Pacheco 3176, C1431 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5667354, lng: -58.4893912 },
    AddressComponents: null,
  },
  {
    Title: 'Fahren Café',
    URL: 'https://www.google.com/maps?cid=4135453313674756972',
    List: ['Café de especialidad'],
    Address: 'Virrey Olaguer y Feliú 3405, C1426 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5758422, lng: -58.459134 },
    AddressComponents: null,
  },
  {
    Title: 'Café Negro',
    URL: 'https://www.google.com/maps?cid=15880214581053851453',
    List: ['Café de especialidad'],
    Address: 'Arévalo 2051, C1414 Comuna 14, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5781086, lng: -58.4370328 },
    AddressComponents: null,
  },
  {
    Title: 'Pulso Specialty coffee & vermú',
    URL: 'https://www.google.com/maps?cid=16666872989378564372',
    List: ['Café de especialidad'],
    Address: 'Blanco Encalada 1992, C1438 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.556957, lng: -58.455155299999994 },
    AddressComponents: null,
  },
  {
    Title: 'Cuento',
    URL: 'https://www.google.com/maps?cid=1482392185484432234',
    List: ['Café de especialidad'],
    Address: 'Laprida 2189, C1425 EKW, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5868067, lng: -58.3984903 },
    AddressComponents: null,
  },
  {
    Title: 'Café Coltrane',
    URL: 'https://www.google.com/maps?cid=15096882605328108596',
    List: ['Café de especialidad'],
    Address: 'Av. Córdoba 1515, C1055 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5992075, lng: -58.3884751 },
    AddressComponents: null,
  },
  {
    Title: 'Café Boheme - Café de Especialidad',
    URL: 'https://www.google.com/maps?cid=1423084294435138392',
    List: ['Café de especialidad'],
    Address: 'Libertad 545, C1012 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.602095999999996, lng: -58.3837334 },
    AddressComponents: null,
  },
  {
    Title: 'Stain Coffee',
    URL: 'https://www.google.com/maps?cid=9916371577842549423',
    List: ['Café de especialidad'],
    Address: 'El Salvador 5999, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5800625, lng: -58.4391803 },
    AddressComponents: null,
  },
  {
    Title: 'Refugio x lenga',
    URL: 'https://www.google.com/maps?cid=13432869808658786085',
    List: ['Café de especialidad'],
    Address: 'Habana 3764, C1419GRA Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5963746, lng: -58.510821899999996 },
    AddressComponents: null,
  },
  {
    Title: 'Social Corazón',
    URL: 'https://www.google.com/maps?cid=3106967694136142220',
    List: ['Café de especialidad'],
    Address: 'Guatemala 4802, C1425BUP Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5855331, lng: -58.425607 },
    AddressComponents: null,
  },
  {
    Title: 'KISSATEN TOSTADOR',
    URL: 'https://www.google.com/maps?cid=10406263274293577216',
    List: ['Café de especialidad'],
    Address: 'Av. Juramento 1381, C1428 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.555792, lng: -58.446472099999994 },
    AddressComponents: null,
  },
  {
    Title: 'Daniel Bakery',
    URL: 'https://www.google.com/maps?cid=10946275456203321577',
    List: ['Café de especialidad'],
    Address: 'Honduras 5815, C1414BNI C1414BNI, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.582317599999996, lng: -58.4384963 },
    AddressComponents: null,
  },
  {
    Title: 'ÖSS Kaffe Palermo',
    URL: 'https://www.google.com/maps?cid=11297699984687028029',
    List: ['Café de especialidad'],
    Address: 'Pje. Emilio Zola 5107, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.583547599999996, lng: -58.4284683 },
    AddressComponents: null,
  },
  {
    Title: 'Modular Café',
    URL: 'https://www.google.com/maps?cid=16436040407702126542',
    List: ['Café de especialidad'],
    Address: 'Carlos Calvo 701, C1102 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.619658799999996, lng: -58.37584 },
    AddressComponents: null,
  },
  {
    Title: 'Ostia Cafe',
    URL: 'https://www.google.com/maps?cid=10501172966860285193',
    List: ['Café de especialidad'],
    Address: 'Jorge Luis Borges 1917, C1414DGG C1414DGG, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5866061, lng: -58.426710099999994 },
    AddressComponents: null,
  },
  {
    Title: 'Docena',
    URL: 'https://www.google.com/maps?cid=12227021942763096331',
    List: ['Café de especialidad'],
    Address: 'Guevara 356, C1427 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5872471, lng: -58.449763499999996 },
    AddressComponents: null,
  },
  {
    Title: 'Casa Nueza',
    URL: 'https://www.google.com/maps?cid=7242808262847959224',
    List: ['Café de especialidad'],
    Address: 'Gorriti 3681, C1172 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5954404, lng: -58.4163949 },
    AddressComponents: null,
  },
  {
    Title: 'Daniel Bakery',
    URL: 'https://www.google.com/maps?cid=11039797390836122701',
    List: ['Café de especialidad'],
    Address: 'Honduras 3714, C1180 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.594242099999995, lng: -58.414961399999996 },
    AddressComponents: null,
  },
  {
    Title: 'Café Razo',
    URL: 'https://www.google.com/maps?cid=7758059350961570264',
    List: ['Café de especialidad'],
    Address: 'Besares 2299, C1429DII C1429DII, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5445159, lng: -58.4696984 },
    AddressComponents: null,
  },
  {
    Title: 'Presencia Coffee',
    URL: 'https://www.google.com/maps?cid=4130661530482089736',
    List: ['Café de especialidad'],
    Address: 'Av. Alvear 1600, C1011 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.589887499999996, lng: -58.3859462 },
    AddressComponents: null,
  },
  {
    Title: 'Caversaschi & Co.',
    URL: 'https://www.google.com/maps?cid=17921289972773511236',
    List: ['Café de especialidad'],
    Address: 'Nicaragua 5510, B1414 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5823624, lng: -58.432829399999996 },
    AddressComponents: null,
  },
  {
    Title: 'Pastelería Labán',
    URL: 'https://www.google.com/maps?cid=11424276172834441245',
    List: ['Café de especialidad'],
    Address: 'Charcas 3656, C1425BMX Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5886504, lng: -58.416579199999994 },
    AddressComponents: null,
  },
  {
    Title: 'Esmero Café',
    URL: 'https://www.google.com/maps?cid=17291936053753402734',
    List: ['Café de especialidad'],
    Address: 'Libertad 1362, C1016 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5917123, lng: -58.384447099999996 },
    AddressComponents: null,
  },
  {
    Title: 'Artifice Café',
    URL: 'https://www.google.com/maps?cid=7650632524565231110',
    List: ['Café de especialidad'],
    Address: 'Godoy Cruz 1369, C1414 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5899512, lng: -58.4373672 },
    AddressComponents: null,
  },
  {
    Title: 'Chez Janu',
    URL: 'https://www.google.com/maps?cid=7255988537203060801',
    List: ['Café de especialidad'],
    Address: 'Echeverría 1310, C1428 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.556497799999995, lng: -58.4447951 },
    AddressComponents: null,
  },
  {
    Title: 'Hobby - Café de Especialidad',
    URL: 'https://www.google.com/maps?cid=6884239802471451301',
    List: ['Café de especialidad'],
    Address: 'Malabia 1343, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.592683, lng: -58.429688799999994 },
    AddressComponents: null,
  },
  {
    Title: 'Cora Cafe',
    URL: 'https://www.google.com/maps?cid=345599601109105939',
    List: ['Café de especialidad'],
    Address: 'Edificio Kavanagh, Florida 1045, C1005 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5955021, lng: -58.374838399999994 },
    AddressComponents: null,
  },
  {
    Title: 'Rosie Café',
    URL: 'https://www.google.com/maps?cid=7029193120353054597',
    List: ['Café de especialidad'],
    Address: 'Ruiz Huidobro 3049, C1429 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5468222, lng: -58.4786116 },
    AddressComponents: null,
  },
  {
    Title: 'BLANCA®',
    URL: 'https://www.google.com/maps?cid=9353525215095271978',
    List: ['Café de especialidad'],
    Address: 'Tagle 2589, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5838505, lng: -58.399884799999995 },
    AddressComponents: null,
  },
  {
    Title: 'Café Mar del Plata',
    URL: 'https://www.google.com/maps?cid=7620317392787548742',
    List: ['Café de especialidad'],
    Address: 'Añasco 2543, C1416 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5984675, lng: -58.4622308 },
    AddressComponents: null,
  },
  {
    Title: 'GRAMO CAFÉ',
    URL: 'https://www.google.com/maps?cid=12771586238298934534',
    List: ['Café de especialidad'],
    Address: 'Av. Dorrego 2517, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.575350799999995, lng: -58.4356941 },
    AddressComponents: null,
  },
  {
    Title: 'FRUTO CAFÉ',
    URL: 'https://www.google.com/maps?cid=13600374282177325132',
    List: ['Café de especialidad'],
    Address: 'José A. Cabrera 5939, C1414 BHK, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5829861, lng: -58.441640199999995 },
    AddressComponents: null,
  },
  {
    Title: 'Sicilia Deco e Caffe - Il Cortile',
    URL: 'https://www.google.com/maps?cid=5312020794956344270',
    List: ['Café de especialidad'],
    Address: 'Av. Dorrego 1588, C1414 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5833794, lng: -58.4445981 },
    AddressComponents: null,
  },
  {
    Title: 'Solileb',
    URL: 'https://www.google.com/maps?cid=13023935284547877410',
    List: ['Café de especialidad'],
    Address: 'Zapiola 1102, C1426 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.573487199999995, lng: -58.4535832 },
    AddressComponents: null,
  },
  {
    Title: 'Café Rotondo',
    URL: 'https://www.google.com/maps?cid=1156070602855627592',
    List: ['Café de especialidad'],
    Address: 'Av. Cerviño 3907, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.578549699999996, lng: -58.4133648 },
    AddressComponents: null,
  },
  {
    Title: 'Punto Café',
    URL: 'https://www.google.com/maps?cid=1470093313946778264',
    List: ['Café de especialidad'],
    Address: 'Carlos Pellegrini 999, C1009ABS C1009ABS, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5967165, lng: -58.381256699999994 },
    AddressComponents: null,
  },
  {
    Title: 'nano café2 Parera',
    URL: 'https://www.google.com/maps?cid=8130908770545748274',
    List: ['Café de especialidad'],
    Address: 'Parera 173, C1014 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.590887599999995, lng: -58.385242999999996 },
    AddressComponents: null,
  },
  {
    Title: 'Bulevar',
    URL: 'https://www.google.com/maps?cid=16479387814501991619',
    List: ['Café de especialidad'],
    Address: 'Monteagudo 209, C1437EVE C1437EVE, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.6402577, lng: -58.405181999999996 },
    AddressComponents: null,
  },
  {
    Title: 'casa Lharmonie',
    URL: 'https://www.google.com/maps?cid=14233453331077951308',
    List: ['Café de especialidad'],
    Address: 'Maure 1516, C1426 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.565245399999995, lng: -58.434608 },
    AddressComponents: null,
  },
  {
    Title: 'CAVERNA café de especialidad',
    URL: 'https://www.google.com/maps?cid=3383588562714470744',
    List: ['Café de especialidad'],
    Address: 'Marcos Sastre 92, B1706 Haedo, Provincia de Buenos Aires',
    Coordinates: { lat: -34.6451201, lng: -58.593269799999995 },
    AddressComponents: null,
  },
  {
    Title: 'Sorbito',
    URL: 'https://www.google.com/maps?cid=12878482801900013466',
    List: ['Café de especialidad'],
    Address: 'Espora 244, B1704 Ramos Mejía, Provincia de Buenos Aires',
    Coordinates: { lat: -34.6446191, lng: -58.5655729 },
    AddressComponents: null,
  },
  {
    Title: 'Venus Cafe',
    URL: 'https://www.google.com/maps?cid=1846602445548019245',
    List: ['Café de especialidad'],
    Address: 'C1414 Buenos Aires',
    Coordinates: { lat: -34.5815075, lng: -58.4436319 },
    AddressComponents: null,
  },
  {
    Title: 'Zulu Haus',
    URL: 'https://www.google.com/maps?cid=6164807421842117051',
    List: ['Café de especialidad'],
    Address: 'Salvador Debenedetti 635, B1637 La Lucila, Provincia de Buenos Aires',
    Coordinates: { lat: -34.4976566, lng: -58.4888188 },
    AddressComponents: null,
  },
  {
    Title: 'Doxa Cafe y Vino',
    URL: 'https://www.google.com/maps?cid=3854452607765588651',
    List: ['Café de especialidad'],
    Address: 'Cabello 3965, C1425 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5793022, lng: -58.414884799999996 },
    AddressComponents: null,
  },
  {
    Title: 'Café Colegiales II',
    URL: 'https://www.google.com/maps?cid=4221500908070531499',
    List: ['Café de especialidad'],
    Address: 'Céspedes 3394, C1426DVJ C1426DVJ, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5780554, lng: -58.454113199999995 },
    AddressComponents: null,
  },
  {
    Title: 'Báltica Café',
    URL: 'https://www.google.com/maps?cid=3463126008063956018',
    List: ['Café de especialidad'],
    Address: 'Quesada 1798, C1429 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.551301099999996, lng: -58.457074899999995 },
    AddressComponents: null,
  },
  {
    Title: 'CUADRA',
    URL: 'https://www.google.com/maps?cid=4572300152437104987',
    List: ['Café de especialidad'],
    Address: 'Concepción Arenal 3774, C1427 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.586464299999996, lng: -58.4476004 },
    AddressComponents: null,
  },
  {
    Title: 'Morro Café',
    URL: 'https://www.google.com/maps?cid=7404280065021943986',
    List: ['Café de especialidad'],
    Address: 'Sucre 3010, C1428 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5674342, lng: -58.4608235 },
    AddressComponents: null,
  },
  {
    Title: 'SOSA Café',
    URL: 'https://www.google.com/maps?cid=5281459577579665669',
    List: ['Café de especialidad'],
    Address: 'Moldes 653, C1426ALA C1426ALA, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5725318, lng: -58.4470278 },
    AddressComponents: null,
  },
  {
    Title: 'Cerezo bar',
    URL: 'https://www.google.com/maps?cid=15730977218197360558',
    List: ['Café de especialidad'],
    Address: 'Cap. Gral. Ramón Freire 2277, C1428CZE C1428CZE, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.564972499999996, lng: -58.465659499999994 },
    AddressComponents: null,
  },
  {
    Title: 'Batata Cofi',
    URL: 'https://www.google.com/maps?cid=8231294986076349923',
    List: ['Café de especialidad'],
    Address: 'Florentino Ameghino 908, B1870 Avellaneda, Provincia de Buenos Aires',
    Coordinates: { lat: -34.6625116, lng: -58.3617779 },
    AddressComponents: null,
  },
  {
    Title: 'Dopo Café y Vino',
    URL: 'https://www.google.com/maps?cid=13463889812326462105',
    List: ['Café de especialidad'],
    Address: 'José A. Cabrera 5002, C1414 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5899907, lng: -58.4323997 },
    AddressComponents: null,
  },
  {
    Title: 'Canillita',
    URL: 'https://www.google.com/maps?cid=6693621299717303450',
    List: ['Café de especialidad'],
    Address: 'Junín 926, C1113AAC, C1113AAD C1113AAC, Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5984007, lng: -58.3975295 },
    AddressComponents: null,
  },
  {
    Title: 'Zur Café',
    URL: 'https://www.google.com/maps?cid=9985678046877538230',
    List: ['Café de especialidad'],
    Address: 'Honduras 5857, C1414 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5820382, lng: -58.4388669 },
    AddressComponents: null,
  },
  {
    Title: 'Medio Pan y un Libro Café',
    URL: 'https://www.google.com/maps?cid=12294996475492617016',
    List: ['Café de especialidad'],
    Address: 'Virrey Avilés 3686, C1427 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5772851, lng: -58.462213 },
    AddressComponents: null,
  },
  {
    Title: 'La Ventana x Anafe - Café de especialidad',
    URL: 'https://www.google.com/maps?cid=13857141147601971827',
    List: ['Café de especialidad'],
    Address: 'Arévalo 1375, C1414 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5842513, lng: -58.443799899999995 },
    AddressComponents: null,
  },
  {
    Title: 'Crecia Bolleria',
    URL: 'https://www.google.com/maps?cid=8902066211991510550',
    List: ['Café de especialidad'],
    Address: 'Juncal 2179, C1125 Cdad. Autónoma de Buenos Aires',
    Coordinates: { lat: -34.5925355, lng: -58.3983327 },
    AddressComponents: null,
  },
  {
    Title: 'MUCHO',
    URL: 'https://www.google.com/maps?cid=13920317235630806190',
    List: ['Café de especialidad'],
    Address: 'Conesa 2686, C1428 Buenos Aires',
    Coordinates: { lat: -34.560219599999996, lng: -58.466789 },
    AddressComponents: null,
  },
  {
    Title: 'Astrid Pastelería - Café',
    URL: 'https://www.google.com/maps?cid=2050520187430592602',
    List: ['Café de especialidad'],
    Address: 'Manuel Ugarte 2198, C1428 CABA',
    Coordinates: { lat: -34.5553271, lng: -58.4594557 },
    AddressComponents: null,
  },
  {
    Title: 'Siba Café',
    URL: 'https://www.google.com/maps?cid=8390202047336073511',
    List: ['Café de especialidad'],
    Address: 'Montañeses 2999, C1428 CABA',
    Coordinates: { lat: -34.5492318, lng: -58.4559697 },
    AddressComponents: null,
  },
  {
    Title: 'Bandido cafe',
    URL: 'https://www.google.com/maps?cid=11167444934079281448',
    List: ['Café de especialidad'],
    Address: 'Ciudad Autónoma de Buenos Aires AR, Bartolomé Cerretti 80, B1846 Adrogué',
    Coordinates: { lat: -34.8010825, lng: -58.3854282 },
    AddressComponents: null,
  },
  {
    Title: 'MANIFIESTO (SUC. BELGRANO)',
    URL: 'https://www.google.com/maps?cid=16717609145925722569',
    List: ['Café de especialidad'],
    Address: 'Aguilar 2104, C1426 CABA',
    Coordinates: { lat: -34.567202699999996, lng: -58.445423999999996 },
    AddressComponents: null,
  },
  {
    Title: 'Cover Cafe',
    URL: 'https://www.google.com/maps?cid=17427595076749293934',
    List: ['Café de especialidad'],
    Address: 'Jorge Luis Borges 2008, Buenos Aires',
    Coordinates: { lat: -34.5858985, lng: -58.4260978 },
    AddressComponents: null,
  },
  {
    Title: 'La Filial Café',
    URL: 'https://www.google.com/maps?cid=14824499125691442586',
    List: ['Café de especialidad'],
    Address: 'Olaya 1023, Buenos Aires',
    Coordinates: { lat: -34.607611, lng: -58.4424966 },
    AddressComponents: null,
  },
  {
    Title: 'Meme Coffee',
    URL: 'https://www.google.com/maps?cid=7529806024135354813',
    List: ['Café de especialidad'],
    Address: 'Av. Dorrego 2591, C1425 CABA',
    Coordinates: { lat: -34.5746981, lng: -58.434585999999996 },
    AddressComponents: null,
  },
  {
    Title: 'Boreal - Café de Especialidad',
    URL: 'https://www.google.com/maps?cid=9066471120284725436',
    List: ['Café de especialidad'],
    Address: 'Asunción 4011, C1419 CABA',
    Coordinates: { lat: -34.6008117, lng: -58.5112537 },
    AddressComponents: null,
  },
  {
    Title: 'The Shelter Coffee',
    URL: 'https://www.google.com/maps?cid=9377140394292403883',
    List: ['Café de especialidad'],
    Address: 'Av. del Libertador 13131, B1640AOC Martínez, Provincia de Buenos Aires',
    Coordinates: { lat: -34.489402, lng: -58.4848797 },
    AddressComponents: null,
  },
  {
    Title: 'Gato Blanco Coffee',
    URL: 'https://www.google.com/maps?cid=15796773941576909695',
    List: ['Café de especialidad'],
    Address: 'Concordia 699, C1407 CABA',
    Coordinates: { lat: -34.6248001, lng: -58.4790019 },
    AddressComponents: null,
  },
  {
    Title: 'La Kitchen',
    URL: 'https://www.google.com/maps?cid=8032284953641593615',
    List: ['Café de especialidad'],
    Address: 'Roseti 1360, C1427BWB C1427BWB, Buenos Aires',
    Coordinates: { lat: -34.5819271, lng: -58.4613939 },
    AddressComponents: null,
  },
  {
    Title: 'Tueste',
    URL: 'https://www.google.com/maps?cid=3789005876481781109',
    List: ['Café de especialidad'],
    Address: 'Doblas 692, C1424 CABA',
    Coordinates: { lat: -34.6250947, lng: -58.430043399999995 },
    AddressComponents: null,
  },
  {
    Title: 'Jungla Plantas y Café',
    URL: 'https://www.google.com/maps?cid=6660941994433412326',
    List: ['Café de especialidad'],
    Address: 'Guevara, Concepción Arenal 202 Esquina, C1427 CABA',
    Coordinates: { lat: -34.5878501, lng: -58.4482729 },
    AddressComponents: null,
  },
  {
    Title: 'Café Galpón',
    URL: 'https://www.google.com/maps?cid=5216498395285912808',
    List: ['Café de especialidad'],
    Address: 'Leopoldo Marechal 866, C1405 CABA',
    Coordinates: { lat: -34.608056999999995, lng: -58.4377218 },
    AddressComponents: null,
  },
  {
    Title: 'Fomento Café',
    URL: 'https://www.google.com/maps?cid=8637785799120059403',
    List: ['Café de especialidad'],
    Address: 'Zapiola 2402, C1428CXL C1428CXL, Buenos Aires',
    Coordinates: { lat: -34.563137, lng: -58.4659475 },
    AddressComponents: null,
  },
  {
    Title: 'Valore Coffee Company',
    URL: 'https://www.google.com/maps?cid=11040682130190148874',
    List: ['Café de especialidad'],
    Address: 'Federico Lacroze 3578, C1427 CABA',
    Coordinates: { lat: -34.5813214, lng: -58.4512511 },
    AddressComponents: null,
  },
  {
    Title: 'BLANCA Studio',
    URL: 'https://www.google.com/maps?cid=341529410505734722',
    List: ['Café de especialidad'],
    Address: 'Av. Álvarez Thomas 758, C1427 CABA',
    Coordinates: { lat: -34.579990099999996, lng: -58.452954 },
    AddressComponents: null,
  },
  {
    Title: 'Melodra – Café de Especialidad',
    URL: 'https://www.google.com/maps?cid=5327068736316639563',
    List: ['Café de especialidad'],
    Address: 'San Martín 657, C1004 CABA',
    Coordinates: { lat: -34.6004383, lng: -58.3739704 },
    AddressComponents: null,
  },
  {
    Title: 'Toki Moment - Specialty Coffee',
    URL: 'https://www.google.com/maps?cid=10045607369663633012',
    List: ['Café de especialidad'],
    Address: 'Marcelo Torcuato de Alvear 664, C1058 CABA',
    Coordinates: { lat: -34.5964186, lng: -58.376334899999996 },
    AddressComponents: null,
  },
  {
    Title: 'Hobby Café',
    URL: 'https://www.google.com/maps?cid=10839182669461063000',
    List: ['Café de especialidad'],
    Address: 'Guevara 91, C1427 CABA',
    Coordinates: { lat: -34.5881719, lng: -58.446989599999995 },
    AddressComponents: null,
  },
  {
    Title: 'Tiny Coffee Shop',
    URL: 'https://www.google.com/maps?cid=4226804670018832069',
    List: ['Café de especialidad'],
    Address: 'Zapata 500, C1426 CABA',
    Coordinates: { lat: -34.5725374, lng: -58.4427871 },
    AddressComponents: null,
  },
  {
    Title: 'Nano Café',
    URL: 'https://www.google.com/maps?cid=6618416402979824996',
    List: ['Café de especialidad'],
    Address: 'Arcos 1514, C1426 Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.5659894, lng: -58.4492013 },
    AddressComponents: null,
  },
  {
    Title: 'Clorindo café',
    URL: 'https://www.google.com/maps?cid=4405340606121094207',
    List: ['Café de especialidad'],
    Address: 'Talcahuano 1261, C1012 CABA',
    Coordinates: { lat: -34.593587, lng: -58.385768899999995 },
    AddressComponents: null,
  },
  {
    Title: 'Café Jazmin + Narda Lepes',
    URL: 'https://www.google.com/maps?cid=17454780261684929592',
    List: ['Café de especialidad'],
    Address: 'Armenia 1700 1425, C1414DKI CABA',
    Coordinates: { lat: -34.5895058, lng: -58.4272065 },
    AddressComponents: null,
  },
  {
    Title: 'Surry Hills Arevalo',
    URL: 'https://www.google.com/maps?cid=15336736801749232391',
    List: ['Café de especialidad'],
    Address: 'Arévalo 2877, C1426DJC CABA',
    Coordinates: { lat: -34.572268799999996, lng: -58.4312531 },
    AddressComponents: null,
  },
  {
    Title: 'CUADRA',
    URL: 'https://www.google.com/maps?cid=13963122207372413850',
    List: ['Café de especialidad'],
    Address: 'Concepción Arenal 2629, C1426DGA CABA',
    Coordinates: { lat: -34.5761876, lng: -58.439501699999994 },
    AddressComponents: null,
  },
  {
    Title: 'Darien Café',
    URL: 'https://www.google.com/maps?cid=2143828015520798857',
    List: ['Café de especialidad'],
    Address: 'Av. Dr. Honorio Pueyrredón 1534, C1414 CABA',
    Coordinates: { lat: -34.6037545, lng: -58.449330499999995 },
    AddressComponents: null,
  },
  {
    Title: 'Vedra Cafe',
    URL: 'https://www.google.com/maps?cid=14246916547333405503',
    List: ['Café de especialidad'],
    Address: 'Vuelta de Obligado 2613, C1428 CABA',
    Coordinates: { lat: -34.5565493, lng: -58.4597674 },
    AddressComponents: null,
  },
  {
    Title: 'ifigenia Café',
    URL: 'https://www.google.com/maps?cid=7577278380597097705',
    List: ['Café de especialidad'],
    Address: 'Gral. César Díaz 2249, C1416 CABA',
    Coordinates: { lat: -34.6202476, lng: -58.372993599999994 },
    AddressComponents: null,
  },
  {
    Title: 'La Chatita Cafetería',
    URL: 'https://www.google.com/maps?cid=5258096783566224691',
    List: ['Café de especialidad'],
    Address: 'El Salvador 4068, C1175 C1175ACF, Buenos Aires',
    Coordinates: { lat: -34.592816, lng: -58.4201549 },
    AddressComponents: null,
  },
  {
    Title: 'Silvestre pan & café',
    URL: 'https://www.google.com/maps?cid=8012237761435302641',
    List: ['Café de especialidad'],
    Address: 'Charlone 300, C1427 CABA',
    Coordinates: { lat: -34.5840075, lng: -58.4491312 },
    AddressComponents: null,
  },
  {
    Title: 'Piccolina cafe',
    URL: 'https://www.google.com/maps?cid=11841565750508483525',
    List: ['Café de especialidad'],
    Address: 'Fray Justo Sta. María de Oro 2148, C1425 FOD, Buenos Aires',
    Coordinates: { lat: -34.582929299999996, lng: -58.4278051 },
    AddressComponents: null,
  },
  {
    Title: 'Surch café',
    URL: 'https://www.google.com/maps?cid=1784375403077085607',
    List: ['Café de especialidad'],
    Address: 'Vicente López, Buenos Aires Province',
    Coordinates: { lat: -34.5230671, lng: -58.474866899999995 },
    AddressComponents: null,
  },
  {
    Title: 'Cuervo Café',
    URL: 'https://www.google.com/maps?cid=5268807433237530469',
    List: ['Café de especialidad'],
    Address: 'Av. Juramento 1284, C1428DMN C1428DMN, Buenos Aires',
    Coordinates: { lat: -34.555365099999996, lng: -58.4452079 },
    AddressComponents: null,
  },
  {
    Title: 'Vive Café',
    URL: 'https://www.google.com/maps?cid=635984939353951849',
    List: ['Café de especialidad'],
    Address: 'Av. Álvarez Thomas 1500, C1427 CABA',
    Coordinates: { lat: -34.5785609, lng: -58.4631427 },
    AddressComponents: null,
  },
  {
    Title: 'Raíz - Café de especialidad',
    URL: 'https://www.google.com/maps?cid=18284939565218601541',
    List: ['Café de especialidad'],
    Address: 'Aguirre 1015, C1414 CABA',
    Coordinates: { lat: -34.593047, lng: -58.439831 },
    AddressComponents: null,
  },
  {
    Title: 'Borja Café X Cande Molfese',
    URL: 'https://www.google.com/maps?cid=17228784704254121749',
    List: ['Café de especialidad'],
    Address: 'República de la India, Cabello &, C1425 Buenos Aires',
    Coordinates: { lat: -34.5794644, lng: -58.415445999999996 },
    AddressComponents: null,
  },
  {
    Title: 'Marcia',
    URL: 'https://www.google.com/maps?cid=9063038586188031502',
    List: ['Café de especialidad'],
    Address: 'Capdevila 2899, C1431 CABA',
    Coordinates: { lat: -34.5705844, lng: -58.4893776 },
    AddressComponents: null,
  },
  {
    Title: 'BLANCA Deco & Café',
    URL: 'https://www.google.com/maps?cid=7609271938932249737',
    List: ['Café de especialidad'],
    Address: 'Sinclair 3136, C1425 CABA',
    Coordinates: { lat: -34.5735782, lng: -58.4228415 },
    AddressComponents: null,
  },
  {
    Title: 'Sicilia Deco e Caffe',
    URL: 'https://www.google.com/maps?cid=10115164464659420158',
    List: ['Café de especialidad'],
    Address: 'Dr. Luis Beláustegui 700, C1416CXD CABA',
    Coordinates: { lat: -34.6030684, lng: -58.452339699999996 },
    AddressComponents: null,
  },
  {
    Title: 'KROP FINEST CØFFEE',
    URL: 'https://www.google.com/maps?cid=5009141596895529325',
    List: ['Café de especialidad'],
    Address: 'Migueletes 1041, C1426BUM CABA',
    Coordinates: { lat: -34.5648279, lng: -58.436653 },
    AddressComponents: null,
  },
  {
    Title: 'Kopi cafe',
    URL: 'https://www.google.com/maps?cid=14111606929296775798',
    List: ['Café de especialidad'],
    Address: 'Báez 419, C1426BRI Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.5711126, lng: -58.4324793 },
    AddressComponents: null,
  },
  {
    Title: 'Jaramillo cafe',
    URL: 'https://www.google.com/maps?cid=6156428028938301955',
    List: ['Café de especialidad'],
    Address: '11 de Septiembre de 1888 3700, C1429BIR CABA',
    Coordinates: { lat: -34.5448728, lng: -58.4621569 },
    AddressComponents: null,
  },
  {
    Title: "Togni's Café",
    URL: 'https://www.google.com/maps?cid=14354487813113662551',
    List: ['Café de especialidad'],
    Address: 'Blanco Encalada 1675, C1428 CABA',
    Coordinates: { lat: -34.5550298, lng: -58.4522595 },
    AddressComponents: null,
  },
  {
    Title: 'Vecindario',
    URL: 'https://www.google.com/maps?cid=2060789962290825775',
    List: ['Café de especialidad'],
    Address: 'Malabia 691, C1414 CABA',
    Coordinates: { lat: -34.5970442, lng: -58.4365725 },
    AddressComponents: null,
  },
  {
    Title: 'Cafe Gutierrez',
    URL: 'https://www.google.com/maps?cid=16913011337917378787',
    List: ['Café de especialidad'],
    Address: 'Juan María Gutiérrez 2637, C1425AQC, C1425 CABA',
    Coordinates: { lat: -34.5868472, lng: -58.3995156 },
    AddressComponents: null,
  },
  {
    Title: 'Café Bar',
    URL: 'https://www.google.com/maps?cid=2667419380379381630',
    List: ['Café de especialidad'],
    Address: 'Aguirre 902, C1414 CABA',
    Coordinates: { lat: -34.5941432, lng: -58.439087799999996 },
    AddressComponents: null,
  },
  {
    Title: 'Oliba',
    URL: 'https://www.google.com/maps?cid=10574805800222930375',
    List: ['Café de especialidad'],
    Address: 'C1414BTN, Costa Rica 6020, C1414BTN CABA',
    Coordinates: { lat: -34.5793295, lng: -58.4391353 },
    AddressComponents: null,
  },
  {
    Title: 'San Cafe',
    URL: 'https://www.google.com/maps?cid=2521855111987160618',
    List: ['Café de especialidad'],
    Address: 'Paraguay 3511, C1425 CABA',
    Coordinates: { lat: -34.592168799999996, lng: -58.414467599999995 },
    AddressComponents: null,
  },
  {
    Title: 'Tónico Café',
    URL: 'https://www.google.com/maps?cid=7871420761202746841',
    List: ['Café de especialidad'],
    Address: 'Riobamba 1173, C1116 CABA',
    Coordinates: { lat: -34.595093, lng: -58.394496 },
    AddressComponents: null,
  },
  {
    Title: 'FORMA Café',
    URL: 'https://www.google.com/maps?cid=15262679490692019860',
    List: ['Café de especialidad'],
    Address: 'Ramallo 2268, C1429 CABA',
    Coordinates: { lat: -34.5422934, lng: -58.470935999999995 },
    AddressComponents: null,
  },
  {
    Title: 'BORRA caffè',
    URL: 'https://www.google.com/maps?cid=4300840755496956403',
    List: ['Café de especialidad'],
    Address: 'Lerma 600, C1414 CABA',
    Coordinates: { lat: -34.593310599999995, lng: -58.432991099999995 },
    AddressComponents: null,
  },
  {
    Title: 'Rita Specialty Coffee',
    URL: 'https://www.google.com/maps?cid=4898600259177415633',
    List: ['Café de especialidad'],
    Address: 'Amenábar 3361, C1429 CABA',
    Coordinates: { lat: -34.5521996, lng: -58.4682823 },
    AddressComponents: null,
  },
  {
    Title: 'Walden café',
    URL: 'https://www.google.com/maps?cid=13034867067354785045',
    List: ['Café de especialidad'],
    Address: 'Gurruchaga 1195, C1414 CABA',
    Coordinates: { lat: -34.592421, lng: -58.433842999999996 },
    AddressComponents: null,
  },
  {
    Title: 'Hijos del Mar',
    URL: 'https://www.google.com/maps?cid=14762851373291966331',
    List: ['Café de especialidad'],
    Address: 'Zapiola 799, C1426 CABA',
    Coordinates: { lat: -34.5753485, lng: -58.449281799999994 },
    AddressComponents: null,
  },
  {
    Title: 'Cuervo Cafe (Chacarita)',
    URL: 'https://www.google.com/maps?cid=10634705196734684534',
    List: ['Café de especialidad'],
    Address: 'Guevara 393, C1427 CABA',
    Coordinates: { lat: -34.5869263, lng: -58.449965299999995 },
    AddressComponents: null,
  },
  {
    Title: 'Barragán Lonchería y Café',
    URL: 'https://www.google.com/maps?cid=8935541560231990829',
    List: ['Café de especialidad'],
    Address: 'Nicasio Oroño 1195, C1416 CABA',
    Coordinates: { lat: -34.6112378, lng: -58.456514899999995 },
    AddressComponents: null,
  },
  {
    Title: 'Dicha Café',
    URL: 'https://www.google.com/maps?cid=7452051181453670083',
    List: ['Café de especialidad'],
    Address: 'Av. Congreso 3321, C1430 CABA',
    Coordinates: { lat: -34.5602704, lng: -58.472046399999996 },
    AddressComponents: null,
  },
  {
    Title: 'Amelia Café',
    URL: 'https://www.google.com/maps?cid=12419231309368401768',
    List: ['Café de especialidad'],
    Address: 'Rojas 702, C1405 Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.612699899999996, lng: -58.4449664 },
    AddressComponents: null,
  },
  {
    Title: 'Bee Coffee - Café de especialidad',
    URL: 'https://www.google.com/maps?cid=7924811809655365946',
    List: ['Café de especialidad'],
    Address: 'Echeverría 2923, C1428DSA Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.5658324, lng: -58.4608862 },
    AddressComponents: null,
  },
  {
    Title: 'ISPICA Caffe e Pasticceria',
    URL: 'https://www.google.com/maps?cid=16098825392822729935',
    List: ['Café de especialidad'],
    Address: 'Gorriti 5295, C1414 Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.5875108, lng: -58.433759099999996 },
    AddressComponents: null,
  },
  {
    Title: 'Cruasan',
    URL: 'https://www.google.com/maps?cid=9398872854398706962',
    List: ['Café de especialidad'],
    Address: 'Av. Olazábal 3827, C1713BQE Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.5689397, lng: -58.473272099999996 },
    AddressComponents: null,
  },
  {
    Title: 'Cofi Jaus',
    URL: 'https://www.google.com/maps?cid=12282732242278821776',
    List: ['Café de especialidad'],
    Address: 'Av. Bartolomé Mitre 2160, B1605BTO Vicente López, Provincia de Buenos Aires, Argentina',
    Coordinates: { lat: -34.530187, lng: -58.515736 },
    AddressComponents: {
      street: '2160 Avenida Bartolomé Mitre',
      city: 'Munro',
      state: 'Buenos Aires',
      zip: '1605',
      country: 'Argentina',
    },
  },
  {
    Title: 'Compadre bike & coffee',
    URL: 'https://www.google.com/maps?cid=1800855728628303863',
    List: ['Café de especialidad'],
    Address: 'Av. Gral. Mosconi 4300, C1419 Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.596713799999996, lng: -58.518975299999994 },
    AddressComponents: null,
  },
  {
    Title: 'Atelier Fuerza Dos',
    URL: 'https://www.google.com/maps?cid=1756019358132759069',
    List: ['Café de especialidad'],
    Address: 'Superí 1276, C1426BAD Cdad. Autónoma de Buenos Aires, Argentina',
    Coordinates: { lat: -34.5750242, lng: -58.4579423 },
    AddressComponents: null,
  },
  {
    Title: 'LAB. Training Center & Coffee Shop',
    URL: 'https://www.google.com/maps?cid=10152841826580314604',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5860009, lng: -58.4368973 },
    AddressComponents: null,
  },
  {
    Title: 'FRUTO CAFÉ',
    URL: 'https://www.google.com/maps?cid=15950237864226029510',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5859867, lng: -58.425797499999994 },
    AddressComponents: null,
  },
  {
    Title: 'Juani Café (Specialty coffee)',
    URL: 'https://www.google.com/maps?cid=4865570075222895010',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5935114, lng: -58.4250407 },
    AddressComponents: null,
  },
  {
    Title: 'RVR Café.',
    URL: 'https://www.google.com/maps?cid=17406835880195435018',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5937719, lng: -58.4318227 },
    AddressComponents: null,
  },
  {
    Title: 'JISU',
    URL: 'https://www.google.com/maps?cid=5551039225167072997',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5990909, lng: -58.3644286 },
    AddressComponents: null,
  },
  {
    Title: 'Vive Café',
    URL: 'https://www.google.com/maps?cid=11374571609754323316',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.581756, lng: -58.4360058 },
    AddressComponents: null,
  },
  {
    Title: 'Cuervo Café',
    URL: 'https://www.google.com/maps?cid=4339105063233013450',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5809409, lng: -58.436678 },
    AddressComponents: null,
  },
  {
    Title: 'BORJA SPECIALTY COFFEE',
    URL: 'https://www.google.com/maps?cid=15168335462933671006',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5642669, lng: -58.4601519 },
    AddressComponents: null,
  },
  {
    Title: 'Hábito Café',
    URL: 'https://www.google.com/maps?cid=990193823863489639',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.6149987, lng: -58.3744405 },
    AddressComponents: null,
  },
  {
    Title: 'Good Joe - Coffee to go',
    URL: 'https://www.google.com/maps?cid=10375500308621230322',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5613102, lng: -58.4645474 },
    AddressComponents: null,
  },
  {
    Title: 'BLU CAFE',
    URL: 'https://www.google.com/maps?cid=424731638061335621',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.466283499999996, lng: -58.5071218 },
    AddressComponents: null,
  },
  {
    Title: 'Café Colegiales',
    URL: 'https://www.google.com/maps?cid=4525040240656183764',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5730254, lng: -58.4486163 },
    AddressComponents: null,
  },
  {
    Title: 'CUADRA',
    URL: 'https://www.google.com/maps?cid=17345639781767075078',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.549928099999995, lng: -58.461926399999996 },
    AddressComponents: null,
  },
  {
    Title: 'BLANCA Deco & Café',
    URL: 'https://www.google.com/maps?cid=2391761664025479388',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5646565, lng: -58.4391481 },
    AddressComponents: null,
  },
  {
    Title: 'Mulata',
    URL: 'https://www.google.com/maps?cid=9385411317407223103',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.589258, lng: -58.42368 },
    AddressComponents: null,
  },
  {
    Title: 'Salvaje Bakery',
    URL: 'https://www.google.com/maps?cid=6783284434165223701',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5807461, lng: -58.442086599999996 },
    AddressComponents: null,
  },
  {
    Title: 'Usina Cafetera',
    URL: 'https://www.google.com/maps?cid=16750565413861666885',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5772569, lng: -58.481533199999994 },
    AddressComponents: null,
  },
  {
    Title: 'NEGRO Cueva de café',
    URL: 'https://www.google.com/maps?cid=958392489908918747',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.6008782, lng: -58.3795684 },
    AddressComponents: null,
  },
  {
    Title: 'Lattente',
    URL: 'https://www.google.com/maps?cid=1723568768618317836',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.58619, lng: -58.428059399999995 },
    AddressComponents: null,
  },
  {
    Title: 'Rondó Cafe',
    URL: 'https://www.google.com/maps?cid=16261884404300353214',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5964515, lng: -58.3872739 },
    AddressComponents: null,
  },
  {
    Title: 'Cuervo Café',
    URL: 'https://www.google.com/maps?cid=15670044895945950604',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5903849, lng: -58.4258604 },
    AddressComponents: null,
  },
  {
    Title: 'ÖSS Kaffe',
    URL: 'https://www.google.com/maps?cid=16653767050646370241',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5545617, lng: -58.4558524 },
    AddressComponents: null,
  },
  {
    Title: 'I AM BARISTA',
    URL: 'https://www.google.com/maps?cid=12194791143986595557',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.6242267, lng: -58.4767551 },
    AddressComponents: null,
  },
  {
    Title: 'La Motofeca',
    URL: 'https://www.google.com/maps?cid=4466795309704533333',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5974387, lng: -58.3758771 },
    AddressComponents: null,
  },
  {
    Title: 'HACIENDA',
    URL: 'https://www.google.com/maps?cid=88967763314736589',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5880355, lng: -58.4249817 },
    AddressComponents: null,
  },
  {
    Title: 'Hábito Café',
    URL: 'https://www.google.com/maps?cid=17531144171747439761',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.6153903, lng: -58.3824091 },
    AddressComponents: null,
  },
  {
    Title: 'La Bici - Café de Especialidad',
    URL: 'https://www.google.com/maps?cid=6838855479475441156',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5787275, lng: -58.442912299999996 },
    AddressComponents: null,
  },
  {
    Title: 'Estilo Barista Café',
    URL: 'https://www.google.com/maps?cid=13080774920585060388',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5940073, lng: -58.3830093 },
    AddressComponents: null,
  },
  {
    Title: 'The Shelter Coffee',
    URL: 'https://www.google.com/maps?cid=17101517998636889585',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5916026, lng: -58.3808267 },
    AddressComponents: null,
  },
  {
    Title: 'All Saints Cafe',
    URL: 'https://www.google.com/maps?cid=15017645880134838391',
    List: ['Café de especialidad'],
    Address: null,
    Coordinates: { lat: -34.5608685, lng: -58.4593425 },
    AddressComponents: null,
  },
];

const CENTROIDES_BARRIOS_REFERENCIA: Record<string, { lat: number; lng: number }> = {
  Saavedra: { lat: -34.5545, lng: -58.4775 },
  Núñez: { lat: -34.5488, lng: -58.4635 },
  Belgrano: { lat: -34.5615, lng: -58.4565 },
  Colegiales: { lat: -34.5742, lng: -58.4492 },
  Chacarita: { lat: -34.5858, lng: -58.4495 },
  'Villa Ortúzar': { lat: -34.5808, lng: -58.4612 },
  'Villa Urquiza': { lat: -34.5735, lng: -58.4848 },
  Coghlan: { lat: -34.5602, lng: -58.4735 },
  Palermo: { lat: -34.5855, lng: -58.4265 },
  'Villa Crespo': { lat: -34.5945, lng: -58.4385 },
  Recoleta: { lat: -34.5905, lng: -58.3955 },
  Retiro: { lat: -34.5955, lng: -58.3775 },
  'San Nicolás': { lat: -34.6005, lng: -58.3805 },
  'Puerto Madero': { lat: -34.6115, lng: -58.3625 },
  'San Telmo': { lat: -34.6202, lng: -58.3735 },
  Monserrat: { lat: -34.6152, lng: -58.3795 },
  Caballito: { lat: -34.6125, lng: -58.4425 },
  'Villa General Mitre': { lat: -34.6085, lng: -58.4595 },
  Paternal: { lat: -34.6025, lng: -58.4555 },
  'Villa Devoto': { lat: -34.5985, lng: -58.5125 },
  Floresta: { lat: -34.6245, lng: -58.4775 },
  'Parque Patricios': { lat: -34.6395, lng: -58.4052 },
  Almagro: { lat: -34.6055, lng: -58.4195 },
};

function calcularDistanciaSimpleMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function inferirBarrioPorCoordenadasYDireccion(
  lat: number,
  lng: number,
  address: string | null
): { barrio: string; esCaba: boolean; direccionLimpia: string } {
  const addr = (address || '').trim();
  const lower = addr.toLowerCase();

  // Detectar si está en Provincia de Buenos Aires (fuera de CABA)
  if (
    lower.includes('provincia de buenos aires') ||
    lower.includes('buenos aires province') ||
    lower.includes('vicente lópez') ||
    lower.includes('martínez') ||
    lower.includes('la lucila') ||
    lower.includes('haedo') ||
    lower.includes('ramos mejía') ||
    lower.includes('avellaneda') ||
    lower.includes('adrogué') ||
    lat > -34.534 ||
    lat < -34.66 ||
    lng < -58.535
  ) {
    return {
      barrio: 'GBA (Fuera de CABA)',
      esCaba: false,
      direccionLimpia: addr || `Coordenadas (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    };
  }

  let mejorBarrio = 'Palermo';
  let menorDist = Number.POSITIVE_INFINITY;
  for (const [barrio, coords] of Object.entries(CENTROIDES_BARRIOS_REFERENCIA)) {
    const dist = calcularDistanciaSimpleMetros(lat, lng, coords.lat, coords.lng);
    if (dist < menorDist) {
      menorDist = dist;
      mejorBarrio = barrio;
    }
  }

  const direccionLimpia = addr
    ? addr
        .replace(/,\s*C\d{4}[A-Z]*\s*/gi, ', ')
        .replace(/,\s*B\d{4}[A-Z]*\s*/gi, ', ')
        .replace(/Cdad\.\s*Autónoma de Buenos Aires/gi, 'CABA')
        .replace(/,\s*Argentina$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : `${mejorBarrio}, CABA`;

  return {
    barrio: mejorBarrio,
    esCaba: true,
    direccionLimpia,
  };
}

/**
 * Catálogo procesado y geolocalizado de los Cafés HUB del usuario.
 */
export const CATALOGO_CAFES_ESPECIALIDAD_HUB: CafeHubCurado[] = RAW_GOOGLE_MAPS_CAFES_HUB.map(
  (item, idx) => {
    const info = inferirBarrioPorCoordenadasYDireccion(
      item.Coordinates.lat,
      item.Coordinates.lng,
      item.Address
    );
    return {
      id: `cafe-hub-${idx + 1}`,
      nombre: item.Title.trim(),
      urlGoogleMaps: item.URL,
      direccion: info.direccionLimpia,
      barrio: info.barrio,
      esCaba: info.esCaba,
      lat: item.Coordinates.lat,
      lng: item.Coordinates.lng,
    };
  }
);

/**
 * Catálogo filtrado únicamente a Cafés HUB dentro de CABA (para los circuitos de adhesión CABA).
 */
export const CATALOGO_CAFES_HUB_CABA: CafeHubCurado[] = CATALOGO_CAFES_ESPECIALIDAD_HUB.filter(
  (c) => c.esCaba
);

/**
 * Devuelve los N Cafés HUB de la lista oficial del usuario más cercanos a una coordenada (lat, lng).
 */
export function listarCafesHubCercanos(
  lat: number,
  lng: number,
  limite = 3,
  soloCaba = true
): (CafeHubCurado & { distanciaMetros: number; minutosCaminando: number; cuadrasAprox: number })[] {
  const base = soloCaba ? CATALOGO_CAFES_HUB_CABA : CATALOGO_CAFES_ESPECIALIDAD_HUB;
  return base
    .map((cafe) => {
      const lineal = calcularDistanciaSimpleMetros(lat, lng, cafe.lat, cafe.lng);
      const dy = (cafe.lat - lat) * 111320;
      const dx = (cafe.lng - lng) * 111320 * Math.cos(((lat + cafe.lat) * 0.5 * Math.PI) / 180);
      const theta = (35 * Math.PI) / 180;
      const du = Math.abs(dx * Math.cos(theta) - dy * Math.sin(theta));
      const dv = Math.abs(dx * Math.sin(theta) + dy * Math.cos(theta));
      const distanciaMetros =
        lineal < 15 ? 0 : Math.round(Math.max(lineal * 1.28, (du + dv) * 1.04));
      const extraCruces = distanciaMetros > 950 ? 1.5 : distanciaMetros > 450 ? 1 : 0;
      const minutosCaminando =
        distanciaMetros < 20
          ? 1
          : Math.max(2, Math.round(distanciaMetros / 70 + extraCruces));
      const cuadrasAprox = Math.max(1, Math.round(distanciaMetros / 100));
      return {
        ...cafe,
        distanciaMetros,
        minutosCaminando,
        cuadrasAprox,
      };
    })
    .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
    .slice(0, limite);
}

/**
 * Busca el Café HUB oficial de la lista del usuario más cercano a un punto o barrio.
 */
export function buscarCafeHubMasCercano(
  lat: number,
  lng: number
): CafeHubCurado & { distanciaMetros: number; minutosCaminando: number; cuadrasAprox: number } {
  const cercanos = listarCafesHubCercanos(lat, lng, 1, true);
  return cercanos[0];
}
