// Shown for a product until a real image is found automatically or uploaded manually.
export const PLACEHOLDER_PRODUCT_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#e5e7eb"/>
  <path d="M60 130 L85 100 L110 122 L130 90 L150 130 Z" fill="#9ca3af"/>
  <circle cx="75" cy="80" r="12" fill="#9ca3af"/>
  <rect x="50" y="55" width="100" height="90" rx="6" fill="none" stroke="#9ca3af" stroke-width="4"/>
</svg>
`.trim());
