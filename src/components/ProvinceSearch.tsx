import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { PROVINCES } from "@/data/provinces";
import { useGame } from "@/backend/GameProvider";
import { partyColor, partyName } from "@/data/parties";
import { Input } from "@/components/ui/input";

const normalize = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[ıi̇]/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a");

/** İl adına veya plakasına göre hızlı arama. */
export function ProvinceSearch({ onPick }: { onPick: (provinceId: string) => void }) {
  const { standings } = useGame();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return PROVINCES.filter(
      (p) => normalize(p.name).startsWith(q) || String(p.plate) === q || normalize(p.name).includes(q),
    ).slice(0, 8);
  }, [query]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        placeholder="İl ara (ör. Trabzon, 61)"
        className="pl-9"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) pick(results[0].id);
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="glass absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-y-auto p-1">
          {results.map((province) => {
            const leading = standings[province.id]?.leadingPartyId ?? null;
            return (
              <li key={province.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08]"
                  onMouseDown={() => {
                    if (blurTimer.current) window.clearTimeout(blurTimer.current);
                  }}
                  onClick={() => pick(province.id)}
                >
                  <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {String(province.plate).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate text-sm font-semibold">{province.name}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: partyColor(leading) }}
                    />
                    {partyName(leading)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
