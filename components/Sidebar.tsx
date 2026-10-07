"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

type NavItem = { href: string; label: string; soon?: string };

const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clients", label: "Clients" },
    { href: "/tasks", label: "Tasks" },
    { href: "/staff", label: "Staff" },
    { href: "/activity", label: "Activity" },
    { href: "/workflows", label: "Workflows", soon: "22 Sep" },
    { href: "/documents", label: "Documents", soon: "24 Sep" },
    { href: "/messages", label: "Messages", soon: "25 Sep" },
    { href: "/ai", label: "AI assistant", soon: "30 Sep" },
  ],
  STAFF: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clients", label: "Clients" },
    { href: "/tasks", label: "My tasks" },
    { href: "/activity", label: "Activity" },
    { href: "/documents", label: "Documents", soon: "24 Sep" },
    { href: "/messages", label: "Messages", soon: "25 Sep" },
  ],
  CLIENT: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/work", label: "My work" },
    { href: "/profile", label: "Profile" },
    { href: "/documents", label: "Documents", soon: "24 Sep" },
    { href: "/messages", label: "Messages", soon: "25 Sep" },
  ],
};

export function Sidebar(props: { role: Role; firmName: string; userName: string; subtitle: string }) {
  const pathname = usePathname();
  return (
    <aside className="side">
      <div className="brand">
        <b>CA Office OS</b>
        <span>{props.firmName}</span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV[props.role].map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
              {item.label}
              {item.soon && <span className="soon">{item.soon}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="me">
        <div>
          <b>{props.userName}</b>
          <span className="small">{props.subtitle}</span>
        </div>
        <form action="/auth/signout" method="post">
          <button className="linkbtn" type="submit">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
