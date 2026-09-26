/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#67d9c3",
        "primary-container": "#22a28e",
        "on-primary": "#00382f",
        "on-primary-container": "#003029",
        "secondary": "#45f3d2",
        "secondary-container": "#00d6b7",
        "on-secondary": "#00382e",
        "surface": "#111415",
        "surface-dim": "#111415",
        "surface-bright": "#37393b",
        "surface-container-lowest": "#0c0f10",
        "surface-container-low": "#191c1d",
        "surface-container": "#1e2021",
        "surface-container-high": "#282a2b",
        "surface-container-highest": "#333536",
        "on-surface": "#e2e2e4",
        "on-surface-variant": "#bcc9c5",
        "outline": "#86948f",
        "outline-variant": "#3d4946",
        "error": "#ffb4ab",
        "error-container": "#93000a",
        "on-error": "#690005",
        "on-error-container": "#ffdad6",
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
