import { notFound } from "next/navigation";
import { Game } from "@/components/Game";
import { OPERATION_CONFIG, isOperation } from "@/lib/game/operations";

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ operation: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { operation } = await params;
  const { mode } = await searchParams;
  // MVP : seules les opérations activées sont jouables.
  if (!isOperation(operation) || !OPERATION_CONFIG[operation].enabled) {
    notFound();
  }
  // Mode adaptatif : réservé à la multiplication (« points faibles »).
  const adaptive = mode === "adaptive" && operation === "multiplication";
  return <Game operation={operation} adaptive={adaptive} />;
}
