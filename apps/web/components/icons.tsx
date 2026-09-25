import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowUpRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const Lock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Icon>
);

export const Envelope = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.8 7 8.2 6 8.2-6" />
  </Icon>
);

export const Eye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const Bolt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
  </Icon>
);

export const Receipt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Close = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const Fingerprint = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 11v3.5a6 6 0 0 1-1.2 3.6" />
    <path d="M8.5 9.5a3.5 3.5 0 0 1 7 0V13a9 9 0 0 1-.6 3.3" />
    <path d="M5.8 15.5c.5-1.3.7-2.6.7-4V9.5a5.5 5.5 0 0 1 10.3-2.7" />
    <path d="M18.4 10.5V13c0 1.6-.2 3.1-.7 4.5" />
    <path d="M4.3 9A8 8 0 0 1 19 6.2" />
  </Icon>
);

export const Spinner = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="animate-spin">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" fill="none" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
);
