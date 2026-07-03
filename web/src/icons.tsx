interface IconProps {
  size?: number;
}

function svg(children: React.ReactNode, size = 18) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IconOverview = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>,
    size
  );

export const IconQueues = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M3 12v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <rect x="3" y="17" width="18" height="4" rx="1" />
    </>,
    size
  );

export const IconJobs = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <circle cx="3.5" cy="6" r="1.2" />
      <circle cx="3.5" cy="12" r="1.2" />
      <circle cx="3.5" cy="18" r="1.2" />
    </>,
    size
  );

export const IconWorkers = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </>,
    size
  );

export const IconPlus = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 5v14M5 12h14" />
    </>,
    size
  );

export const IconLogout = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>,
    size
  );

export const IconBolt = ({ size }: IconProps) =>
  svg(<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />, size);

export const IconMenu = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </>,
    size
  );

export const IconClose = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M18 6 6 18M6 6l12 12" />
    </>,
    size
  );

export const IconUsers = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
    size
  );
