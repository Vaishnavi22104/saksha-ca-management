import Link from "next/link";

/**
 * The bar across the top of every signed-in page: search the work,
 * the period you are in, notifications, and who you are signed in as.
 */
export function TopBar(props: { userName: string; subtitle: string; unread: number; avatarUrl?: string | null }) {
  const now = new Date();
  // Indian financial year: April to March.
  const y = now.getFullYear();
  const fyStart = now.getMonth() >= 3 ? y : y - 1;
  const period = `FY ${fyStart}-${String(fyStart + 1).slice(2)} · ${now.toLocaleString("en-IN", { month: "long" })}`;
  const initials = props.userName.replace(/^CA\s+/i, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="topbar">
      <form className="tb-search" action="/tasks">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" strokeLinecap="round" />
        </svg>
        <label htmlFor="tb-q" className="sr-only">Search tasks</label>
        <input id="tb-q" name="q" type="search" placeholder="Search clients, tasks or documents" autoComplete="off" />
        <span className="tb-kbd" aria-hidden="true">Enter ↵</span>
      </form>

      <span className="tb-period">{period}</span>

      <Link className="tb-bell" href="/notifications" aria-label={`Notifications${props.unread ? `, ${props.unread} unread` : ""}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
        </svg>
        {props.unread > 0 && <i className="dot" />}
      </Link>

      <Link className="tb-me" href="/profile">
        {props.avatarUrl ? (
          // A plain img: the URL is a Supabase public URL, and adding a
          // remote host to next/image config for one 32px avatar is not
          // worth the configuration it would need.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tb-av photo" src={props.avatarUrl} alt="" />
        ) : (
          <span className="tb-av">{initials}</span>
        )}
        <span className="tb-who">
          <b>{props.userName}</b>
          <span>{props.subtitle}</span>
        </span>
      </Link>
    </header>
  );
}
