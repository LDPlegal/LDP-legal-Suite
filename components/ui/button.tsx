import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button system — refinado con press animation, sombras suaves, y
// transiciones cubicas Apple-ish. Mantiene el azul LDP en `default`.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium press transition-[background,color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        // Primary: gradient sutil navy → más claro (luz catch arriba)
        default:
          "text-primary-foreground shadow-[0_1px_2px_rgba(11,25,41,0.20),inset_0_1px_0_rgba(255,255,255,0.18)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_100%,white_8%),var(--primary))] hover:brightness-110 active:brightness-95",
        destructive:
          "text-destructive-foreground shadow-[0_1px_2px_rgba(11,25,41,0.20),inset_0_1px_0_rgba(255,255,255,0.18)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--destructive)_100%,white_8%),var(--destructive))] hover:brightness-110 active:brightness-95",
        outline:
          "border border-border bg-[var(--glass-bg)] backdrop-blur-md text-foreground shadow-[0_1px_2px_rgba(11,25,41,0.04),inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-accent/60 hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_2px_rgba(11,25,41,0.04),inset_0_1px_0_rgba(255,255,255,0.4)] hover:bg-secondary/80",
        ghost:
          "text-foreground hover:bg-accent/60 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-xl px-7 text-[15px]",
        icon: "h-9 w-9 rounded-lg",
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
