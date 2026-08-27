import { PROVINCES } from "@/data/provinces";
import { toOklab } from "@/lib/color";

/**
 * Futbol haritasının tek takım kaynağı.
 *
 * Partilerle aynı şekil (Party yapısıyla uyumlu): id, name, shortName,
 * fullName, color, on, founded, blurb. Böylece pusula, harita boyaması ve
 * koltuklar siyasi haritadaki bileşenlerle aynı koddan çalışır.
 *
 * Dört büyük takım (Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor) listede
 * EN ÜSTTE durur; ardından diğer tanınan kulüpler, sonra her ile bir jenerik
 * takım gelir. `major` bayrağı sıralama ve vurgu için kullanılır.
 */
export type FootballTeam = {
  id: string;
  name: string;
  shortName: string;
  fullName: string;
  color: string;
  on: "light" | "dark";
  provinceId: string;
  cityId: string;
  cityName: string;
  founded?: number;
  blurb?: string;
  /** Dört büyük takım: listelerde en üstte gösterilir. */
  major?: boolean;
  /** Kullanıcının kurduğu kulüp mü? */
  custom?: boolean;
  logoUrl?: string | null;
  ownerHandle?: string | null;
};

function tone(color: string): "light" | "dark" {
  const lab = toOklab(color);
  return lab && lab[0] > 0.68 ? "dark" : "light";
}

/**
 * Dört büyük takım önce tanımlanır; aynı ilde birden çok takım olabildiği
 * için (İstanbul: GS-FB-BJK) `provinceId` aynı kalabilir, id'ler benzersizdir.
 */
const MAJOR_TEAMS: Array<{
  id: string;
  provinceId: string;
  name: string;
  shortName: string;
  fullName: string;
  color: string;
  founded?: number;
  blurb?: string;
}> = [
  {
    id: "ft-istanbul-galatasaray",
    provinceId: "istanbul",
    name: "Galatasaray",
    shortName: "GS",
    fullName: "Galatasaray Spor Kulübü",
    // Parlak kırmızı: bordo (Trabzonspor) ve koyu kırmızıdan (Göztepe) net ayrışır.
    color: "#E4002B",
    founded: 1905,
    blurb: "İstanbul'un Avrupa yakasını temsil eder.",
  },
  {
    id: "ft-istanbul-fenerbahce",
    provinceId: "istanbul",
    name: "Fenerbahçe",
    shortName: "FB",
    fullName: "Fenerbahçe Spor Kulübü",
    color: "#003E7E",
    founded: 1907,
    blurb: "İstanbul'un Kadıköy yakasını temsil eder.",
  },
  {
    id: "ft-istanbul-besiktas",
    provinceId: "istanbul",
    name: "Beşiktaş",
    shortName: "BJK",
    fullName: "Beşiktaş Jimnastik Kulübü",
    // Siyah koyu arka planda kayboluyordu; haritada görünür kalmak için
    // beyaz kullanılıyor (rozet metni koyu okunur).
    color: "#F5F5F5",
    founded: 1903,
    blurb: "İstanbul'un Boğaz kıyısını temsil eder.",
  },
  {
    id: "ft-trabzon-trabzonspor",
    provinceId: "trabzon",
    name: "Trabzonspor",
    shortName: "TS",
    fullName: "Trabzonspor Kulübü",
    // Bordo — kulübün resmî rengi; mor (#81007F) yerine artık gerçek bordo.
    color: "#7A1F3C",
    founded: 1967,
    blurb: "Karadeniz'in en büyük kulübü.",
  },
];

/** Dört büyük dışında tanınan kulüpler (il başına bir tane). */
const OTHER_TEAMS: Record<string, { name: string; shortName: string; fullName: string; color: string; founded?: number }> = {
  // Renkler haritada yan yana gelince karışmasın diye algısal uzaklığa göre
  // seçildi (OKLab): kırmızı ailesi parlak kırmızı (GS) / koyu kırmızı (Göztepe)
  // / bordo (Trabzonspor) olarak üçe bölündü, maviler koyudan açığa merdiven
  // kurdu, sarılar/yeşiller/morlar tek bir kulüpte kaldı.
  ankara: { name: "Ankaragücü", shortName: "AG", fullName: "MKE Ankaragücü", color: "#FF9800", founded: 1910 },
  izmir: { name: "Göztepe", shortName: "GÖZ", fullName: "Göztepe Spor Kulübü", color: "#A61B29", founded: 1925 },
  bursa: { name: "Bursaspor", shortName: "BUR", fullName: "Bursaspor Kulübü", color: "#00A859", founded: 1963 },
  kocaeli: { name: "Kocaelispor", shortName: "KOC", fullName: "Kocaelispor", color: "#1E88E5", founded: 1966 },
  eskisehir: { name: "Eskişehirspor", shortName: "ES", fullName: "Eskişehirspor", color: "#5D4037", founded: 1965 },
  samsun: { name: "Samsunspor", shortName: "SAM", fullName: "Samsunspor", color: "#C2185B", founded: 1965 },
  malatya: { name: "Yeni Malatyaspor", shortName: "YMS", fullName: "Yeni Malatyaspor", color: "#FFD100", founded: 1986 },
  diyarbakir: { name: "Diyarbakırspor", shortName: "DİY", fullName: "Diyarbakırspor", color: "#2E7D32", founded: 1968 },
  adana: { name: "Adana Demirspor", shortName: "ADS", fullName: "Adana Demirspor", color: "#42A5F5", founded: 1940 },
  antalya: { name: "Antalyaspor", shortName: "ANT", fullName: "Antalyaspor", color: "#F4511E", founded: 1966 },
  gaziantep: { name: "Gaziantep FK", shortName: "GAF", fullName: "Gaziantep Futbol Kulübü", color: "#C2410C", founded: 1988 },
  hatay: { name: "Hatayspor", shortName: "HAT", fullName: "Hatayspor", color: "#4B0082", founded: 1967 },
  kayseri: { name: "Kayserispor", shortName: "KAY", fullName: "Kayserispor", color: "#5C6BC0", founded: 1966 },
  konya: { name: "Konyaspor", shortName: "KON", fullName: "Konyaspor", color: "#1B5E20", founded: 1922 },
  sivas: { name: "Sivasspor", shortName: "SİV", fullName: "Sivasspor", color: "#D26B6B", founded: 1967 },
  rize: { name: "Çaykur Rizespor", shortName: "ÇRZ", fullName: "Çaykur Rizespor", color: "#00838F", founded: 1953 },
  canakkale: { name: "Çanakkale Dardanelspor", shortName: "ÇD", fullName: "Çanakkale Dardanelspor", color: "#1565C0", founded: 1927 },
  ordu: { name: "Orduspor", shortName: "ORD", fullName: "Orduspor", color: "#7E57C2", founded: 1967 },
};

/**
 * Aynı ilde birden çok takım olan illerin EK takımları.
 *
 * OTHER_TEAMS il başına tek takım üretir; bu liste o kuralı deler. Diyarbakır'da
 * Diyarbakırspor'un yanına Amedspor eklenir. id'ler benzersiz, `major` değil.
 */
const EXTRA_TEAMS: Array<{
  id: string;
  provinceId: string;
  name: string;
  shortName: string;
  fullName: string;
  color: string;
  founded?: number;
  blurb?: string;
}> = [
  {
    id: "ft-diyarbakir-amedspor",
    provinceId: "diyarbakir",
    name: "Amedspor",
    shortName: "AMED",
    fullName: "Amedspor",
    color: "#9CCC65",
    founded: 1990,
    blurb: "Diyarbakır'ı temsil eder.",
  },
  {
    id: "ft-ankara-genclerbirligi",
    provinceId: "ankara",
    name: "Gençlerbirliği",
    shortName: "GB",
    fullName: "Gençlerbirliği Spor Kulübü",
    color: "#9C27B0",
    founded: 1923,
    blurb: "Ankara'yı temsil eder.",
  },
];

function provinceName(id: string): string {
  return PROVINCES.find((p) => p.id === id)?.name ?? id;
}

/** Dört büyük + tanınan kulüpler + her ile bir jenerik takım. */
export function buildFootballTeams(): FootballTeam[] {
  const listed: FootballTeam[] = MAJOR_TEAMS.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    fullName: t.fullName,
    color: t.color,
    on: tone(t.color),
    provinceId: t.provinceId,
    cityId: t.provinceId,
    cityName: provinceName(t.provinceId),
    founded: t.founded,
    blurb: t.blurb,
    major: true,
  }));

  for (const province of PROVINCES) {
    if (province.id === "istanbul" || province.id === "trabzon") continue; // büyüklerde
    const other = OTHER_TEAMS[province.id];
    const name = other?.name ?? `${province.name} FK`;
    const shortName = other?.shortName ?? `${province.name.slice(0, 3).toLocaleUpperCase("tr")}`;
    const fullName = other?.fullName ?? `${province.name} Futbol Kulübü`;
    const color = other?.color ?? "#90A4AE";
    listed.push({
      id: `ft-${province.id}`,
      name,
      shortName,
      fullName,
      color,
      on: tone(color),
      provinceId: province.id,
      cityId: province.id,
      cityName: province.name,
      founded: other?.founded,
      blurb: `${province.name} ilini temsil eden takım.`,
    });
  }

  // Aynı ilde birden çok takım: EXTRA_TEAMS (ör. Diyarbakır'da Amedspor).
  for (const t of EXTRA_TEAMS) {
    listed.push({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      fullName: t.fullName,
      color: t.color,
      on: tone(t.color),
      provinceId: t.provinceId,
      cityId: t.provinceId,
      cityName: provinceName(t.provinceId),
      founded: t.founded,
      blurb: t.blurb,
    });
  }

  return listed;
}

export const FOOTBALL_TEAMS: FootballTeam[] = buildFootballTeams();

export const FOOTBALL_TEAM_BY_ID: Record<string, FootballTeam> = Object.fromEntries(
  FOOTBALL_TEAMS.map((team) => [team.id, team]),
);

export const FOOTBALL_TEAM_IDS = FOOTBALL_TEAMS.map((team) => team.id);

/**
 * İl → ana takım eşlemesi. Aynı ilde birden çok takım varsa (İstanbul: GS-FB-BJK)
 * ilk tanımlanan (dört büyükten biri) ana takım sayılır; oy pusulasında hepsi
 * görünür, harita boyaması en çok oy alana göre yapılır.
 */
export const FOOTBALL_TEAM_BY_PROVINCE: Record<string, FootballTeam> = {};
for (const province of PROVINCES) {
  FOOTBALL_TEAM_BY_PROVINCE[province.id] = FOOTBALL_TEAMS.find(
    (t) => t.provinceId === province.id,
  ) as FootballTeam;
}

export const FOOTBALL_NEUTRAL_COLOR = "#243044";

export function teamColor(teamId: string | null | undefined): string {
  if (!teamId) return FOOTBALL_NEUTRAL_COLOR;
  return FOOTBALL_TEAM_BY_ID[teamId]?.color ?? FOOTBALL_NEUTRAL_COLOR;
}

export function teamName(teamId: string | null | undefined): string {
  if (!teamId) return "Bilinmiyor";
  return FOOTBALL_TEAM_BY_ID[teamId]?.name ?? "Bilinmiyor";
}

export function teamShortName(teamId: string | null | undefined): string {
  if (!teamId) return "?";
  return FOOTBALL_TEAM_BY_ID[teamId]?.shortName ?? FOOTBALL_TEAM_BY_ID[teamId]?.name ?? "?";
}

/** Kullanıcının kurduğu kulüpleri canlı dizine yazar (idempotent). */
export function setCustomClubs(clubs: FootballTeam[]): void {
  for (const club of clubs) {
    FOOTBALL_TEAM_BY_ID[club.id] = club;
    if (!FOOTBALL_TEAMS.some((t) => t.id === club.id)) {
      FOOTBALL_TEAMS.push(club);
    }
  }
}
