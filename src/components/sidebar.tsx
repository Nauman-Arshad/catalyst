"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  Package,
  ClipboardList,
  CreditCard,
  Undo2,
  History,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/returns", label: "Returns", icon: Undo2 },
  { href: "/party-history", label: "Party History", icon: History },
  { href: "/companies", label: "Company Ledger", icon: Building2 },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  collapsed = false,
  onToggle,
  onNavigate,
  mobile = false,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-gray-200 bg-white transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center px-3",
          collapsed ? "justify-center" : "justify-between pl-5",
        )}
      >
        {!collapsed && (
          <Link
            href="/"
            onClick={onNavigate}
            className="flex items-center gap-2 text-lg font-bold text-purple-600"
          >
            <span className="text-xl">⬡</span> Catalyst
          </Link>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={mobile ? "Close menu" : "Toggle sidebar"}
            className="flex size-8 items-center justify-center rounded-md text-gray-500 hover:bg-purple-50 hover:text-purple-600"
          >
            {mobile ? (
              <X className="size-5" />
            ) : collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "px-3",
                active
                  ? "bg-purple-600 text-white"
                  : "text-gray-600 hover:bg-purple-50",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-gray-200 p-4",
          collapsed && "flex justify-center",
        )}
      >
        <UserButton showName={!collapsed} />
      </div>
    </aside>
  );
}
