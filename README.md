# partim.lol

Türkiye haritası üzerinde oynanan bir siyaset simülasyonu oyunu. 81 ilin tamamı
tıklanabilir; her il, o ilde en çok oy alan partinin rengiyle boyanır. Oyuncular
X (Twitter) hesaplarıyla giriş yapar, **saat başı bir oy** kullanır ve isterlerse
bir ildeki bir partinin **il başkanlığı** koltuğunu satın alır.

> Bu bir oyundur. Sonuçlar hiçbir kamuoyu araştırmasını, resmî veriyi veya gerçek
> seçim sonucunu temsil etmez; hiçbir parti veya kurumla bağlantısı yoktur.

---

## Oyun kuralları

| Kural | Değer |
| --- | --- |
| Oy soğuma süresi | 1 saat (oyuncu başına, tüm iller için ortak) |
| Oy başına XP | +1 |
| İl başkanlığı XP'si | Koltuğu elde tuttuğun her saat için +20 |
| Boş koltuk fiyatı | $1 |
| Devralma | O anki bedelin $1 fazlası (1 → 2 → 3 …) |
| Seviye eğrisi | L seviyesi için toplam `25·(L−1)·L` XP (2. seviye 50, 5. seviye 500) |

Her **il × parti** ikilisi için tek bir başkanlık koltuğu vardır; yani 81 × 15 =
1215 koltuk. Koltuğun sahibi, o ilin panelinde partinin yanında X kullanıcı adıyla
görünür. Tüm bu sabitler tek yerde — [`src/lib/game.ts`](src/lib/game.ts) — tanımlı
ve sunucu tarafında [`supabase/migrations/20260823120000_init.sql`](supabase/migrations/20260823120000_init.sql) içinde aynen
tekrarlanır.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ üretir
npm run preview
```

Ortam değişkeni tanımlamazsanız uygulama **demo modda** açılır: harita bölgesel
eğilimlere göre üretilmiş inandırıcı bir tabloyla dolu gelir, giriş taklit edilir,
ilerlemeniz `localStorage`'da tutulur ve ödeme alınmaz. Oyunun tamamı bu hâliyle
oynanabilir — GitHub Pages'e sunucusuz dağıtım da böyle çalışır.

## Teknoloji

- **Vite + React 18 + TypeScript**, shadcn/ui dizin düzeni (`src/components/ui`)
- **Tailwind CSS** (koyu tema, cam paneller)
- **three.js** — arka plandaki `QuantumNebula` parçacık sahnesi
- **Supabase** — X (Twitter) OAuth + Postgres (isteğe bağlı)
- **Stripe Checkout** — il başkanlığı ödemeleri (isteğe bağlı)
- Rotalama `HashRouter` ile: GitHub Pages'te 404 hilesi gerekmez

### Dizin düzeni

```
src/
  backend/        arka uç soyutlaması (demo | supabase) + React context
  components/     oyun bileşenleri (harita, pusula, koltuklar, sıralama)
  components/ui/  shadcn tarzı ilkel bileşenler + quantum-nebula
  data/           provinces.ts (81 il SVG yolu) ve parties.ts
  lib/            oyun kuralları, biçimlendirme, yardımcılar
  pages/          Harita, İl, Sıralama, Profil, Nasıl oynanır
supabase/         şema, RLS, RPC'ler ve Stripe edge fonksiyonları
scripts/          harita verisi üretici
```

Arka uç seçimi [`src/backend/index.ts`](src/backend/index.ts) içinde tek bir
koşulla yapılır. Koşul doğrudan `import.meta.env` üzerinden yazıldığı için,
anahtarlar tanımsızken Supabase istemcisi paketten tamamen elenir (~220 KB).

## Gerçek moda geçiş

> Adım adım kontrol listesi: [`docs/CANLIYA-ALMA.md`](docs/CANLIYA-ALMA.md).
> Aşağısı özet; oradaki liste sırayı, doğrulama adımlarını ve bilinen boşlukları
> da içerir.

### 1. Supabase

1. Yeni bir proje açın ve şemayı uygulayın. Yerelde Supabase CLI varsa
   `supabase db push` yeterli; yoksa depodaki **Actions → "Supabase'e uygula"**
   iş akışı aynı işi tarayıcıdan yapar (bilgisayar gerekmez). Şema
   [`supabase/migrations/20260823120000_init.sql`](supabase/migrations/20260823120000_init.sql)
   içindedir ve illeri/partileri, oy ve koltuk tablolarını, RLS politikalarını ve
   kuralların doğrulandığı fonksiyonları kurar.
2. **Authentication → Providers → Twitter**'ı açın; X Developer Portal'da
   oluşturduğunuz uygulamanın anahtarlarını girin. Callback adresi olarak
   Supabase'in verdiği `https://<proje>.supabase.co/auth/v1/callback` adresini
   X uygulamasına ekleyin.
3. **Authentication → URL Configuration** altına yayın adresinizi (`https://partim.lol`)
   ve `http://localhost:5173` adresini ekleyin.
4. `.env.local` dosyanıza:

   ```
   VITE_SUPABASE_URL=https://<proje>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

5. Saatlik başkanlık XP'si için **Database → Extensions**'tan `pg_cron`'u açıp:

   ```sql
   select cron.schedule('partim-leader-xp', '0 * * * *', $$select public.accrue_leader_xp()$$);
   ```

### 2. Stripe

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

CLI kuramıyorsanız aynı üç adımı **Actions → "Supabase'e uygula"** iş akışı
`fonksiyonlar` hedefiyle yapar; Stripe anahtarlarını depo Secrets'ına koymanız
yeterlidir.

Stripe panelinde `checkout.session.completed` olayı için bir webhook uç noktası
oluşturun (`https://<proje>.supabase.co/functions/v1/stripe-webhook`), imza
gizlisini kaydedin:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Akış şöyle işler: istemci `create-checkout`'u çağırır → fiyat **sunucuda**
`next_seat_price()` ile hesaplanır → Stripe Checkout'a yönlendirme yapılır →
ödeme onaylanınca `stripe-webhook`, `apply_seat_purchase()` ile koltuğu devreder.
İstemci hiçbir noktada kendini başkan yapamaz; aynı Stripe oturumu iki kez
işlenmez. Ödeme sürerken koltuk başkasına geçmişse satın alma `stale` olarak
kaydedilir (iade operatörün kararına bırakılmıştır — otomatik iade eklenmedi).

### 3. GitHub Pages

> **Önce bunu ayarlayın:** depo ayarlarında **Settings → Pages → Source** mutlaka
> **GitHub Actions** olmalı. Varsayılan olan "Deploy from a branch" seçeneği depo
> kökünü olduğu gibi yayınlar; kökteki `index.html` ise `/src/main.tsx` dosyasına
> bakar. Tarayıcı TypeScript çalıştıramadığı için sonuç **beyaz ekran** olur.
> Belirti buysa hata sizde değil, bu ayardadır.

Doğru kaynak seçildikten sonra [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
her itmede projeyi derleyip `dist/` çıktısını yayınlar. İş akışı `main` dalını ve
geliştirme dalı `claude/partim-lol-game-dev-j6jwzx`'i dinler (`main` açıldığında
ikincisi silinebilir); **Actions** sekmesinden elle de tetiklenebilir.

- `vars.VITE_SUPABASE_URL` ve `secrets.VITE_SUPABASE_ANON_KEY` tanımlıysa gerçek
  modda derlenir; tanımsızsa demo modda yayınlanır.
- `vars.CUSTOM_DOMAIN` tanımlıysa (`partim.lol`) `CNAME` dosyası otomatik yazılır.
  Bunu tanımlamadan önce alan adının DNS kayıtlarını GitHub Pages'e yönlendirin.

Vite `base: "./"` kullandığı için site hem `kullanici.github.io/partim.lol/`
alt yolunda hem de kök alan adında ek ayar gerektirmeden çalışır.

Rotalama HashRouter ile yapılır, ama `public/404.html` düz adresleri de karşılar:
`partim.lol/kosullar` isteği `#/kosullar`'a yönlenir. Bu, X ve Stripe gibi `#`
içeren adresleri kabul etmeyen doğrulayıcılar için gerekli.

## Harita verisini yeniden üretme

`src/data/provinces.ts` üretilmiş bir dosyadır (81 il, Mercator projeksiyonu,
1000×422 viewBox). Kaynağı [cihadturhan/tr-geojson](https://github.com/cihadturhan/tr-geojson);
topojson ile önce nicemlenip sonra sadeleştirildiği için komşu illerin paylaşılan
sınırları birebir örtüşür, haritada çatlak oluşmaz.

```bash
mkdir -p .cache
curl -o .cache/tr-cities.json \
  https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json
npm i -D topojson-server topojson-simplify topojson-client
npm run gen:provinces
```

## Partiler

[`src/data/parties.ts`](src/data/parties.ts) Ağustos 2026 itibarıyla oyuna dâhil
edilen partileri ve kurumsal renklerine yakın tonları içerir. Parti listesi
değiştiğinde yalnızca bu dosyayı düzenlemek yeterlidir: pusula, harita boyaması,
koltuklar, renk anahtarı ve sıralamalar bu diziden türetilir. Gerçek modda
`supabase/migrations/20260823120000_init.sql` içindeki `parties` tablosunu da güncelleyin.

Renkler ve adlar yalnızca tanınırlık amacıyla kullanılmıştır; hiçbir parti bu
projeyi onaylamamıştır.

## Bilinen sınırlar

- Demo modda tüm veri tarayıcıdadır: farklı cihazlar birbirinin oylarını görmez.
- Otomatik Stripe iadesi yoktur; `seat_purchases.status = 'stale'` kayıtları elle
  ele alınmalıdır.
- Sıralama tablosu ilk 50 oyuncuyu gösterir, sayfalama yoktur.
