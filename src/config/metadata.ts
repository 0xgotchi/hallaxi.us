import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hallaxius",
  description:
    "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
  alternates: {
    canonical: "https://hallaxi.us",
  },
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "Hallaxius",
    description:
      "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
    url: "https://hallaxi.us",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hallaxius",
    description:
      "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
  },
};

export const viewport = {
  themeColor: "#ffffff",
};

export default metadata;
