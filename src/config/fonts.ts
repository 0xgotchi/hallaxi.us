import { Inter } from "next/font/google";

// Configure Inter as the default sans font
export const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const fontClassName = `${inter.variable} antialiased`;
