import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button system, plano. Sin gradientes, sin sombras, sin radio en el CTA
// marino. Solo transiciones de color de 140ms.
//   default     → CTA marino #0B2239 (radio 0)
//   action      → CTA azul de acción #0F4C81 (radio 0)
//   outline     → borde #DFE0DC sobre blanco
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-none bg-primary text-primary-foreground hover:bg-primary/90",
        action:
          "rounded-none bg-[#0F4C81] text-white hover:bg-[#0A3A63]",
        destructive:
          "rounded-none bg-[#B4462E] text-white hover:bg-[#9A3A25]",
        outline:
          "rounded-[3px] border border-border bg-card text-foreground hover:bg-secondary",
        secondary:
          "rounded-[3px] bg-secondary text-foreground hover:bg-muted",
        ghost:
          "rounded-[3px] text-foreground hover:bg-accent",
        link: "px-0 text-action underline-offset-4 hover:text-action-hover hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-7 text-[15px]",
        icon: "h-9 w-9",
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
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
