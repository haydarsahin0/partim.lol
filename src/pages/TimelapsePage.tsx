import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, RotateCcw, Video } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { VoteHistory, VoteHistoryBucket } from "@/backend/types";
import { buildFrames, lerpFrame, syntheticHistory, type Frame } from "@/lib/timelapse";
import { BOYUTLAR, drawFrame, type Kalite, type Oran } from "@/lib/timelapseRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Kaynak = "gercek" | "ornek";

/**
 * Video süresi saniye cinsinden seçiliyor, kare hızı değil.
 *
 * "2× hız" demek videonun kaç saniye süreceğini söylemiyordu; sosyal medyada
 * istenen şey ise doğrudan süre. Oynatıcı seçilen süreyi bir saat gibi
 * kullanıyor ve veriyi o süreye yayıyor.
 */
const SURELER = [10, 15, 20, 30];

/** Kaç dakikada bir kare alınacağı. Kısa geçmişte ince kova daha çok kare verir. */
const COZUNURLUKLER: Array<{ deger: VoteHistoryBucket; etiket: string; ms: number }> = [
  { deger: "10min", etiket: "10 dk", ms: 600_000 },
  { deger: "hour", etiket: "1 saat", ms: 3_600_000 },
  { deger: "day", etiket: "1 gün", ms: 86_400_000 },
];

/**
 * Çizim hızı. Veri kovaları seyrek olsa da aradaki kareler üretiliyor.
 *
 * 25, 30 yerine bilinçli: 1920×1080 bir kareyi çizmek yavaş makinelerde
 * 30 kare/sn'ye yetişmiyor ve kaçan kareler videoyu istenenden kısa
 * yapıyordu. 25 hem sinema standardı hem güvenli.
 */
const KARE_HIZI = 25;

/** Video sonunda son kare bu kadar duruyor; ani kesme kötü duruyor. */
const BITIS_DURAKLAMA_MS = 1200;

/**
 * Hazırlanan videonun gerçek süresi.
 *
 * İstenen süre bir bütçe; kaydı yapan tarayıcı kareleri gerçek zamanda
 * yakaladığı için yavaş bir cihazda video istenenden kısa çıkabiliyor.
 * Kullanıcı bunu ancak dosyayı açınca fark ederdi — ölçüp söylüyoruz.
 */
async function videoSuresi(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let bitti = false;
    const bitir = (d: number | null) => {
      if (bitti) return;
      bitti = true;
      v.removeAttribute("src");
      resolve(d && Number.isFinite(d) && d > 0 ? d : null);
    };
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) return bitir(v.duration);
      // WebM'de süre çoğu zaman Infinity geliyor; sona sarınca yerine oturuyor.
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        bitir(v.duration);
      };
      v.currentTime = 1e6;
    };
    v.onerror = () => bitir(null);
    window.setTimeout(() => bitir(null), 6000);
    v.src = url;
  });
}

/** MediaRecorder'ın bu tarayıcıda desteklediği ilk biçim. */
function kayitBicimi(): { mime: string; uzanti: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const adaylar: Array<{ mime: string; uzanti: string }> = [
    { mime: "video/mp4;codecs=avc1", uzanti: "mp4" },
    { mime: "video/mp4", uzanti: "mp4" },
    { mime: "video/webm;codecs=vp9", uzanti: "webm" },
    { mime: "video/webm;codecs=vp8", uzanti: "webm" },
    { mime: "video/webm", uzanti: "webm" },
  ];
  return adaylar.find((a) => MediaRecorder.isTypeSupported(a.mime)) ?? null;
}

/**
 * Zaman tüneli.
 *
 * Oy oranlarının ve haritanın zaman içindeki değişimini hızlandırılmış olarak
 * oynatır ve doğrudan video dosyası olarak kaydeder.
 *
 * Kayıt neden ekran kaydı değil: sayfayı ekrandan kaydetmek arayüzü, imleci ve
 * tarayıcı çerçevesini de içeri alır; çözünürlük de elde olmaz. Kareler
 * canvas'a çizildiği için `captureStream` ile tam istenen boyutta (16:9, 9:16,
 * 1:1) kaydedilebiliyor ve ekran paylaşımı izni gerekmiyor.
 */
export default function TimelapsePage() {
  const { backend, isDemo } = useGame();

  const [kaynak, setKaynak] = useState<Kaynak>(isDemo ? "ornek" : "gercek");
  const [oran, setOran] = useState<Oran>("16:9");
  const [sureSn, setSureSn] = useState(15);
  const [kalite, setKalite] = useState<Kalite>("hd");
  const [cozunurluk, setCozunurluk] = useState<VoteHistoryBucket>("10min");
  const [history, setHistory] = useState<VoteHistory | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [oynuyor, setOynuyor] = useState(false);
  /** 0–1 arası ilerleme. Kare sayısından bağımsız: süre neyse ona yayılıyor. */
  const [ilerleme, setIlerleme] = useState(0);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [video, setVideo] = useState<{ url: string; uzanti: string; sure: number | null } | null>(
    null,
  );
  const [hata, setHata] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  /*
   * Çizim ve kare üretimi ref üzerinden okunuyor.
   *
   * Oynatma döngüsü bunları bağımlılık olarak alsaydı, kimliği değişen her
   * fonksiyonda effect yeniden kurulur ve BAŞLANGIÇ ZAMANI SIFIRLANIRDI —
   * 10 saniyelik video 29 saniye sürüyordu, sebebi buydu.
   */
  const cizRef = useRef<(f: Frame | null) => void>(() => undefined);
  const kareUretRef = useRef<(oran: number) => Frame | null>(() => null);
  const ilerlemeRef = useRef(0);

  /* ------------------------------- veri ---------------------------------- */

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata(null);

    const kova = COZUNURLUKLER.find((c) => c.deger === cozunurluk) ?? COZUNURLUKLER[1];

    const yukle = async () => {
      if (kaynak === "ornek") {
        const gercek = await backend.getVoteHistory(cozunurluk).catch(() => null);
        // Örnek akış gerçek açılış tablosunun üstüne biniyor: video haritanın
        // gerçek başlangıç hâlinden yola çıksın. Kova aralığı seçilen
        // çözünürlükle aynı olmalı, yoksa tarih etiketi tutmuyor.
        return {
          ...syntheticHistory({ bucketMs: kova.ms, buckets: 72, votesPerBucket: 90 }),
          seed: gercek?.seed ?? {},
        };
      }
      return backend.getVoteHistory(cozunurluk);
    };

    void yukle()
      .then((next) => {
        if (iptal) return;
        setHistory(next);
        setIlerleme(0);
      })
      .catch((err) => {
        if (!iptal) setHata(err instanceof Error ? err.message : "Geçmiş okunamadı.");
      })
      .finally(() => !iptal && setYukleniyor(false));

    return () => {
      iptal = true;
    };
  }, [backend, kaynak, cozunurluk]);

  const frames: Frame[] = useMemo(() => (history ? buildFrames(history) : []), [history]);

  /**
   * O anki kare. İlerleme kesirli olduğu için iki veri karesinin arası
   * doldurulur — böylece kaç kova olursa olsun görüntü akıcı kalıyor.
   */
  const kareUret = useCallback(
    (oran: number): Frame | null => {
      if (frames.length === 0) return null;
      if (frames.length === 1) return frames[0];
      const konum = Math.max(0, Math.min(1, oran)) * (frames.length - 1);
      const i = Math.min(frames.length - 2, Math.floor(konum));
      return lerpFrame(frames[i], frames[i + 1], konum - i);
    },
    [frames],
  );

  const frame: Frame | null = useMemo(() => kareUret(ilerleme), [kareUret, ilerleme]);

  /* ------------------------------- çizim --------------------------------- */

  const ciz = useCallback(
    (f: Frame | null) => {
      const canvas = canvasRef.current;
      if (!canvas || !f) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawFrame(ctx, f, { oran, kalite, ornek: kaynak === "ornek" });
    },
    [oran, kalite, kaynak],
  );

  // Döngünün okuduğu güncel referanslar (bkz. cizRef tanımı).
  cizRef.current = ciz;
  kareUretRef.current = kareUret;
  ilerlemeRef.current = ilerleme;

  /*
   * Canvas ölçüsü yalnızca ölçü/kalite değişince ayarlanmalı.
   *
   * Bağımlılıkta `frame` vardı: her karede canvas.width yeniden atanıyordu.
   * Bu, canvas'ı sıfırlayan ve bağlamı baştan kuran pahalı bir işlem —
   * saniyede sekiz kez yapılınca hem çizim yavaşlıyor hem kayıt akışı
   * kesiliyordu.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = BOYUTLAR[kalite][oran];
    canvas.width = width;
    canvas.height = height;
    cizRef.current(kareUretRef.current(ilerlemeRef.current));
    // ilerleme bilerek bağımlılıkta değil: ölçü değişimine tepki veriyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oran, kalite]);

  // Oynatma dışındayken (slider, ölçü değişimi) çizimi buradan tazeliyoruz;
  // oynatma sırasında kareyi döngünün kendisi çiziyor.
  useEffect(() => {
    if (oynuyor) return;
    ciz(frame);
  }, [frame, ciz, oynuyor]);

  /* ------------------------------ oynatma -------------------------------- */

  /*
   * Oynatma gerçek saate bağlı, kare sayısına değil.
   *
   * Eskiden "kare başına şu kadar milisaniye" diye ilerliyordu; süre kaç kova
   * olduğuna göre değişiyordu ve videonun kaç saniye olacağı önceden belli
   * değildi. Şimdi seçilen süre bir bütçe: geçen zamanın o süreye oranı
   * doğrudan ilerleme oluyor. 15 saniye seçildiyse video 15 saniye sürüyor —
   * veri ister 8 kova olsun ister 400.
   *
   * Sonda kısa bir duraklama var: son kare bir anda kesilince video yarıda
   * kalmış gibi duruyor.
   */
  useEffect(() => {
    if (!oynuyor || frames.length === 0) return;
    const toplamMs = sureSn * 1000;
    const kareAraligi = 1000 / KARE_HIZI;
    let baslangic: number | null = null;
    let sonCizim = -Infinity;
    let sonBildirim = -Infinity;

    const dongu = (now: number) => {
      baslangic ??= now;
      const gecen = now - baslangic;
      const oran = Math.min(1, gecen / toplamMs);

      if (now - sonCizim >= kareAraligi) {
        sonCizim = now;
        /*
         * Kareyi BURADA, doğrudan çiziyoruz.
         *
         * Önce yalnızca React durumunu güncelliyorduk ve çizim ayrı bir
         * effect'te oluyordu. Bitişteki duraklamada ilerleme değişmediği için
         * React yeniden çizmiyordu; canvas'tan yeni kare akmayınca kayıt
         * erken bitiyor ve video istenenden kısa çıkıyordu. Şimdi her tikte
         * bir kare kesin çiziliyor, duraklama boyunca da son kare tazeleniyor.
         */
        cizRef.current(kareUretRef.current(oran));
        // Slider'ı sık güncellemeye gerek yok; her tikte React'i yormayalım.
        if (now - sonBildirim >= 120) {
          sonBildirim = now;
          setIlerleme(oran);
        }
      }

      if (gecen >= toplamMs + BITIS_DURAKLAMA_MS) {
        setIlerleme(1);
        setOynuyor(false);
        return;
      }
      rafRef.current = requestAnimationFrame(dongu);
    };
    rafRef.current = requestAnimationFrame(dongu);
    return () => cancelAnimationFrame(rafRef.current);
  }, [oynuyor, sureSn, frames.length]);

  /* ------------------------------- kayıt --------------------------------- */

  // Oynatma bitince kaydı kapat.
  useEffect(() => {
    if (oynuyor || !kaydediyor) return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, [oynuyor, kaydediyor]);

  const kaydet = useCallback(() => {
    const canvas = canvasRef.current;
    const bicim = kayitBicimi();
    if (!canvas || frames.length === 0) return;
    if (!bicim) {
      setHata(
        "Bu tarayıcı video kaydını desteklemiyor. Chrome ya da Safari'nin güncel sürümünü deneyin; " +
          "alternatif olarak videoyu telefonun ekran kaydıyla alabilirsiniz.",
      );
      return;
    }

    setHata(null);
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);

    const stream = canvas.captureStream(KARE_HIZI);
    const parcalar: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: bicim.mime,
      videoBitsPerSecond: 8_000_000,
    });
    recorder.ondataavailable = (e) => e.data.size > 0 && parcalar.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const url = URL.createObjectURL(new Blob(parcalar, { type: bicim.mime }));
      setVideo({ url, uzanti: bicim.uzanti, sure: null });
      setKaydediyor(false);
      recorderRef.current = null;
      void videoSuresi(url).then((sure) =>
        setVideo((onceki) => (onceki && onceki.url === url ? { ...onceki, sure } : onceki)),
      );
    };
    recorderRef.current = recorder;

    setIlerleme(0);
    setKaydediyor(true);
    recorder.start();
    setOynuyor(true);
  }, [frames.length, video]);

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );

  const kovaSayisi = frames.length;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Zaman tüneli</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Oy oranlarının ve haritanın zaman içindeki değişimi, hızlandırılmış olarak. Doğrudan
          video dosyası olarak indirip tanıtımda kullanabilirsin — ekran kaydı gerekmiyor,
          görüntü tam istediğin ölçüde çıkıyor.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-center bg-black/40 p-3">
          <canvas
            ref={canvasRef}
            className={cn(
              "h-auto w-full rounded-xl",
              oran === "9:16" && "max-w-[min(100%,360px)]",
              oran === "1:1" && "max-w-[min(100%,560px)]",
            )}
          />
        </div>

        <div className="space-y-4 p-4">
          {yukleniyor ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (ilerleme >= 1) setIlerleme(0);
                    setOynuyor((v) => !v);
                  }}
                  disabled={frames.length === 0 || kaydediyor}
                >
                  {oynuyor ? <Pause /> : <Play />}
                  {oynuyor ? "Duraklat" : "Oynat"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOynuyor(false);
                    setIlerleme(0);
                  }}
                  disabled={kaydediyor}
                >
                  <RotateCcw />
                  Başa sar
                </Button>

                <Button variant="secondary" onClick={kaydet} disabled={kaydediyor || frames.length === 0}>
                  {kaydediyor ? <Loader2 className="animate-spin" /> : <Video />}
                  {kaydediyor ? "Kaydediliyor…" : "Video oluştur"}
                </Button>

                {video && (
                  <Button asChild variant="primary">
                    <a href={video.url} download={`partim-lol-zaman-tuneli.${video.uzanti}`}>
                      <Download />
                      Videoyu indir
                    </a>
                  </Button>
                )}
              </div>

              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(ilerleme * 1000)}
                onChange={(e) => {
                  setOynuyor(false);
                  setIlerleme(Number(e.target.value) / 1000);
                }}
                disabled={kaydediyor}
                aria-label="Zaman"
                className="w-full accent-primary"
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Secim
                  baslik="Kaynak"
                  secenekler={[
                    { deger: "gercek", etiket: "Gerçek oylar" },
                    { deger: "ornek", etiket: "Örnek akış" },
                  ]}
                  secili={kaynak}
                  onSec={(v) => {
                    setOynuyor(false);
                    setKaynak(v as Kaynak);
                  }}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Ölçü"
                  secenekler={[
                    { deger: "16:9", etiket: "16:9" },
                    { deger: "9:16", etiket: "9:16" },
                    { deger: "1:1", etiket: "1:1" },
                  ]}
                  secili={oran}
                  onSec={(v) => setOran(v as Oran)}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Kalite"
                  secenekler={[
                    { deger: "hd", etiket: "720p" },
                    { deger: "fullhd", etiket: "1080p" },
                  ]}
                  secili={kalite}
                  onSec={(v) => setKalite(v as Kalite)}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Çözünürlük"
                  secenekler={COZUNURLUKLER.map((c) => ({ deger: c.deger, etiket: c.etiket }))}
                  secili={cozunurluk}
                  onSec={(v) => {
                    setOynuyor(false);
                    setCozunurluk(v as VoteHistoryBucket);
                  }}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Süre"
                  secenekler={SURELER.map((sn) => ({ deger: String(sn), etiket: `${sn} sn` }))}
                  secili={String(sureSn)}
                  onSec={(v) => setSureSn(Number(v))}
                  kilitli={kaydediyor}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{kovaSayisi} veri karesi</Badge>
                <Badge variant="secondary">{sureSn} sn · {KARE_HIZI} kare/sn</Badge>
                <Badge variant="secondary">
                  {BOYUTLAR[kalite][oran].width}×{BOYUTLAR[kalite][oran].height}
                </Badge>
                {kaynak === "ornek" && (
                  <Badge variant="warning">örnek veri — gerçek sonuç değildir</Badge>
                )}
              </div>

              {kaynak === "gercek" && frames.length <= 1 && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Gerçek oy geçmişi henüz bir kareye sığıyor: oyun yeni açıldı. Oylar biriktikçe
                  bu video kendiliğinden uzuyor. Şimdiden tanıtım videosu çekmek için
                  <strong className="text-foreground"> Örnek akış</strong> kaynağını seç — o
                  videoya "örnek veri" damgası basılır.
                </p>
              )}

              {video?.sure != null && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {Math.abs(video.sure - sureSn) <= Math.max(1, sureSn * 0.12) ? (
                    <>
                      Video <strong className="text-foreground">{video.sure.toFixed(1)} sn</strong>{" "}
                      olarak hazır.
                    </>
                  ) : (
                    <>
                      Video <strong className="text-amber-300">{video.sure.toFixed(1)} sn</strong>{" "}
                      çıktı, oysa {sureSn} sn istendi: cihaz çizime yetişemedi. Kaliteyi 720p yapıp
                      ya da başka sekmeleri kapatıp tekrar dene.
                    </>
                  )}
                </p>
              )}

              {hata && <p className="text-[13px] leading-relaxed text-amber-300">{hata}</p>}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Secim({
  baslik,
  secenekler,
  secili,
  onSec,
  kilitli,
}: {
  baslik: string;
  secenekler: Array<{ deger: string; etiket: string }>;
  secili: string;
  onSec: (deger: string) => void;
  kilitli?: boolean;
}) {
  return (
    <div>
      <span className="stat-label">{baslik}</span>
      <div className="mt-1.5 flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
        {secenekler.map((s) => (
          <button
            key={s.deger}
            type="button"
            disabled={kilitli}
            onClick={() => onSec(s.deger)}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              secili === s.deger
                ? "bg-white/[0.12] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.etiket}
          </button>
        ))}
      </div>
    </div>
  );
}
