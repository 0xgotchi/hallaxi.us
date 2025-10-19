import { generateLayoutNextMetadata, type SEOConfig } from "@0xgotchi/seo";
import type { Metadata } from "next";

const siteSEO = {
  title: "Hallaxius",
  description: "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
  alternates: {
    canonical: "https://hallaxi.us",
    favicon: { rel: "icon", href: "/favicon.png", type: "image/png" },
  },
  openGraph: {
    title: "Hallaxius",
    description: "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
    url: "https://hallaxi.us",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hallaxius",
    description: "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
  },
  themeColor: { default: "#ff0000" },
} as const satisfies SEOConfig;

export const metadata: Metadata = generateLayoutNextMetadata(
  siteSEO,
) as Metadata;

export default metadata;
