import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-void/60 px-3 py-1 text-sm text-bone shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-dust selection:bg-ember/40 file:border-0 file:bg-transparent file:text-sm disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ember/70 focus-visible:ring-2 focus-visible:ring-ember/25",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
