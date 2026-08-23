import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Tüm düğmeler buğulu cam. Basılınca hafifçe küçülme (active:scale) Apple'ın
 * dokunsal geri bildirimini taklit eder; mobilde fark yaratan ayrıntı bu.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full",
    "text-[15px] font-semibold tracking-[-0.01em]",
    "transition-all duration-200 ease-apple active:scale-[0.97]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100",
    "[&_svg]:size-[18px] [&_svg]:shrink-0",
    "backdrop-blur-xl backdrop-saturate-150",
  ],
  {
    variants: {
      variant: {
        default:
          "border border-white/15 bg-white/[0.14] text-foreground shadow-[0_1px_0_0_rgb(255_255_255_/_0.12)_inset,0_8px_24px_-12px_rgb(0_0_0_/_0.8)] hover:bg-white/[0.2]",
        primary:
          "border border-primary/30 bg-primary/85 text-primary-foreground shadow-[0_1px_0_0_rgb(255_255_255_/_0.25)_inset,0_10px_30px_-12px_hsl(var(--primary)/0.7)] hover:bg-primary",
        secondary:
          "border border-white/10 bg-white/[0.07] text-foreground hover:bg-white/[0.12]",
        outline:
          "border border-white/15 bg-white/[0.03] text-foreground hover:border-white/30 hover:bg-white/[0.08]",
        ghost:
          "border border-transparent bg-transparent text-foreground/75 backdrop-blur-none hover:bg-white/[0.08] hover:text-foreground",
        destructive:
          "border border-destructive/30 bg-destructive/80 text-destructive-foreground hover:bg-destructive",
        accent:
          "border border-accent/30 bg-accent/80 text-accent-foreground hover:bg-accent",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        lg: "h-13 px-7 text-base",
        icon: "size-11",
        "icon-sm": "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
