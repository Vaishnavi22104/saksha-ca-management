"use client";

import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

type NavItem = { href: string; label: string; soon?: string };

/** Two letters for the signed-in person, when they have no picture. */
function initials(name: string) {
  return name.replace(/^CA\s+/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/profile", label: "Profile" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clients", label: "Clients" },
    { href: "/tasks", label: "Tasks" },
    { href: "/staff", label: "Staff" },
    { href: "/activity", label: "Activity" },
    { href: "/notifications", label: "Notifications" },
    { href: "/workflows", label: "Workflows" },
    { href: "/documents", label: "Documents" },
    { href: "/messages", label: "Messages" },
    { href: "/ai", label: "AI assistant" },
  ],
  STAFF: [
    { href: "/profile", label: "Profile" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clients", label: "Clients" },
    { href: "/tasks", label: "My tasks" },
    { href: "/activity", label: "Activity" },
    { href: "/notifications", label: "Notifications" },
    { href: "/documents", label: "Documents" },
    { href: "/messages", label: "Messages" },
  ],
  CLIENT: [
    { href: "/profile", label: "Profile" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/work", label: "My work" },
    { href: "/notifications", label: "Notifications" },
    { href: "/documents", label: "Documents" },
    { href: "/messages", label: "Messages" },
  ],
};

export function Sidebar(props: {
  role: Role;
  firmName: string;
  userName: string;
  subtitle: string;
  unread?: number;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  return (
    <aside className="side">
      <div className="brand">
        <LogoMark size={30} />
        <span className="brand-txt">
          <b>SAKSHA</b>
          <span>{props.firmName}</span>
        </span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV[props.role].map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
              {item.label}
              {item.soon && <span className="soon">{item.soon}</span>}
              {item.href === "/notifications" && !!props.unread && (
                <span className="count" aria-label={`${props.unread} unread`}>{props.unread > 99 ? "99+" : props.unread}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="me">
        <Link href="/profile" className="me-who">
          {props.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="me-av photo" src={props.avatarUrl} alt="" />
          ) : (
            <span className="me-av">{initials(props.userName)}</span>
          )}
          <span className="me-txt">
            <b>{props.userName}</b>
            <span className="small">{props.subtitle}</span>
          </span>
        </Link>
        <form action="/auth/signout" method="post">
          <button className="linkbtn" type="submit">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
