const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType
} = require('docx');

// Strict Black & Grey Theme (NO GREEN AT ALL)
const FONT_FAMILY = "Calibri";
const COLOR_BLACK = "111827";        // Primary dark text / title
const COLOR_MUTED = "4B5563";        // Secondary description / subtitle
const COLOR_HEADER_BG = "1F2937";    // Deep charcoal for table headers (#1F2937)
const COLOR_BORDER = "9CA3AF";       // Clean neutral grey border (#9CA3AF)
const COLOR_ROW_ALT = "F3F4F6";      // Light grey zebra row (#F3F4F6)
const COLOR_BOX_BG = "F9FAFB";       // Soft off-white / light grey for diagram cards
const COLOR_DIAGRAM_HEAD = "374151"; // Medium dark grey for diagram node headers

const borderThin = {
  style: BorderStyle.SINGLE,
  size: 4, // 0.5 pt
  color: COLOR_BORDER
};

const cellBorders = {
  top: borderThin,
  bottom: borderThin,
  left: borderThin,
  right: borderThin
};

// Section Heading with clean black/grey bottom border
function createHeading(title) {
  return [
    new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 8,
          color: "374151",
          space: 4
        }
      },
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          font: FONT_FAMILY,
          size: 26, // 13pt
          color: COLOR_BLACK
        })
      ]
    })
  ];
}

function createSubHeading(title) {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    children: [
      new TextRun({
        text: title,
        bold: true,
        font: FONT_FAMILY,
        size: 22, // 11pt
        color: COLOR_BLACK
      })
    ]
  });
}

function createParagraph(text) {
  return new Paragraph({
    spacing: { after: 90, line: 250 },
    children: [
      new TextRun({
        text: text,
        font: FONT_FAMILY,
        size: 20, // 10pt
        color: COLOR_BLACK
      })
    ]
  });
}

function createBullet(text, boldPrefix = "") {
  const children = [];
  if (boldPrefix) {
    children.push(
      new TextRun({
        text: boldPrefix,
        bold: true,
        font: FONT_FAMILY,
        size: 20,
        color: COLOR_BLACK
      })
    );
  }
  children.push(
    new TextRun({
      text: text,
      font: FONT_FAMILY,
      size: 20,
      color: COLOR_BLACK
    })
  );

  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 45, line: 240 },
    children: children
  });
}

function makeCell(text, isHeader = false, isAlt = false, widthPercent = undefined) {
  return new TableCell({
    width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: {
      type: ShadingType.CLEAR,
      fill: isHeader ? COLOR_HEADER_BG : (isAlt ? COLOR_ROW_ALT : "FFFFFF"),
      color: "auto"
    },
    borders: cellBorders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0, line: 220 },
        children: [
          new TextRun({
            text: text,
            bold: isHeader,
            font: FONT_FAMILY,
            size: isHeader ? 20 : 19,
            color: isHeader ? "FFFFFF" : COLOR_BLACK
          })
        ]
      })
    ]
  });
}

function createTable(headers, rows, widths = []) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => makeCell(h, true, false, widths[i]))
  });

  const tableRows = rows.map((r, rowIndex) => {
    const isAlt = rowIndex % 2 === 1;
    return new TableRow({
      children: r.map((c, colIndex) => makeCell(c, false, isAlt, widths[colIndex]))
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...tableRows],
    spacing: { before: 80, after: 140 }
  });
}

// Visual In-built Grey-Themed Chart Box (Diagram Card)
function createProcessChart(steps) {
  const cells = steps.map((s, idx) => {
    return new TableCell({
      width: { size: Math.floor(100 / steps.length), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: COLOR_BOX_BG, color: "auto" },
      borders: cellBorders,
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: `STEP ${idx + 1}`,
              bold: true,
              size: 17,
              font: FONT_FAMILY,
              color: COLOR_DIAGRAM_HEAD
            })
          ],
          spacing: { after: 40 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: s.title,
              bold: true,
              size: 20,
              font: FONT_FAMILY,
              color: COLOR_BLACK
            })
          ],
          spacing: { after: 40 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: s.desc,
              size: 17,
              font: FONT_FAMILY,
              color: COLOR_MUTED
            })
          ],
          spacing: { after: 0 }
        })
      ]
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: cells })],
    spacing: { before: 80, after: 120 }
  });
}

// Role Hierarchy Diagram in Professional Grey Theme
function createRoleChart() {
  const roles = [
    {
      title: "CHARTERED ACCOUNTANT",
      sub: "Firm Principal (Admin)",
      items: ["• Sees all firm work & staff", "• Reviews and approves returns", "• Full client master control", "• Uses AI assistant"]
    },
    {
      title: "OFFICE STAFF",
      sub: "Preparer & Staff",
      items: ["• Sees only assigned clients", "• Prepares tasks & uploads", "• Submits work for review", "• Cannot self-approve"]
    },
    {
      title: "CLIENT PORTAL",
      sub: "Business Client",
      items: ["• Sees only own business", "• Uploads requested papers", "• Tracks filing progress", "• 1-on-1 messaging"]
    }
  ];

  const cells = roles.map(r => {
    return new TableCell({
      width: { size: 33, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: COLOR_BOX_BG, color: "auto" },
      borders: cellBorders,
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: r.title,
              bold: true,
              size: 19,
              font: FONT_FAMILY,
              color: COLOR_BLACK
            })
          ],
          spacing: { after: 20 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: r.sub,
              italics: true,
              size: 17,
              font: FONT_FAMILY,
              color: COLOR_MUTED
            })
          ],
          spacing: { after: 80 }
        }),
        ...r.items.map(it => new Paragraph({
          children: [
            new TextRun({
              text: it,
              size: 18,
              font: FONT_FAMILY,
              color: COLOR_BLACK
            })
          ],
          spacing: { after: 30 }
        }))
      ]
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: cells })],
    spacing: { before: 80, after: 120 }
  });
}

// System Architecture Diagram
function createArchChart() {
  const parts = [
    { title: "USER BROWSER", sub: "React 19 / Next.js", desc: "Clean screens, zero delay, runs on phone or laptop." },
    { title: "APPLICATION ENGINE", sub: "Next.js Server Actions", desc: "Checks user login, runs validation, executes rules." },
    { title: "DATABASE KERNEL", sub: "PostgreSQL & RLS", desc: "Enforces data boundaries; stores tasks and audit logs." },
    { title: "PRIVATE VAULT", sub: "Supabase Storage", desc: "Confidential client PDFs and bills kept private." }
  ];

  const cells = parts.map(p => {
    return new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: COLOR_BOX_BG, color: "auto" },
      borders: cellBorders,
      margins: { top: 90, bottom: 90, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: p.title,
              bold: true,
              size: 18,
              font: FONT_FAMILY,
              color: COLOR_BLACK
            })
          ],
          spacing: { after: 30 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: p.sub,
              italics: true,
              size: 16,
              font: FONT_FAMILY,
              color: COLOR_MUTED
            })
          ],
          spacing: { after: 40 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: p.desc,
              size: 16,
              font: FONT_FAMILY,
              color: COLOR_BLACK
            })
          ],
          spacing: { after: 0 }
        })
      ]
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: cells })],
    spacing: { before: 80, after: 120 }
  });
}

async function buildDoc() {
  const doc = new Document({
    sections: [
      // PAGE 1: TITLE PAGE
      {
        properties: {
          page: {
            margin: { top: 1800, right: 1440, bottom: 1800, left: 1440 }
          }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 1400, after: 100 },
            children: [
              new TextRun({
                text: "INTERNSHIP PROJECT DOCUMENTATION",
                bold: true,
                font: FONT_FAMILY,
                size: 24,
                color: "1F2937",
                characterSpacing: 40
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: "9CA3AF",
                space: 10
              }
            },
            spacing: { after: 600 }
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 80 },
            children: [
              new TextRun({
                text: "SAKSHA",
                bold: true,
                font: FONT_FAMILY,
                size: 52,
                color: COLOR_BLACK
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: "A Practice Management System for Chartered Accountancy Firms",
                bold: true,
                font: FONT_FAMILY,
                size: 24,
                color: COLOR_MUTED
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 2600 },
            children: [
              new TextRun({
                text: "Less chasing. More filing.",
                italics: true,
                font: FONT_FAMILY,
                size: 22,
                color: "6B7280"
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 600, after: 50 },
            children: [
              new TextRun({
                text: "Submitted as part of Internship Project",
                font: FONT_FAMILY,
                size: 20,
                color: COLOR_BLACK
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Project Documentation",
                font: FONT_FAMILY,
                size: 20,
                color: COLOR_MUTED
              })
            ]
          })
        ]
      },

      // PAGES 2+: REPORT CONTENT
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children: [
          // 1. Problem We Are Solving
          ...createHeading("1. Problem We Are Solving"),
          createParagraph(
            "A chartered accountancy (CA) firm does repeating work for many businesses. Every month there is GST sales tax. Every quarter there is TDS. Every year there are income tax returns and audits. Each job needs papers from the client, work by a staff member, and review by the CA."
          ),
          createParagraph("Most firms run on spreadsheets, WhatsApp, and memory. This causes serious daily problems:"),
          createBullet("Recurring deadlines are remade by hand, so missed filings are noticed only after the penalty date."),
          createBullet("Documents get buried in WhatsApp chats and emails, making it hard to find the final version."),
          createBullet("No one can answer 'what is pending for this client?' without asking multiple people in the office."),
          createBullet("Staff hand over returns verbally, with zero recorded proof that the CA reviewed the work."),
          createBullet("Clients forget what papers were asked of them, so staff spend hours sending manual reminders."),
          createBullet("When a staff member leaves, the real state of client work exists only in their head."),
          createParagraph(
            "The result is constant time lost to chasing, late submissions, and growing penalty risk."
          ),

          // 2. The Traditional Way
          ...createHeading("2. The Traditional Way"),
          createParagraph("Firms manage their work using five disconnected tools:"),
          createBullet("One shared Excel workbook or multiple desktop spreadsheets."),
          createBullet("WhatsApp groups for texting clients and receiving photo scans of bills."),
          createBullet("Email folders with messy names like 'final', 'final2', and 'final_revised'."),
          createBullet("Paper diary notes to remember government filing cutoffs."),
          createBullet("Walking across the office to ask if work is finished."),

          createSubHeading("Chart 1: The Traditional Fragmented Flow vs. SAKSHA"),
          createProcessChart([
            { title: "WhatsApp / Email", desc: "Scattered papers & lost messages." },
            { title: "Manual Spreadsheets", desc: "Typed by hand, easily outdated." },
            { title: "Staff Desktops", desc: "Files stuck on individual PCs." },
            { title: "SAKSHA Unified App", desc: "One place. Everything connected." }
          ]),

          createSubHeading("Table 1: Limitations of Traditional Tools vs. SAKSHA"),
          createTable(
            ["Tool Area", "Traditional Tool Limit", "SAKSHA System Solution"],
            [
              ["Work Tracking", "Spreadsheets drift; copies get out of sync.", "Single live register with real-time status."],
              ["Data Access", "No boundaries; staff see all or nothing.", "Role permissions enforced at the database level."],
              ["Audit Trail", "No history; edited cells leave no trace.", "Permanent append-only activity log."],
              ["File Versions", "Lost in chat threads when phones change.", "Clear versions with formal accept/reject states."],
              ["Partner Review", "Verbal approval; easily skipped.", "System blocks completion without CA approval."]
            ],
            [22, 39, 39]
          ),

          // 3. What Uniqueness We Are Adding
          ...createHeading("3. What Uniqueness We Are Adding"),
          createParagraph(
            "SAKSHA combines the rules of an accounting office into a single secure system:"
          ),
          createBullet("Work is Generated, Not Typed — A compliance cycle is written down once as a template. Generating it for a client automatically creates dated tasks, assigns staff, and asks the client for papers."),
          createBullet("Database-Enforced Security — Access rules live directly on database tables, so a staff member can only see their assigned clients on every screen."),
          createBullet("Review is a Hard Rule — If a task requires review, the staff member cannot complete it. Only the qualified CA can approve or return it."),
          createBullet("Document Versioning with Reasons — Client uploads are kept as versions. If rejected, the CA must enter a written reason, and accepted files cannot be deleted."),
          createBullet("Permanent Audit Log — Every status change or edit is written to an unchangeable activity log in the same instant."),
          createBullet("Client Self-Service Portal — Clients sign in, see requested papers, upload files, and chat in one place."),
          createBullet("Safe AI Assistant — Answers questions about deadlines and workload from firm records without reading private tax papers."),

          createSubHeading("Chart 2: How Work Flows from Start to Finish"),
          createProcessChart([
            { title: "1. Client Setup", desc: "CA adds client with PAN & GSTIN." },
            { title: "2. Auto-Generate", desc: "Template creates dated tasks." },
            { title: "3. Upload Papers", desc: "Client uploads in portal." },
            { title: "4. Staff Prepare", desc: "Staff completes & sends to review." },
            { title: "5. CA Approval", desc: "CA checks and approves work." }
          ]),

          // 4. Features & Services
          ...createHeading("4. Features & Services"),
          createParagraph("What each person can see and do is controlled strictly by their role:"),

          createSubHeading("Chart 3: User Role Permission Hierarchy"),
          createRoleChart(),

          createSubHeading("4.1 Chartered Accountant (Admin)"),
          createBullet("Add, edit, and deactivate clients with PAN and GSTIN validation."),
          createBullet("Create staff logins and assign staff to specific clients."),
          createBullet("Create tasks, reassign them, and approve or return work submitted for review."),
          createBullet("Build compliance templates and generate full cycles for any period."),
          createBullet("Request client documents, and accept or reject each uploaded version with reasons."),
          createBullet("View the firm-level dashboard: open work, overdue items, and pending reviews."),
          createBullet("Use the AI assistant for quick summaries and client reminder drafts."),

          createSubHeading("4.2 Staff"),
          createBullet("See only the clients they have been assigned to."),
          createBullet("Work on assigned tasks and submit completed work for CA review."),
          createBullet("Request papers from clients and inspect uploaded files."),
          createBullet("View their personal dashboard: tasks due today, this week, and late items."),

          createSubHeading("4.3 Client"),
          createBullet("Sign in to a portal showing only their own business."),
          createBullet("See requested documents, upload files, and view reasons if returned."),
          createBullet("Track live filing progress for all services."),
          createBullet("Send direct messages to the firm instead of scattered WhatsApp chats."),

          createSubHeading("Eight Seeded Compliance Services"),
          createBullet("1. GST — Monthly sales tax returns (GSTR-1, GSTR-3B) and annual filings."),
          createBullet("2. Income Tax — Yearly ITR filing and advance tax calculations."),
          createBullet("3. TDS — Quarterly tax withholding returns (24Q, 26Q)."),
          createBullet("4. Bookkeeping — Daily accounting and ledger balancing."),
          createBullet("5. Statutory Audit — Formal yearly check of company financial accounts."),
          createBullet("6. Payroll — Monthly staff salary computation and statutory deductions."),
          createBullet("7. MCA / ROC — Company registration filings (AOC-4, MGT-7) and KYC."),
          createBullet("8. Other Work — Custom financial advisory and valuation engagements."),

          // 5. AI Implementation
          ...createHeading("5. AI Implementation"),
          createParagraph(
            "The AI assistant is built as a practical, safe tool using a hosted language model. It has two simple jobs: understand what action the CA wants, and write the final summary."
          ),
          createBullet("How a Turn Works: The system creates a text summary of active deadlines and workloads. The model decides which action to take. The app checks all client names against real records, runs the query, and saves the answer with the data it used."),

          createSubHeading("Table 2: AI Boundaries and Safeguards"),
          createTable(
            ["Concern", "How SAKSHA Handles It"],
            [
              ["Data sent to provider", "Only a short text summary of workflow status. No document files, PAN, or GSTIN."],
              ["Invented client names", "Every name is matched against real firm lists; unknown names are dropped."],
              ["Database access", "The AI never writes database queries. The application runs all searches securely."],
              ["No tax advice", "The AI is strictly instructed never to give legal, accounting, or tax advice."],
              ["Safe fallback", "If the AI service is offline, normal keyword search runs automatically."]
            ],
            [35, 65]
          ),

          // 6. Technology Stack
          ...createHeading("6. Technology Stack"),
          createParagraph("Every technology was chosen for a clear, practical reason:"),

          createSubHeading("Chart 4: System Architecture Overview"),
          createArchChart(),

          createSubHeading("Table 3: Technology Choices & Technical Reasons"),
          createTable(
            ["Layer", "Technology", "Why This Was Chosen"],
            [
              ["Framework", "Next.js 15 (App Router)", "Server components query the database directly, removing the need for a separate API layer."],
              ["UI Library", "React 19", "Lightweight reusable components with built-in form state handling."],
              ["Language", "TypeScript", "Strict typing prevents bugs with roles, task statuses, and tax IDs before code runs."],
              ["Database", "PostgreSQL", "Strong relational integrity and native Row Level Security (RLS) for data isolation."],
              ["Platform", "Supabase", "Combines hosted PostgreSQL, authentication, and file storage under one permission model."],
              ["Access Control", "Row Level Security (RLS)", "Security rules stay on the database tables, filtering every query automatically."],
              ["Business Logic", "PL/pgSQL Functions", "Review rules and audit entries run inside the database transaction itself."],
              ["File Storage", "Supabase Storage", "Private file buckets that share the same access rules as the database tables."],
              ["Validation", "Zod", "Checks form inputs at runtime and produces clean error messages."],
              ["AI Engine", "Hosted GPT API", "Fast summaries and client reminder drafts without reading private tax papers."],
              ["Styling", "Custom CSS", "Design tokens control the entire black and grey theme with zero framework bloat."],
              ["Charts", "Inline SVG", "Lightweight visual charts drawn directly with zero extra download size."]
            ],
            [18, 30, 52]
          ),

          createSubHeading("Table 4: Technologies Considered and Rejected"),
          createTable(
            ["Not Used", "Reason for Rejection"],
            [
              ["An ORM (Prisma)", "Business rules live in database functions; an ORM adds unnecessary overhead."],
              ["CSS Frameworks (Tailwind)", "Custom design tokens give full control over styling without extra dependencies."],
              ["Heavy Component Libraries", "Prebuilt UI libraries add huge download size for components that take only a few lines."],
              ["Third-Party Chart Libraries", "Simple SVG paths render instantly without 100+ KB of charting JavaScript."]
            ],
            [30, 70]
          ),

          // 7. Phase-wise Development
          ...createHeading("7. Phase-wise Development"),
          createParagraph("The system was built across seven organized phases:"),

          createSubHeading("Table 5: Development Phases and Deliverables"),
          createTable(
            ["Phase", "Focus", "What Was Delivered"],
            [
              ["Phase 1", "Foundation", "Database schema, roles, login, forced password change, client list, and activity log."],
              ["Phase 2", "Workflows", "Reusable compliance templates and one-click cycle generation for clients."],
              ["Phase 3", "Documents", "Document requests, versioned file uploads, and accept/reject review flows."],
              ["Phase 4", "Messaging", "Centralized client conversation threads with permanent message records."],
              ["Phase 5", "Notifications", "Database-generated alerts for task assignments and document approvals."],
              ["Phase 6", "AI Assistant", "Deadline search, daily summaries, and reminder drafting with safe fallbacks."],
              ["Phase 7", "Hardening", "Role-specific dashboards, black and grey visual theme, and production checks."]
            ],
            [14, 24, 62]
          ),

          createSubHeading("Table 6: Current Project Status"),
          createTable(
            ["Area", "Status", "Details"],
            [
              ["Database & Permissions", "Complete", "Full relational schema, RLS policies, and activity triggers."],
              ["Authentication & Roles", "Complete", "Three distinct roles with secure session cookie handling."],
              ["Clients, Staff & Tasks", "Complete", "Full task lifecycle with partner review enforcement."],
              ["Workflows & Documents", "Complete", "Template generation, private file storage, and versioning."],
              ["Messaging & AI", "Complete", "In-app chat and guardrailed GPT assistant."],
              ["Cloud Deployment", "Remaining", "Production hosting and custom domain setup."]
            ],
            [30, 20, 50]
          ),

          // 8. Expected Outcome
          ...createHeading("8. Expected Outcome"),
          createParagraph(
            "SAKSHA replaces scattered WhatsApp messages, lost emails, and confusing Excel sheets with one clean, secure system."
          ),

          createSubHeading("Table 7: Intended Outcomes and Mechanisms"),
          createTable(
            ["Outcome", "How SAKSHA Achieves It"],
            [
              ["Fewer missed deadlines", "Every compliance step becomes a dated task automatically; overdue work is calculated live."],
              ["Less time spent chasing", "Clients see requested documents directly in their portal and receive alerts."],
              ["Verifiable CA review", "Staff cannot complete tasks without CA partner review approval."],
              ["Clear document history", "Every uploaded version is preserved with timestamps and decision reasons."],
              ["Complete accountability", "All actions are recorded permanently in an append-only audit ledger."],
              ["Confidentiality", "Database RLS guarantees clients and staff see only what belongs to them."]
            ],
            [32, 68]
          )
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, '..', 'SAKSHA_Project_Report_BlackGrey.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log('BLACK_GREY_DOCX_GENERATED_AT: ' + outputPath);
}

buildDoc().catch(err => {
  console.error('ERROR_BUILDING_DOCX:', err);
  process.exit(1);
});
