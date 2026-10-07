type P = { size?: number; className?: string; style?: React.CSSProperties };

export const BoltIcon = ({ size = 14, color }: { size?: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill={color} />
  </svg>
);

const stroke = (size: number, width: number, extra: P, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={extra.className}
    style={extra.style}
  >
    {children}
  </svg>
);

export const CheckIcon = ({ size = 15, ...p }: P) => stroke(size, 3, p, <path d="M5 12.5 10 17 19 7" />);
export const ChevronDown = ({ size = 18, ...p }: P) => stroke(size, 2.2, p, <path d="m6 9 6 6 6-6" />);
export const ChevronLeft = ({ size = 20, ...p }: P) => stroke(size, 2.2, p, <path d="m15 6-6 6 6 6" />);
export const ChevronRight = ({ size = 20, ...p }: P) => stroke(size, 2.2, p, <path d="m9 6 6 6-6 6" />);
export const PlusIcon = ({ size = 28, ...p }: P) => stroke(size, 2.6, p, <path d="M12 5v14M5 12h14" />);
export const CloseIcon = ({ size = 20, ...p }: P) => stroke(size, 2.4, p, <path d="M6 6l12 12M18 6 6 18" />);
export const ArrowRight = ({ size = 15, ...p }: P) => stroke(size, 2.4, p, <path d="M5 12h14M13 6l6 6-6 6" />);
export const SendIcon = ({ size = 20, ...p }: P) => stroke(size, 2.4, p, <path d="M12 19V5M5 12l7-7 7 7" />);
export const GearIcon = ({ size = 22, ...p }: P) =>
  stroke(
    size,
    2,
    p,
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  );
