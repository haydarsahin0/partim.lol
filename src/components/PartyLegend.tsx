import { useMemo } from "react";
import { useGame } from "@/backend/GameProvider";

/**
 * Harita renk anahtarı: parti → renk, kazandığı il sayısıyla.
 *
 * SIRA: EN ÇOK İLDEN EN AZA
 *
 * Liste eskiden partilerin tanım sırasındaydı — yani haritada hiç ili olmayan
 * bir parti, on ili olanın üstünde durabiliyordu. Renk anahtarına bakmanın
 * sebebi "haritadaki şu renk kimin" sorusu; o soruya en çok yer kaplayan
 * renkten başlayarak cevap vermek gerekiyor.
 *
 * Eşitlik oy sayısıyla bozuluyor: aynı sayıda ili olan iki partiden çok oy
 * alan önce geliyor. İkisi de eşitse parti sırası korunuyor (kararlı sıralama),
 * böylece liste her tazelemede yerinden oynamıyor.
 */
export function PartyLegend() {
  const { national, parties } = useGame();

  const sirali = useMemo(() => {
    const iller = new Map(national.map((row) => [row.partyId, row.provinces]));
    const oylar = new Map(national.map((row) => [row.partyId, row.votes]));
    return parties
      .map((party) => ({
        party,
        provinces: iller.get(party.id) ?? 0,
        votes: oylar.get(party.id) ?? 0,
      }))
      .sort((a, b) => b.provinces - a.provinces || b.votes - a.votes);
  }, [national, parties]);

  return (
    <div>
      <h3 className="stat-label mb-2">Renk anahtarı</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {sirali.map(({ party, provinces }) => (
          <li key={party.id} className="flex items-center gap-1.5 text-xs" title={party.fullName}>
            <span className="size-2.5 rounded-[3px]" style={{ background: party.color }} />
            <span className="font-semibold">{party.name}</span>
            <span className="font-mono text-muted-foreground">{provinces}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
