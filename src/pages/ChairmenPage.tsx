import { useEffect, useState } from "react";
import { Crown, MapPin, Vote } from "lucide-react";
import { Link } from "react-router-dom";
import { useGame } from "@/backend/GameProvider";
import type { LeaderboardEntry } from "@/backend/types";
import { PROVINCES } from "@/data/provinces";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, levelTitle } from "@/lib/game";
import { cn } from "@/lib/utils";

const MADALYA = ["text-amber-300", "text-slate-300", "text-orange-400"];

/**
 * Başkanlar tablosu.
 *
 * NEDEN AYRI BİR SAYFA
 *
 * Sıralama sayfası XP'ye göre; XP'yi oy kullanarak da biriktirebiliyorsun.
 * Oysa oyunun para kazandıran ve asıl rekabet yaratan kısmı il başkanlığı:
 * koltuk satın alınıyor, elde tutuluyor ve devralınıyor. "Haritanın kaçta kaçı
 * kimin" sorusunun tek bir cevabı yoktu — burada var.
 */
export default function ChairmenPage() {
  const { backend, user } = useGame();
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let iptal = false;
    void backend.getChairmen(50).then((data) => {
      if (!iptal) setRows(data);
    });
    return () => {
      iptal = true;
    };
  }, [backend]);

  const toplamKoltuk = rows?.reduce((a, r) => a + r.leaderCount, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Başkanlar</h1>
        <p className="text-sm text-muted-foreground">
          En çok il başkanlığı tutandan aza. Her il, her parti için ayrı bir koltuk —
          toplam {formatNumber(PROVINCES.length)} ilde yer var.
        </p>
      </div>

      {rows && rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="glass-soft px-3 py-1.5">
            <strong className="font-mono text-foreground">{rows.length}</strong> başkan
          </span>
          <span className="glass-soft px-3 py-1.5">
            <strong className="font-mono text-foreground">{formatNumber(toplamKoltuk)}</strong>{" "}
            koltuk tutuluyor
          </span>
        </div>
      )}

      <Card className="p-2 sm:p-3">
        {!rows ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          /*
           * Boş liste bir hata değil, bir davet: koltuklar duruyor.
           */
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz hiçbir ilin başkanı yok.
            </p>
            <Link
              to="/"
              className="mt-2 inline-block text-sm font-semibold text-primary underline underline-offset-4"
            >
              Haritadan bir il seç ve ilk başkan sen ol
            </Link>
          </div>
        ) : (
          <ol className="space-y-1">
            {rows.map((row, index) => {
              const benim = user?.id === row.user.id;
              return (
                <li
                  key={row.user.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5",
                    benim ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "w-7 shrink-0 text-center font-display text-sm font-bold",
                      MADALYA[index] ?? "text-muted-foreground",
                    )}
                  >
                    {index < 3 ? <Crown className="mx-auto size-4" /> : index + 1}
                  </span>
                  <Avatar src={row.user.avatarUrl} handle={row.user.handle} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {row.user.displayName}
                      {benim && <span className="ml-1.5 text-xs text-primary">(sen)</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{row.user.handle} · Sv.{row.level} {levelTitle(row.level)}
                    </div>
                  </div>
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <Vote className="size-3.5" />
                    {formatNumber(row.voteCount)}
                  </span>
                  {/* Asıl sayı bu: sağda, en ağır yazıyla. */}
                  <span className="flex w-20 shrink-0 items-center justify-end gap-1.5 font-mono text-sm font-bold tabular-nums">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {row.leaderCount}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
