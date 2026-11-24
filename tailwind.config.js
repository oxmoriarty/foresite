/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5fa",
          100: "#e0ecf6",
          200: "#c2dbef",
          300: "#97c2e3",
          400: "#5b9ecd",
          500: "#246da6",
          600: "#0e3860", // Core dark brand blue
          700: "#0a2a4a", // Hover dark brand blue
          800: "#071f37", // Active / deep brand blue
          900: "#051628", // Midnight sidebar blue (matching Payroost dark sidebar)
          950: "#030c17", // Ultra deep navy
        },
        slate: {
          850: "#172033",
          950: "#0b0f19",
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          '"Manrope"',
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: [
          '"Plus Jakarta Sans"',
          '"Manrope"',
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        card: "0 1px 3px rgba(0,0,0,0.05), 0 10px 25px -5px rgba(0,0,0,0.04)",
        "card-hover": "0 12px 30px -4px rgba(14, 56, 96, 0.15), 0 4px 10px -2px rgba(0,0,0,0.04)",
        pill: "0 4px 14px 0 rgba(14, 56, 96, 0.25)",
      },
    },
  },
  plugins: [],
};
