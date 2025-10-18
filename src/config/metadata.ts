import { generateLayoutNextMetadata, type SEOConfig } from "@0xgotchi/seo";
import type { Metadata } from "next";

const siteSEO: SEOConfig = {
  title: "Hallaxius",
  description: "Website hallaxi.us",
  alternates: {
    canonical: "https://hallaxi.us",
    favicons: [{ rel: "icon", href: "/favicon.png", type: "image/png" }],
  },
  openGraph: {
    title: "hallaxi.us",
    description: "Website hallaxi.us",
    url: "https://hallaxi.us",
    siteName: "hallaxi.us",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "hallaxi.us",
    description: "Website hallaxi.us",
  },
};

export const metadata: Metadata = generateLayoutNextMetadata(
  siteSEO,
) as Metadata;
export default metadata;
