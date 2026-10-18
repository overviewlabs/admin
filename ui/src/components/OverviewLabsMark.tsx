import { useId, type SVGProps } from "react";

/** The supplied logo's alpha channel preserves its exact silhouette in either theme. */
export function OverviewLabsMark(props: SVGProps<SVGSVGElement>) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 2000 2000" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <mask id={maskId} className="overview-labs-logo-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="2000" height="2000">
          <image href="/overview-labs-logo-v1.png" width="2000" height="2000" />
        </mask>
      </defs>
      <rect width="2000" height="2000" mask={`url(#${maskId})`} />
    </svg>
  );
}
