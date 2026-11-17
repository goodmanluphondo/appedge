import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CreateRecordPage } from "../../../create-record-page";
import { getCreateRecordOptions, type ManagementSection } from "../../../lib/data";
import { managementSectionForSlug } from "../../../section-page";

const creatableSections: ManagementSection[] = ["Clients", "Applications", "Domains", "Routes"];

export default async function Page({ params }: PageProps<"/[section]/new">) {
  const { section: slug } = await params;
  const section = managementSectionForSlug(slug);
  if (!section || !creatableSections.includes(section)) notFound();
  await headers();
  const options = await getCreateRecordOptions();
  return <CreateRecordPage section={section} options={options}/>;
}
