// SF Symbols–like line icons. Decorative by default; pair with a visible or aria label.
const PATHS = {
  starFilled: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1zm0 4.5-1.9 3.8-4.2.6 3 3-.7 4.2 3.8-2 3.8 2-.7-4.2 3-3-4.2-.6z",
  search: "M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.8 4.8 1.4-1.4-4.8-4.8A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z",
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z",
  minus: "M4 11h16v2H4z",
  person: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 10c4.4 0 8 2.2 8 5v1H4v-1c0-2.8 3.6-5 8-5z",
  location: "M20.5 3.5 3 10.8l7.2 2.9 2.9 7.3z",
  chevronLeft: "M15.4 4.6 8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z",
  chevronRight: "M8.6 19.4 16 12 8.6 4.6 10 3.2l8.8 8.8L10 20.8z",
  xmark: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zm0 2.1 6 2v11.8l-6-2zM5 7.4l2-.7v11.7l-2 .7zm12 .3 2-.7v11.6l-2 .7z",
  flag: "M5 3h2v1h11l-2 4.5L18 13H7v8H5zm2 3v5h8l-1.2-2.5L15 6z",
  pencil: "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4zM15 7.2 6.8 15.4l-.4 1.2 1.2-.4L15.8 8z",
  trash: "M9 3h6l1 2h4v2H4V5h4zm-3 5h12l-1 13H7zm3 2v9h2v-9zm4 0v9h2v-9z",
  camera: "M9 4h6l1.5 2H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5zm3 4a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  refresh: "M12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6a5.97 5.97 0 0 1 4.23 1.77L13 11h7V4l-2.35 2.35A7.96 7.96 0 0 0 12 4z",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm-1 2h2v4.6l3.2 1.9-1 1.7L11 12.7z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  skate: "M5 14h14a1 1 0 0 1 0 2h-1.3a2 2 0 1 1-3.4 0H9.7a2 2 0 1 1-3.4 0H5a1 1 0 0 1 0-2zM3 12.5C3 11 4 10 5.5 10h13c1.5 0 2.5 1 2.5 2.5z",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
      <path d={PATHS[name]} fillRule="evenodd" />
    </svg>
  );
}
