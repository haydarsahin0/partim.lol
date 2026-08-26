import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import type { ProvinceStanding } from "@/backend/types";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FootballResultsBoard } from "@/components/FootballResultsBoard";
import { FootballVoteBallot } from "@/components/FootballVoteBallot";

export function FootballProvinceDialog({
  provinceId,
  standing,
  nextVoteAt,
  onVote,
  onClose,
}: {
  provinceId: string | null;
  standing: ProvinceStanding | null;
  nextVoteAt: string | null;
  onVote: (provinceId: string, teamId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const province = provinceId ? PROVINCE_BY_ID[provinceId] : null;

  return (
    <Dialog open={!!province} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <VisuallyHidden.Root>
          <DialogTitle>{province?.name ?? "Il"}</DialogTitle>
          <DialogDescription>
            Futbol haritası il detayları, oy oranları ve takım pusulası.
          </DialogDescription>
        </VisuallyHidden.Root>

        {province && standing && (
          <div className="space-y-5 p-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{province.region}</p>
              <h2 className="font-display text-2xl font-extrabold tracking-tight">{province.name}</h2>
            </div>

            <FootballResultsBoard standing={standing} />

            <FootballVoteBallot
              provinceId={province.id}
              provinceName={province.name}
              nextVoteAt={nextVoteAt}
              onVote={onVote}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
