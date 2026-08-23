/**
 * Açılış oy tablosunu SQL migration'ına yazar.
 *
 * Yüzdeler ve algoritma src/data/seedShares.ts içinde; burada yalnızca o
 * modül derlenip çalıştırılıyor. İki yerde ayrı ayrı hesaplansaydı demo mod
 * ile canlı veritabanı zamanla birbirinden ayrılırdı.
 *
 *   node scripts/generate-seed-sql.mjs
 */
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
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
-- Bu tohum GERÇEK OYLARDAN AYRI tutulur (public.seed_tallies). Migration
-- yeniden çalıştırıldığında önce eski tohum province_tallies'ten düşülür,
-- sonra yenisi eklenir — böylece oyuncuların gerçek oyları hiç bozulmaz ve
-- yüzdeler her seferinde yeniden hedefe oturur.
-- =============================================================================

create table if not exists public.seed_tallies (
  province_id text not null references public.provinces (id) on delete cascade,
  party_id    text not null references public.parties   (id) on delete cascade,
  votes       int  not null check (votes >= 0),
  primary key (province_id, party_id)
);

alter table public.seed_tallies enable row level security;
-- Politika yok: istemci okumaz, yalnızca migration yazar.

-- 1) Önceki tohumu geri al
update public.province_tallies pt
   set votes = greatest(0, pt.votes - st.votes)
  from public.seed_tallies st
 where st.province_id = pt.province_id and st.party_id = pt.party_id;

delete from public.province_tallies where votes = 0;
delete from public.seed_tallies;

-- 2) Yeni tohum
insert into public.seed_tallies (province_id, party_id, votes) values
${rows.join(",\n")}
on conflict (province_id, party_id) do update set votes = excluded.votes;

-- 3) Tohumu gerçek sayaçların üstüne ekle
insert into public.province_tallies (province_id, party_id, votes)
select province_id, party_id, votes from public.seed_tallies
on conflict (province_id, party_id)
  do update set votes = public.province_tallies.votes + excluded.votes;
`;

const out = join(root, "supabase/migrations/20260824010000_seed_tallies.sql");
writeFileSync(out, sql);
console.log(`Yazıldı: ${out} (${rows.length} satır)`);
