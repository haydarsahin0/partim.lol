import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, RotateCcw, ShieldQuestion, X } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { fileToSquareDataUrl } from "@/lib/image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { XLogo } from "@/components/XLogo";

/** Profil düzenleme: kullanıcı adı, görünen ad, X hesabı ve avatar. */
export function ProfileEditor() {
  const { profile, updateProfile, checkHandle } = useGame();

  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [xHandle, setXHandle] = useState(profile?.xHandle ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile?.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /**
   * Kullanıcı adı müsait mi?
   *
   * Kaydete basınca reddedilmek kötü bir deneyimdi: hata çıkıyor ama kutuda
   * alınmış ad duruyordu, sanki kabul edilmiş gibi. Artık yazarken soruluyor
   * ve alınmışsa kaydet düğmesi açılmıyor.
   */
  const [adDurumu, setAdDurumu] = useState<{
    durum: "bos" | "sorgu" | "uygun" | "dolu" | "bilinmiyor";
    mesaj?: string;
  }>({ durum: "bos" });

  // Profil dışarıdan değişirse (ilk yükleme, giriş) alanları eşitle.
  useEffect(() => {
    if (!profile) return;
    setHandle(profile.handle);
    setDisplayName(profile.displayName);
    setXHandle(profile.xHandle ?? "");
    setAvatar(profile.avatarUrl);
  }, [profile?.id, profile?.handle, profile?.displayName, profile?.xHandle, profile?.avatarUrl]);

  /*
   * Yazarken sorma: her tuşta sunucuya gitmesin diye kısa bir bekleme var.
   * Kendi adına dönerse sorgu yapılmıyor — kullanıcı kendi adını koruyabilir.
   */
  useEffect(() => {
    if (!profile) return;
    const ad = handle.trim();
    if (ad === profile.handle) {
      setAdDurumu({ durum: "bos" });
      return;
    }
    if (ad.length < 3) {
      setAdDurumu(
        ad.length === 0
          ? { durum: "bos" }
          : { durum: "dolu", mesaj: "Kullanıcı adı en az 3 karakter olmalı." },
      );
      return;
    }

    setAdDurumu({ durum: "sorgu" });
    let iptal = false;
    const zamanlayici = window.setTimeout(() => {
      void checkHandle(ad)
        .then((sonuc) => {
          if (iptal) return;
          if (sonuc.kontrolEdilemedi) {
            // Sunucuya ulaşılamadı: engelleme, kaydetmeyi dene. Kararı sunucu verir.
            setAdDurumu({ durum: "bilinmiyor" });
            return;
          }
          setAdDurumu(
            sonuc.ok
              ? { durum: "uygun" }
              : { durum: "dolu", mesaj: sonuc.message ?? "Bu kullanıcı adı alınmış." },
          );
        })
        .catch(() => {
          if (!iptal) setAdDurumu({ durum: "bilinmiyor" });
        });
    }, 400);

    return () => {
      iptal = true;
      window.clearTimeout(zamanlayici);
    };
  }, [handle, profile?.handle, checkHandle, profile]);

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
    if (!profile) return;
    setBusy(true);
    try {
      const sonuc = await updateProfile({
        handle,
        displayName,
        xHandle: xHandle.trim() || null,
        avatarUrl: avatar,
      });
      /*
       * Reddedildiyse alanı eski adına geri al. Kutuda reddedilmiş adın
       * kalması "kaydedildi" izlenimi veriyordu.
       */
      if (!sonuc.ok) {
        setHandle(profile.handle);
        setAdDurumu({ durum: "bos" });
      }
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
          Hesabın Google kimliğine bağlı; nereden girersen gir aynı profil. Görünüşünü
          istediğin zaman değiştirebilirsin.
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
            aria-invalid={adDurumu.durum === "dolu"}
          />
          {adDurumu.durum === "dolu" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
              <X className="size-3 shrink-0" />
              {adDurumu.mesaj}
            </span>
          ) : adDurumu.durum === "uygun" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
              <Check className="size-3 shrink-0" />@{handle.trim()} müsait
            </span>
          ) : adDurumu.durum === "sorgu" ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 shrink-0 animate-spin" />
              bakılıyor…
            </span>
          ) : adDurumu.durum === "bilinmiyor" ? (
            <span className="block text-[11px] text-muted-foreground">
              Müsaitlik şu an sorulamıyor. Kaydete basabilirsin — ad alınmışsa sunucu
              kabul etmez.
            </span>
          ) : (
            <span className="block text-[11px] text-muted-foreground">
              Sıralamada ve il sayfalarında @{handle || "kullaniciadi"} olarak görünür.
            </span>
          )}
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
        <Button
          variant="primary"
          // Alınmış ya da sorgusu sürüyor: kaydete izin verme.
          disabled={!dirty || busy || adDurumu.durum === "dolu" || adDurumu.durum === "sorgu"}
          onClick={() => void save()}
        >
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

    </Card>
  );
}
