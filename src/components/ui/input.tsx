import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-full border border-white/12 bg-white/[0.06] px-4",
        // 16px: iOS bunun altındaki yazı tiplerinde odaklanınca sayfayı yakınlaştırıyor
        "text-[16px] tracking-[-0.01em] placeholder:text-muted-foreground/70",
        "backdrop-blur-xl backdrop-saturate-150 transition-all duration-200 ease-apple",
        "focus-visible:border-white/25 focus-visible:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
