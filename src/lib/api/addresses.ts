import { parseAddressList } from "@/lib/providers/mime";
import { badRequest } from "@/lib/api/errors";
import type { Address } from "@/types";
import type { AddressInput } from "@/lib/api/schemas";

/** Normalises API address inputs ("Name <a@b.com>" strings or {email,name} objects). */
export function toAddresses(inputs: AddressInput[] | undefined): Address[] {
  if (!inputs) return [];
  const out: Address[] = [];
  for (const input of inputs) {
    if (typeof input === "string") {
      const parsed = parseAddressList(input);
      if (!parsed.length) throw badRequest(`Invalid email address: ${input}`);
      out.push(...parsed);
    } else {
      out.push({ email: input.email.toLowerCase(), name: input.name ?? null });
    }
  }
  return out;
}
