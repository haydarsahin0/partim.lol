import { useState } from "react";
import { Check, Loader2, Vote } from "lucide-react";
import { PARTIES, partyColor, partyTextColor } from "@/data/parties";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/SignInDialog";
import { XP_PER_VOTE, formatDuration } from "@/lib/game";
import { cn } from "@/lib/utils";

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
  const { user, profile, vote } = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const cooldown = useCountdown(profile?.nextVoteAt);

  const locked = cooldown > 0;

  const submit = async () => {
    if (!selected) return;
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
          Saatte 1 oy · oy başına +{XP_PER_VOTE} XP
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {PARTIES.map((party) => {
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
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-black"
                style={{ background: party.color, color: partyTextColor(party.id) }}
              >
                {isSelected ? <Check className="size-3.5" /> : party.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{party.name}</span>
            </button>
          );
        })}
      </div>

      {!user ? (
        <Button className="w-full" size="lg" onClick={() => setSignInOpen(true)}>
          Oy vermek için giriş yap
        </Button>
      ) : (
        <Button
          className="w-full"
          size="lg"
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
      )}

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
