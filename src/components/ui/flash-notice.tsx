import { flashMessage } from "@/lib/flash";
import { Alert } from "./feedback";

export function FlashNotice({ code }: { code: string | string[] | undefined }) {
  const message = flashMessage(code);
  if (!message) return null;
  return <Alert variant="success" className="mb-5">{message}</Alert>;
}
