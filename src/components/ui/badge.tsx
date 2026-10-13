import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-ember/50 bg-rust/40 text-gold",
        outline: "border-iron-500 text-dust",
        muted: "border-transparent bg-iron-700/80 text-bone/80",
        plasma: "border-plasma/40 bg-plasma/10 text-plasma",
        arc: "border-arc/50 bg-arc/15 text-arc",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
