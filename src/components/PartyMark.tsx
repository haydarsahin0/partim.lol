import { PARTY_BY_ID, partyColor, partyShortName, partyTextColor } from "@/data/parties";
import { cn } from "@/lib/utils";

/**
 * Parti rozeti (logo).
 *
 * Gerçek partilerin resmî amblemleri tescilli marka; oyuna gömülemez. Onun
 * yerine her partiye kendi kurumsal rengi ve doğru kısaltmasıyla tek tip bir
 * monogram üretiliyor. Eskiden kısaltma `name.slice(0, 2)` ile türetiliyordu ve
 * "Yeniden Refah" → "Ye", "Memleket" → "Me" gibi okunmayan rozetler çıkıyordu;
 * kısaltmalar artık parti listesinde tek tek yazılı (bkz. data/parties.ts).
 *
 * Kullanıcının kurduğu partide yüklenmiş logo varsa onun yerine o basılır.
 *
 * Neden SVG: rozet 20 pikselden 72 piksele kadar her boyda kullanılıyor. SVG
 * viewBox'ı sabit tuttuğu için yazı boyu, köşe yarıçapı ve kenarlık her boyutta
 * aynı oranda ölçekleniyor; CSS ile ayrı ayrı ayarlamak gerekmiyor.
 */
export function PartyMark({
  partyId,
  size = 28,
  className,
  title,
}: {
  partyId: string;
  size?: number;
  className?: string;
  /** Verilirse rozet erişilebilir bir görsel olur; verilmezse süs sayılır. */
  title?: string;
}) {
  const party = PARTY_BY_ID[partyId];
  const short = partyShortName(partyId);
  const bg = partyColor(partyId);
  const fg = partyTextColor(partyId);
  const light = party?.on === "dark"; // koyu metin → açık zemin

  if (party?.logoUrl) {
    return (
      <img
        src={party.logoUrl}
        alt={title ?? ""}
        aria-hidden={title ? undefined : "true"}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-[26%] object-cover", className)}
        style={{ width: size, height: size, background: bg }}
      />
    );
  }

  // Uzun kısaltmalar küçülür; 6 harfe kadar (özel partiler) sığar.
  const fontSize = [40, 40, 34, 26, 21, 17, 15][Math.min(short.length, 6)];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      style={{ width: size, height: size }}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`pm-${partyId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={light ? 0.5 : 0.22} />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={bg} />
      <rect width="64" height="64" rx="17" fill={`url(#pm-${partyId})`} />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="16.4"
        fill="none"
        stroke={light ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.22)"}
        strokeWidth="1.5"
      />
      <text
        x="32"
        y="34"
        textAnchor="middle"
        dominantBaseline="central"
        fill={fg}
        fontSize={fontSize}
        fontWeight="800"
        letterSpacing={short.length > 3 ? "-1.2" : "-0.6"}
        fontFamily="'SF Pro Display', Inter, system-ui, sans-serif"
      >
        {short}
      </text>
    </svg>
  );
}
