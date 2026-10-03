// Figures are plausible composites grounded in published behaviour — not live data.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON3 = MONTHS.map((m) => m.slice(0, 3).toUpperCase());

export const SPECIES = [
  {
    id: 'whale',
    index: '01',
    name: 'Humpback Whale',
    latin: 'Megaptera novaeangliae',
    stock: 'Southeast Pacific · Breeding Stock G',
    color: [0.35, 0.95, 1.0],
    css: '#7ff3ff',
    portrait: 'img/whale.jpg',
    verb: 'pod',
    route: [
      [-64.6, -62.8], [-62.2, -64.5], [-58.2, -68.5], [-53, -76.6], [-46, -77.8], [-38, -75.8], [-30, -73.6],
      [-22, -72.4], [-15, -77.2], [-9, -81.6], [-3.2, -82.6], [1, -80.9], [3.6, -79.4], [6.2, -80.4],
      [6, -81.4], [1, -83.4], [-8, -84.6], [-18, -80], [-28, -76.8], [-38, -77.8], [-48, -79.4], [-56, -72.6], [-61.6, -65.8],
    ],
    keys: [[0, 0], [3.8, 0], [6.6, 0.5], [9.6, 0.5], [11.95, 1]],
    phases: [
      [0, 3.8, 'Feeding', 'Krill swarms of the Gerlache Strait'],
      [3.8, 6.6, 'Northbound', 'Following the Humboldt Current'],
      [6.6, 9.6, 'Breeding', 'Song season, Gulf of Panama'],
      [9.6, 12, 'Southbound', 'Mothers and calves return south'],
    ],
    ends: [
      { u: 0, title: 'Feeding grounds', place: 'Gerlache Strait, Antarctica', window: 'DEC — APR' },
      { u: 0.5, title: 'Breeding grounds', place: 'Gulf of Panama · Gorgona', window: 'JUL — OCT' },
    ],
    distanceKm: 8300,
    distanceNote: 'one way · among the longest of any mammal',
    population: 11800,
    popNote: 'est. individuals in Stock G',
    trend: '+4.1% / yr',
    status: 'LC',
    statusNote: 'Least Concern globally; recovered from whaling',
    threats: ['Ship strikes in the Panama approaches', 'Entanglement in gillnets', 'Krill fishery competition', 'Ocean noise masking song'],
    medium: 'sea',
    observers: ['Happywhale ID', 'R/V Laurence M. Gould', 'Fluke photo · Gorgona NP', 'Hydrophone array HP-3', 'Whale-watch log, Bahía Solano', 'Satellite tag #'],
    unit: 'whales',
    countRange: [1, 14],
    focus: { lat: -24, lon: -76, alt: 2.9, tilt: 4, k: 0.45, fov: 32 },
    labelAngle: -0.4,
    blurb: 'Every austral autumn the pod leaves the krill-rich fjords of the Antarctic Peninsula and swims nearly the full length of South America to sing and calve in warm equatorial water. Then they turn around.',
  },
  {
    id: 'tern',
    index: '02',
    name: 'Arctic Tern',
    latin: 'Sterna paradisaea',
    stock: 'Greenland & Iceland colonies',
    color: [0.92, 0.96, 1.0],
    css: '#eef4ff',
    portrait: 'img/tern.jpg',
    verb: 'flock',
    route: [
      [74.6, -19], [66, -17], [56, -26], [47, -34], [40, -30], [28, -21], [15, -19.5], [2, -12], [-12, -4], [-25, 3],
      [-38, 6], [-48, -2], [-58, -14], [-67, -30], [-62, -42], [-50, -42], [-38, -37], [-24, -30], [-8, -27],
      [8, -36], [24, -44], [38, -46], [50, -40], [61, -32], [70, -24],
    ],
    keys: [[0, 0.52], [3.1, 0.54], [5.2, 1.0], [7.4, 1.0], [8.0, 1.12], [9.0, 1.14], [11.0, 1.5], [12, 1.52]],
    phases: [
      [0, 3.1, 'Austral summer', 'Fishing the Weddell Sea pack-ice edge'],
      [3.1, 5.2, 'Northbound', 'Riding the westerlies in a giant S'],
      [5.2, 7.4, 'Breeding', 'Colonies on the Greenland coast'],
      [7.4, 9.0, 'Stopover', 'Refuelling in the mid-North Atlantic'],
      [9.0, 11.0, 'Southbound', 'Down the coast of West Africa'],
      [11.0, 12, 'Austral summer', 'Arrived at the Antarctic ice edge'],
    ],
    ends: [
      { u: 0, title: 'Breeding colonies', place: 'Sand Island, NE Greenland', window: 'JUN — JUL' },
      { u: 0.5, title: 'Wintering waters', place: 'Weddell Sea pack ice', window: 'DEC — MAR' },
    ],
    distanceKm: 70900,
    distanceNote: 'round trip · the longest migration ever recorded',
    population: 2000000,
    popNote: 'est. breeding adults, worldwide',
    trend: '−1.3% / yr',
    status: 'LC',
    statusNote: 'Least Concern, but declining at North Atlantic colonies',
    threats: ['Collapse of sandeel prey near colonies', 'Shifting North Atlantic winds', 'Mink & fox predation on nests', 'Plastic ingestion'],
    medium: 'air',
    observers: ['Geolocator tag GL-', 'eBird checklist', 'Seabird survey, RRS Discovery', 'Colony count, Sand Island', 'Ship-of-opportunity log', 'BirdLife observer'],
    unit: 'terns',
    countRange: [12, 640],
    focus: { lat: 4, lon: -24, alt: 3.15, tilt: 0, k: 0.2, fov: 33 },
    labelAngle: 0.3,
    blurb: 'Two summers a year, almost no night. An arctic tern living thirty years flies the distance to the Moon and back three times, tracing a giant S through the Atlantic to borrow the trade winds.',
  },
  {
    id: 'wildebeest',
    index: '03',
    name: 'Wildebeest',
    latin: 'Connochaetes taurinus mearnsi',
    stock: 'Serengeti — Mara ecosystem',
    color: [1.0, 0.68, 0.32],
    css: '#ffb366',
    portrait: 'img/wildebeest.jpg',
    verb: 'herd',
    route: [
      [-3.0, 35.05], [-2.88, 34.7], [-2.6, 34.38], [-2.28, 34.18], [-1.98, 34.42], [-1.66, 34.8], [-1.46, 35.05],
      [-1.34, 35.26], [-1.72, 35.36], [-2.18, 35.5], [-2.62, 35.32],
    ],
    keys: [[0, 0], [2.8, 0.03], [4.0, 0.17], [5.5, 0.33], [6.5, 0.5], [7.4, 0.58], [9.3, 0.66], [10.5, 0.82], [11.6, 0.97], [12, 1]],
    phases: [
      [0, 2.8, 'Calving', '8,000 calves born a day on the short-grass plains'],
      [2.8, 5.5, 'Rut & westward', 'Long columns through the Western Corridor'],
      [5.5, 7.4, 'River crossings', 'The Grumeti and the Mara'],
      [7.4, 9.3, 'Masai Mara', 'Grazing the northern grasslands'],
      [9.3, 12, 'Southbound', 'Following the short rains home'],
    ],
    ends: [
      { u: 0, title: 'Calving plains', place: 'Ndutu, southern Serengeti', window: 'JAN — MAR' },
      { u: 0.58, title: 'Mara crossings', place: 'Kogatende · Mara River', window: 'JUL — SEP' },
    ],
    distanceKm: 1000,
    distanceNote: 'annual clockwise circuit',
    population: 1300000,
    popNote: 'wildebeest, with 250,000 zebra',
    trend: '−0.4% / yr',
    status: 'LC',
    statusNote: 'Species Least Concern; the migration itself is fragile',
    threats: ['Fencing & roads severing corridors', 'Mara River flow loss upstream', 'Drought shifting rain timing', 'Poaching for bushmeat'],
    medium: 'land',
    observers: ['Collar fix WB-', 'Ranger patrol, Kogatende', 'Aerial census transect', 'Guide radio, Lamai', 'Camera trap SG-', 'Mara Conservancy scout'],
    unit: 'animals',
    countRange: [400, 26000],
    focus: { lat: -2.1, lon: 34.85, alt: 0.15, tilt: 34, k: 1, fov: 34 },
    labelAngle: 0.2,
    blurb: 'A million and more animals chase rain they can smell from fifty kilometres away, walking a slow clockwise ring through two countries and across a river full of crocodiles.',
  },
  {
    id: 'monarch',
    index: '04',
    name: 'Monarch Butterfly',
    latin: 'Danaus plexippus plexippus',
    stock: 'Eastern North American population',
    color: [1.0, 0.45, 0.08],
    css: '#ff8a2a',
    portrait: 'img/monarch.jpg',
    verb: 'swarm',
    route: [[46.5, -78], [43.8, -84], [40.2, -91], [35.6, -96.4], [30, -98.6], [25, -99.8], [19.6, -100.25]],
    open: true,
    keys: [[0, 1], [2.5, 1], [3.6, 0.72], [5.4, 0.16], [6.5, 0], [7.9, 0], [9.3, 0.55], [10.7, 1.0], [12, 1]],
    phases: [
      [0, 2.5, 'Overwintering', 'Clustered on oyamel firs, Michoacán'],
      [2.5, 6.5, 'Spring relay', 'Three generations recolonise the north'],
      [6.5, 7.9, 'Breeding', 'Milkweed across the Corn Belt'],
      [7.9, 10.7, 'Super-generation', 'A single generation flies to Mexico'],
      [10.7, 12, 'Overwintering', 'Arriving for Día de Muertos'],
    ],
    ends: [
      { u: 0, title: 'Summer range', place: 'Great Lakes & southern Canada', window: 'JUN — AUG' },
      { u: 1, title: 'Overwintering forest', place: 'Sierra Chincua, Michoacán', window: 'NOV — MAR' },
    ],
    distanceKm: 4500,
    distanceNote: 'one way · flown by a single generation',
    population: 200000000,
    popNote: 'est. across 1.79 ha of forest',
    trend: '−59% since 1996',
    status: 'VU',
    statusNote: 'Vulnerable (IUCN 2023 reassessment)',
    threats: ['Loss of milkweed to herbicides', 'Illegal logging of oyamel forest', 'Late freezes & extreme heat', 'Neonicotinoid exposure'],
    medium: 'air',
    observers: ['Journey North report #', 'Tag recovery MX-', 'Roost count, Cape May', 'iNaturalist obs.', 'Peak-flight watch, Eagle Pass', 'WWF forest survey'],
    unit: 'monarchs',
    countRange: [30, 90000],
    focus: { lat: 34, lon: -93, alt: 1.05, tilt: 14, k: 0.85, fov: 33 },
    labelAngle: -0.2,
    blurb: 'No butterfly that leaves Mexico in spring ever returns. Its great-grandchildren do: a "super-generation" that lives eight months instead of six weeks, and navigates to forests it has never seen.',
  },
  {
    id: 'caribou',
    index: '05',
    name: 'Caribou',
    latin: 'Rangifer tarandus granti',
    stock: 'Porcupine herd · Yukon & Alaska',
    color: [0.78, 0.9, 1.0],
    css: '#cfe4ff',
    portrait: 'img/caribou.jpg',
    verb: 'herd',
    route: [
      [65.7, -139.2], [66.6, -139.6], [67.55, -139.5], [68.45, -140.3], [69.15, -142], [69.72, -144.2],
      [69.45, -146.1], [68.6, -146.4], [67.6, -145.1], [66.7, -143.1], [66.0, -141.1],
    ],
    keys: [[0, 0], [2.9, 0.02], [4.3, 0.24], [5.2, 0.46], [6.4, 0.5], [7.2, 0.6], [8.6, 0.75], [10.2, 0.95], [12, 1]],
    phases: [
      [0, 2.9, 'Wintering', 'Cratering for lichen under the snow'],
      [2.9, 5.2, 'Spring migration', 'Pregnant cows lead, on old trails'],
      [5.2, 6.4, 'Calving', 'The coastal plain, out of reach of wolves'],
      [6.4, 8.6, 'Post-calving', 'Massing on the coast against mosquitoes'],
      [8.6, 12, 'Fall migration', 'Through the Brooks Range to the Yukon'],
    ],
    ends: [
      { u: 0, title: 'Wintering range', place: 'Ogilvie Mountains, Yukon', window: 'NOV — MAR' },
      { u: 0.5, title: 'Calving grounds', place: 'Arctic coastal plain, Alaska', window: 'JUN' },
    ],
    distanceKm: 2700,
    distanceNote: 'per year · the farthest of any land mammal',
    population: 218000,
    popNote: 'photo-census estimate',
    trend: '+3.6% / yr',
    status: 'VU',
    statusNote: 'Vulnerable (species); this herd is stable',
    threats: ['Oil leasing on the calving grounds', 'Rain-on-snow icing events', 'Insect harassment in warmer summers', 'Mismatch with spring green-up'],
    medium: 'land',
    observers: ['Collar fix PCH-', 'Gwichʼin observer, Old Crow', 'Aerial photo-census', 'ADF&G survey flight', 'Dempster Hwy count', 'Trail camera AN-'],
    unit: 'caribou',
    countRange: [40, 9000],
    focus: { lat: 67.8, lon: -142.6, alt: 0.34, tilt: 32, k: 1, fov: 34, sun: 74 },
    labelAngle: 0.5,
    blurb: 'The Gwichʼin call the coastal plain "the sacred place where life begins." Every spring the herd walks there on trails worn into the tundra over thousands of years.',
  },
];

export const STATUS_SCALE = ['LC', 'NT', 'VU', 'EN', 'CR'];
export const STATUS_NAME = { LC: 'Least Concern', NT: 'Near Threatened', VU: 'Vulnerable', EN: 'Endangered', CR: 'Critically Endangered' };

export function phaseAt(sp, t) {
  t = ((t % 12) + 12) % 12;
  return sp.phases.find(([a, b]) => t >= a && t < b) || sp.phases[sp.phases.length - 1];
}

/** Plausible environmental readout at a position & month. */
export function conditionsAt(sp, lat, t) {
  const m = ((t % 12) + 12) % 12;
  // hemisphere-aware seasonal cycle: +1 ≈ local midsummer
  const season = Math.cos(((m - 6.5) / 12) * Math.PI * 2) * Math.sign(lat || 1);
  const a = Math.abs(lat);
  if (sp.medium === 'sea') {
    const sst = 28.5 - 0.0062 * a * a - (a > 55 ? (a - 55) * 0.18 : 0) + season * (a > 10 ? 2.6 : 0.6);
    return { label: 'Sea surface', value: `${Math.max(-1.8, sst).toFixed(1)}°C`, extra: sst < 4 ? 'Krill bloom index · high' : sst > 24 ? 'Warm-pool calm · 0.8 m swell' : 'Humboldt upwelling · 2.4 m swell' };
  }
  if (sp.id === 'tern') {
    const wind = 18 + a * 0.32 + Math.sin(m * 1.7 + lat) * 6;
    const dir = ['W', 'WSW', 'NW', 'SW', 'E', 'NE'][Math.floor(Math.abs(lat * 0.13 + m) % 6)];
    return { label: 'Wind aloft', value: `${wind.toFixed(0)} kn ${dir}`, extra: `${(24 - Math.abs(season) * (a > 60 ? 22 : 6) * (season > 0 ? -1 : 1) * 0.5).toFixed(1)} h daylight` };
  }
  if (sp.id === 'wildebeest') {
    const rain = [92, 88, 145, 182, 74, 18, 12, 21, 28, 46, 104, 118][Math.floor(m)];
    return { label: 'Rainfall', value: `${rain} mm/mo`, extra: rain > 80 ? 'Short grass flush · 31°C' : 'Dry season · 34°C, dust' };
  }
  if (sp.id === 'monarch') {
    const temp = 24 - (a - 20) * 0.55 + season * 9;
    return { label: 'Air temperature', value: `${temp.toFixed(0)}°C`, extra: temp < 13 ? 'Below flight threshold · clustering' : `Tailwind ${(8 + (m * 7) % 13).toFixed(0)} km/h NNE` };
  }
  const temp = -14 + season * 22 - (a - 66) * 1.2;
  const snow = Math.max(0, Math.min(100, 60 - season * 70));
  return { label: 'Air temperature', value: `${temp.toFixed(0)}°C`, extra: `Snow cover ${snow.toFixed(0)}% · ${temp > 8 ? 'mosquito index high' : 'firm crust'}` };
}
