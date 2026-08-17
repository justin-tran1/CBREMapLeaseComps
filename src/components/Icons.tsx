import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }
}

export const IconMap = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </svg>
)

export const IconChart = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M3 20h18" />
    <rect x="5" y="11" width="3.6" height="6" rx="1" />
    <rect x="10.2" y="6.5" width="3.6" height="10.5" rx="1" />
    <rect x="15.4" y="13.5" width="3.6" height="3.5" rx="1" />
  </svg>
)

export const IconUpload = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 16V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
)

export const IconSearch = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.5 15.5 4 4" />
  </svg>
)

export const IconX = ({ size = 14, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const IconChevronRight = ({ size = 14, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const IconChevronLeft = ({ size = 14, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m15 5-7 7 7 7" />
  </svg>
)

export const IconChevronDown = ({ size = 14, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m5 9 7 7 7-7" />
  </svg>
)

export const IconLayers = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3.5 12.5 8.5 4.7 8.5-4.7" />
    <path d="m3.5 16.8 8.5 4.7 8.5-4.7" />
  </svg>
)

export const IconSliders = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="18" r="2.2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconGlobe = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.6 2.6 2.6 15.4 0 18-2.6-2.6-2.6-15.4 0-18Z" />
  </svg>
)

export const IconPolygon = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m12 3.5 8 5.2-3 9.8H7l-3-9.8z" />
    <circle cx="12" cy="3.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="20" cy="8.7" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="17" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="7" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="4" cy="8.7" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

export const IconRectangle = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="4" y="6" width="16" height="12" rx="1.2" />
    <circle cx="4" cy="6" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="20" cy="18" r="1.7" fill="currentColor" stroke="none" />
  </svg>
)

export const IconCircle = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="7.6" />
    <path d="M12 12h7.6" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
  </svg>
)

export const IconFilter = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M3.5 5.5h17l-6.6 7.6v5.2l-3.8 2v-7.2z" />
  </svg>
)

export const IconSun = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5" />
  </svg>
)

export const IconMoon = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z" />
  </svg>
)

export const IconDownload = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 4v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17" />
  </svg>
)

export const IconTarget = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
  </svg>
)

export const IconAlert = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 4.5 2.8 20h18.4z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)

export const IconInfo = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)

export const IconCheck = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

export const IconRefresh = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M20 11.5a8 8 0 1 0-.9 4.5" />
    <path d="M20 5.5v6h-6" />
  </svg>
)

export const IconTable = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="3.5" y="5" width="17" height="14" rx="1.4" />
    <path d="M3.5 9.6h17M9.5 9.6V19" />
  </svg>
)

export const IconPin = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
)

export const IconSettings = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
)

export const IconTrash = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 20a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3l.9-13.5" />
  </svg>
)

export const CbreLogo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" className="topbar__logo">
    <rect width="32" height="32" rx="6" fill="#17e88f" />
    <path
      d="M16 6.2c-3.9 0-7.1 3.2-7.1 7.1 0 5.3 7.1 12.5 7.1 12.5s7.1-7.2 7.1-12.5c0-3.9-3.2-7.1-7.1-7.1Zm0 9.7a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z"
      fill="#003f2d"
    />
  </svg>
)

export const IconCube = ({ size = 16, className, style }: IconProps) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m12 2.8 8 4.4v9.6l-8 4.4-8-4.4V7.2z" />
    <path d="m4 7.2 8 4.4 8-4.4M12 11.6V21.2" />
  </svg>
)
