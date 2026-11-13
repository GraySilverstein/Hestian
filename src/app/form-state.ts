export interface FormState {
  readonly status: "idle" | "error" | "success";
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly link?: string;
}

export const IDLE_FORM_STATE: FormState = { status: "idle" };

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/workspace";
  // Only same-site absolute paths; reject protocol-relative and absolute URLs.
  if (!value.startsWith("/") || value.startsWith("//")) return "/workspace";
  return value;
}
