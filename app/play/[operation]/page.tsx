import { notFound } from "next/navigation";
import { Game } from "@/components/Game";
import { OPERATION_CONFIG, isOperation } from "@/lib/game/operations";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ operation: string }>;
}) {
  const { operation } = await params;
  // MVP : seules les opérations activées sont jouables.
  if (!isOperation(operation) || !OPERATION_CONFIG[operation].enabled) {
    notFound();
  }
  return <Game operation={operation} />;
}
