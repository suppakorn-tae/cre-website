import { AdvicePage } from '@/features/admin/advice/AdvicePage';

export default async function AdminAdviceRoute({
  searchParams,
}: {
  searchParams: Promise<{ indicator?: string | string[] }>;
}) {
  const { indicator } = await searchParams;
  return <AdvicePage initialCode={typeof indicator === 'string' ? indicator : undefined} />;
}
