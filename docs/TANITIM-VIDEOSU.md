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
2. **Ölçü** — `16:9` (YouTube, X), `9:16` (Reels, TikTok, Shorts),
   `1:1` (akış gönderisi).
3. **Hız** — saniyede kaç kare oynatılacağı. `1×` bir saati bir kare sayar.
4. **Video oluştur** → oynatma başlar, bitince **Videoyu indir** düğmesi çıkar.

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

- **Uzunluk**: 72 kare × `1×` ≈ 6 saniye. Sosyal medya için 6–15 saniye
  ideal; daha uzun istiyorsanız hızı `0,5×` yapın.
- **Sonu**: video son karede duruyor, yani son görüntü tablonun son hâli.
  Kurguda o kareyi 1–2 saniye dondurmak iyi durur.
- **Ses**: dosyada ses yok. Kurguda müzik ekleyin.
- **Yazı**: videoda oyun adı, tarih ve toplam oy zaten var; üstüne yazı
  eklemek gerekmiyor.
