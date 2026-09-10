/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Sora", "sans-serif"],
      },
      colors: {
        navy: {
          DEFAULT: "#0B3D91",
          dark: "#082d6c",
          deep: "#002869",
        },
        signal: {
          DEFAULT: "#00C853",
          dark: "#00A838",
          bright: "#2BE26F",
        },
        ink: {
          900: "#0B1220",
          500: "#5B6472",
        },
      },
      boxShadow: {
        panel: "0 10px 30px -12px rgba(11, 61, 145, 0.18)",
        glow: "0 0 0 4px rgba(0, 200, 83, 0.12)",
      },
    },
  },
  plugins: [],
};
