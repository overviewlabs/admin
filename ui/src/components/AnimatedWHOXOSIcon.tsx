import { OverviewLabsMark } from "./OverviewLabsMark";
import type { SVGProps } from "react";
import { cn } from "../lib/utils";

export function AnimatedWHOXOSIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <OverviewLabsMark
      className={cn("whoxos-thinking-icon overview-labs-loading-mark", className)}
      {...props}
    />
  );
}

/** Full-page loading state: a large, centered, animated WHOXOS mark. */
export function WHOXOSLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex min-h-dvh w-full items-center justify-center", className)}
    >
      <AnimatedWHOXOSIcon className="h-24 w-24 text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
