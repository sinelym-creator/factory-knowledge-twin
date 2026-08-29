// Tailwind v4는 PostCSS 플러그인 하나로 붙는다(별도 tailwind.config.js·autoprefixer 불요).
// 토큰·유틸리티 정의는 app/globals.css의 @theme 안에 있다.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
