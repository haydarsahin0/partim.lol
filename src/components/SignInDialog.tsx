import { useState } from "react";
import { AtSign, Info } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
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
import { XLogo } from "@/components/XLogo";

/**
 * Gerçek kurulumda giriş doğrudan X (Twitter) OAuth ile yapılır.
 * Demo modda sunucu olmadığı için kullanıcıdan sadece kullanıcı adı alınır.
 */
export function SignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isDemo, signIn } = useGame();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await signIn(handle);
      onOpenChange(false);
      setHandle("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>X hesabınla giriş yap</DialogTitle>
          <DialogDescription>
            Oy kullanmak, XP toplamak ve il başkanlığı almak için giriş gerekiyor.
          </DialogDescription>
        </DialogHeader>

        {isDemo ? (
          <div className="space-y-3">
            <div className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                Bu kopya <strong>demo modda</strong> çalışıyor: gerçek X girişi ve ödeme yok, ilerlemen
                yalnızca bu tarayıcıda saklanıyor. Supabase anahtarları tanımlandığında aynı ekran
                gerçek OAuth'a döner.
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="stat-label">X kullanıcı adın</span>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  placeholder="kullaniciadi"
                  className="pl-9"
                  maxLength={20}
                />
              </div>
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            X hesabına yönlendirileceksin. Yalnızca herkese açık kullanıcı adın, adın ve profil
            görselin alınır.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            <XLogo className="size-4" />
            {isDemo ? "Demo oyuncu olarak gir" : "X ile devam et"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
