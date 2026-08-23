import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em] backdrop-blur-xl backdrop-saturate-150 transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/12 text-primary",
        secondary: "border-white/10 bg-white/[0.07] text-foreground/85",
        outline: "border-white/15 bg-transparent text-foreground/70",
        success: "border-emerald-400/25 bg-emerald-400/12 text-emerald-300",
        warning: "border-amber-400/25 bg-amber-400/12 text-amber-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
