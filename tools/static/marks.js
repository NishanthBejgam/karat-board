/* Karat Board — merchant marks, shared by the board and the broadcast page.

   ---- Merchant marks ----
   Each merchant's own favicon was fetched at first, and eight logos in eight
   brand colours (Malabar maroon, PNG purple, BRPL orange…) fought the gold
   board. So every mark is redrawn here in ONE language: a 24x24 grid, the same
   stroke weight, all of it inheriting the board's bronze, with secondary strokes
   dropped to 45-55% so each mark has some depth rather than reading as wire.

   The SHAPE is the merchant's own, traced off their actual logo - Malabar's
   ringed M with the centre dot, Tanishq's flared T, Kalyan's twin ribbon sweeps,
   MMTC-PAMP's lettered coin, Aspect's notched block, PNG's interlocking bands,
   Bhima's serif B with its detached dot and swoosh. Only the colour is ours. */
const MARKS = {
  // ringed geometric M, dot in the counter
  malabar: `<circle cx="12" cy="12" r="9.5" opacity=".45"/>
            <path d="M9 15.9V8.3M15 15.9V8.3M9 8.3l3 3.6 3-3.6"/>
            <circle cx="12" cy="13.5" r=".95" fill="currentColor" stroke="none"/>`,
  // flared T over its dot
  tanishq: `<path d="M4.4 6.4c1.1-1.6 2.3-1.6 3.5-1.6h8.2c1.2 0 2.4 0 3.5 1.6"/>
            <path d="M9.7 5.1c0 6.7-1.3 10.9-4.5 13.8"/>
            <path d="M14.3 5.1c0 6.7 1.3 10.9 4.5 13.8"/>
            <circle cx="12" cy="18.7" r="1.45" fill="currentColor" stroke="none"/>`,
  // twin ribbon sweeps off a stem
  kalyan: `<path d="M6.4 3.6v16.8"/>
           <path d="M6.4 13.6C12.6 11 17.4 6.9 19.1 3.1"/>
           <path d="M7.1 13.1C12 15.3 17.5 17.8 19.5 21.2" opacity=".55"/>`,
  // their own emblem, lifted from lalithaa_logo.svg and recoloured - the
  // only mark here that is traced rather than drawn, because they publish
  // the geometry and a hand copy would only be a worse version of it
  lalithaa: `<g><g fill="currentColor" stroke="none" transform="translate(2.46,2.00) scale(0.07143) translate(-323,-47)"><path d="M508.84,90.81c-13.61-19.41-36.76-40.85-36.76-40.85v-3.07h-6.47v3.58c-16.68,12.42-40.17,41.53-40.17,41.53-7.12-4.14-14.65-7.62-22.54-9.99-6.35-1.9-12.93-3.08-19.56-3.26-5.53-.15-11.08.38-16.46,1.65-4.58,1.08-9.03,2.68-13.26,4.75-3.49,1.71-6.82,3.74-9.94,6.04-2.29,1.69-4.48,3.53-6.52,5.52-1.5,1.46-3.36,2.94-3.67,5.15-.14.99.12,2.42,1.41,2.35,28.85-7.66,48.17,26.34,48.17,26.34,1.87,3.15,0,3.15,0,3.15-77.96,24.34-58.22,63.32-58.22,63.32,17.53,30.13,71.58,16.51,71.58,16.51,2.3,1.79.59,3.41.59,3.41-65.53,28.59-59.23,69.1-59.23,69.1,4.59,25.53,29.62,15.83,29.62,15.83,8.67-2.41,15.84-9.67,21.73-16.11,7.6-8.31,14.19-17.54,20.27-27.01.49-.76.98-1.54,1.34-2.38.29-.68.51-1.42,1.05-1.92.58-.53,1.43-.67,2.21-.55.77.13,1.48.48,2.18.84,4.39,2.29,8.52,5.03,12.55,7.9,7.91,5.65,15.68,11.58,23.09,17.87,6.56,5.57,13.13,11.14,19.69,16.7,7.54,6.4,15.16,12.75,22.58,19.26,6.48,5.68,14.96,8.75,23.46,9.66,4.91.52,9.95.36,14.68-1.08,5.16-1.57,9.77-4.6,13.89-8.06,9.2-7.73,17.75-16.73,23.15-27.58,4.84-9.73,6.93-20.79,5.14-31.56-.58-3.46-1.45-7.15-3.1-10.28l-19.66-28.08c-5.11-6.64-9.45-3.32-9.45-3.32-4.81,3.68-8.73,7.65-10.79,13.49-1.64,4.64-2.92,11.8-.47,16.28.42.76.96,1.44,1.5,2.12,5.08,6.43,10.17,12.86,15.25,19.29.27.35.55.7.67,1.12.1.36.08.74.05,1.11-.38,4.48-2.56,8.77-5.94,11.72-3.39,2.95-7.95,4.52-12.43,4.28-.47-.02-.95-.07-1.38-.28-.32-.17-.6-.42-.86-.67-6.69-6.26-13.34-12.55-20.12-18.69-3.92-3.56-8.27-6.89-11.94-10.71-31.92-33.19-72-41.19-72-41.19l.34-6.81c61.1-27.06,65.87,18.73,65.87,18.73l33.36-11.24c-39.15-66.38-95.49-27.91-95.49-27.91-2.38,1.44-2.64-.6-2.64-.6l-3.83-28.51c-1.27-2.3,1.54-1.87,1.54-1.87,1.85.15,3.7.38,5.54.65,10.95,1.62,21.65,4.85,32.05,8.56,10.82,3.85,21.41,8.35,31.83,13.18,11.05,5.13,21.91,10.67,32.58,16.53,1.34.73,2.67,1.47,3.88,2.39.81.61,1.58,1.31,2.52,1.68.95.37,2.15.33,2.83-.42.69-.75.63-1.9.53-2.91-.96-9.73-1.5-19.31-.45-29.06.94-8.79,2.98-17.46,6.22-25.69,2.77-7.01,6.4-13.68,10.8-19.8,3.76-5.24,8.07-10.08,12.82-14.45,3.83-3.54,7.95-6.77,12.3-9.65,2.97-1.97,6.04-3.79,9.23-5.39.25-.12,3.61-1.46,3.61-1.66v-4.43c-30.12-19.57-80.34,5.45-80.34,5.45ZM390.16,246.94s-12.13,26.55-31.66,42.38c0,0-2.98,1.15-3.06-1.79,0,0-1.15-31.4,32.3-42,0,0,2.8-.51,2.42,1.41ZM398.2,196.89s-19.27,2.56-30.76-4.21c0,0-12.13-5.74-2.43-20.43,0,0,6-11.61,27.45-12,0,0,1.96-.34,1.79,1.03l5.61,33.06s-.12,2.94-1.66,2.55ZM535.06,103.91s-24,24.17-34.22,57.37c0,0-34.21-21.96-86.64-26.39,0,0-1.53-.34-2.21-2.89-1.13-2.46-2.48-4.84-3.88-7.15-2.49-4.13-5.28-8.22-8.65-11.73-1.71-1.79-3.58-3.43-5.62-4.83-1.02-.7-2.08-1.36-3.19-1.91-.78-.38-2.27-.79-2.37-1.83,0-.04,0-.07,0-.11.07-.88,1.72-.55,2.25-.48,9.34.79,18.59,3.79,26.54,8.69.22.14.46.29.57.52.09.19.09.4.09.61,0,5.45-1.17,11.76,2.77,16.13,1.54,1.71,3.57,3.19,5.66,4.16,2.23,1.04,4.41.78,6.77,1.04,0,0,11.49,1.27,14.17-8.43,0-7.61,0-15.22,0-22.83,0-.54,0-1.1.1-1.64.76-4.1,5.16-9.02,7.83-12.06,1.81-2.05,3.79-3.95,5.99-5.57.88-.65,6.11-4.51,7.15-3.82,2.65,1.78,4.83,4.53,6.63,7.11,2.14,3.06,3.85,6.41,5.18,9.9,1.55,4.05,4.03,9.81,2.09,14.02-1.22,2.65-3.15,4.8-4.34,7.51-1.06,2.41-2.9,6.78-2.07,9.46,1.23,3.96,3.47,7.86,6.23,10.92,1.81,2.01,3.99,3.7,6.52,4.71.3.12.6.23.92.26.46.05.91-.06,1.36-.17,3.8-.95,7.54-2.26,10.6-4.78,2.71-2.24,4.68-5.16,5.87-8.46,1.09-2.99,1.59-6.14,2.03-9.28,0,0,.34-14.13,25.19-19.92,0,0,2.05.17.69,1.87Z"/></g></g>`,
  // the standing deer from their favicon - swept horns, head turned down,
  // the long neck into the body. Drawn rather than traced: Indriya ships the
  // deer as a raster favicon only, and their SVGs are the wordmark and a
  // petal motif.
  indriya: `<path d="M10.1 6.6c-.9-1.5-1-3.2-.4-4.9"/>
            <path d="M12.5 6.3c.4-1.8 1.5-3.2 3-4.1"/>
            <path d="M10.4 7.2c.6-.9 1.7-1 2.4-.2"/>
            <path d="M10.4 7.2c-.7.5-1.2 1.2-1.4 2"/>
            <path d="M12.8 7c.5 1.6 1 3 2 4.3"/>
            <path d="M14.8 11.3c2.3-.5 4 .5 4.6 2.4"/>
            <path d="M19.4 13.7c.5 1.7.2 3.4-.8 4.8"/>
            <path d="M14.8 11.3c-1.3 1.4-1.8 3-1.6 4.7"/>
            <path d="M13.2 16c1.6.9 3.4 1.1 5.2.6"/>
            <path d="M13.3 16.2 12.6 21"/><path d="M18.4 16.6l.4 4.4"/>
            <path d="M15.6 16.6 15.2 21" opacity=".5"/>
            <path d="M19.9 13.4c.9-.5 1.5-1.3 1.7-2.3" opacity=".5"/>`,
  // the lotus that sits beside their letters
  grt: `<g><path d="M12 18C10.9 14.9 11 11.7 12 8.6 13 11.7 13.1 14.9 12 18Z" transform="rotate(-54 12 18)" opacity=".55"/><path d="M12 18C10.9 14.9 11 11.7 12 8.6 13 11.7 13.1 14.9 12 18Z" transform="rotate(-27 12 18)"/><path d="M12 18C10.9 14.9 11 11.7 12 8.6 13 11.7 13.1 14.9 12 18Z" transform="rotate(0 12 18)"/><path d="M12 18C10.9 14.9 11 11.7 12 8.6 13 11.7 13.1 14.9 12 18Z" transform="rotate(27 12 18)"/><path d="M12 18C10.9 14.9 11 11.7 12 8.6 13 11.7 13.1 14.9 12 18Z" transform="rotate(54 12 18)" opacity=".55"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor" stroke="none"/></g>`,
  // their gold DP inside its bordered square
  dp: `<rect x="4.4" y="4.4" width="15.2" height="15.2" rx="1.4" opacity=".5"/><path d="M7.8 8.4v7.2h1.5c2 0 3.3-1.6 3.3-3.6s-1.3-3.6-3.3-3.6H7.8"/><path d="M14.4 15.6V8.4h1.6c1.3 0 2.3.9 2.3 2.1s-1 2.1-2.3 2.1h-1.6"/>`,
  // the plume from their emblem - thangam mayil, the golden peacock
  thangamayil: `<path d="M16.6 3.8c1 4.8-.3 9.1-3.2 12.3-1.3 1.4-2.8 2.5-4.5 3.3-2.9-2.6-3.6-6.6-1.8-10.1 1.9-3.6 5.3-5.8 9.5-5.5z"/><path d="M13.5 8c.5 2.7-.3 5.2-2.2 7.3-.8.9-1.7 1.6-2.8 2.2" opacity=".55"/><circle cx="13.9" cy="6.4" r=".85" fill="currentColor" stroke="none"/>`,
  // the lettered coin rim
  mmtc: `<circle cx="12" cy="12" r="9.3"/><circle cx="12" cy="12" r="4.5" opacity=".9"/>
         <g opacity=".5" stroke-width="1.5">
           <path d="M18.4 12h1.7M16.5 16.5l1.2 1.2M12 18.4v1.7M7.5 16.5l-1.2 1.2"/>
           <path d="M5.6 12H3.9M7.5 7.5 6.3 6.3M12 5.6V3.9M16.5 7.5l1.2-1.2"/>
         </g>`,
  // notched corner block with its offset square
  aspect: `<path d="M9.2 4.4h10.4v15.2h-5.2V9.4H9.2z"/>
           <path d="M4.4 15.1h4.5v4.5H4.4z" opacity=".55"/>`,
  // R over the shoulder of a B
  brpl: `<path d="M6.5 5.2v14.2" opacity=".45"/>
         <path d="M9.4 19.4V5.2h4.2a3.7 3.7 0 0 1 0 7.4H9.4"/>
         <path d="m13.5 12.6 4.6 6.8"/>`,
  // two interlocking bands
  png: `<circle cx="9.2" cy="12" r="5.6"/><circle cx="14.8" cy="12" r="5.6"/>`,
  // their two crossed ribbon loops, the ones that meet in a heart at the foot
  joyalukkas: `<g><path d="M12 20.5C8.8 15.8 8.8 8.2 12 4c3.2 4.2 3.2 11.8 0 16.5Z" transform="rotate(-26 12 20.5)" opacity=".55"/><path d="M12 20.5C8.8 15.8 8.8 8.2 12 4c3.2 4.2 3.2 11.8 0 16.5Z" transform="rotate(26 12 20.5)"/></g>`,
  // the looped paisley that stands before their letters, with its top curls
  senco: `<g><path d="M12 4.2c-2.7 4.8-4.5 8.6-4.5 11.6 0 2.6 2 4.4 4 4.4 2.1 0 3.9-1.7 3.9-4.1 0-3.4-1.6-7.2-3.4-11.9Z" transform="rotate(-9 12 4.2)" opacity=".55"/><path d="M12 4.2c-2.2 4-3.7 7.1-3.7 9.6 0 2.2 1.6 3.6 3.3 3.6 1.7 0 3.2-1.4 3.2-3.4 0-2.8-1.3-5.9-2.8-9.8Z" transform="rotate(16 12 4.2)"/><path d="M12 4.2c-.8-1.5-2.5-1.9-3.2-.8"/></g>`,
  // serif B, detached dot, swoosh
  bhima: `<path d="M9 4.8v11.4"/>
          <path d="M9 4.8h3.4a2.8 2.8 0 0 1 0 5.6H9"/>
          <path d="M9 10.4h3.9a2.9 2.9 0 0 1 0 5.8H9"/>
          <circle cx="6.1" cy="8.9" r="1.25" fill="currentColor" stroke="none"/>
          <path d="M4.3 19.5c4.7-2.3 10.7-2.3 15.4 0" opacity=".55"/>`,
};
