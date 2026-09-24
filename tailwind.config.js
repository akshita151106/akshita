/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { neon: { cyan: "#22d3ee", violet: "#a855f7" } },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        display: ["Chakra Petch", "Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
};
