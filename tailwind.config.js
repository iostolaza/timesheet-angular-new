// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",  // Added: Scans .html/.ts for classes
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};