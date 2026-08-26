import { useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { readableTextTone, takenColors } from "@/data/parties";
import { checkPartyColor, describeColorCheck, suggestColors } from "@/lib/color";
import { PARTY_SHORT_MAX, PARTY_SHORT_MIN, PARTY_WEEKLY_PRICE, formatUsd } from "@/lib/game";
import { fileToSquareDataUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Başlangıç için mevcut takımlardan uzak, çekici tonlar */
const PRESET_COLORS = [
  "#FF3B30",
  "#FF9F0A",
  "#FFD60A",
  "#32D74B",
  "#64D2FF",
  "#0A84FF",
  "#BF5AF2",
  "#FF375F",
  "#5E5CE6",
  "#40C8E0",
  "#AC8E68",
  "#8E8E93",
];

export function CreateClubDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    name: string;
    shortName: string;
    color: string;
    logoDataUrl?: string | null;
  }) => { ok: boolean; message?: string };
}) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState("#32D74B");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const taken = useMemo(() => takenColors(), []);
  const colorCheck = useMemo(() => checkPartyColor(color, taken), [color, taken]);
  const colorError = describeColorCheck(colorCheck);
  const suggestions = useMemo(
    () => (colorCheck.ok ? [] : suggestColors(color, taken, 4)),
    [color, colorCheck.ok, taken],
  );

  const shortOk = shortName.length >= PARTY_SHORT_MIN && shortName.length <= PARTY_SHORT_MAX;
  const nameOk = name.trim().length >= 3;
  const canSubmit = nameOk && shortOk && colorCheck.ok && !busy;

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    try {
      setLogo(await fileToSquareDataUrl(file));
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Logo yüklenemedi.");
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const result = onCreate({
        name: name.trim(),
        shortName: shortName.trim(),
        color,
        logoDataUrl: logo,
      });
      if (result.ok) {
        onOpenChange(false);
        setName("");
        setShortName("");
        setLogo(null);
      } else {
        // Hata mesajı yoksa sessiz kalma; olası ad çakışması burada görünür.
        if (result.message) setLogoError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const textTone = readableTextTone(color) === "dark" ? "#0b0f19" : "#ffffff";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kendi futbol kulübünü kur</DialogTitle>
          <DialogDescription>
            Haftalık {formatUsd(PARTY_WEEKLY_PRICE)}. Kulübün tüm illerin oy pusulasına girer ve
            haritada kendi renginle yarışır.
          </DialogDescription>
        </DialogHeader>

        {/* Canlı önizleme */}
        <div className="glass-soft flex items-center gap-3 p-3">
          <span
            className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl text-[13px] font-black"
            style={{ background: color, color: textTone }}
          >
            {logo ? (
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              (shortName || "??")
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name.trim() || "Kulüp adı"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {shortName || "KISALTMA"} · Türkiye geneli
            </div>
          </div>
        </div>

        <div className="space-y-3.5">
          <label className="block space-y-1.5">
            <span className="stat-label">Kulüp adı</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ör. Anadolu Kartalları"
              maxLength={40}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="stat-label">
              Kısaltma ({PARTY_SHORT_MIN}–{PARTY_SHORT_MAX} harf)
            </span>
            <Input
              value={shortName}
              onChange={(e) =>
                setShortName(
                  e.target.value
                    .toLocaleUpperCase("tr")
                    .replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, "")
                    .slice(0, PARTY_SHORT_MAX),
                )
              }
              placeholder="AK"
              className={cn(shortName && !shortOk && "border-amber-400/40")}
            />
          </label>

          <div className="space-y-2">
            <span className="stat-label">Renk</span>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((preset) => {
                const ok = checkPartyColor(preset, taken).ok;
                const active = preset.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    disabled={!ok}
                    aria-label={preset}
                    title={ok ? preset : "Mevcut bir takımın rengine çok yakın"}
                    className={cn(
                      "grid size-8 place-items-center rounded-full transition-transform duration-200 ease-apple",
                      active ? "scale-110 ring-2 ring-white/80" : "ring-1 ring-white/15",
                      !ok && "cursor-not-allowed opacity-25",
                    )}
                    style={{ background: preset }}
                  >
                    {active && <Check className="size-4" style={{ color: textTone }} />}
                  </button>
                );
              })}
              <label
                className="grid size-8 cursor-pointer place-items-center rounded-full ring-1 ring-white/15"
                style={{ background: color }}
                title="Kendi rengini seç"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="size-0 opacity-0"
                />
                <Sparkles className="size-3.5" style={{ color: textTone }} />
              </label>
            </div>

            {colorError && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-2.5 text-xs text-amber-200">
                <p>{colorError}</p>
                {suggestions.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="opacity-80">Bunlar uygun:</span>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setColor(s)}
                        aria-label={s}
                        className="size-6 rounded-full ring-1 ring-white/25"
                        style={{ background: s }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="stat-label">Logo (isteğe bağlı)</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus />
                {logo ? "Değiştir" : "Yükle"}
              </Button>
              {logo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>
                  <X />
                  Kaldır
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pickLogo(e.target.files?.[0])}
              />
            </div>
            {logoError && <p className="text-xs text-amber-300">{logoError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {formatUsd(PARTY_WEEKLY_PRICE)}/hafta · Kur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
