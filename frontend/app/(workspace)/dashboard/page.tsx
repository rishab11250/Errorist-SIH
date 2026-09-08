import { DashboardPage } from '@/components/dashboard/DashboardPage';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardRoute({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <DashboardPage initialSearchParams={await searchParams} />;
}
