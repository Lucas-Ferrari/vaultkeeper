import type { Page } from "@playwright/test";

export const MIN_TARGET_PX = 44;

export interface LayoutAudit {
  scrollWidth: number;
  innerWidth: number;
  /** Deepest elements past the right edge: where a horizontal scroll comes from (diagnostics). */
  overflowing: string[];
  /** Visible interactive elements smaller than 44x44. */
  smallTargets: string[];
  /** Visible interactive elements outside the viewport width, e.g. inside a side-scrolling table. */
  offscreenTargets: string[];
}

/**
 * R-PWA-2 S1: no horizontal scroll, all actions reachable, touch targets >= 44 px. Measures every
 * visible interactive element in the rendered page (links, buttons, form controls, ARIA widgets).
 */
export async function auditLayout(page: Page): Promise<LayoutAudit> {
  return page.evaluate((min) => {
    const viewport = window.innerWidth + 0.5;
    const selector =
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=option], [role=checkbox], [role=combobox]";
    const describe = (element: Element, box: DOMRect) => {
      const name = element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40);
      return `${element.tagName.toLowerCase()} "${name ?? ""}" ${Math.round(box.width)}x${Math.round(box.height)} @${Math.round(box.left)}`;
    };

    const smallTargets: string[] = [];
    const offscreenTargets: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || style.visibility === "hidden") continue;
      // A small native control is fine when its <label> is the 44 px touch target.
      const label =
        element.closest("label") ??
        (element.id ? document.querySelector(`label[for="${element.id}"]`) : null);
      const small = box.width < min || box.height < min;
      const target = label && small ? label.getBoundingClientRect() : box;
      if (target.width + 0.5 < min || target.height + 0.5 < min) {
        smallTargets.push(describe(element, target));
      }
      if (target.left < -0.5 || target.right > viewport) {
        offscreenTargets.push(describe(element, target));
      }
    }

    const overflowing: string[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      const right = element.getBoundingClientRect().right;
      const childOverflows = [...element.children].some(
        (child) => child.getBoundingClientRect().right > viewport,
      );
      if (right > viewport && !childOverflows) {
        overflowing.push(
          `${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 40)} right=${Math.round(right)}`,
        );
      }
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflowing: overflowing.slice(0, 6),
      smallTargets,
      offscreenTargets,
    };
  }, MIN_TARGET_PX);
}
