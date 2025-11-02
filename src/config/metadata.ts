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
    images: [
      {
        url: "https://hallaxi.us/favicon.png",
        width: 128,
        height: 128,
        alt: "Hallaxius logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Hallaxius",
    description:
      "Temporarily upload files up to 500 MB for free with AES-256 encryption and complete anonymity.",
    images: ["https://hallaxi.us/favicon.png"],
  },
};

export default metadata;
