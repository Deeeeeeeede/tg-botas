import { randomUUID } from "node:crypto";

export function generateQueueId(): string {
  return randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase();
}

export function formatEur(amount: number | string): string {
  return `€${Number(amount).toFixed(2)}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function formatDate(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Vilnius",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function isExpired(date: Date | null | undefined): boolean {
  if (!date) return true;
  return date < new Date();
}
