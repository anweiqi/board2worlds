import Board2Worlds from "@/components/Board2Worlds";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  return <Board2Worlds initialRunId={run} />;
}
