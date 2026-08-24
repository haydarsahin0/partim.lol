/**
 * Zaman tüneli: haritanın ve oy oranlarının zaman içindeki hâli.
 *
 * Geçmiş ayrıca kaydedilmiyor. public.votes her oyun ne zaman kullanıldığını
 * tuttuğu için haritanın herhangi bir andaki hâli, açılış tablosunun üstüne o
 * ana kadarki oyları eklemekle bulunuyor. Buradaki iş de bu: kovaları sırayla
 * toplayıp her an için tam bir tablo (kare) üretmek.
 */
import { PARTIES } from "@/data/parties";
import { NATIONAL_SHARES } from "@/data/seedShares";
import { PROVINCES } from "@/data/provinces";
import type { VoteHistory } from "@/backend/types";

export type Tallies = Record<string, Record<string, number>>;

export type Frame = {
  /** Karenin temsil ettiği an (ISO) */
  at: string;
  /** provinceId -> partyId -> toplam oy */
  tallies: Tallies;
  /** provinceId -> önde giden parti (oy yoksa null) */
  leaders: Record<string, string | null>;
  /** Ülke geneli, oy sırasına göre */
  national: Array<{ partyId: string; votes: number; pct: number }>;
  totalVotes: number;
};

function clone(tallies: Tallies): Tallies {
  const out: Tallies = {};
  for (const [provinceId, row] of Object.entries(tallies)) out[provinceId] = { ...row };
  return out;
}

function summarize(at: string, tallies: Tallies): Frame {
  const byParty = new Map<string, number>();
  const leaders: Record<string, string | null> = {};
  let total = 0;

  for (const province of PROVINCES) {
    const row = tallies[province.id];
    let best: string | null = null;
    let bestVotes = 0;
    if (row) {
      for (const [partyId, votes] of Object.entries(row)) {
        if (votes <= 0) continue;
        byParty.set(partyId, (byParty.get(partyId) ?? 0) + votes);
        total += votes;
        if (votes > bestVotes) {
          bestVotes = votes;
          best = partyId;
        }
      }
    }
    leaders[province.id] = best;
  }

  const national = [...byParty.entries()]
    .map(([partyId, votes]) => ({ partyId, votes, pct: total ? (votes / total) * 100 : 0 }))
    .sort((a, b) => b.votes - a.votes);

  return { at, tallies, leaders, national, totalVotes: total };
}

/**
 * Kovaları sırayla toplayıp kare dizisi üretir.
 *
 * İlk kare açılış tablosunun kendisi: oyun başladığı andaki harita. Sonraki
 * her kare bir öncekinin üstüne o kovadaki oyları ekler — yani hiçbir kare
 * baştan hesaplanmıyor, video kaç kare olursa olsun maliyet aynı kalıyor.
 */
export function buildFrames(history: VoteHistory): Frame[] {
  const running = clone(history.seed);
  const first = history.buckets[0]?.at ?? new Date().toISOString();

  const frames: Frame[] = [summarize(first, clone(running))];
  for (const bucket of history.buckets) {
    for (const [provinceId, row] of Object.entries(bucket.delta)) {
      const target = (running[provinceId] ??= {});
      for (const [partyId, votes] of Object.entries(row)) {
        target[partyId] = (target[partyId] ?? 0) + votes;
      }
    }
    frames.push(summarize(bucket.at, clone(running)));
  }
  return frames;
}

/**
 * İki kare arasını doldurur.
 *
 * Veri kovaları saatlik: 72 kova var. Videoyu 15 saniye yapmak için bunları
 * saniyede beş kare oynatmak gerekirdi ve sonuç takır takır akardı. Bunun
 * yerine 30 kare/sn çiziyoruz ve aradaki kareleri buradan üretiyoruz —
 * çubuklar ve sayaçlar süzülerek ilerliyor.
 *
 * İl renkleri sayıların KENDİSİ harmanlanıp lider yeniden hesaplanarak
 * bulunuyor. Doğrudan lideri harmanlamak mümkün değil (renk ya odur ya bu);
 * sayıları harmanlayınca il, gerçekten öne geçtiği anda renk değiştiriyor.
 */
export function lerpFrame(a: Frame, b: Frame, t: number): Frame {
  if (t <= 0) return a;
  if (t >= 1) return b;

  const karisim: Tallies = {};
  for (const province of PROVINCES) {
    const ra = a.tallies[province.id];
    const rb = b.tallies[province.id];
    if (!ra && !rb) continue;
    const satir: Record<string, number> = {};
    const idler = new Set([...Object.keys(ra ?? {}), ...Object.keys(rb ?? {})]);
    for (const partyId of idler) {
      const va = ra?.[partyId] ?? 0;
      const vb = rb?.[partyId] ?? 0;
      satir[partyId] = va + (vb - va) * t;
    }
    karisim[province.id] = satir;
  }

  const at = new Date(
    Date.parse(a.at) + (Date.parse(b.at) - Date.parse(a.at)) * t,
  ).toISOString();
  return summarize(at, karisim);
}

/* ----------------------------- örnek akış -------------------------------- */

/** İl–parti yakınlığı: aynı çift her zaman aynı katsayıyı verir. */
function ilEgilimi(provinceId: string, partyId: string): number {
  let h = 2166136261;
  const input = `${provinceId}~${partyId}~tl1`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 0,35 – 2,45 arası
  return 0.35 + ((h >>> 0) % 1000) / 1000 * 2.1;
}

/** Deterministik, bağımlılıksız rastgelelik: aynı tohum aynı videoyu verir. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Örnek (tanıtım) akışı.
 *
 * Oyun yeni açıldığı için gerçek geçmiş henüz birkaç saatlik. Tanıtım videosu
 * çekilebilsin diye inandırıcı bir akış üretiyoruz: iller sırayla doluyor,
 * partilerin ivmesi zaman içinde değişiyor ve liderlik el değiştiriyor.
 *
 * Bu veri GERÇEK DEĞİL; zaman tüneli bunu kullanırken ekranda "örnek veri"
 * yazıyor ve videoya da basılıyor. Tanıtım videosunun gerçek sonuç sanılması,
 * oyunun kendisine güveni sarsar.
 */
export function syntheticHistory(options?: {
  buckets?: number;
  votesPerBucket?: number;
  seed?: number;
  /** Kovalar arası süre (ms). Varsayılan bir saat. */
  bucketMs?: number;
}): VoteHistory {
  const buckets = options?.buckets ?? 72;
  const perBucket = options?.votesPerBucket ?? 90;
  const bucketMs = options?.bucketMs ?? 3600_000;
  const random = rng(options?.seed ?? 20260824);

  const partyIds = PARTIES.map((p) => p.id);
  /*
   * Her partiye bir "ivme eğrisi".
   *
   * Ağırlıklar oyunun kendi hedef oranlarından (NATIONAL_SHARES) türetiliyor
   * ve dalgalanma zamanla sönümleniyor: video başta karışık, liderlik el
   * değiştiriyor, sona doğru gerçek tabloya oturuyor. Tamamen rastgele
   * üretseydik tanıtım videosu oyunun gerçek dengesiyle alakasız çıkardı.
   */
  const momentum = partyIds.map((partyId) => ({
    partyId,
    hedef: NATIONAL_SHARES[partyId] ?? 0.8,
    faz: random() * Math.PI * 2,
    hiz: 0.7 + random() * 2.4,
  }));

  const start = Date.now() - buckets * bucketMs;
  const out: VoteHistory = { seed: {}, buckets: [] };

  for (let i = 0; i < buckets; i++) {
    const t = i / Math.max(1, buckets - 1);
    const delta: Tallies = {};

    // İl sayısı zamanla artıyor: harita yavaş yavaş doluyor.
    const acikIl = Math.max(6, Math.round(PROVINCES.length * (0.12 + 0.88 * t)));
    // Dalgalanma sönümleniyor: t=0'da güçlü, sona doğru sıfıra iniyor.
    const dalga = Math.max(0, 1 - t * 1.12);
    const agirliklar = momentum.map((m) => ({
      partyId: m.partyId,
      w: Math.max(0.05, m.hedef * (1 + dalga * 2.4 * Math.sin(m.faz + m.hiz * t * Math.PI))),
    }));
    const adet = Math.round(perBucket * (0.35 + 1.3 * t));
    for (let n = 0; n < adet; n++) {
      const province = PROVINCES[Math.floor(random() * acikIl)];

      /*
       * İl eğilimi: her ilin her partiye karşı sabit bir yakınlığı var.
       * Olmadığı sürece her il ülke ortalamasına yakınsıyor ve harita tek
       * renge dönüyordu — tanıtım videosunda görülecek bir şey kalmıyordu.
       * Eğilimler iller arasında ortalamada 1'e yakın olduğu için ülke
       * yüzdeleri bozulmuyor, yalnızca dağılım renkleniyor.
       */
      const yerel = agirliklar.map((a) => ({
        partyId: a.partyId,
        w: a.w * ilEgilimi(province.id, a.partyId),
      }));
      const yerelToplam = yerel.reduce((acc, a) => acc + a.w, 0);

      let hedef = random() * yerelToplam;
      let partyId = yerel[0].partyId;
      for (const a of yerel) {
        hedef -= a.w;
        if (hedef <= 0) {
          partyId = a.partyId;
          break;
        }
      }
      const row = (delta[province.id] ??= {});
      row[partyId] = (row[partyId] ?? 0) + 1;
    }

    out.buckets.push({ at: new Date(start + i * bucketMs).toISOString(), delta });
  }

  return out;
}
