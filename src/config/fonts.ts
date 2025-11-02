import { Inter } from "next/font/google";

export const inter = Inter({
  variable: "--font-sans",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const fontClassName = `${inter.variable} antialiased`;
