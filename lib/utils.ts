import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names, letting later Tailwind classes win over earlier ones (shadcn/ui's helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Where shadcn/ui pop-ups (dialogs, menus, popovers, selects) mount: inside
 * the console's `.kit-shadcn` wrapper, so its theme applies to them too.
 */
export function kitContainer(): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLElement>(".kit-shadcn") ?? undefined;
}
