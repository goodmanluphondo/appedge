import { headers } from "next/headers";
import { currentTime } from "../lib/format";
import { firstValue } from "../lib/query";
import { Overview } from "../overview";

export default async function Home({ searchParams }: PageProps<"/">) {
  await headers();
  const query = await searchParams;
  return <Overview scope={firstValue(query.client)} domainId={firstValue(query.domain)} now={currentTime()}/>;
}
