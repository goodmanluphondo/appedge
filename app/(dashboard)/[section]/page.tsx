import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getManagementData } from "../../lib/data";
import { managementSectionForSlug, SectionPage } from "../../section-page";

export default async function Page({ params, searchParams }: PageProps<"/[section]">) {
  const [{ section: slug }, query] = await Promise.all([params, searchParams]);
  const section = managementSectionForSlug(slug);
  if (!section) notFound();
  await headers();
  const data = await getManagementData(section);
  return <SectionPage section={section} query={typeof query.q === "string" ? query.q : ""} data={data}/>;
}
