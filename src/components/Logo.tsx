/**
 * partim.lol markası.
 *
 * İşaret: haritaya çakılan bir iğne (bir il) ve içine oyulmuş bir taç
 * (o ilin başkanlığı). Oyunun tek cümlelik özeti bu: bir yer kap, başında
 * dur. 16 piksele indiğinde taç detayı erirken siluet iğne olarak okunmaya
 * devam ediyor — favicon boyutunda da tanınır kalması için böyle seçildi.
 *
 * Tacın oyuğu saydam DEĞİL, koyu zemin rengiyle dolu: markanın altına
 * haritanın ya da shader'ın gelmesi hâlinde delikten sızan görüntü tacı
 * okunmaz yapıyordu.
 */
const PIN = "M32 57C32 57 47 36.5 47 25.5A15 15 0 1 0 17 25.5C17 36.5 32 57 32 57Z";
const CROWN = "M24.2 30.2V20.4l4.6 3.8L32 18.2l3.2 6L39.8 20.4v9.8z";

/** Zeminin koyu rengi — taç oyuğu bununla doldurulur. */
const VOID = "#070B14";

export function Logo({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** Verilirse erişilebilir bir görsel olur; verilmezse süs sayılır. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="partim-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5EEAD4" />
          <stop offset="0.55" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <path d={PIN} fill="url(#partim-logo-g)" />
      <path d={CROWN} fill={VOID} />
    </svg>
  );
}

/** İşaret + yazı. Dar ekranda yazı gizlenir, işaret kalır. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <Logo size={30} title="partim.lol" />
      <span className="hidden font-display text-lg font-extrabold tracking-tight sm:block">
        partim<span className="text-primary">.lol</span>
      </span>
    </span>
  );
}
