"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(element: HTMLElement) {
  return element.offsetParent !== null;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

// Escape to close, Tab/Shift+Tab cycles within the modal instead of escaping to the page
// behind it, and focus returns to whatever opened the modal once it closes. Attach the
// returned ref to the dialog element (the one with role="dialog"), not the backdrop.
export function useModalA11y(onClose: () => void) {
  const containerRef = useRef<HTMLElement>(null);
  // Captured during RENDER, not inside an effect: a field with `autoFocus` inside the modal
  // (the usual pattern here) gets focused by React during the commit phase, which runs before
  // any useEffect — so by the time a mount effect could read document.activeElement, focus has
  // already moved from the trigger button to that field, and "restore focus" would put it back
  // on the wrong element. Render happens before commit, so this still sees the trigger.
  const previouslyFocusedRef = useRef<HTMLElement | null>(typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null);
  // onClose is almost always a fresh inline function on every render of the caller. Reading it
  // through a ref (kept current by a separate, every-render effect) lets the main effect below
  // run exactly once on mount / once on unmount regardless of how many times the caller
  // re-renders while the modal stays open.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const previouslyFocused = previouslyFocusedRef.current;
    const container = containerRef.current;

    if (container && !container.contains(document.activeElement)) {
      const focusable = focusableElements(container);
      (focusable[0] ?? container).focus();
    }

    function handleTabKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !container) return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeInside = container.contains(document.activeElement);
      if (event.shiftKey) {
        if (!activeInside || document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!activeInside || document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Escape is handled on the BUBBLE phase (not capture, unlike the Tab trap above), and
    // defers to event.defaultPrevented: a popup nested inside the modal (e.g. a country-code
    // dropdown) may want to consume its own Escape press to close just itself. Its own
    // keydown handler runs first (it's on the actual target, closer to the event source) and
    // calls preventDefault() when it does — checked here instead of relying on
    // stopPropagation(), because React's synthetic stopPropagation() does not reliably stop
    // a *native* document-level listener like this one from still firing (verified: it does
    // NOT cross that boundary in this app's React/event-delegation setup, so a capture-phase
    // or naive bubble-phase listener here would close the whole modal instead of just the
    // nested popup). event.defaultPrevented is a plain flag on the shared native event and
    // reads correctly regardless of that boundary.
    function handleEscapeKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.stopPropagation();
      onCloseRef.current();
    }

    document.addEventListener("keydown", handleTabKeyDown, true);
    document.addEventListener("keydown", handleEscapeKeyDown);
    return () => {
      document.removeEventListener("keydown", handleTabKeyDown, true);
      document.removeEventListener("keydown", handleEscapeKeyDown);
      previouslyFocused?.focus?.();
    };
    // Mount/unmount only — see onCloseRef above for why onClose is intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
