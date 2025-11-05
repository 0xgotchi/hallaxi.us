import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ErrorPage from "@/components/page/ErrorPage";
import prisma from "@/lib/prisma";

interface SlugPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SlugPage({ params }: SlugPageProps) {
  const { slug } = await params;

  if (!slug) {
    return (
      <ErrorPage
        title="Not found"
        description="This file does not exist or has expired."
      />
    );
  }

  try {
    const record = await prisma.upload.findUnique({ where: { url: slug } });

    if (!record) {
      return (
        <ErrorPage
          title="Not found"
          description="This file does not exist or has expired."
        />
      );
    }

    const isExpired =
      !!record.expiresAt && new Date(record.expiresAt) < new Date();
    if (isExpired) {
      return (
        <ErrorPage
          title="Not found"
          description="This file does not exist or has expired."
        />
      );
    }

    const headersList = await headers();
    const currentDomain = headersList.get("host");

    if (
      !currentDomain ||
      record.domain.toLowerCase() !== currentDomain.toLowerCase()
    ) {
      return (
        <ErrorPage
          title="Not found"
          description="This file does not exist or has expired."
        />
      );
    }

    const r2KeyParts = record.r2Key.split("/");
    const encodedR2Key = r2KeyParts
      .map((part: string, index: number) =>
        index === 0 ? part : encodeURIComponent(part),
      )
      .join("/");

    redirect(`${process.env.R2_PUBLIC_BASE_URL}/${encodedR2Key}`);
  } catch (error) {
    console.error("Error in slug page:", error);
    return (
      <ErrorPage
        title="Error"
        description="An error occurred while processing your request."
      />
    );
  }
}
