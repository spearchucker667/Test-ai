import { useEffect, RefObject } from "react";

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean = true, onClose?: () => void) {
  useEffect(() => {
    if (!active || !ref.current) return;

    const el = ref.current;
    
    // Find all focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]'
    ].join(',');
    
    const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors));

    // Focus the first element when active
    const focusable = getFocusable();
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      el.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const elements = getFocusable();
      if (elements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, ref, onClose]);
}
