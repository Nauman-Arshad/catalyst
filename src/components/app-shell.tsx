"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "@/components/sidebar";

// Persisted collapse state, read with useSyncExternalStore so it stays in sync
// without a setState-in-effect and without a hydration mismatch.
const KEY = "sidebar-collapsed";
const EVENT = "sidebar-collapsed-change";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function useCollapsed() {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) === "1",
    () => false,
  );
}

function setCollapsedValue(value: boolean) {
  localStorage.setItem(KEY, value ? "1" : "0");
  window.dispatchEvent(new Event(EVENT));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#f5f3ff]">
      {/* Desktop sidebar (sticky, collapsible) */}
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsedValue(!collapsed)}
        />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar
              mobile
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex size-9 items-center justify-center rounded-md text-gray-600 hover:bg-purple-50"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/" className="text-lg font-bold text-purple-600">
            <span className="text-xl">⬡</span> Catalyst
          </Link>
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
