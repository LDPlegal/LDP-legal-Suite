import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-input bg-[var(--glass-bg-subtle)] backdrop-blur-sm px-3 py-2 text-sm",
        "shadow-[0_1px_2px_rgba(11,25,41,0.04),inset_0_1px_0_rgba(255,255,255,0.4)]",
        "placeholder:text-muted-foreground/70",
        "transition-[border-color,box-shadow,background] duration-150",
        "focus:bg-[var(--glass-bg-strong)]",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
