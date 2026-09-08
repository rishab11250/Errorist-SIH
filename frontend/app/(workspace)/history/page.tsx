import { RepositoryPage } from '@/components/repository/RepositoryPage';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <RepositoryPage initialSearchParams={await searchParams} />;
}
