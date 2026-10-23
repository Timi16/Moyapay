import { iconResponse } from "@/lib/brandImage";

export const dynamic = "force-static";

export function GET() {
  return iconResponse(180, true);
}
