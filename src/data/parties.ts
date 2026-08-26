import { toOklab } from "@/lib/color";
import { PROVINCES } from "@/data/provinces";

/**
 * Partiler.
 *
 * İki kaynak var: buradaki sabit liste ve kullanıcıların kurduğu özel partiler.
 * Özel partiler çalışma anında `setCustomParties()` ile eklenir; harita boyaması,
 * pusula, koltuklar ve sıralamalar hepsi aşağıdaki canlı dizinden okur.
 *
 * Renkler kurumsal kimliklere yakın seçildi ve birbirine karışmayacak şekilde
 * algısal olarak ayrıştırıldı (bkz. lib/color.ts). Yeni bir parti eklerken
 * `checkPartyColor` ile mesafesini doğrulayın.
 */
export type Party = {
  id: string;
  /** Pusulada ve dar alanlarda kullanılan kısa ad */
  name: string;
  /**
   * Rozetin (logo) üstüne basılan kısaltma. `name`den türetmek yetmiyordu:
   * ilk iki harfi almak "Yeniden Refah"ı "Ye", "Memleket"i "Me" yapıyordu.
   * Bu yüzden her parti için ayrı ayrı yazılı.
   */
  shortName: string;
  /** Parti bilgisinde gösterilen tam ad */
  fullName: string;
  /** Kurumsal renk (hex) */
  color: string;
  /** Renk üstünde okunacak metnin tonu */
  on: "light" | "dark";
  founded?: number;
  /** Bir cümlelik konum tarifi */
  blurb?: string;
  /** Kullanıcı tarafından kurulmuş mu? */
  custom?: boolean;
  /** Özel partilerde yüklenen logo (data URI) */
  logoUrl?: string | null;
  /** Özel partiyi kuran kullanıcının X kullanıcı adı */
  ownerHandle?: string | null;
};

export const BASE_PARTIES: Party[] = [
  { id: "akp", name: "AK Parti", shortName: "AKP", fullName: "Adalet ve Kalkınma Partisi", color: "#F58220", on: "dark", founded: 2001, blurb: "Muhafazakâr demokrat merkez sağ." },
  { id: "chp", name: "CHP", shortName: "CHP", fullName: "Cumhuriyet Halk Partisi", color: "#E30A17", on: "light", founded: 1923, blurb: "Sosyal demokrat, Kemalist gelenek." },
  { id: "dem", name: "DEM Parti", shortName: "DEM", fullName: "Halkların Eşitlik ve Demokrasi Partisi", color: "#7B2D8E", on: "light", founded: 2023, blurb: "Sol, çoğulcu ve Kürt siyasi hareketi." },
  { id: "mhp", name: "MHP", shortName: "MHP", fullName: "Milliyetçi Hareket Partisi", color: "#8E1B2E", on: "light", founded: 1969, blurb: "Ülkücü, milliyetçi muhafazakâr." },
  { id: "iyi", name: "İYİ Parti", shortName: "İYİ", fullName: "İYİ Parti", color: "#00A0DF", on: "dark", founded: 2017, blurb: "Milliyetçi merkez sağ." },
  { id: "yrp", name: "Yeniden Refah", shortName: "YRP", fullName: "Yeniden Refah Partisi", color: "#0F6B4A", on: "light", founded: 2018, blurb: "Millî Görüş geleneği." },
  { id: "zafer", name: "Zafer Partisi", shortName: "ZP", fullName: "Zafer Partisi", color: "#1B3A93", on: "light", founded: 2021, blurb: "Milliyetçi, göç karşıtı program." },
  { id: "tip", name: "TİP", shortName: "TİP", fullName: "Türkiye İşçi Partisi", color: "#D81E05", on: "light", founded: 2017, blurb: "Sosyalist sol." },
  { id: "sp", name: "Saadet", shortName: "SP", fullName: "Saadet Partisi", color: "#16326B", on: "light", founded: 2001, blurb: "Millî Görüş çizgisi." },
  { id: "deva", name: "DEVA", shortName: "DEVA", fullName: "Demokrasi ve Atılım Partisi", color: "#00A8A0", on: "dark", founded: 2020, blurb: "Liberal muhafazakâr merkez." },
  { id: "gelecek", name: "Gelecek", shortName: "GP", fullName: "Gelecek Partisi", color: "#3F51B5", on: "light", founded: 2019, blurb: "Muhafazakâr demokrat merkez." },
  { id: "dp", name: "Demokrat Parti", shortName: "DP", fullName: "Demokrat Parti", color: "#0057A8", on: "light", founded: 2007, blurb: "Merkez sağ, Demokrat gelenek." },
  { id: "hudapar", name: "HÜDA PAR", shortName: "HÜDA", fullName: "Hür Dava Partisi", color: "#3E8E41", on: "light", founded: 2012, blurb: "İslamcı muhafazakâr." },
  { id: "bbp", name: "BBP", shortName: "BBP", fullName: "Büyük Birlik Partisi", color: "#1F2E5C", on: "light", founded: 1993, blurb: "Milliyetçi muhafazakâr." },
  { id: "memleket", name: "Memleket", shortName: "MP", fullName: "Memleket Partisi", color: "#C2185B", on: "light", founded: 2021, blurb: "Ulusalcı sol merkez." },
  // Renkleri algısal mesafeyle seçildi; kurumsal tonları netleşince güncelleyin.
  { id: "yeni", name: "Yeni Parti", shortName: "YP", fullName: "Yeni Parti", color: "#AFB42B", on: "dark", blurb: "Merkez, yenilikçi program." },
  { id: "anahtar", name: "Anahtar Parti", shortName: "AP", fullName: "Anahtar Parti", color: "#8D6E63", on: "light", blurb: "Merkez sağ, kalkınmacı çizgi." },
];

/* --------------------------- canlı dizin ---------------------------------
 * Aşağıdaki üç yapı YERİNDE güncellenir (yeni nesne atanmaz). Böylece
 * modülü import eden dosyalardaki referanslar geçerli kalır; React'in yeniden
 * çizmesi ise GameProvider'daki durum değişikliğiyle tetiklenir.
 * ------------------------------------------------------------------------ */

export const PARTIES: Party[] = [...BASE_PARTIES];
export const PARTY_BY_ID: Record<string, Party> = Object.fromEntries(
  BASE_PARTIES.map((p) => [p.id, p]),
);
export const PARTY_IDS: string[] = BASE_PARTIES.map((p) => p.id);

/** Futbol haritasında kullanılan takım listesi. Party yapısıyla aynıdır. */
const MAJOR_TEAMS: Record<string, { name: string; shortName: string; fullName: string; color: string }> = {
  istanbul: { name: "Galatasaray", shortName: "GS", fullName: "Galatasaray Spor Kulübü", color: "#A32638" },
  ankara: { name: "Ankaragücü", shortName: "AG", fullName: "MKE Ankaragücü", color: "#FDB913" },
  izmir: { name: "Göztepe", shortName: "GÖZ", fullName: "Göztepe Spor Kulübü", color: "#C8102E" },
  bursa: { name: "Bursaspor", shortName: "BUR", fullName: "Bursaspor Kulübü", color: "#008000" },
  trabzon: { name: "Trabzonspor", shortName: "TS", fullName: "Trabzonspor Kulübü", color: "#81007F" },
  kocaeli: { name: "Kocaelispor", shortName: "KOC", fullName: "Kocaelispor", color: "#0066B3" },
  eskisehir: { name: "Eskişehirspor", shortName: "ES", fullName: "Eskişehirspor", color: "#D71920" },
  samsun: { name: "Samsunspor", shortName: "SAM", fullName: "Samsunspor", color: "#C8102E" },
  malatya: { name: "Yeni Malatyaspor", shortName: "YMS", fullName: "Yeni Malatyaspor", color: "#FFD100" },
  diyarbakir: { name: "Diyarbakırspor", shortName: "DİY", fullName: "Diyarbakırspor", color: "#FF0000" },
  adana: { name: "Adana Demirspor", shortName: "ADS", fullName: "Adana Demirspor", color: "#0066B3" },
  antalya: { name: "Antalyaspor", shortName: "ANT", fullName: "Antalyaspor", color: "#C8102E" },
  gaziantep: { name: "Gaziantep FK", shortName: "GAF", fullName: "Gaziantep Futbol Kulübü", color: "#E30A17" },
  hatay: { name: "Hatayspor", shortName: "HAT", fullName: "Hatayspor", color: "#4B0082" },
  kayseri: { name: "Kayserispor", shortName: "KAY", fullName: "Kayserispor", color: "#FF0000" },
  konya: { name: "Konyaspor", shortName: "KON", fullName: "Konyaspor", color: "#006600" },
  sivas: { name: "Sivasspor", shortName: "SİV", fullName: "Sivasspor", color: "#D71920" },
  rize: { name: "Çaykur Rizespor", shortName: "ÇRZ", fullName: "Çaykur Rizespor", color: "#005C9A" },
  canakkale: { name: "Çanakkale Dardanelspor", shortName: "ÇD", fullName: "Çanakkale Dardanelspor", color: "#00457C" },
};

export const FOOTBALL_TEAMS: Array<Party & { provinceId: string }> = PROVINCES.map((province) => {
  const maj = MAJOR_TEAMS[province.id];
  const name = maj?.name ?? `${province.name} FK`;
  const shortName = maj?.shortName ?? province.name.slice(0, 3).toLocaleUpperCase("tr");
  const fullName = maj?.fullName ?? `${province.name} Futbol Kulübü`;
  const color = maj?.color ?? "#3A7D44";
  return {
    id: `ft-${province.id}`,
    name,
    shortName,
    fullName,
    color,
    on: readableTextTone(color),
    custom: false,
    provinceId: province.id,
  };
});

export const FOOTBALL_TEAM_BY_PROVINCE: Record<string, Party & { provinceId: string }> = {};
for (const team of FOOTBALL_TEAMS) {
  PARTY_BY_ID[team.id] = team;
  FOOTBALL_TEAM_BY_PROVINCE[team.provinceId] = team;
}

/** Rengin üstünde koyu mu açık mı yazı okunacağını belirler. */
export function readableTextTone(color: string): "light" | "dark" {
  const lab = toOklab(color);
  return lab && lab[0] > 0.68 ? "dark" : "light";
}

/** Kullanıcıların kurduğu partileri canlı dizine yazar. */
export function setCustomParties(custom: Party[]): void {
  const normalized = custom.map((p) => ({
    ...p,
    custom: true,
    shortName: p.shortName || p.name,
    on: p.on ?? readableTextTone(p.color),
  }));

  PARTIES.length = 0;
  PARTIES.push(...BASE_PARTIES, ...normalized);

  for (const key of Object.keys(PARTY_BY_ID)) delete PARTY_BY_ID[key];
  for (const party of PARTIES) PARTY_BY_ID[party.id] = party;

  PARTY_IDS.length = 0;
  PARTY_IDS.push(...PARTIES.map((p) => p.id));
}

/** Boş/bilinmeyen il için nötr ton */
export const NEUTRAL_COLOR = "#243044";

export function partyColor(partyId: string | null | undefined): string {
  if (!partyId) return NEUTRAL_COLOR;
  return PARTY_BY_ID[partyId]?.color ?? NEUTRAL_COLOR;
}

export function partyName(partyId: string | null | undefined): string {
  if (!partyId) return "Boş";
  return PARTY_BY_ID[partyId]?.name ?? "Bilinmiyor";
}

/** Parti renginin üstünde okunacak metin rengi */
/** Rozete basılacak kısaltma. Bilinmeyen parti için "?" döner. */
export function partyShortName(partyId: string | null | undefined): string {
  if (!partyId) return "?";
  const party = PARTY_BY_ID[partyId];
  if (!party) return partyId.slice(0, 3).toLocaleUpperCase("tr");
  return party.shortName || party.name;
}

export function partyTextColor(partyId: string | null | undefined): string {
  const party = partyId ? PARTY_BY_ID[partyId] : undefined;
  const tone = party?.on ?? (party ? readableTextTone(party.color) : "light");
  return tone === "dark" ? "#0b0f19" : "#ffffff";
}

/** Renk çakışma denetimi için mevcut partilerin adı+rengi */
export function takenColors(excludeId?: string): Array<{ name: string; color: string }> {
  return PARTIES.filter((p) => p.id !== excludeId).map((p) => ({
    name: p.name,
    color: p.color,
  }));
}
