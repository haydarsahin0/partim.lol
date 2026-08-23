import { useGame } from "@/backend/GameProvider";

/** Harita renk anahtarı: parti → renk, kazandığı il sayısıyla. */
export function PartyLegend() {
  const { national, parties } = useGame();
  const wins = new Map(national.map((row) => [row.partyId, row.provinces]));

  return (
    <div>
      <h3 className="stat-label mb-2">Renk anahtarı</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {parties.map((party) => (
          <li key={party.id} className="flex items-center gap-1.5 text-xs" title={party.fullName}>
            <span className="size-2.5 rounded-[3px]" style={{ background: party.color }} />
            <span className="font-semibold">{party.name}</span>
            <span className="font-mono text-muted-foreground">{wins.get(party.id) ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
