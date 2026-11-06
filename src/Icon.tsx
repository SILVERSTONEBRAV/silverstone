import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'inbox'
  | 'book'
  | 'briefcase'
  | 'layers'
  | 'sparkles'
  | 'library'
  | 'scan'
  | 'activity'
  | 'settings'
  | 'search'
  | 'plus'
  | 'arrow'
  | 'check'
  | 'calendar'
  | 'clock'
  | 'more'
  | 'target'
  | 'trend'
  | 'file'
  | 'chevron'
  | 'close'
  | 'menu'
  | 'send'
  | 'shield'
  | 'camera'
  | 'cloud'
  | 'download'
  | 'moon'
  | 'sun'
  | 'play'
  | 'pause'
  | 'reset'
  | 'external'
  | 'bell'
  | 'filter'
  | 'compass'
  | 'sparkle'
  | 'mic'
  | 'volume'
  | 'volumeOff';

const iconPaths: Record<IconName, string> = {
  home: 'M3 10.8 12 3l9 7.8M5.5 9.2v11h13v-11M9.2 20.2v-6.4h5.6v6.4',
  inbox: 'M4 4h16v13h-5l-2 3h-2l-2-3H4zM4 13h5l1.5 2h3L15 13h5',
  book: 'M4 5.2A2.2 2.2 0 0 1 6.2 3H20v17H6.2A2.2 2.2 0 0 0 4 22V5.2ZM4 17.8a2.2 2.2 0 0 1 2.2-2.2H20M8 7h8M8 10.5h7',
  briefcase: 'M3 8.5h18v12H3zM8 8.5V5h8v3.5M3 13h18M10 13v2h4v-2',
  layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  sparkles: 'm12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 15l.6 1.8L7.5 17.5l-1.9.6L5 20l-.6-1.9-1.9-.6 1.9-.7L5 15Z',
  library: 'M4 4h16v16H4zM8 4v16M11 8h6M11 12h6M11 16h4',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10M12 7v10',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6ZM19.3 13.7l1.2.9-1.4 2.4-1.4-.5a7.8 7.8 0 0 1-1.7 1l-.2 1.5h-2.8l-.2-1.5a7.8 7.8 0 0 1-1.7-1l-1.4.5-1.4-2.4 1.2-.9a7.6 7.6 0 0 1 0-2l-1.2-.9 1.4-2.4 1.4.5a7.8 7.8 0 0 1 1.7-1l.2-1.5h2.8l.2 1.5a7.8 7.8 0 0 1 1.7 1l1.4-.5 1.4 2.4-1.2.9a7.6 7.6 0 0 1 0 2Z',
  search: 'm20.5 20.5-4.1-4.1M18 10.8a7.2 7.2 0 1 1-14.4 0 7.2 7.2 0 0 1 14.4 0Z',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'm5 12 4.2 4.2L19 6.5',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h3M8 17h6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.2 2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 12h.01',
  trend: 'M3 17 9 11l4 4 8-9M15 6h6v6',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7',
  chevron: 'm8 10 4 4 4-4',
  close: 'm6 6 12 12M18 6 6 18',
  menu: 'M4 6h16M4 12h16M4 18h16',
  send: 'm3 11 18-8-8 18-2-8-8-2ZM11 13l5-5',
  shield: 'M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3ZM8.5 12l2.2 2.2 4.8-5',
  camera: 'M4 7h3l1.5-2h7L17 7h3v12H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  cloud: 'M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9Z',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  moon: 'M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  play: 'm8 5 11 7-11 7V5Z',
  pause: 'M8 5h3v14H8zM15 5h3v14h-3z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 8v4l2.5 1.5',
  external: 'M14 4h6v6M20 4l-9 9M18 13v6H5V6h6',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
  sparkle: 'm12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3ZM19 16l.5 1.5L21 18l-1.5.5L19 20l-.5-1.5L17 18l1.5-.5L19 16Z',
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM19 11a7 7 0 0 1-14 0M12 18v3M9 21h6',
  volume: 'M4 10v4h4l5 4V6l-5 4H4ZM16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11',
  volumeOff: 'M4 10v4h4l5 4V6l-5 4H4ZM17 9l5 6M22 9l-5 6',
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
