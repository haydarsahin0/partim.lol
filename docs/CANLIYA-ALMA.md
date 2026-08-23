# Canlıya alma kontrol listesi

Şu an site **demo modda** yayında: giriş taklit ediliyor, veriler tarayıcıda
duruyor, ödeme alınmıyor. Gerçek moda geçmek üç fazdır. **Sırayı bozmayın** —
Faz 2'nin ön koşulu Faz 1, Faz 3'ün ön koşulu Faz 1'dir.

Tavsiye: önce Faz 1'i bitirip oyunu ücretsiz olarak yayına alın, oyuncu akışını
gerçek veriyle görün; ödemeleri (Faz 2) ondan sonra açın. Stripe'ın işletme
doğrulaması günler sürebilir ve oyunun geri kalanını bekletmesi için sebep yok.

### Bilgisayarın yoksa

Hepsi telefondan yapılabilir. Terminal, Docker veya Supabase CLI kurmana gerek
yok: şemayı uygulamak ve edge fonksiyonlarını yüklemek için depoda
**Actions → "Supabase'e uygula" → Run workflow** düğmesi var; CLI'yi GitHub'ın
sunucusu senin yerine koşturuyor.

İki pratik not:

- **GitHub uygulamasını değil, tarayıcıyı kullan.** Mobil uygulamada depo
  ayarları (Secrets/Variables) ve "Run workflow" yok. `github.com` adresini
  tarayıcıdan aç; menü dar gelirse "Masaüstü site" seçeneğini işaretle.
- **Anahtarları kimseye, hiçbir sohbete yapıştırma.** Hepsi doğrudan
  GitHub Secrets'a girilir; oradan Supabase'e iş akışı taşır.

---

## Faz 1 — Giriş ve oylama canlı (ücretsiz kısım)

### 1.1 İşletmeci bilgilerini doldur

`src/lib/site.ts` içindeki köşeli parantezli alanları gerçek bilgilerle değiştir:
işletmeci adı, iletişim e-postası, sicil/vergi bilgisi. (Telefondan: GitHub'da
dosyayı aç, sağ üstteki kalem simgesine bas, düzenle ve "Commit changes" de —
site kendiliğinden yeniden yayınlanır.) Doldurulmadığı sürece
Kullanım Koşulları ve Gizlilik sayfalarının başında uyarı görünür.

Sonra `/kosullar` ve `/gizlilik` sayfalarını okuyup kendi durumuna göre gözden
geçir. **Bu metinler hukukçu onayından geçmiş değildir**, doldurulacak bir
taslaktır — özellikle iade koşullarını kendi kararına göre yaz.

### 1.2 Supabase projesi

1. [supabase.com](https://supabase.com) → yeni proje. Bölge olarak Türkiye'ye en
   yakın olanı seç (genelde `eu-central-1` / Frankfurt). Kurulumda belirlediğin
   **veritabanı parolasını bir yere kaydet**, birazdan lazım olacak.

2. Şemayı uygula. İki yol var, ikisi de telefondan yapılabilir:

   **Yol A — iş akışıyla (önerilen, kopyala-yapıştır yok):**

   1. [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
      → yeni **access token** üret.
   2. Depo → Settings → Secrets and variables → Actions:
      - **Variables**: `SUPABASE_PROJECT_REF` = proje adresindeki ref
        (`https://supabase.com/dashboard/project/`**`<ref>`**)
      - **Secrets**: `SUPABASE_ACCESS_TOKEN` ve `SUPABASE_DB_PASSWORD`
   3. Depo → **Actions → "Supabase'e uygula" → Run workflow** → hedef `veritabani`.

   İş akışı `supabase/migrations/` altındaki dosyaları uygular; tekrar
   çalıştırmak güvenlidir, uygulanmış migration atlanır.

   **Yol B — elle:** GitHub'da
   [`supabase/migrations/20260823120000_init.sql`](../supabase/migrations/20260823120000_init.sql)
   dosyasını aç, **"Copy raw file"** düğmesine bas, Supabase'de **SQL Editor**'a
   yapıştır ve çalıştır.

   Hangi yolu seçersen seç sonuç aynı: iller ve partiler, oy/koltuk tabloları,
   RLS politikaları ve kuralları doğrulayan fonksiyonlar kurulur.

3. **Database → Extensions** → `pg_cron`'u aç, sonra SQL Editor'da:

   ```sql
   select cron.schedule('partim-leader-xp', '0 * * * *', $$select public.accrue_leader_xp()$$);
   ```

   Bu olmadan il başkanlarının saatlik 20 XP'si hiç işlenmez.

### 1.3 X (Twitter) uygulaması

[developer.x.com](https://developer.x.com) → Developer Portal → yeni App.
**User authentication settings** altında:

| Alan | Değer |
| --- | --- |
| App permissions | Read |
| Type of App | Web App |
| Callback URI | `https://<proje>.supabase.co/auth/v1/callback` |
| Website URL | `https://partim.lol` |
| Terms of service | `https://partim.lol/kosullar` |
| Privacy policy | `https://partim.lol/gizlilik` |

Ardından **API Key** ve **API Secret Key**'i alıp Supabase'de
**Authentication → Providers → Twitter**'a gir ve sağlayıcıyı etkinleştir.

> İki uyarı:
> - Supabase'in Twitter sağlayıcısı OAuth 1.0a kullanır; X panelinde OAuth 2.0
>   değil, **OAuth 1.0a** anahtarlarını istediğine dikkat et (alan adları
>   "API Key / API Secret Key").
> - X'in ücretsiz geliştirici katmanının oturum açmayı kapsayıp kapsamadığı
>   zaman zaman değişiyor. Portal ücretli plan istiyorsa Faz 1 burada takılır;
>   sürprizle karşılaşmamak için bu adımı erken dene.

### 1.4 Supabase yönlendirme adresleri

**Authentication → URL Configuration**:

- Site URL: `https://partim.lol` (alan adı henüz yoksa `https://haydarsahin0.github.io/partim.lol/`)
- Redirect URLs listesine ekle:
  - `https://partim.lol/**`
  - `https://haydarsahin0.github.io/partim.lol/**`
  - `http://localhost:5173/**`

### 1.5 Anahtarları GitHub'a gir

Depo → **Settings → Secrets and variables → Actions**:

- **Variables** sekmesi: `VITE_SUPABASE_URL` = `https://<proje>.supabase.co`
- **Secrets** sekmesi: `VITE_SUPABASE_ANON_KEY` = projenin anon (public) anahtarı

Sonra **Actions → GitHub Pages'e dağıt → Run workflow** ile yeniden yayınla.
Üstteki sarı "Demo mod" şeridi kaybolduysa gerçek moda geçmişsin demektir.

### 1.6 Doğrula

- [ ] X ile giriş yapılıyor, avatar ve kullanıcı adı geliyor
- [ ] Oy verilebiliyor; ikinci oy denemesi 1 saat bekletiyor
- [ ] Farklı bir tarayıcıdan bakınca aynı oy sayıları görünüyor (artık ortak veritabanı)
- [ ] Sıralamada gerçek kullanıcılar çıkıyor
- [ ] Bir saat sonra il başkanının XP'si arttı (pg_cron çalışıyor)

---

## Faz 2 — Ödemeler (Stripe)

### 2.1 Önce test modunda

1. Stripe hesabı aç. Panelin sağ üstündeki **Test mode** açıkken devam et.
2. Stripe'ın **Developers → API keys** sayfasından gizli anahtarı al ve depo
   Secrets'ına `STRIPE_SECRET_KEY` olarak ekle.

3. Depo → **Actions → "Supabase'e uygula" → Run workflow** → hedef
   `fonksiyonlar`. İş akışı anahtarı Supabase'e aktarır ve iki edge fonksiyonunu
   yükler (`stripe-webhook` doğru şekilde JWT doğrulaması kapalı yüklenir).
   Yükleme sunucuda derlenir; Docker gerekmez.

4. Stripe → **Developers → Webhooks → Add endpoint**:
   - URL: `https://<proje>.supabase.co/functions/v1/stripe-webhook`
   - Olay: `checkout.session.completed`
   - Signing secret'ı (`whsec_...`) al, depo Secrets'ına `STRIPE_WEBHOOK_SECRET`
     olarak ekle ve iş akışını `fonksiyonlar` hedefiyle bir kez daha çalıştır.

5. Test kartı `4242 4242 4242 4242` ile bir koltuk satın al. Beklenen: ödemeden
   sonra siteye dönünce "Ödemen alındı, koltuk devrediliyor…" görünür ve birkaç
   saniye içinde koltuk sana geçer.

### 2.2 Canlıya geçir

1. Stripe'ta işletme bilgilerini tamamla (kimlik/işletme doğrulaması, banka
   hesabı). Onay birkaç gün sürebilir.
2. Test modunu kapat, depo Secrets'ındaki `STRIPE_SECRET_KEY` ve
   `STRIPE_WEBHOOK_SECRET` değerlerini canlı karşılıklarıyla değiştir, sonra
   iş akışını `fonksiyonlar` hedefiyle çalıştır. Webhook uç noktasını canlı modda
   **yeniden oluşturman** gerekir; test webhook'u canlıda çalışmaz.
3. Küçük bir gerçek ödemeyle ($1) uçtan uca dene.

### 2.3 Bilinen boşluk

Ödeme sürerken koltuk başka birine geçerse satın alma uygulanmaz ve
`seat_purchases` tablosuna `status = 'stale'` olarak yazılır. **Otomatik iade
yok.** Bu kayıtları düzenli kontrol edip Stripe panelinden elle iade et:

```sql
select * from seat_purchases where status = 'stale' order by created_at desc;
```

---

## Faz 3 — partim.lol alan adı

1. Alan adı sağlayıcının DNS panelinde:

   | Tip | Ad | Değer |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `haydarsahin0.github.io` |

   (GitHub bu IP'leri nadiren değiştirir; Pages belgelerindeki güncel listeyle
   karşılaştır.)

2. Depo → **Settings → Pages → Custom domain** → `partim.lol` → Save.
   DNS yayılınca **Enforce HTTPS**'i işaretle (sertifika birkaç saat sürebilir).
3. Depo → Settings → Secrets and variables → Actions → **Variables**:
   `CUSTOM_DOMAIN` = `partim.lol`. Bu, her dağıtımda `CNAME` dosyasını yazar;
   olmadan bir sonraki dağıtım özel alan adı ayarını düşürebilir.
4. `src/lib/site.ts` içindeki `url` alanını güncelle.
5. Supabase'in Redirect URL listesine ve X uygulamasının Website/Callback
   alanlarına yeni adresi eklemeyi unutma.

---

## Yayın sonrası

- **Supabase ücretsiz katmanı** iki haftalık hareketsizlikte projeyi duraklatır;
  oyun canlıysa sorun olmaz ama sessiz dönemlerde kontrol et.
- **Yedek**: Supabase → Database → Backups. Ücretsiz katmanda günlük yedek yok,
  önemli hâle gelirse ücretli plana geç.
- **Kötüye kullanım**: saatlik oy sınırı sunucuda uygulanır, ama çok hesap açmayı
  engelleyen bir şey yok. Sorun büyürse IP başına sınır veya X hesap yaşı şartı
  eklenebilir.
- **Oylar herkese açık**: `votes` tablosu ve "son oylar" akışı kimin neye oy
  verdiğini gösterir. Bu bilinçli bir tercih; değiştirmek istersen
  `supabase/migrations/20260823120000_init.sql` içindeki `votes` select politikasını daralt.
