/**
 * Açılış oy tablosunu SQL migration'ına yazar.
 *
 * Yüzdeler ve algoritma src/data/seedShares.ts içinde; burada yalnızca o
 * modül derlenip çalıştırılıyor. İki yerde ayrı ayrı hesaplansaydı demo mod
 * ile canlı veritabanı zamanla birbirinden ayrılırdı.
 *
 *   node scripts/generate-seed-sql.mjs
 *
 * HER ÇAĞRI YENİ BİR DOSYA YAZAR, eskisinin üzerine değil.
 *
 * Sebebi acı bir tecrübe: `supabase db push` bir sürümü bir kez uygular ve
 * uygulanmış sürümleri (supabase_migrations.schema_migrations) bir daha
 * çalıştırmaz. Aynı dosyayı yeni sayılarla güncelleyince push "bu sürüm zaten
 * uygulanmış" deyip sessizce atlıyor; veritabanında eski sayılar kalıyor,
 * iş akışı da yeşil görünüyordu. Yeni sürüm numarası bunu imkânsız kılar.
 *
 * Eski tohum dosyaları SİLİNMEZ: uzak taraf onları uygulanmış olarak
 * kaydetti, yerelden kaldırmak geçmiş uyuşmazlığı yaratır. Zaten her tohum
 * migration'ı önce bir öncekini geri alıp yenisini yazdığı için sıralı
 * çalıştıklarında sonuç hep en sonuncunun verisidir.
 */
import { build } from "esbuild";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "partim-seed-"));
const bundle = join(tmp, "seed.mjs");

await build({
  entryPoints: [join(root, "src/data/seedShares.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundle,
  alias: { "@": join(root, "src") },
  logLevel: "warning",
});

const { buildSeedTallies, NATIONAL_SHARES, SEED_TOTAL_VOTES } = await import(
  pathToFileURL(bundle).href
);

const tallies = buildSeedTallies();

// Doğrulama: ülke geneli yüzdeleri gerçekten tutmuş mu?
const totals = {};
let grand = 0;
for (const row of Object.values(tallies)) {
  for (const [partyId, votes] of Object.entries(row)) {
    totals[partyId] = (totals[partyId] ?? 0) + votes;
    grand += votes;
  }
}
console.log(`Toplam oy: ${grand.toLocaleString("tr")}`);
let sapma = 0;
for (const [partyId, hedef] of Object.entries(NATIONAL_SHARES)) {
  const gercek = (totals[partyId] / grand) * 100;
  sapma = Math.max(sapma, Math.abs(gercek - hedef));
  console.log(
    `  ${partyId.padEnd(9)} hedef %${hedef.toFixed(1).padStart(4)} → gerçek %${gercek.toFixed(2)}`,
  );
}
// Kaçınılmaz yuvarlama payı: tek bir oy 100/total puan ettiği için hiçbir
// parti hedefine yarım oydan daha yakın oturamaz.
// En büyük kalan yöntemi her partiyi tam payına en fazla BİR oy uzakta
// bırakır; bir oyun puan karşılığı da 100/toplam.
const tolerans = 100 / grand + 0.001;
console.log(`En büyük sapma: ${sapma.toFixed(3)} puan (tolerans ${tolerans.toFixed(3)})`);
if (sapma > tolerans) {
  console.error("Sapma yuvarlama payını aşıyor, migration yazılmadı.");
  process.exit(1);
}

// Haritanın tek renge boyanmaması için: hangi partinin kaç ili önde bitirdiği
const kazanan = {};
for (const row of Object.values(tallies)) {
  const lider = Object.entries(row).sort((a, b) => b[1] - a[1])[0];
  if (lider) kazanan[lider[0]] = (kazanan[lider[0]] ?? 0) + 1;
}
console.log(
  "İl kazananları:",
  Object.entries(kazanan)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id}=${n}`)
    .join(" "),
);

const rows = [];
for (const [provinceId, row] of Object.entries(tallies)) {
  for (const [partyId, votes] of Object.entries(row)) {
    rows.push(`  ('${provinceId}', '${partyId}', ${votes})`);
  }
}

const sql = `-- =============================================================================
-- Açılış oy tablosu  —  ÜRETİLMİŞ DOSYA, ELLE DÜZENLEMEYİN
--
--   node scripts/generate-seed-sql.mjs
--
-- Yüzdeler ve dağıtım algoritması src/data/seedShares.ts içinde. Ülke geneli
-- yüzdeleri tam tutturulur; bölgesel eğilim yalnızca illere dağılımı değiştirir.
-- Toplam ${grand.toLocaleString("tr")} oy, ${rows.length} satır.
--
-- SAYAÇ SIFIRDAN KURULUR, eskisinden çıkarma yapılmaz.
--
-- Önce "önceki tohumu düş, yenisini ekle" yapıyorduk. Bu, province_tallies'e
-- yalnızca tohum üzerinden dokunulduğunu varsayıyordu — ve varsayım yanlıştı:
-- eski bir migration (bot koltukları) tabloya doğrudan ~1.900 oy yazmıştı,
-- hiçbir yerde kayıtlı olmadığı için de hiçbir zaman düşülmedi. Sonuç: toplam
-- oy hedeflenenin çok üstünde kaldı ve sıralamanın başı yanlış partide takıldı.
--
-- Artık sayaç iki doğrulanabilir kaynaktan yeniden kuruluyor:
--   public.votes        oyuncuların gerçekten kullandığı her oy
--   public.seed_tallies aşağıdaki açılış tablosu
-- Aradan ne geçmiş olursa olsun sonuç aynı yere oturur; migration kaç kez
-- çalışırsa çalışsın fark etmez.
-- =============================================================================

create table if not exists public.seed_tallies (
  province_id text not null references public.provinces (id) on delete cascade,
  party_id    text not null references public.parties   (id) on delete cascade,
  votes       int  not null check (votes >= 0),
  primary key (province_id, party_id)
);

alter table public.seed_tallies enable row level security;
-- Politika yok: istemci okumaz, yalnızca migration yazar.

-- 1) Açılış tablosunu yenisiyle değiştir
delete from public.seed_tallies;
insert into public.seed_tallies (province_id, party_id, votes) values
${rows.join(",\n")}
on conflict (province_id, party_id) do update set votes = excluded.votes;

-- 2) Sayacı sıfırdan kur: önce gerçek oylar
delete from public.province_tallies;

insert into public.province_tallies (province_id, party_id, votes)
select province_id, party_id, count(*)::int
from public.votes
group by province_id, party_id;

-- 3) Üstüne açılış tablosu
insert into public.province_tallies (province_id, party_id, votes)
select province_id, party_id, votes from public.seed_tallies
on conflict (province_id, party_id)
  do update set votes = public.province_tallies.votes + excluded.votes;
`;

/*
 * Sürüm numarası: UTC zaman damgası — ama var olan EN BÜYÜK sürümden kesinlikle
 * büyük olmalı. Bu makinenin saati geride kalabiliyor; küçük bir numara
 * üretirsek migration sıraya geriden girer ve Supabase onu geçmiş uyuşmazlığı
 * sayar. O yüzden gerekirse en büyüğün bir saniye üstüne çıkıyoruz.
 */
const dir = join(root, "supabase/migrations");
const mevcut = readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f));
const enBuyuk = mevcut.reduce((a, f) => {
  const v = f.slice(0, 14);
  return v > a ? v : a;
}, "00000000000000");

const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
const parse = (v) =>
  Date.UTC(
    +v.slice(0, 4),
    +v.slice(4, 6) - 1,
    +v.slice(6, 8),
    +v.slice(8, 10),
    +v.slice(10, 12),
    +v.slice(12, 14),
  );

let version = stamp(new Date());
if (version <= enBuyuk) {
  version = stamp(new Date(parse(enBuyuk) + 1000));
  console.log(`Saat geride (${enBuyuk} zaten var), sürüm ${version} yapıldı.`);
}

const eskiler = mevcut.filter((f) => f.endsWith("_seed_tallies.sql"));

const out = join(dir, `${version}_seed_tallies.sql`);
writeFileSync(out, sql);

/*
 * Beklenen sonucu da yazıyoruz. İş akışı dağıtımdan sonra veritabanından
 * okuduğu gerçek değerle bunu yan yana basıyor: "uyguladım" demek yetmiyor,
 * uygulanan şeyin doğru olduğu da görünmeli.
 */
const lider = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
writeFileSync(
  join(root, "supabase/seed-expected.json"),
  JSON.stringify(
    {
      version,
      toplam_oy: grand,
      birinci_parti: lider[0],
      birinci_yuzde: Number(((lider[1] / grand) * 100).toFixed(1)),
      oyu_olan_il: Object.values(tallies).filter((row) => Object.keys(row).length > 0).length,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Yazıldı: ${out} (${rows.length} satır)`);
if (eskiler.length > 0) {
  console.log(
    `Önceki tohum migration'ları duruyor (silinmemeli): ${eskiler.join(", ")}\n` +
      "Sırayla çalıştıklarında sonuç en sonuncunun verisidir.",
  );
}
