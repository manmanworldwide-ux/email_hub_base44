import { randomBytes } from "node:crypto";
import type { Address, SendMailParams } from "@/types";
import { htmlToText, textToHtml } from "@/lib/utils";

/** Parses an RFC 5322 address list ("Name" <a@b.com>, c@d.com). */
export function parseAddressList(value: string | null | undefined): Address[] {
  if (!value) return [];
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let depth = 0;
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "<") depth++;
    else if (!inQuotes && ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && !inQuotes && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  const out: Address[] = [];
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    const match = s.match(/^(?:"?([^"]*?)"?\s*)?<([^>]+)>$/);
    if (match) {
      out.push({ name: match[1]?.trim() || null, email: match[2].trim().toLowerCase() });
      continue;
    }
    const emailMatch = s.match(/[^\s<>"]+@[^\s<>"]+/);
    if (emailMatch) out.push({ name: null, email: emailMatch[0].toLowerCase() });
  }
  return out;
}

export function formatAddress(address: Address): string {
  if (!address.name) return address.email;
  const name = address.name.replace(/"/g, "");
  const encoded = encodeHeaderWord(name);
  return /^[\w .'-]*$/.test(name) ? `${encoded} <${address.email}>` : `"${encoded}" <${address.email}>`;
}

/** RFC 2047 encoded-word for non-ASCII header values. */
export function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function base64UrlEncode(input: string | Buffer): string {
  return (typeof input === "string" ? Buffer.from(input, "utf8") : input).toString("base64url");
}

export function base64UrlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function wrap76(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n");
}

/** Builds a multipart/alternative RFC 2822 message suitable for Gmail's `raw` field. */
export function buildRfc822(params: SendMailParams): string {
  const boundary = `=_emailhub_${randomBytes(12).toString("hex")}`;
  const text = params.text ?? (params.html ? htmlToText(params.html) : "");
  const html = params.html ?? textToHtml(text);

  const headers = [
    `From: ${formatAddress({ name: params.fromName, email: params.fromEmail })}`,
    `To: ${params.to.map(formatAddress).join(", ")}`,
  ];
  if (params.cc.length) headers.push(`Cc: ${params.cc.map(formatAddress).join(", ")}`);
  if (params.bcc.length) headers.push(`Bcc: ${params.bcc.map(formatAddress).join(", ")}`);
  headers.push(`Subject: ${encodeHeaderWord(params.subject)}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(text, "utf8").toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(html, "utf8").toString("base64")),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function replySubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}
