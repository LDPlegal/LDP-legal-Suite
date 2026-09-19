import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badges planos, 11px, peso 600, tracking .055em, mayúsculas, sin radio.
// Neutro por defecto; rojo solo para alerta real (vencida, audiencia);
// marino sólido para estados de sistema (ABIERTO).
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-none border px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.055em] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        secondary: "border-border bg-transparent text-muted-foreground",
        destructive: "border-[#E3C3BA] bg-[#FBF1EE] text-[#B4462E]",
        success: "border-[#C6D2DE] bg-[#F2F5F8] text-action",
        warning: "border-[#E7D3AE] bg-[#FBF3E6] text-[#B89254]",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
