export function pageHead(title: string, description: string) {
  const t = `${title} · Mutual CAT`;
  return {
    meta: [
      { title: t },
      { name: "description", content: description },
      { property: "og:title", content: t },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}

export const selectCls = "h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm";
export const inputCls = "h-11 bg-card text-base";
