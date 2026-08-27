# Tanıtım videosu (zaman tüneli)

`partim.lol/#/zaman-tuneli` — oy oranlarının ve haritanın zaman içindeki
değişimini hızlandırılmış olarak oynatır ve **doğrudan video dosyası** verir.
Telefondan da çalışır; ekran kaydı gerekmiyor.

## Nasıl çalışıyor

Geçmişi ayrıca kaydetmiyoruz. `public.votes` her oyun ne zaman kullanıldığını
zaten tutuyor; haritanın herhangi bir andaki hâli, açılış tablosunun üstüne o
ana kadarki oyları eklemekle bulunuyor. Yani zaman tüneli **geriye dönük** de
çalışır — özellik bugün açıldı ama ilk günden bu yana verilen bütün oyları
gösterebilir.

Kareler bir `<canvas>`'a çiziliyor ve `canvas.captureStream()` ile
kaydediliyor. Ekran kaydından farkı: arayüz, imleç ve tarayıcı çerçevesi
görüntüye girmiyor, çözünürlük tam istenen ölçüde oluyor.

## Kullanımı

1. **Kaynak**
   - `Gerçek oylar` — oyuncuların gerçekten kullandığı oylar.
   - `Örnek akış` — inandırıcı bir simülasyon. Oyun yeni açıldığı ve gerçek
     geçmiş henüz kısa olduğu için var. Bu videoya **"ÖRNEK VERİ"** damgası
     basılır; damgayı kaldırmayın — tanıtım videosunun gerçek sonuç
     sanılması, oyunun kendisine güveni sarsar.
2. **Tarz** — aynı veri dört kuşakta çizilir:
   - 🗺️ **Klasik** — harita + tablo, tanıdık görünüm.
   - 🚨 **Son Dakika** — haber kuşağı: kırmızı bant, üstte "SON DAKİKA"
     rozeti, altta büyük manşet bandı. Reels için önerilen.
   - 🗳️ **Seçim Gecesi** — canlı yayın: "CANLI" rozeti ve açılan sandık
     sayacı. X için önerilen.
   - ⬛ **Minimal** — sade tipografi, az gürültü, kocaman manşet.
3. **Kapak yazısı** — açılış kartındaki ve manşet bandındaki metin. Boş
   bırakılırsa tarza göre otomatik yazılır; bir il seçiliyse il adıyla
   üretilir ("İSTANBUL BÖYLE DEĞİŞTİ").
4. **Kalite** — `720p` (varsayılan) ya da `1080p`. Sosyal medyada 720p
   fazlasıyla yeterli ve daha güvenli (aşağıya bakın).
5. **Ölçü** — `16:9` (YouTube, X), `9:16` (Reels, TikTok, Shorts),
   `1:1` (akış gönderisi).
6. **Çözünürlük** — kaç dakikada bir kare alınacağı. `10 dk` en akıcısı;
   geçmiş uzadıkça `1 saat` yeter.
7. **Aralık** — video yalnızca son süreyi göstersin: `Son 24 saat`,
   `Son 6 saat`, `Son 2 saat`, `Son 1 saat`, `Son 30 dk`, `Son 15 dk`.
   Varsayılan **Tüm geçmiş**. Aralık seçildiğinde video, o aralığın
   başlangıcındaki harita durumuyla açılır (öncesindeki oylar sessizce
   işlenir). Kısa aralıklarda akıcılık için **Zaman dilimi**'ni 5 dk ya da
   10 dk yapın; az kare varsa sayfa bunu söyler.
8. **Süre** — videonun kaç saniye olacağı: `10`, `15`, `20`, `30`. Veri kaç
   kare olursa olsun seçilen süreye yayılır; aradaki kareler üretilir.
9. **Video oluştur** → oynatma başlar, bitince **Videoyu indir** düğmesi çıkar.

### Hazır ayarlar

- **📱 Reels** — `9:16` · `15 sn` · `Son Dakika` tarzı. Reels/TikTok/Shorts
  için tek tıkla.
- **🐦 X** — `16:9` · `20 sn` · `Seçim Gecesi` tarzı. X akışı için tek tıkla.

## Viral kurgu

Video tek bir görünümden ibaret değil; her tarzda şunlar var:

- **Açılış kartı** — ilk ~1,4 saniye: ince, harf aralıklı (letter-spacing)
  ve ölçülü bir manşet, üstünde vurgu renginde ince aksan çizgisi ve
  "partim.lol" markası. Reels'te ilk iki saniye izleyiciyi durduran kısım
  budur; sonunda soldurarak haritayı açar.
- **Kapanış kartı** — son ~2,4 saniye: "partim.lol — Sen de oy ver, ilini
  boya" çağrısı. Marka izleyicide kalır; videoyu sonuna kadar izleyen herkes
  adresi görür.
- **Devir parlaması** — bir ilin rengi değiştiği anda o il ~450 ms beyaz
  çizgiyle parlar. Vurgu yalnızca GÖRSELdir: videoya "şu il şundan şuna
  geçti" gibi hiçbir devir yazısı basılmaz; "Son Dakika" bandında her zaman
  yalnızca kapak yazısı görünür.
- **Ken Burns** — harita video boyunca yavaşça yakınlaşır; düz veri
  görüntüsüne hareket ve dram katar.
- **Giriş & bitiş kartları** kapatılabilir ("Giriş & bitiş kartları"
  onay kutusu) — saf veri görselleştirmesi istenirse.

Açılış ve kapanış kartları seçilen sürenin **içinden** ayrılır: "15 sn"
seçtiysen dosya yine 15 saniyedir.

## Süre neden kısa çıkabilir?

Kayıt gerçek zamanda yapılıyor: tarayıcı canvas'a çizilen kareleri o an
yakalıyor. Cihaz çizime yetişemezse yakalanan kare azalıyor ve video
istenenden kısa çıkıyor.

Sayfa bunu kendisi ölçüp söylüyor: kayıt bitince "Video 15,0 sn olarak hazır"
ya da "Video 11,2 sn çıktı, oysa 15 sn istendi" yazıyor. Kısa çıkarsa:

- **Kaliteyi 720p yapın** (kare başına yarı piksel).
- Kayıt sürerken **sekmeyi öne alın**; arka plandaki sekmede tarayıcı çizimi
  yavaşlatıyor.
- Diğer ağır sekmeleri kapatın.

Kayıt bitene kadar sekmeyi arka plana atmayın: tarayıcılar arka plandaki
sekmede çizimi yavaşlatıyor ve video kekeme çıkıyor.

## Dosya biçimi

Tarayıcının desteklediği ilk biçim kullanılır: Chrome ve Safari'de genellikle
`.mp4`, Firefox'ta `.webm`. İkisi de kurgu programlarına doğrudan girer.
`.webm` dosyasını Instagram gibi bir yere yükleyemezseniz herhangi bir
dönüştürücüyle `.mp4` yapmanız yeterli.

Tarayıcı `MediaRecorder`'ı desteklemiyorsa sayfa bunu söyler; o durumda
videoyu telefonun kendi ekran kaydıyla alabilirsiniz — sayfayı tam ekran
yapıp oynatın.

## Video daha iyi olsun

- **Uzunluk**: sosyal medya için 10–15 saniye ideal; varsayılan 15.
- **Sonu**: video son karede bir saniye kadar duruyor, ani kesilmiyor
  (kartlar açıkken bu sürede kapanış kartı görünür).
- **Ses**: dosyada ses yok. Kurguda müzik ekleyin.
- **Yazı**: videoda oyun adı, tarih, toplam oy, manşet ve devir yazıları
  zaten var; üstüne yazı eklemek gerekmiyor.
- **Kapak yazısını kısa ve merak uyandırıcı tutun** — manşet bandı yalnızca
  bu yazıyı gösterir (devirler videoya yazı olarak girmez), o yüzden il adı
  kullanmadan genel bir manşet yazın ("TÜRKİYE BÖYLE OY VERDİ" gibi).
- **Tek il videosu**: "Kapsam"dan bir il seçersen manşet o ilin adıyla
  üretilir ve harita o ile yakınlaşır — memleket gururu içerikleri en çok
  paylaşılanlardır.
