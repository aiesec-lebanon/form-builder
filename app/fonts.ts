import localFont from "next/font/local";

// The design system's own font files (components/aiesec/fonts), self-hosted
// through next/font: no requests to third parties.
export const lato = localFont({
  src: [
    { path: "../components/aiesec/fonts/lato-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../components/aiesec/fonts/lato-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../components/aiesec/fonts/lato-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../components/aiesec/fonts/lato-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../components/aiesec/fonts/lato-latin-700-italic.woff2", weight: "700", style: "italic" },
    { path: "../components/aiesec/fonts/lato-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-lato",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "system-ui", "sans-serif"],
});

export const raleway = localFont({
  src: "../components/aiesec/fonts/raleway-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-raleway",
  display: "swap",
  fallback: ["Lato", "Helvetica Neue", "Arial", "sans-serif"],
});
