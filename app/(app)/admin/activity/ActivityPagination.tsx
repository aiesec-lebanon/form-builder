"use client";

import NextLink from "next/link";
import * as React from "react";

import { Pagination } from "@/components/aiesec";
import { activityHref, type ActivityQuery } from "@/lib/admin/activity-query";

// The design system gives disabled page links (Previous on page 1) no href;
// next/link requires one, so those render as a plain, inert anchor.
const PageLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(function PageLink({ href, ...rest }, ref) {
  return href ? <NextLink ref={ref} href={href} scroll={false} {...rest} /> : <a ref={ref} {...rest} />;
});

/** Page links that keep the current filters and sort. */
export function ActivityPagination({ query, page, pageCount }: { query: ActivityQuery; page: number; pageCount: number }) {
  return <Pagination page={page} pageCount={pageCount} hrefFor={(target) => activityHref(query, { page: target })} label="Pages" linkComponent={PageLink} />;
}
