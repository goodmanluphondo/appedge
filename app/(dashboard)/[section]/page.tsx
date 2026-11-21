import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { currentTime } from "../../lib/format";
import { firstValue } from "../../lib/query";
import { managementSectionForSlug, SectionPage } from "../../section-page";

export default async function Page({ params, searchParams }: PageProps<"/[section]">) {
  const [{ section: slug }, query] = await Promise.all([params, searchParams]);
  const section = managementSectionForSlug(slug);
  if (!section) notFound();
  await headers();
  return <SectionPage
    section={section}
    path={`/${slug}`}
    scope={firstValue(query.client)}
    query={firstValue(query.q) ?? ""}
    filter={firstValue(query.filter) ?? "all"}
    domainId={firstValue(query.domain)}
    now={currentTime()}
  />;
}
