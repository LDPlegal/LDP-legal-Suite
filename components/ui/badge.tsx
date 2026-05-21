import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badges con tinte translúcido (no fills sólidos opacos). El borde toma
// color del propio variant a baja opacidad, y el fondo es soft tint —
// más alineado al lenguaje glass del resto del sistema.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/12 text-primary dark:bg-primary/18 dark:text-primary",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/25 bg-destructive/12 text-destructive dark:bg-destructive/18 dark:text-destructive",
        success:
          "border-success/25 bg-success/12 text-success dark:bg-success/18 dark:text-success",
        warning:
          "border-warning/25 bg-warning/14 text-warning dark:bg-warning/20 dark:text-warning",
        outline:
          "border-border bg-transparent text-foreground",
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
