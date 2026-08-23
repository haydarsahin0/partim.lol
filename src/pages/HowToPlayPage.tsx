import { Crown, MousePointerClick, Plug, Sparkles, Vote } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { supabaseHost } from "@/backend/supabaseClient";
import { Card } from "@/components/ui/card";
import {
  LEADER_BASE_PRICE,
  LEADER_PRICE_STEP,
  XP_PER_LEADER_HOUR,
  XP_PER_VOTE,
  formatUsd,
  totalXpForLevel,
} from "@/lib/game";

const RULES = [
  {
    icon: MousePointerClick,
    title: "İlini seç",
    body: "Haritadaki 81 ilden birine tıkla. Her il, o ilde en çok oyu alan partinin rengiyle boyanır; renk ne kadar canlıysa fark o kadar açıktır.",
  },
  {
    icon: Vote,
    title: "Saat başı 1 oy",
    body: `Giriş yaptıktan sonra istediğin ilde istediğin partiye oy verebilirsin. Her oy +${XP_PER_VOTE} XP getirir ve bir sonraki oy hakkın 1 saat sonra açılır.`,
  },
  {
    icon: Crown,
    title: "İl başkanlığını kap",
    body: `Her il × her parti için tek bir başkanlık koltuğu var. Boş koltuk ${formatUsd(
      LEADER_BASE_PRICE,
    )}. Dolu bir koltuğu devralmak, o anki bedelin ${formatUsd(
      LEADER_PRICE_STEP,
    )} fazlasına mal olur — yani koltuk el değiştirdikçe pahalılaşır.`,
  },
  {
    icon: Sparkles,
    title: "Seviye atla",
    body: `Başkanı olduğun her koltuk, elinde tuttuğun her saat için +${XP_PER_LEADER_HOUR} XP kazandırır. Seviye ${2}'ye ${totalXpForLevel(
      2,
    )} XP, seviye ${5}'e ${totalXpForLevel(5)} XP ile ulaşırsın.`,
  },
];

export default function HowToPlayPage() {
  const { isDemo } = useGame();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Nasıl oynanır?</h1>
        <p className="text-sm text-muted-foreground">
          partim.lol, Türkiye haritası üzerinde oynanan bir siyaset simülasyonudur. Gerçek bir seçim
          değildir, sonuçları hiçbir resmî veriyi temsil etmez.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {RULES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon className="size-4" />
              </span>
              <h2 className="font-display text-base font-bold">{title}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-display text-base font-bold">
          {isDemo ? "Bu kopya demo modda" : "Gerçek modda çalışıyor"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {isDemo ? (
            <>
              Şu an sunucu bağlı değil: X girişi taklit ediliyor, ilerlemen yalnızca bu tarayıcıda
              saklanıyor ve ödemeler gerçek değil. Depodaki{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">README.md</code>{" "}
              dosyası, Supabase (X OAuth + veritabanı) ve Stripe anahtarlarını tanımlayarak aynı
              arayüzü gerçek moda nasıl geçireceğini adım adım anlatır.
            </>
          ) : (
            <>
              Girişler X (Twitter) OAuth ile, ödemeler Stripe Checkout ile alınıyor. Oy soğuma süresi,
              XP ve koltuk fiyatı sunucu tarafında doğrulanır.
            </>
          )}
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
          <Plug className="size-4 text-primary" />
          Bağlantı durumu
        </h2>
        {/* Telefondan hata ayıklarken tarayıcı konsolu açmak zor; bağlantının
            nereye kurulduğunu burada okunur şekilde gösteriyoruz. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Mod</dt>
          <dd className="font-semibold">{isDemo ? "Demo (sunucusuz)" : "Gerçek (Supabase)"}</dd>
          <dt className="text-muted-foreground">Sunucu</dt>
          <dd className="break-all font-mono text-xs">{supabaseHost ?? "—"}</dd>
        </dl>
        {!isDemo && supabaseHost && !/^[a-z0-9]+\.supabase\.co$/i.test(supabaseHost) && (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
            Sunucu adresi beklenen biçimde değil. <code>VITE_SUPABASE_URL</code> değişkeni
            <code> https://&lt;ref&gt;.supabase.co</code> olmalı; sonuna <code>/rest/v1</code> gibi
            bir ek gelmemeli.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-bold">Sorumluluk reddi</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Oyundaki parti adları ve renkleri yalnızca tanınırlık içindir; hiçbir parti, kurum veya kişi
          ile bağlantımız ya da onayları yoktur. Oyun içi oylar bir kamuoyu araştırması değildir ve
          gerçek seçim sonuçlarıyla ilgisi yoktur. İl başkanlığı ödemeleri dijital bir oyun içi
          konumdur; siyasi bağış değildir.
        </p>
      </Card>
    </div>
  );
}
