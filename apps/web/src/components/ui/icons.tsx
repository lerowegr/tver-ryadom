import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const UsersIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 19c.8-3 3.4-4.5 6.5-4.5s5.7 1.5 6.5 4.5" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M18.6 14.9c1.6.7 2.6 2 3 4.1" />
  </svg>
);

export const StarIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
  </svg>
);

export const MapPinIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const RouteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M8.4 17.6c3-1.2 4.2-3.2 3.3-5.4-.9-2.3.2-4.3 3.8-5.6" />
  </svg>
);

export const PhoneIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 4h4l1.5 4.5-2.3 1.7a12 12 0 0 0 5.6 5.6l1.7-2.3L20 15v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);

export const MailIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

export const TelegramIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M21.9 4.6 18.9 19c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-.9.5l.3-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L7.2 13 2.7 11.6c-1-.3-1-1 .2-1.4l17.7-6.8c.8-.3 1.5.2 1.3 1.2z" />
  </svg>
);

export const WhatsAppIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.5c-2.6-1.1-4.3-3.7-4.4-3.9-.1-.2-1.1-1.4-1.1-2.7s.7-1.9 1-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 .9c.3.2.5.3.6.4 0 .2 0 .7-.2 1.3z" />
  </svg>
);

export const VkIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M13 17.5c-5.7 0-9-3.9-9.1-10.4h2.9c.1 4.8 2.2 6.8 3.9 7.2V7.1h2.7v4.1c1.6-.2 3.4-2.1 4-4.1h2.7a8 8 0 0 1-3.7 5.2 8.3 8.3 0 0 1 4.3 5.2h-3a5.2 5.2 0 0 0-4.3-3.7v3.7H13z" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const XIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h16m-6-6 6 6-6 6" />
  </svg>
);

export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const WalkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="13" cy="4.5" r="2" />
    <path d="m9 21 2.5-5.5L9 13l1-5 3.5-1 3 3 3 1" />
    <path d="m10 8-3 2-1.5 3.5M13.5 15.5 16 21" />
  </svg>
);

export const HeartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20.5S3.5 15 3.5 9A4.6 4.6 0 0 1 12 6.4 4.6 4.6 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2.5 4.5 5.5v6c0 4.7 3.2 8.3 7.5 10 4.3-1.7 7.5-5.3 7.5-10v-6L12 2.5z" />
  </svg>
);

export const CameraIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="14" r="3.5" />
  </svg>
);

export const CarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 16.5v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2M21.5 16.5v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2" />
    <path d="M2.5 16.5v-4l2-5.5a1.5 1.5 0 0 1 1.4-1h12.2a1.5 1.5 0 0 1 1.4 1l2 5.5v4a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1z" />
    <path d="M3 12.5h18M6.5 15h1M16.5 15h1" />
  </svg>
);

export const RubleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 20V4.5h4.5a4 4 0 0 1 0 8H9" />
    <path d="M6.5 15.5h7M6.5 12.5H9" />
  </svg>
);
