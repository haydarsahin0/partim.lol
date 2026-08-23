import { toOklab } from "@/lib/color";

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
  { id: "akp", name: "AK Parti", fullName: "Adalet ve Kalkınma Partisi", color: "#F58220", on: "dark", founded: 2001, blurb: "Muhafazakâr demokrat merkez sağ." },
  { id: "chp", name: "CHP", fullName: "Cumhuriyet Halk Partisi", color: "#E30A17", on: "light", founded: 1923, blurb: "Sosyal demokrat, Kemalist gelenek." },
  { id: "dem", name: "DEM Parti", fullName: "Halkların Eşitlik ve Demokrasi Partisi", color: "#7B2D8E", on: "light", founded: 2023, blurb: "Sol, çoğulcu ve Kürt siyasi hareketi." },
  { id: "mhp", name: "MHP", fullName: "Milliyetçi Hareket Partisi", color: "#8E1B2E", on: "light", founded: 1969, blurb: "Ülkücü, milliyetçi muhafazakâr." },
  { id: "iyi", name: "İYİ Parti", fullName: "İYİ Parti", color: "#00A0DF", on: "dark", founded: 2017, blurb: "Milliyetçi merkez sağ." },
  { id: "yrp", name: "Yeniden Refah", fullName: "Yeniden Refah Partisi", color: "#0F6B4A", on: "light", founded: 2018, blurb: "Millî Görüş geleneği." },
  { id: "zafer", name: "Zafer Partisi", fullName: "Zafer Partisi", color: "#1B3A93", on: "light", founded: 2021, blurb: "Milliyetçi, göç karşıtı program." },
  { id: "tip", name: "TİP", fullName: "Türkiye İşçi Partisi", color: "#D81E05", on: "light", founded: 2017, blurb: "Sosyalist sol." },
  { id: "sp", name: "Saadet", fullName: "Saadet Partisi", color: "#16326B", on: "light", founded: 2001, blurb: "Millî Görüş çizgisi." },
  { id: "deva", name: "DEVA", fullName: "Demokrasi ve Atılım Partisi", color: "#00A8A0", on: "dark", founded: 2020, blurb: "Liberal muhafazakâr merkez." },
  { id: "gelecek", name: "Gelecek", fullName: "Gelecek Partisi", color: "#3F51B5", on: "light", founded: 2019, blurb: "Muhafazakâr demokrat merkez." },
  { id: "dp", name: "Demokrat Parti", fullName: "Demokrat Parti", color: "#0057A8", on: "light", founded: 2007, blurb: "Merkez sağ, Demokrat gelenek." },
  { id: "hudapar", name: "HÜDA PAR", fullName: "Hür Dava Partisi", color: "#3E8E41", on: "light", founded: 2012, blurb: "İslamcı muhafazakâr." },
  { id: "bbp", name: "BBP", fullName: "Büyük Birlik Partisi", color: "#1F2E5C", on: "light", founded: 1993, blurb: "Milliyetçi muhafazakâr." },
  { id: "memleket", name: "Memleket", fullName: "Memleket Partisi", color: "#C2185B", on: "light", founded: 2021, blurb: "Ulusalcı sol merkez." },
  // Renkleri algısal mesafeyle seçildi; kurumsal tonları netleşince güncelleyin.
  { id: "yeni", name: "Yeni Parti", fullName: "Yeni Parti", color: "#AFB42B", on: "dark", blurb: "Merkez, yenilikçi program." },
  { id: "anahtar", name: "Anahtar Parti", fullName: "Anahtar Parti", color: "#8D6E63", on: "light", blurb: "Merkez sağ, kalkınmacı çizgi." },
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
