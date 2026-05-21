import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Input — glass surface con focus ring suave que halo el campo.
// La altura sigue siendo h-9 para mantener consistencia con buttons.
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-[var(--glass-bg-subtle)] backdrop-blur-sm px-3 py-1 text-sm",
        "shadow-[0_1px_2px_rgba(11,25,41,0.04),inset_0_1px_0_rgba(255,255,255,0.4)]",
        "placeholder:text-muted-foreground/70",
        "transition-[border-color,box-shadow,background] duration-150",
        "focus:bg-[var(--glass-bg-strong)]",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
