import { Inter } from "next/font/google";

export const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const fontClassName = `${inter.variable} antialiased`;
