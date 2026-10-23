import type { PaymentResult, RequestStatus } from "@moyapay/shared";
import { RESULT_CHIP, STATUS_CHIP } from "@/lib/format";

export function StatusChip({ status, large, className = "" }: { status: RequestStatus; large?: boolean; className?: string }) {
  const [label, cls] = STATUS_CHIP[status];
  return <span className={`chip ${cls} ${large ? "lg" : ""} ${className}`}>{label}</span>;
}

export function ResultChip({ result }: { result: PaymentResult }) {
  const [label, cls] = RESULT_CHIP[result];
  return <span className={`chip ${cls}`}>{label}</span>;
}
