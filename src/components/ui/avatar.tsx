import * as React from "react";
import { cn } from "@/lib/utils";
import { fallbackAvatar } from "@/lib/avatar";

type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  src?: string | null;
  handle: string;
  size?: number;
};

/**
 * Basit avatar: kaynak yoksa veya yüklenemezse kullanıcı adından üretilen
 * deterministik SVG'ye düşer (harici istek yok).
 */
export function Avatar({ src, handle, size = 36, className, ...props }: AvatarProps) {
  const fallback = React.useMemo(() => fallbackAvatar(handle), [handle]);
  const [url, setUrl] = React.useState(src || fallback);

  React.useEffect(() => {
    setUrl(src || fallback);
  }, [src, fallback]);

  return (
    <span
      className={cn("inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-white/15", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <img
        src={url}
        alt={`@${handle}`}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setUrl(fallback)}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
