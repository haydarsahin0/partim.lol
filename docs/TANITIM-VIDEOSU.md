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
2. **Kalite** — `720p` (varsayılan) ya da `1080p`. Sosyal medyada 720p
   fazlasıyla yeterli ve daha güvenli (aşağıya bakın).
3. **Ölçü** — `16:9` (YouTube, X), `9:16` (Reels, TikTok, Shorts),
   `1:1` (akış gönderisi).
4. **Çözünürlük** — kaç dakikada bir kare alınacağı. `10 dk` en akıcısı;
   geçmiş uzadıkça `1 saat` yeter.
5. **Süre** — videonun kaç saniye olacağı: `10`, `15`, `20`, `30`. Veri kaç
   kare olursa olsun seçilen süreye yayılır; aradaki kareler üretilir.
6. **Video oluştur** → oynatma başlar, bitince **Videoyu indir** düğmesi çıkar.

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
- **Sonu**: video son karede bir saniye kadar duruyor, ani kesilmiyor.
- **Ses**: dosyada ses yok. Kurguda müzik ekleyin.
- **Yazı**: videoda oyun adı, tarih ve toplam oy zaten var; üstüne yazı
  eklemek gerekmiyor.
