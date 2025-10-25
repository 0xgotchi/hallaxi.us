export const allowedDomains = [
  "hallaxi.us",
  "antisemita.lol",
] as const;

export type AllowedDomain = (typeof allowedDomains)[number];

export function buildPublicUrl(slug: string, domain?: string) {
  const usedDomain =
    domain && allowedDomains.includes(domain as any)
      ? domain
      : allowedDomains[0];
  return `https://${usedDomain}/${slug}`;
}
