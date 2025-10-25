import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ErrorPage from "@/components/page/ErrorPage";
import prisma from "@/lib/prisma";

interface SlugPageProps {
  params: Promise<{ slug: string }>;
}

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

  redirect(`${process.env.R2_PUBLIC_BASE_URL}/${record.r2Key}`);
}