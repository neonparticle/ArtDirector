import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-iron-500 bg-iron-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-ember data-[state=checked]:bg-rust",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-dust transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-gold data-[state=checked]:shadow-[0_0_8px_rgba(232,170,0,0.7)]" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
