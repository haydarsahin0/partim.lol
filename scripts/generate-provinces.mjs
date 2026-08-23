import fs from 'node:fs';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature } from 'topojson-client';

const SRC = process.argv[2];
const OUT = process.argv[3];
const WIDTH = 1000;

// plaka -> { name, region }  (resmi plaka sırası)
const PLATES = [
 ['Adana','Akdeniz'],['Adıyaman','Güneydoğu Anadolu'],['Afyonkarahisar','Ege'],['Ağrı','Doğu Anadolu'],
 ['Amasya','Karadeniz'],['Ankara','İç Anadolu'],['Antalya','Akdeniz'],['Artvin','Karadeniz'],
 ['Aydın','Ege'],['Balıkesir','Marmara'],['Bilecik','Marmara'],['Bingöl','Doğu Anadolu'],
 ['Bitlis','Doğu Anadolu'],['Bolu','Karadeniz'],['Burdur','Akdeniz'],['Bursa','Marmara'],
 ['Çanakkale','Marmara'],['Çankırı','İç Anadolu'],['Çorum','Karadeniz'],['Denizli','Ege'],
 ['Diyarbakır','Güneydoğu Anadolu'],['Edirne','Marmara'],['Elazığ','Doğu Anadolu'],['Erzincan','Doğu Anadolu'],
 ['Erzurum','Doğu Anadolu'],['Eskişehir','İç Anadolu'],['Gaziantep','Güneydoğu Anadolu'],['Giresun','Karadeniz'],
 ['Gümüşhane','Karadeniz'],['Hakkâri','Doğu Anadolu'],['Hatay','Akdeniz'],['Isparta','Akdeniz'],
 ['Mersin','Akdeniz'],['İstanbul','Marmara'],['İzmir','Ege'],['Kars','Doğu Anadolu'],
 ['Kastamonu','Karadeniz'],['Kayseri','İç Anadolu'],['Kırklareli','Marmara'],['Kırşehir','İç Anadolu'],
 ['Kocaeli','Marmara'],['Konya','İç Anadolu'],['Kütahya','Ege'],['Malatya','Doğu Anadolu'],
 ['Manisa','Ege'],['Kahramanmaraş','Akdeniz'],['Mardin','Güneydoğu Anadolu'],['Muğla','Ege'],
 ['Muş','Doğu Anadolu'],['Nevşehir','İç Anadolu'],['Niğde','İç Anadolu'],['Ordu','Karadeniz'],
 ['Rize','Karadeniz'],['Sakarya','Marmara'],['Samsun','Karadeniz'],['Siirt','Güneydoğu Anadolu'],
 ['Sinop','Karadeniz'],['Sivas','İç Anadolu'],['Tekirdağ','Marmara'],['Tokat','Karadeniz'],
 ['Trabzon','Karadeniz'],['Tunceli','Doğu Anadolu'],['Şanlıurfa','Güneydoğu Anadolu'],['Uşak','Ege'],
 ['Van','Doğu Anadolu'],['Yozgat','İç Anadolu'],['Zonguldak','Karadeniz'],['Aksaray','İç Anadolu'],
 ['Bayburt','Karadeniz'],['Karaman','İç Anadolu'],['Kırıkkale','İç Anadolu'],['Batman','Güneydoğu Anadolu'],
 ['Şırnak','Güneydoğu Anadolu'],['Bartın','Karadeniz'],['Ardahan','Doğu Anadolu'],['Iğdır','Doğu Anadolu'],
 ['Yalova','Marmara'],['Karabük','Karadeniz'],['Kilis','Güneydoğu Anadolu'],['Osmaniye','Akdeniz'],
 ['Düzce','Karadeniz'],
];

// kaynak veri adlarından resmi adlara
const ALIAS = { 'Afyon':'Afyonkarahisar', 'Hakkari':'Hakkâri', 'Kahramanmaras':'Kahramanmaraş' };

const slugMap = {'ç':'c','Ç':'c','ğ':'g','Ğ':'g','ı':'i','İ':'i','ö':'o','Ö':'o','ş':'s','Ş':'s','ü':'u','Ü':'u','â':'a'};
const slug = (s) => s.split('').map(c => slugMap[c] ?? c).join('').toLowerCase().replace(/[^a-z0-9]+/g,'-');

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
for (const f of raw.features) {
  const n = f.properties.name;
  f.properties.name = ALIAS[n] ?? n;
}

// --- topoloji: paylaşılan sınırlar korunsun diye quantize + simplify ---
let topo = topology({ tr: raw }, 1e5);
topo = presimplify(topo);
const minWeight = quantile(topo, 0.93); // ~%95,5 nokta korunur, sınırlar tutarlı kalır
topo = simplify(topo, minWeight);
const geo = feature(topo, topo.objects.tr);

// --- projeksiyon: Mercator ---
const R = 180 / Math.PI;
const merc = ([lon, lat]) => [lon, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const eachRing = (geom, cb) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  polys.forEach((poly, pi) => poly.forEach((ring, ri) => cb(ring, pi, ri)));
};
for (const f of geo.features) eachRing(f.geometry, (ring) => {
  for (const c of ring) {
    const [x, y] = merc(c);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
});
const scale = WIDTH / (maxX - minX);
const HEIGHT = +((maxY - minY) * scale).toFixed(2);
const project = (c) => { const [x, y] = merc(c); return [(x - minX) * scale, (maxY - y) * scale]; };

const r2 = (n) => { const v = Math.round(n * 10) / 10; return Object.is(v, -0) ? 0 : v; };

// alan (piksel kare) — en büyük halka üzerinden etiket merkezi
const ringArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return a / 2; };
const ringCentroid = (pts) => {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f; x += (pts[j][0] + pts[i][0]) * f; y += (pts[j][1] + pts[i][1]) * f;
  }
  a *= 3;
  return a === 0 ? pts[0] : [x / a, y / a];
};

const byName = new Map();
for (const f of geo.features) {
  const rings = [];
  eachRing(f.geometry, (ring, pi, ri) => rings.push({ pts: ring.map(project), outer: ri === 0, pi }));
  let d = '';
  for (const { pts } of rings) {
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = [r2(pts[i][0]), r2(pts[i][1])];
      if (i === 0) { d += `M${p[0]} ${p[1]}`; prev = p; continue; }
      if (prev && p[0] === prev[0] && p[1] === prev[1]) continue;
      d += `L${p[0]} ${p[1]}`; prev = p;
    }
    d += 'Z';
  }
  // en büyük dış halkanın merkezi
  const outers = rings.filter(r => r.outer).map(r => ({ c: ringCentroid(r.pts), a: Math.abs(ringArea(r.pts)) }));
  outers.sort((a, b) => b.a - a.a);
  const [cx, cy] = outers[0].c;
  byName.set(f.properties.name, { d, cx: r2(cx), cy: r2(cy), area: Math.round(outers.reduce((s, o) => s + o.a, 0)) });
}

const missing = PLATES.map(p => p[0]).filter(n => !byName.has(n));
if (missing.length) { console.error('EKSİK İL:', missing, '\nVeri adları:', [...byName.keys()].join(',')); process.exit(1); }

const rows = PLATES.map(([name, region], i) => {
  const g = byName.get(name);
  return `  { id: "${slug(name)}", plate: ${i + 1}, name: "${name}", region: "${region}", cx: ${g.cx}, cy: ${g.cy}, area: ${g.area}, d: "${g.d}" }`;
});

const out = `// OTOMATİK ÜRETİLDİ — elle düzenlemeyin.
// Kaynak: cihadturhan/tr-geojson (tr-cities-utf8.json), topojson ile sadeleştirildi.
// Projeksiyon: Mercator, viewBox 0 0 ${WIDTH} ${HEIGHT}

export type Province = {
  /** URL/anahtar için sabit kimlik (ör. "istanbul") */
  id: string;
  /** Resmi plaka kodu 1–81 */
  plate: number;
  name: string;
  region: string;
  /** Etiket merkezi (viewBox koordinatı) */
  cx: number;
  cy: number;
  /** Yaklaşık alan — etiket yoğunluğu için */
  area: number;
  /** SVG path verisi */
  d: string;
};

export const MAP_VIEWBOX = { width: ${WIDTH}, height: ${HEIGHT} } as const;

export const PROVINCES: Province[] = [
${rows.join(',\n')},
];

export const PROVINCE_BY_ID: Record<string, Province> = Object.fromEntries(
  PROVINCES.map((p) => [p.id, p]),
);

export const PROVINCE_IDS = PROVINCES.map((p) => p.id);

export const REGIONS = [...new Set(PROVINCES.map((p) => p.region))].sort((a, b) =>
  a.localeCompare(b, "tr"),
);
`;
fs.writeFileSync(OUT, out);
console.log('yazıldı:', OUT, (out.length / 1024).toFixed(1) + ' KB', 'viewBox 0 0', WIDTH, HEIGHT);
