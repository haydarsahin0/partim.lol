import { useMemo, useState } from "react";
import { Check, Loader2, Sparkles, Vote, Zap } from "lucide-react";
import { partyColor, partyTextColor } from "@/data/parties";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Button } from "@/components/ui/button";
import {
  FAST_VOTE_COOLDOWN_LABEL,
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

  /*
   * Kullanıcıların kurduğu partiler pusulanın başında duruyor. Canlı dizine
   * sona ekleniyorlar; 17 partilik ızgaranın dibinde kalınca partisini yeni
   * kuran kullanıcı kendi partisini bulamıyordu.
   */
  const siralı = useMemo(
    () => [...parties].sort((a, b) => Number(!!b.custom) - Number(!!a.custom)),
    [parties],
  );
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
        {siralı.map((party) => {
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
          <button
            type="button"
            onClick={() => void hizliAc()}
            disabled={hizliBusy}
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-300/[0.14] via-amber-300/[0.06] to-transparent px-3 py-2.5 text-left transition-colors hover:border-amber-300/60 hover:from-amber-300/[0.2] disabled:opacity-60"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-300/20 text-amber-300">
              {hizliBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4 fill-current" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-foreground">
                Bekleme süresini 15 saniyeye indir
              </span>
              <span className="block text-[11px] leading-tight text-muted-foreground">
                {VOTE_COOLDOWN_LABEL} yerine {FAST_VOTE_COOLDOWN_LABEL} — günlük abonelik,
                istediğin an iptal
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-amber-300 px-2.5 py-1 font-mono text-[11px] font-bold text-[#241a00] transition-transform group-hover:scale-105">
              4× hızlı
            </span>
          </button>
        ))}

      <CreatePartyDialog open={partiKur} onOpenChange={setPartiKur} />
    </div>
  );
}
