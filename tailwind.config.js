/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./*.html", "./*.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(193, 199, 209, 0.15), 0 24px 60px rgba(7, 30, 39, 0.06)"
      }
    }
  },
  plugins: []
};
