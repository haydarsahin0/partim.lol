import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, RotateCcw, Video } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { VoteHistory } from "@/backend/types";
import { buildFrames, syntheticHistory, type Frame } from "@/lib/timelapse";
import { BOYUTLAR, drawFrame, type Oran } from "@/lib/timelapseRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Kaynak = "gercek" | "ornek";

const HIZLAR = [
  { etiket: "0,5×", kare: 6 },
  { etiket: "1×", kare: 12 },
  { etiket: "2×", kare: 24 },
  { etiket: "4×", kare: 48 },
];

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
  const [hiz, setHiz] = useState(1);
  const [history, setHistory] = useState<VoteHistory | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [oynuyor, setOynuyor] = useState(false);
  const [indeks, setIndeks] = useState(0);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [video, setVideo] = useState<{ url: string; uzanti: string } | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  /* ------------------------------- veri ---------------------------------- */

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata(null);

    const yukle = async () => {
      if (kaynak === "ornek") {
        const gercek = await backend.getVoteHistory("hour").catch(() => null);
        // Örnek akış gerçek açılış tablosunun üstüne biniyor: video haritanın
        // gerçek başlangıç hâlinden yola çıksın.
        return { ...syntheticHistory(), seed: gercek?.seed ?? {} };
      }
      return backend.getVoteHistory("hour");
    };

    void yukle()
      .then((next) => {
        if (iptal) return;
        setHistory(next);
        setIndeks(0);
      })
      .catch((err) => {
        if (!iptal) setHata(err instanceof Error ? err.message : "Geçmiş okunamadı.");
      })
      .finally(() => !iptal && setYukleniyor(false));

    return () => {
      iptal = true;
    };
  }, [backend, kaynak]);

  const frames: Frame[] = useMemo(() => (history ? buildFrames(history) : []), [history]);
  const frame = frames[Math.min(indeks, Math.max(0, frames.length - 1))] ?? null;

  /* ------------------------------- çizim --------------------------------- */

  const ciz = useCallback(
    (f: Frame | null) => {
      const canvas = canvasRef.current;
      if (!canvas || !f) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawFrame(ctx, f, { oran, ornek: kaynak === "ornek" });
    },
    [oran, kaynak],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = BOYUTLAR[oran];
    canvas.width = width;
    canvas.height = height;
    ciz(frame);
  }, [oran, ciz, frame]);

  useEffect(() => {
    ciz(frame);
  }, [frame, ciz]);

  /* ------------------------------ oynatma -------------------------------- */

  useEffect(() => {
    if (!oynuyor || frames.length === 0) return;
    const kareBasinaMs = 1000 / (HIZLAR[hiz]?.kare ?? 12);
    let son = performance.now();

    const dongu = (now: number) => {
      if (now - son >= kareBasinaMs) {
        son = now;
        setIndeks((prev) => {
          if (prev + 1 >= frames.length) {
            // Kayıt sırasında son karede durup kaydı kapatıyoruz.
            setOynuyor(false);
            return frames.length - 1;
          }
          return prev + 1;
        });
      }
      rafRef.current = requestAnimationFrame(dongu);
    };
    rafRef.current = requestAnimationFrame(dongu);
    return () => cancelAnimationFrame(rafRef.current);
  }, [oynuyor, hiz, frames.length]);

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

    const stream = canvas.captureStream(30);
    const parcalar: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: bicim.mime,
      videoBitsPerSecond: 8_000_000,
    });
    recorder.ondataavailable = (e) => e.data.size > 0 && parcalar.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setVideo({
        url: URL.createObjectURL(new Blob(parcalar, { type: bicim.mime })),
        uzanti: bicim.uzanti,
      });
      setKaydediyor(false);
      recorderRef.current = null;
    };
    recorderRef.current = recorder;

    setIndeks(0);
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

  const sure = frames.length / (HIZLAR[hiz]?.kare ?? 12);

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
                    if (indeks >= frames.length - 1) setIndeks(0);
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
                    setIndeks(0);
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
                max={Math.max(0, frames.length - 1)}
                value={indeks}
                onChange={(e) => {
                  setOynuyor(false);
                  setIndeks(Number(e.target.value));
                }}
                disabled={kaydediyor}
                aria-label="Zaman"
                className="w-full accent-primary"
              />

              <div className="grid gap-3 sm:grid-cols-3">
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
                  baslik="Hız"
                  secenekler={HIZLAR.map((h, i) => ({ deger: String(i), etiket: h.etiket }))}
                  secili={String(hiz)}
                  onSec={(v) => setHiz(Number(v))}
                  kilitli={kaydediyor}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{frames.length} kare</Badge>
                <Badge variant="secondary">≈{sure.toFixed(0)} sn</Badge>
                <Badge variant="secondary">
                  {BOYUTLAR[oran].width}×{BOYUTLAR[oran].height}
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
