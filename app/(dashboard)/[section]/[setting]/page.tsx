import { notFound } from "next/navigation";
import { SettingDetailPage } from "../../../setting-detail-page";
import { settingOptionForSlug } from "../../../lib/settings";

export default async function Page({ params }: PageProps<"/[section]/[setting]">) {
  const { section, setting } = await params;
  if (section !== "settings") notFound();

  const settingOption = settingOptionForSlug(setting);
  if (!settingOption) notFound();

  return <SettingDetailPage setting={settingOption}/>;
}
