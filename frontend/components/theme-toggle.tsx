"use client";

import { Moon, Sun } from "lucide-react";

// Day / night. The choice lives in localStorage and is applied before the
// page paints (the script in app/layout.tsx), so there is no flash. Both icons
// are rendered and CSS shows the right one: no state, nothing to hydrate.
export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Private mode: the choice lasts until the tab closes.
    }
  };

  return (
    <button
      onClick={toggle}
      className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-cream text-cream hover:bg-cream hover:text-ink transition-colors"
      aria-label="Switch between light and dark"
      title="Light / dark"
    >
      <Moon className="w-4 h-4 dark:hidden" strokeWidth={2.5} />
      <Sun className="w-4 h-4 hidden dark:block" strokeWidth={2.5} />
    </button>
  );
}
