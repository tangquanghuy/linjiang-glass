/* Thin-stroke line icons matching the prototype's ~1.7px warm-cream strokes.
   Each is authored on a 24x24 grid and scaled by the consuming rule. */

const svg = (body, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.7"
     stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  coin: svg(`<path d="M4 9.5h16M4 9.5 6.6 5.4A2 2 0 0 1 8.3 4.5h7.4a2 2 0 0 1 1.7.9L20 9.5"/>
             <rect x="3" y="9.5" width="18" height="10" rx="2.4"/>`),

  wallet: svg(`<rect x="3" y="6.6" width="18" height="12.8" rx="2.6"/>
               <path d="M3 10.4h11.6a2 2 0 0 1 2 2v1.2a2 2 0 0 1-2 2H3"/>
               <path d="M6.4 6.6V5.2a1.6 1.6 0 0 1 1.6-1.6h7.2"/>`),

  /* The body used to be missing: the mark was a top rail plus two hangers, which at
     --icon-sm read as a full calendar cropped in half rather than as a compact one.
     Kept simpler than `calendar` -- no day grid -- since 何时 draws it at caption size
     next to 月/日, where six dots turn into noise. */
  calendarSmall: svg(`<rect x="3.4" y="6.2" width="17.2" height="14.4" rx="2.4"/>
                      <path d="M3.4 10.8h17.2"/>
                      <path d="M8 3.8v4.4M16 3.8v4.4"/>`),

  calendar: svg(`<rect x="3.2" y="5.6" width="17.6" height="15" rx="2.4"/>
                 <path d="M3.2 10.4h17.6M8 3.4v4M16 3.4v4"/>
                 <path d="M7.2 13.6h1.6M11.2 13.6h1.6M15.2 13.6h1.6
                          M7.2 17h1.6M11.2 17h1.6M15.2 17h1.6" stroke-width="1.5"/>`),

  clock: svg(`<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.6 2.4"/>`),

  mapPin: svg(`<path d="M12 21s6.5-5.8 6.5-11.1a6.5 6.5 0 1 0-13 0C5.5 15.2 12 21 12 21Z"/>
                  <circle cx="12" cy="9.8" r="2.2"/>`),

  arcade: svg(`<rect x="3.2" y="15.4" width="17.6" height="5.2" rx="1.6"/>
               <path d="M8.4 15.4V10.2"/>
               <circle cx="8.4" cy="7.6" r="2.7"/>
               <path d="M13.8 15.4v-2.6M16.8 12.2h.01M11.2 12.2h.01" stroke-width="1.9"/>`),

  shop: svg(`<path d="M4 7.4h16l-1.2 12.8H5.2L4 7.4Z"/>
            <path d="M7.2 7.4V5.8a4.8 4.8 0 0 1 9.6 0v1.6"/>
            <path d="M8.2 11.2h.01M15.8 11.2h.01" stroke-width="2.3"/>`),

  moon: svg(`<path d="M18.6 14.4A7.4 7.4 0 0 1 9 5.1a7.8 7.8 0 1 0 9.6 9.3Z"
                 fill="currentColor" stroke="none"/>`),

  heart: svg(`<path d="M12 20.4S3.4 15.1 3.4 9.4A4.9 4.9 0 0 1 12 6.3a4.9 4.9 0 0 1 8.6 3.1
                       c0 5.7-8.6 11-8.6 11Z" fill="currentColor" stroke="none"/>`),

  heartOutline: svg(`<circle cx="12" cy="12" r="9"/>
                     <path d="M12 16.6s-4.3-2.7-4.3-5.6a2.5 2.5 0 0 1 4.3-1.6 2.5 2.5 0 0 1 4.3 1.6
                              c0 2.9-4.3 5.6-4.3 5.6Z" fill="currentColor" stroke="none"/>`),

  arrowRight: svg(`<path d="M4.8 12h13.4M13.2 6.9 18.4 12l-5.2 5.1"/>`),

  chevronRight: svg(`<path d="M9.8 5.4 16.4 12l-6.6 6.6"/>`),

  mail: svg(`<rect x="2.6" y="5.4" width="18.8" height="13.2" rx="1.6"/>
             <path d="m2.6 6.6 9.4 7.2 9.4-7.2"/>`),

  /* 工作 and 住所.  Same 24-grid and stroke weight as the rest: the status pane reads
     them at 19px in a row under 时钟 and 地图针, so a heavier or a filled mark would
     pull the two new rows forward of the rows above them. */
  briefcase: svg(`<rect x="2.8" y="7.4" width="18.4" height="12.2" rx="2.2"/>
                  <path d="M8.8 7.4V5.8a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.8 1.8v1.6"/>
                  <path d="M2.8 12.4h18.4" stroke-width="1.5"/>
                  <path d="M10.4 12.4h3.2" stroke-width="1.9"/>`),

  home: svg(`<path d="M4 10.6 12 4.2l8 6.4"/>
             <path d="M5.9 12.1v6.3a1.6 1.6 0 0 0 1.6 1.6h9a1.6 1.6 0 0 0 1.6-1.6v-6.3"/>
             <path d="M10 20v-4.6h4V20" stroke-width="1.5"/>`),

  memo: svg(`<rect x="5" y="4.4" width="14" height="16.2" rx="2"/>
             <path d="M9.4 4.4V3.2h5.2v1.2"/>
             <path d="M8.8 10h6.4M8.8 13.2h6.4M8.8 16.4h4" stroke-width="1.5"/>`),

  /* 更多 -- the pod's fourth ring, and the only door the rest of the interface gets.
     A 2x2 of rounded squares rather than three stacked bars: a hamburger reads as
     "settings for this screen", and this one opens a directory of destinations, which
     is what a grid of tiles reads as.  It is also the shape the page it opens uses. */
  grid: svg(`<rect x="3.8" y="3.8" width="7.1" height="7.1" rx="2.1"/>
             <rect x="13.1" y="3.8" width="7.1" height="7.1" rx="2.1"/>
             <rect x="3.8" y="13.1" width="7.1" height="7.1" rx="2.1"/>
             <rect x="13.1" y="13.1" width="7.1" height="7.1" rx="2.1"/>`),

  /* CG 鉴赏.  A frame with a horizon and a sun, not a stack of photos: the page behind
     it is one scene at a time at full size, and a stack would promise a contact sheet. */
  gallery: svg(`<rect x="3" y="5" width="18" height="14" rx="2.6"/>
                <circle cx="8.6" cy="10.2" r="1.9"/>
                <path d="M3.4 16.6l4.3-3.9a1.8 1.8 0 0 1 2.4 0l3 2.7"/>
                <path d="M13.4 15.4l2.6-2.4a1.8 1.8 0 0 1 2.4 0l2.2 2"/>`),

  /* 随身手机.  Drawn at the same weight as 背包 and 邮件 so it does not pull forward of
     them in the pod; the notch reads as a phone at 22px where a bare rectangle does not. */
  phone: svg(`<rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.8"/>
              <path d="M10.2 2.6h3.6a1 1 0 0 1 1 1v.3a1 1 0 0 1-1 1h-3.6a1 1 0 0 1-1-1v-.3a1 1 0 0 1 1-1Z"
                fill="currentColor" stroke="none"/>
              <path d="M10.6 18.4h2.8" stroke-width="1.5"/>`),

  gear: svg(`<circle cx="12" cy="12" r="3.2"/>
             <path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4
                      M6.7 6.7 5 5M19 19l-1.7-1.7M6.7 17.3 5 19M19 5l-1.7 1.7"/>
             <circle cx="12" cy="12" r="7.4" stroke-dasharray="1.6 3.1"/>`),

  cloud: svg(`<path d="M7.2 18.4h9.4a3.6 3.6 0 0 0 .5-7.2 5.3 5.3 0 0 0-10.2-1.2 3.7 3.7 0 0 0 .3 8.4Z"/>`),

  smile: svg(`<circle cx="12" cy="12" r="8.2"/>
              <path d="M9 10.3h.01M15 10.3h.01" stroke-width="2.1"/>
              <path d="M8.7 14.1a4 4 0 0 0 6.6 0"/>`),

  person: svg(`<circle cx="12" cy="8" r="3.2"/>
               <path d="M5.2 19.2c.8-3.4 3.3-5.2 6.8-5.2s6 1.8 6.8 5.2"/>`),

  sparkle: svg(`<path d="M12 3.4c.9 4.4 2.2 5.7 6.6 6.6-4.4.9-5.7 2.2-6.6 6.6
                         -.9-4.4-2.2-5.7-6.6-6.6 4.4-.9 5.7-2.2 6.6-6.6Z"
                     fill="currentColor" stroke="none"/>
                <path d="M18.8 15.2c.4 1.9 1 2.5 2.9 2.9-1.9.4-2.5 1-2.9 2.9
                         -.4-1.9-1-2.5-2.9-2.9 1.9-.4 2.5-1 2.9-2.9Z"
                     fill="currentColor" stroke="none" opacity=".75"/>`),

  star: svg(`<path d="M12 2.8l2.5 6.1 6.6.5-5 4.3 1.5 6.4L12 16.7l-5.6 3.4 1.5-6.4-5-4.3 6.6-.5Z"
                 fill="currentColor" stroke="none"/>`),

  /* Five-petal sakura used as the divider between the two regions. */
  sakura: `<svg viewBox="0 0 100 100" fill="none">
    <g fill="currentColor">
      ${[0, 72, 144, 216, 288].map((a) => `
      <ellipse cx="50" cy="27" rx="14.5" ry="20"
               transform="rotate(${a} 50 50)" opacity=".82"/>`).join('')}
      <circle cx="50" cy="50" r="6.5" opacity=".95"/>
    </g>
    <g stroke="currentColor" stroke-width="1.6" opacity=".7">
      ${[0, 72, 144, 216, 288].map((a) => `
      <path d="M50 44V33" transform="rotate(${a} 50 50)"/>`).join('')}
    </g>
  </svg>`,
};
