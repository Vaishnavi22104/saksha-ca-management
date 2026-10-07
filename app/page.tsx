import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarRows, Donut } from "@/components/charts";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "SAKSHA — Run your whole CA practice on one screen",
  description:
    "Less chasing. More filing. SAKSHA creates every GST, ITR and TDS cycle, collects documents from clients in their own portal, and keeps every change on record.",
};

/** Small line-art icons. Inline SVG so the page ships no icon library. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const FEATURES = [
  {
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5",
    title: "Every client in one register",
    body: "PAN, GSTIN, contacts, assigned staff and the whole history of work done for them. Each client gets a portal login of their own.",
  },
  {
    icon: "M4 6h16M4 12h16M4 18h10M18 16l2 2 3-3",
    title: "Recurring work, generated",
    body: "Define a GST or ITR cycle once as a template. Generate it per client, per period, and every step becomes a dated task with an owner.",
  },
  {
    icon: "M12 20h9M3 20h4l10-10a2.8 2.8 0 1 0-4-4L3 16v4Z",
    title: "Nothing waits on a reminder",
    body: "Tasks move to-do → in progress → waiting on client → CA review → done, with overdue derived from the due date rather than typed in.",
  },
  {
    icon: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM9 13h6M9 17h4",
    title: "Documents, asked for and versioned",
    body: "Request a balance sheet, the client uploads it in their portal, you accept or reject with a reason. Every version is kept and downloadable.",
  },
  {
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
    title: "Messages that stay with the work",
    body: "Client conversations attached to the task they belong to, instead of scattered across WhatsApp and three inboxes.",
  },
  {
    icon: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
    title: "An assistant that reads your records",
    body: "Ask “what needs me first today?” or “which documents am I still waiting for?” in plain English. It answers from your own data — never tax advice.",
  },
];

const STEPS = [
  { n: "1", t: "Add the client", b: "Details, services, assigned staff. A portal login is created for them." },
  { n: "2", t: "Generate the cycle", b: "Pick a template and a period. Every step becomes a task with a due date." },
  { n: "3", t: "Work and review", b: "Staff progress their tasks; the CA reviews before anything is marked done." },
  { n: "4", t: "Everything on record", b: "Each change is written to an activity log that cannot be edited afterwards." },
];

export default async function Landing() {
  // Someone already signed in has no use for the pitch.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const sampleMix = [
    { key: "p", label: "In progress", value: 12, colour: "--lime-500" },
    { key: "w", label: "Waiting for client", value: 7, colour: "--violet-400" },
    { key: "r", label: "Under review", value: 4, colour: "--violet-700" },
    { key: "t", label: "To do", value: 6, colour: "--ink-3" },
  ];
  const sampleServices = [
    { key: "gst", label: "GST Return", value: 14, colour: "--lime-500" },
    { key: "itr", label: "Income Tax", value: 9, colour: "--lime-500" },
    { key: "tds", label: "TDS Return", value: 6, colour: "--lime-500" },
    { key: "aud", label: "Audit", value: 3, colour: "--lime-500" },
  ];

  return (
    <div className="lp">
      <div className="lp-progress" aria-hidden="true" />

      <header className="lp-nav">
        <div className="lp-wrap">
          <Link href="/" className="lp-logo"><Logo size={30} /></Link>
          <nav>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#roles">For your clients</a>
            <a href="#trust">Security</a>
          </nav>
          <Link className="btn primary" href="/login">Sign in</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-txt">
            <p className="lp-eyebrow">Less chasing. More filing.</p>
            <h1>Run your whole CA practice on one screen.</h1>
            <p className="lp-lede">
              SAKSHA creates every GST, ITR and TDS cycle, collects documents from clients in their own portal, and
              keeps every change on record.
            </p>
            <div className="lp-cta">
              <Link className="btn primary lg" href="/login">Sign in to your firm</Link>
              <a className="btn lg" href="#features">See what&apos;s inside</a>
            </div>
            <p className="lp-note">
              Built for small and mid-size Indian practices · GST, ITR, TDS, audit and bookkeeping cycles
            </p>
            <div className="lp-cue" aria-hidden="true"><i />Scroll to see how a cycle runs</div>
          </div>

          {/* A real slice of the product, drawn with the app's own components. */}
          <div className="lp-shot" aria-hidden="true">
            <div className="lp-shot-h"><span /><span /><span /><b>Dashboard</b></div>
            <div className="lp-shot-b">
              <div className="lp-tiles">
                <div><b>9</b><span>Active tasks</span></div>
                <div className="hot"><b>5</b><span>Overdue</span></div>
                <div><b>2</b><span>Waiting</span></div>
                <div><b>1</b><span>To review</span></div>
              </div>
              <div className="lp-shot-row">
                <div className="lp-mini">
                  <p className="lp-mini-h">Open work by service</p>
                  <BarRows rows={sampleServices} hint="Sample: open tasks by service" />
                </div>
                <div className="lp-mini">
                  <p className="lp-mini-h">Task mix</p>
                  <Donut slices={sampleMix} total={29} hint="Sample: open tasks by status" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-band">
        <div className="lp-wrap lp-band-in">
          <div><b>One register</b><span>Clients, services, staff</span></div>
          <div><b>Generated cycles</b><span>GST · ITR · TDS · Audit</span></div>
          <div><b>Client portal</b><span>Uploads and messages</span></div>
          <div><b>Full audit trail</b><span>Every change recorded</span></div>
        </div>
      </section>


      {/* Anywhere access — illustration on the left, claims on the right. */}
      <section className="lp-sec lp-split-sec">
        <div className="lp-wrap lp-split">
          <div className="lp-illus has-photo">
            <Image
              src="/ca-call.jpg"
              alt="A chartered accountant working at her desk"
              fill
              sizes="(max-width: 980px) 100vw, 50vw"
              className="lp-illus-img"
              priority
            />
            <div className="lp-illus-veil" aria-hidden="true" />
            <div className="lp-illus-glow" aria-hidden="true" />
            <div className="lp-chip-stack" aria-hidden="true">
              <span className="lp-fchip d1">Any device</span>
              <span className="lp-fchip d2">Live status</span>
              <span className="lp-fchip d3">Your whole team</span>
              <span className="lp-fchip d4">Always in order</span>
            </div>
            <div className="lp-laptop" aria-hidden="true">
              <div className="lp-laptop-bar"><i /><i /><i /></div>
              <div className="lp-laptop-body">
                <div className="lp-lrow"><span className="dot lime" />GST · September<b>Filed</b></div>
                <div className="lp-lrow"><span className="dot violet" />TDS · Q2<b>In review</b></div>
                <div className="lp-lrow"><span className="dot grey" />Audit · FY26<b>To do</b></div>
                <div className="lp-lbars"><i style={{ height: "42%" }} /><i style={{ height: "68%" }} /><i style={{ height: "54%" }} /><i style={{ height: "88%" }} /><i style={{ height: "61%" }} /></div>
              </div>
            </div>
            <span className="lp-tag-float" aria-hidden="true">CA office</span>
          </div>

          <div>
            <p className="lp-eyebrow">Work without walls</p>
            <h2 className="lp-h2 left">Your practice, wherever you open it.</h2>
            <ul className="lp-ticks">
              <li><b>Nothing to install</b>Open it in a browser, on a laptop or a phone, at the office or at a client&apos;s.</li>
              <li><b>Always current</b>Every staff member sees the same status the moment it changes.</li>
              <li><b>Built around the calendar</b>Due dates, periods and financial years, not generic to-do lists.</li>
              <li><b>Nothing lost in chat</b>Documents and questions live against the work they belong to.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Showcase: four cards, each with a small mock of the real screen. */}
      <section className="lp-sec alt">
        <div className="lp-wrap">
          <h2 className="lp-h2">Manage every client from one place</h2>
          <p className="lp-sub">The four screens a practice lives in.</p>

          <div className="lp-show">
            <article className="lp-show-card">
              <div className="lp-mock m1">
                <div className="mk-row"><span className="mk-av">SI</span><span><b>S. N. Iyer</b><i>Individual · 12 services</i></span></div>
                <div className="mk-line"><span>PAN</span><b>ABCPI••••K</b></div>
                <div className="mk-line"><span>GSTIN</span><b>27ABCPI••••1Z5</b></div>
                <div className="mk-line"><span>Staff</span><b>Priya Nair</b></div>
                <span className="mk-pill">Audit client</span>
              </div>
              <h3>Client master</h3>
              <p>Every client with their services, tags, assigned staff and full history of work done for them.</p>
            </article>

            <article className="lp-show-card">
              <div className="lp-mock m2">
                <div className="mk-head">Balance sheet FY 2025-26</div>
                <div className="mk-ver"><span className="v-dot bad" /><span>v1 · rejected</span><i>Scan unreadable</i></div>
                <div className="mk-ver"><span className="v-dot ok" /><span>v2 · accepted</span><i>2.4 MB · PDF</i></div>
                <div className="mk-drop">Drop a file, or browse</div>
              </div>
              <h3>Document requests</h3>
              <p>Ask once, the client uploads in their portal, you accept or reject with a reason. Every version kept.</p>
            </article>

            <article className="lp-show-card">
              <div className="lp-mock m3">
                <div className="mk-head">September</div>
                <div className="mk-cal">
                  {Array.from({ length: 21 }).map((_, i) => (
                    <span key={i} className={i === 9 ? "due" : i === 13 ? "late" : i === 17 ? "done" : ""} />
                  ))}
                </div>
                <div className="mk-legend"><span><i className="lime" />Done</span><span><i className="violet" />Due</span><span><i className="red" />Late</span></div>
              </div>
              <h3>The compliance calendar</h3>
              <p>GSTR-1, GSTR-3B, TDS and ITR cycles generated per client, per period, with dates that move with the season.</p>
            </article>

            <article className="lp-show-card">
              <div className="lp-mock m4">
                <div className="mk-ask">What needs me first today?</div>
                <div className="mk-answer">
                  <span className="mk-orb" />
                  <p>5 tasks are overdue. ABC Traders&apos; GST return is waiting on your review.</p>
                </div>
                <div className="mk-bar">Ask anything…<i /></div>
              </div>
              <h3>The assistant</h3>
              <p>Plain-English questions answered from your own records — never tax advice, never a guess.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Every service, one cycle — an orbit of the compliance work. */}
      <section className="lp-sec lp-orbit-sec">
        <div className="lp-wrap lp-orbit-in">
          <div>
            <p className="lp-eyebrow">One engine, every service</p>
            <h2 className="lp-h2 left">Define the cycle once. Run it for every client.</h2>
            <p className="lp-sub left">
              A template holds the steps, who does them and how many days each one gets. Generate it for a client and
              a period, and the whole month appears as dated, owned work.
            </p>
            <Link className="btn primary lg" href="/login">See it in the app</Link>
          </div>

          <div className="lp-orbit" aria-hidden="true">
            <div className="lp-orbit-ring r1" />
            <div className="lp-orbit-ring r2" />
            <div className="lp-orbit-core">SAKSHA</div>
            <div className="lp-orbit-spin">
              <span className="o n1">GSTR-1</span>
              <span className="o n2">GSTR-3B</span>
              <span className="o n3">TDS</span>
              <span className="o n4">ITR</span>
              <span className="o n5">Audit</span>
              <span className="o n6">ROC</span>
            </div>
          </div>
        </div>
      </section>

      {/* A quiet marquee of what the firm actually files. */}
      <section className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee-in">
          {Array.from({ length: 2 }).map((_, k) => (
            <div className="lp-marquee-row" key={k}>
              {["GSTR-1", "GSTR-3B", "GSTR-9", "TDS 26Q", "TDS 24Q", "ITR-3", "ITR-6", "Tax audit", "ROC AOC-4", "MGT-7", "Bookkeeping", "Payroll"].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <h2 className="lp-h2">What the firm gets</h2>
          <p className="lp-sub">Six things a practice actually spends its week on.</p>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <article className="lp-card" key={f.title}>
                <span className="lp-ico"><Icon d={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="how">
        <div className="lp-wrap">
          <h2 className="lp-h2">How a cycle runs</h2>
          <p className="lp-sub">The same four steps, whether it is one GST return or forty.</p>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="lp-step-n">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-sec" id="roles">
        <div className="lp-wrap">
          <h2 className="lp-h2">Three people, three views</h2>
          <p className="lp-sub">Everyone sees their own work, and nothing that isn&apos;t theirs.</p>
          <div className="lp-roles">
            <article className="lp-role-card">
              <div className="lp-role-img">
                <Image src="/ca-portrait.jpg" alt="A chartered accountant reviewing work" fill sizes="(max-width: 980px) 100vw, 33vw" />
                <span className="lp-role-tag">Admin</span>
              </div>
              <p className="lp-role">The CA</p>
              <p>The whole firm: what is overdue, what is waiting on a review, how work is spread across staff, and what clients still owe.</p>
            </article>

            <article className="lp-role-card">
              <div className="lp-role-img">
                <Image src="/ca-desk.jpg" alt="A staff accountant at work" fill sizes="(max-width: 980px) 100vw, 33vw" />
                <span className="lp-role-tag">Staff</span>
              </div>
              <p className="lp-role">The staff member</p>
              <p>Their own queue, grouped into today, this week and later — and the clients they are assigned to. No one else&apos;s workload.</p>
            </article>

            <article className="lp-role-card">
              <div className="lp-role-img">
                <Image src="/ca-team.jpg" alt="A firm reviewing figures together" fill sizes="(max-width: 980px) 100vw, 33vw" />
                <span className="lp-role-tag">Client</span>
              </div>
              <p className="lp-role">The client</p>
              <p>What the firm needs from them, an upload button that works on a phone, the stage their return is at, and a way to ask a question.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="trust">
        <div className="lp-wrap lp-trust">
          <div>
            <h2 className="lp-h2">Built so one firm can never see another</h2>
            <p className="lp-sub left">
              Access is enforced in the database itself, not only in the screens. Every write goes through a checked
              function that records who did it.
            </p>
          </div>
          <ul className="lp-checks">
            <li>Row-level security on every table</li>
            <li>Role-based access: CA, staff, client</li>
            <li>Private file storage with expiring links</li>
            <li>An activity log that cannot be edited</li>
            <li>Client data never used for tax advice</li>
          </ul>
        </div>
      </section>

      <section className="lp-end">
        <div className="lp-wrap">
          <h2>Less chasing. More filing.</h2>
          <Link className="btn primary lg" href="/login">Sign in</Link>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span className="lp-logo sm"><Logo size={26} tone="light" /></span>
          <span className="small">Practice management for chartered accountancy firms</span>
        </div>
      </footer>
    </div>
  );
}
