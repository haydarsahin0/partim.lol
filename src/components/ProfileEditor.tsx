import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImagePlus, KeyRound, Loader2, RotateCcw, ShieldQuestion } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { fileToSquareDataUrl } from "@/lib/image";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { XLogo } from "@/components/XLogo";

/** Profil düzenleme: kullanıcı adı, görünen ad, X hesabı ve avatar. */
export function ProfileEditor() {
  const { profile, updateProfile, getRecoveryCode, restoreAccount } = useGame();

  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [xHandle, setXHandle] = useState(profile?.xHandle ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile?.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Profil dışarıdan değişirse (kurtarma, ilk yükleme) alanları eşitle.
  useEffect(() => {
    if (!profile) return;
    setHandle(profile.handle);
    setDisplayName(profile.displayName);
    setXHandle(profile.xHandle ?? "");
    setAvatar(profile.avatarUrl);
  }, [profile?.id, profile?.handle, profile?.displayName, profile?.xHandle, profile?.avatarUrl]);

  const dirty =
    !!profile &&
    (handle !== profile.handle ||
      displayName !== profile.displayName ||
      (xHandle || null) !== (profile.xHandle ?? null) ||
      avatar !== profile.avatarUrl);

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarError(null);
    try {
      setAvatar(await fileToSquareDataUrl(file));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Görsel yüklenemedi.");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({
        handle,
        displayName,
        xHandle: xHandle.trim() || null,
        avatarUrl: avatar,
      });
    } finally {
      setBusy(false);
    }
  };

  if (!profile) return null;

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="font-display text-base font-semibold tracking-[-0.02em]">Profilini düzenle</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Hesabın bu cihazda açıldı ve burada hatırlanıyor. Görünüşünü istediğin zaman
          değiştirebilirsin.
        </p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar src={avatar} handle={handle || profile.handle} size={64} />
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus />
              Profil resmi yükle
            </Button>
            {avatar && (
              <Button variant="ghost" size="sm" onClick={() => setAvatar(null)}>
                <RotateCcw />
                Varsayılana dön
              </Button>
            )}
          </div>
          {avatarError && <p className="text-xs text-amber-300">{avatarError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickAvatar(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="stat-label">Kullanıcı adı</span>
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))}
            placeholder="kullaniciadi"
          />
          <span className="block text-[11px] text-muted-foreground">
            Sıralamada ve il sayfalarında @{handle || "kullaniciadi"} olarak görünür.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="stat-label">Görünen ad</span>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            placeholder="Adın"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="stat-label">X (Twitter) hesabın</span>
        <Input
          value={xHandle}
          onChange={(e) => setXHandle(e.target.value.replace(/[^A-Za-z0-9_@]/g, "").slice(0, 16))}
          placeholder="@kullaniciadi"
        />
        {/*
          Hesaplar cihazla açıldığı için X sahipliği kanıtlanmıyor. Bunu
          gizlemek taklit kapısı açar; açıkça yazıyoruz.
        */}
        <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
          Bu alan doğrulanmaz — kendi beyanındır. Profilinde bağlantı olarak görünür.
        </span>
      </label>

      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          Kaydet
        </Button>
        {profile.xHandle && (
          <Button variant="ghost" size="sm" asChild>
            <a
              href={`https://x.com/${profile.xHandle}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <XLogo />@{profile.xHandle}
            </a>
          </Button>
        )}
      </div>

      <RecoverySection getRecoveryCode={getRecoveryCode} restoreAccount={restoreAccount} />
    </Card>
  );
}

/**
 * Kurtarma kodu.
 *
 * Hesap tarayıcıdaki kimliğe bağlı olduğu için, kullanıcı site verisini
 * silerse ya da başka bir cihaza geçerse hesabına ulaşamaz. Kod bunun tek
 * çıkış yolu; XP ve satın alınmış koltuklar buna bağlı.
 */
function RecoverySection({
  getRecoveryCode,
  restoreAccount,
}: {
  getRecoveryCode: () => Promise<string | null>;
  restoreAccount: (code: string) => Promise<{ ok: boolean }>;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setCode(await getRecoveryCode());
    setRevealed(true);
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano kapalıysa kullanıcı elle kopyalar */
    }
  };

  return (
    <div className="glass-soft space-y-3 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Hesap kurtarma</h3>
        <Badge variant="secondary">önemli</Badge>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Hesabın bu cihaza bağlı. Tarayıcı verilerini silersen ya da başka bir cihaza geçersen
        seviyeni ve il başkanlıklarını yalnızca bu kodla geri alabilirsin. Kod yalnızca
        üretildiği anda gösterilir, bir yere kaydet. Yeniden ürettiğinde eskisi geçersiz olur.
      </p>

      {revealed && code ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm tracking-[0.12em]">
            {code}
          </code>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Kopyalandı" : "Kopyala"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void reveal()}>
            <RotateCcw />
            Yenile
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void reveal()}>
          <KeyRound />
          Kurtarma kodu üret
        </Button>
      )}

      <div className="border-t border-white/[0.07] pt-3">
        <span className="stat-label">Başka bir cihazdaki hesabını buraya taşı</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            className="w-full font-mono sm:w-56"
          />
          <Button
            variant="secondary"
            disabled={input.replace(/[^A-Z0-9]/g, "").length < 12 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await restoreAccount(input);
                if (result.ok) setInput("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Geri yükle
          </Button>
        </div>
      </div>
    </div>
  );
}
