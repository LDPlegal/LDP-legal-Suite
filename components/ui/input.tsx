import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Input — plano: borde #C9CCC5 sobre blanco, radio 3px, sin sombra.
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-[3px] border border-[#C9CCC5] bg-white px-3 py-1 text-[13.5px] text-[#161C24]",
        "placeholder:text-[#9C9D96]",
        "transition-colors duration-150 ease-out",
        "focus-visible:border-[#0F4C81] focus-visible:outline-none",
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
