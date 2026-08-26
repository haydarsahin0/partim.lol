import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronRight, Loader2, Sparkles, Vote, Zap } from "lucide-react";
import { partyColor, partyTextColor } from "@/data/parties";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Button } from "@/components/ui/button";
import {
  FAST_VOTE_COOLDOWN_LABEL,
  FAST_VOTE_COOLDOWN_MS,
  FAST_VOTE_MULTIPLIER,
  VOTE_COOLDOWN_MS,
  shortDuration,
  PARTY_WEEKLY_PRICE,
  VOTE_COOLDOWN_LABEL,
  XP_PER_VOTE,
  formatDuration,
  formatUsd,
  hasFastVotes,
  hasUnlimitedVotes,
} from "@/lib/game";
import { cn } from "@/lib/utils";
import { PartyMark } from "@/components/PartyMark";
import { CreatePartyDialog } from "@/components/CreatePartyDialog";

/** Bir il için oy pusulası: parti seç, saatte bir oy kullan. */
export function VoteBallot({
  provinceId,
  provinceName,
  onVoted,
}: {
  provinceId: string;
  provinceName: string;
  onVoted?: () => void;
}) {
  const { profile, vote, parties, startFastVotes, requireAuth } = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [partiKur, setPartiKur] = useState(false);
  const [hizliBusy, setHizliBusy] = useState(false);

  const resmiPartiler = useMemo(() => parties.filter((party) => !party.custom), [parties]);
  const kullaniciPartileri = useMemo(() => parties.filter((party) => party.custom), [parties]);
  const unlimited = hasUnlimitedVotes(profile);
  const hizli = hasFastVotes(profile);
  const cooldown = useCountdown(unlimited ? null : profile?.nextVoteAt);

  const locked = !unlimited && cooldown > 0;

  const hizliAc = async () => {
    if (!requireAuth("Aboneliğin hesabına bağlanması için önce giriş yap.")) return;
    setHizliBusy(true);
    try {
      await startFastVotes();
    } finally {
      setHizliBusy(false);
    }
  };

  const submit = async () => {
    if (!selected) return;
    if (!requireAuth("Oyunun sayılması için hesabına ihtiyacımız var.")) return;
    setBusy(true);
    try {
      const ok = await vote(provinceId, selected);
      if (ok) {
        setSelected(null);
        onVoted?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">Oy pusulası</h3>
        <span className="text-xs text-muted-foreground">
          {unlimited ? "Sınırsız oy hakkı" : hizli ? FAST_VOTE_COOLDOWN_LABEL : VOTE_COOLDOWN_LABEL}{" "}
          · oy başına +{XP_PER_VOTE} XP
        </span>
      </div>

      {/*
        Parti kurma pusulanın en başında: oy verecek kişi listeye bakarken
        kendi partisini de kurabileceğini görsün.
      */}
      <button
        type="button"
        onClick={() => {
          if (!requireAuth("Partini hesabına bağlayabilmemiz için önce giriş yap.")) return;
          setPartiKur(true);
        }}
        className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-400/[0.06] px-3 py-2.5 text-left transition-colors hover:border-cyan-300/70 hover:bg-cyan-400/[0.12]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-foreground">Kendi partini kur</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            Haftalık {formatUsd(PARTY_WEEKLY_PRICE)} · adını, rengini ve logonu seç, partin bu
            pusulaya girsin
          </span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {resmiPartiler.map((party) => {
          const isSelected = selected === party.id;
          return (
            <button
              key={party.id}
              type="button"
              onClick={() => setSelected(isSelected ? null : party.id)}
              aria-pressed={isSelected}
              title={party.fullName}
              className={cn(
                "group relative flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all",
                isSelected
                  ? "border-white/40 bg-white/[0.09] shadow-lg"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.06]",
              )}
            >
              {isSelected ? (
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-lg"
                  style={{ background: party.color, color: partyTextColor(party.id) }}
                >
                  <Check className="size-3.5" />
                </span>
              ) : (
                <PartyMark partyId={party.id} size={28} className="rounded-lg" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{party.name}</span>
            </button>
          );
        })}
      </div>

      {kullaniciPartileri.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Sizler tarafından kurulan partiler
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kullaniciPartileri.map((party) => {
              const isSelected = selected === party.id;
              return (
                <button
                  key={party.id}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : party.id)}
                  aria-pressed={isSelected}
                  title={party.fullName}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all",
                    isSelected
                      ? "border-white/40 bg-white/[0.09] shadow-lg"
                      : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.06]",
                  )}
                >
                  {isSelected ? (
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-lg"
                      style={{ background: party.color, color: partyTextColor(party.id) }}
                    >
                      <Check className="size-3.5" />
                    </span>
                  ) : (
                    <PartyMark partyId={party.id} size={28} className="rounded-lg" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{party.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        variant={selected && !locked ? "primary" : "default"}
        disabled={!selected || locked || busy}
        onClick={() => void submit()}
        style={
          selected && !locked
            ? { background: partyColor(selected), color: partyTextColor(selected) }
            : undefined
        }
      >
        {busy ? (
          <Loader2 className="animate-spin" />
        ) : locked ? (
          <>Sonraki oy: {formatDuration(cooldown)}</>
        ) : (
          <>
            <Vote />
            {selected ? `${provinceName} için oy ver` : "Bir parti seç"}
          </>
        )}
      </Button>

      {/*
        Hızlı oy: oy düğmesinin hemen altında, geri sayımın gözle görüldüğü yerde.
        Düğmede fiyat bilerek yok — kullanıcı ücreti Stripe sayfasında görüyor;
        burada yalnızca ne kazandığı duruyor.
      */}
      {!unlimited &&
        (hizli ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2">
            <Zap className="size-4 shrink-0 fill-amber-300 text-amber-300" />
            <span className="text-[12px] leading-snug">
              <strong className="text-foreground">Hızlı oy açık</strong>{" "}
              <span className="text-muted-foreground">
                — {FAST_VOTE_COOLDOWN_LABEL}, her gün kendiliğinden yenilenir.
              </span>
            </span>
          </div>
        ) : (
          /*
             Satılan şey bir SÜRE KISALMASI. Onu cümleyle anlatmak yerine
             gösteriyoruz: eski süre soluk ve üstü çizili, yeni süre parlak.
             Göz iki sayıyı yan yana görünce farkı okumadan anlıyor.
          */
          <button
            type="button"
            onClick={() => void hizliAc()}
            disabled={hizliBusy}
            className={cn(
              "group relative isolate w-full overflow-hidden rounded-2xl px-3.5 py-3 text-left",
              "border border-amber-300/25 bg-[radial-gradient(120%_140%_at_0%_0%,hsl(43_96%_56%_/_0.16)_0%,hsl(43_96%_56%_/_0.05)_45%,transparent_75%)]",
              "shadow-[inset_0_1px_0_0_hsl(43_96%_80%_/_0.16)]",
              "transition-all duration-200 hover:border-amber-300/55 hover:shadow-[inset_0_1px_0_0_hsl(43_96%_80%_/_0.28),0_8px_24px_-12px_hsl(43_96%_56%_/_0.5)]",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            {/* Üstünden geçen ışık: yalnızca imleç üzerindeyken, tek sefer. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-full -z-10 w-1/2 skew-x-[-20deg] bg-gradient-to-r from-transparent via-amber-200/[0.14] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[300%] motion-reduce:hidden"
            />

            <span className="flex items-start gap-3">
              <span className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300 ring-1 ring-amber-300/25 transition-transform duration-200 group-hover:scale-105">
                {hizliBusy ? (
                  <Loader2 className="size-[18px] animate-spin" />
                ) : (
                  <Zap className="size-[18px] fill-current" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-bold tracking-[-0.01em] text-foreground">
                    Hızlı oy
                  </span>
                  <span className="rounded-full bg-amber-300/90 px-1.5 py-px font-mono text-[10px] font-bold leading-[1.4] text-[#2a1e00]">
                    {FAST_VOTE_MULTIPLIER}× hızlı
                  </span>
                </span>

                {/* Asıl mesaj: süre bu kadardan buna iniyor. */}
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-muted-foreground line-through decoration-white/30">
                    {shortDuration(VOTE_COOLDOWN_MS)}
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-amber-300/70" />
                  <span className="font-mono text-[13px] font-bold leading-none text-amber-200">
                    {shortDuration(FAST_VOTE_COOLDOWN_MS)}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    · bir oydan diğerine
                  </span>
                </span>

                {/* İnce yazı da metin sütununda: ikonun altından başlayınca
                    kartın sol kenarı iki farklı hizada kırılıyordu. */}
                <span className="mt-1.5 block text-[11px] leading-tight text-muted-foreground">
                  Günlük abonelik, istediğin an iptal edebilirsin.
                </span>
              </span>

              <ChevronRight className="size-4 shrink-0 self-center text-amber-300/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-amber-300" />
            </span>
          </button>
        ))}

      <CreatePartyDialog open={partiKur} onOpenChange={setPartiKur} />
    </div>
  );
}
