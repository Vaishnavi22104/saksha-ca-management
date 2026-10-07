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

// Clean, simple modern font & black/grey theme
const FONT_FAMILY = "Calibri";
const COLOR_BLACK = "111827";      // Soft black
const COLOR_MUTED = "4B5563";      // Muted grey
const COLOR_HEADER_BG = "27272A";  // Dark charcoal table header
const COLOR_BORDER = "D1D5DB";     // Clean light grey border
const COLOR_ROW_ALT = "F3F4F6";    // Soft grey alternate row

const borderThin = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: COLOR_BORDER
};

const cellBorders = {
  top: borderThin,
  bottom: borderThin,
  left: borderThin,
  right: borderThin
};

// Section Heading with bottom divider line
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
    spacing: { before: 160, after: 60 },
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
    spacing: { after: 100, line: 260 },
    children: [
      new TextRun({
        text: text,
        font: FONT_FAMILY,
        size: 21, // 10.5pt
        color: COLOR_BLACK
      })
    ]
  });
}

function createBullet(title, desc = "") {
  const children = [];
  if (title) {
    children.push(
      new TextRun({
        text: desc ? title + ": " : title,
        bold: !!desc,
        font: FONT_FAMILY,
        size: 21,
        color: COLOR_BLACK
      })
    );
  }
  if (desc) {
    children.push(
      new TextRun({
        text: desc,
        font: FONT_FAMILY,
        size: 21,
        color: COLOR_BLACK
      })
    );
  }

  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 50, line: 250 },
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
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0, line: 230 },
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
    spacing: { before: 100, after: 160 }
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
                text: "PROJECT DOCUMENTATION",
                bold: true,
                font: FONT_FAMILY,
                size: 24,
                color: "374151",
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
            spacing: { before: 400, after: 100 },
            children: [
              new TextRun({
                text: "SAKSHA — CA Management System",
                bold: true,
                font: FONT_FAMILY,
                size: 48,
                color: COLOR_BLACK
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 2600 },
            children: [
              new TextRun({
                text: "A Smart To-Do and Filing System for Accounting Offices",
                italics: true,
                font: FONT_FAMILY,
                size: 22,
                color: COLOR_MUTED
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 600, after: 50 },
            children: [
              new TextRun({
                text: "Simple Project Report",
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
            "A Chartered Accountant (CA) helps businesses pay their taxes. One small CA office takes care of around 100 businesses. Each business has work due every single month, like GST sales tax, salary tax, and yearly tax returns. This adds up to over 1,000 tasks every year."
          ),
          createParagraph("The main problems the office faces every day:"),
          createBullet("Clients forget to send their papers on time."),
          createBullet("Staff members forget who is doing what."),
          createBullet("Work gets delayed, and the government fines the client money."),
          createBullet("The boss has to keep calling people to ask: 'Is this work done yet?'"),
          createParagraph(
            "SAKSHA solves this by giving the office one simple screen that shows who is doing what, which document is missing, and what is due today."
          ),

          // 2. Traditional Way
          ...createHeading("2. Traditional Way"),
          createParagraph("Before SAKSHA, CA offices used five separate things that were not connected to each other:"),
          createBullet("WhatsApp", "Used to ask clients for papers. Files get lost in chat."),
          createBullet("Email", "Used to receive bills. Nobody knows who downloaded them."),
          createBullet("Excel Sheets", "A list of tasks typed by hand. Usually out of date."),
          createBullet("Computer Folders", "Files saved on different PCs. If staff is absent, files are lost."),
          createBullet("Memory", "The boss has to remember everything in their head."),

          createSubHeading("Table 1: Traditional Way vs. SAKSHA"),
          createTable(
            ["Feature", "The Traditional Way", "SAKSHA"],
            [
              ["Messages", "Messy WhatsApp chats on personal phones.", "Messages attached directly to the task."],
              ["Documents", "Scattered photos and email files.", "One upload button for the client."],
              ["Task List", "Manual Excel sheet; easy to forget.", "Automatic list with live status."],
              ["Storage", "Lost in random computer folders.", "Safe, private online storage."],
              ["Reminders", "Boss calls clients repeatedly.", "System shows what is late automatically."]
            ],
            [22, 39, 39]
          ),

          // 3. What Uniqueness Are We Adding
          ...createHeading("3. What Uniqueness Are We Adding"),
          createParagraph("SAKSHA does special things that normal to-do apps cannot do:"),
          createBullet("Repeating Worklists", "You write the steps of a job once. SAKSHA creates the whole list for every client automatically every month."),
          createBullet("Safety Lock on Data", "Normal apps let users change things directly. SAKSHA blocks direct edits. Only safe system rules can update records."),
          createBullet("Complete Privacy", "A client can only see their own files. They can never see another client's tax data."),
          createBullet("Automatic Overdue Clock", "If the clock passes 5:00 PM on the due date, the task turns red instantly. No manual typing needed."),
          createBullet("One Team Voice", "When clients see messages or updates, it says 'Your CA Firm' instead of the employee's name. This keeps things professional."),
          createBullet("Safe AI Helper", "An AI helper that reads only dates and task names. It never reads private tax papers."),

          // 4. Features & Services
          ...createHeading("4. Features & Services"),
          createParagraph("The app shows a different screen depending on who logs in:"),
          createSubHeading("4.1 The CA Boss (Admin)"),
          createBullet("Sees the whole office on one screen."),
          createBullet("Adds clients, staff, and tasks."),
          createBullet("Reviews and approves finished work."),
          createBullet("Asks the AI assistant questions about deadlines."),

          createSubHeading("4.2 Staff Member"),
          createBullet("Sees only their own assigned tasks."),
          createBullet("Organizes work into: Due Today, This Week, and Late."),
          createBullet("Checks client files and sends work for partner review."),

          createSubHeading("4.3 The Client"),
          createBullet("Simple screen showing what documents the CA needs."),
          createBullet("One easy button to upload files."),
          createBullet("Sees which returns are finished and which are in progress."),

          createSubHeading("Table 2: Who Sees What"),
          createTable(
            ["Screen / Item", "The CA (Boss)", "Staff Member", "The Client"],
            [
              ["Dashboard", "Whole office view and charts.", "Only their own work list.", "Only their own files & progress."],
              ["Client List", "Can add and edit all clients.", "Only clients assigned to them.", "Cannot see other clients."],
              ["Task Actions", "Can create, approve, or cancel.", "Can do work; cannot cancel.", "Read-only view of progress."],
              ["Document Vault", "Full access to all files.", "Only files for their clients.", "Can upload requested papers."],
              ["AI Assistant", "Can ask questions anytime.", "No access.", "No access."]
            ],
            [22, 26, 26, 26]
          ),

          createSubHeading("Eight Built-in Services"),
          createBullet("1. GST", "Monthly sales tax filings (GSTR-1, GSTR-3B)."),
          createBullet("2. Income Tax", "Yearly income tax returns (ITR)."),
          createBullet("3. TDS", "Quarterly tax deducted from payments."),
          createBullet("4. Bookkeeping", "Daily accounting and bill entry."),
          createBullet("5. Audit", "Yearly formal check of accounts."),
          createBullet("6. Payroll", "Monthly staff salaries and company benefits."),
          createBullet("7. MCA", "Company registration and legal forms."),
          createBullet("8. Other Work", "Special business advisory work."),

          // 5. AI Implementation
          ...createHeading("5. AI Implementation"),
          createParagraph(
            "We use a single, reliable GPT model to help the boss organize the office in simple words:"
          ),
          createBullet("Finds Information", "The boss asks: 'Which GST returns are late?' and the AI lists them instantly."),
          createBullet("Drafts Reminders", "The AI writes a gentle reminder message to the client, which the boss reads and sends."),
          createBullet("No Tax Advice", "The AI never guesses tax laws or gives financial advice."),
          createBullet("Private Documents Stay Safe", "The AI only sees dates and task names. It never sees client bank statements or bills."),

          // 6. Tech Stack
          ...createHeading("6. Tech Stack"),
          createParagraph("Every technology was chosen for a simple and solid reason:"),
          createSubHeading("Table 3: Tech Stack & Why It Was Chosen"),
          createTable(
            ["Part", "Technology Used", "Why It Was Chosen"],
            [
              ["Website App", "Next.js 15 & React 19", "Builds both the screens and the backend in one clean system with fast loading."],
              ["Language", "TypeScript", "Prevents coding mistakes by checking tax rules, numbers, and dates strictly."],
              ["Database", "PostgreSQL (Supabase)", "Stores records safely and enforces privacy so clients cannot see each other's data."],
              ["File Vault", "Supabase Storage", "A private online box for client files with strict permission rules."],
              ["Validation", "Zod", "Checks that phone numbers, emails, and tax IDs are typed correctly."],
              ["Design & CSS", "Pure Custom CSS", "No heavy libraries. Opens super fast and has dark mode built in."],
              ["Charts", "Custom SVG Charts", "Draws donut and bar charts with zero extra download size."],
              ["AI Engine", "Single GPT Model", "Fast, smart, and safe helper for deadline summaries and quick client reminder drafts."]
            ],
            [20, 30, 50]
          ),

          // 7. Phase-wise Development
          ...createHeading("7. Phase-wise Development"),
          createParagraph("The project was built step by step across four phases:"),
          createSubHeading("Table 4: Phased Development Plan"),
          createTable(
            ["Phase", "Name", "What Was Built", "Status"],
            [
              ["Phase 1", "Foundation", "Database setup, user login, secure passwords, and basic styling.", "Done"],
              ["Phase 2", "Core Work", "Client list, task tracker, repeating templates, and file upload system.", "Done"],
              ["Phase 3", "Smart Tools", "Dashboards for boss/staff/client, charts, messaging, and GPT assistant.", "Done"],
              ["Phase 4", "Next Steps", "Online fee payments and government calendar dates.", "Planned"]
            ],
            [14, 22, 50, 14]
          ),

          // 8. Expected Outcome
          ...createHeading("8. Expected Outcome"),
          createParagraph(
            "SAKSHA replaces messy WhatsApp chats, lost emails, and confusing Excel sheets with one neat, clear website."
          ),
          createParagraph(
            "The CA office gets work done faster, staff never forget a deadline, clients send their papers on time, and no business ever gets fined for missing a government due date."
          )
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, 'SAKSHA_Project_Report.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log('SIMPLE_DOCX_GENERATED_AT: ' + outputPath);
}

buildDoc().catch(err => {
  console.error('ERROR_BUILDING_DOCX:', err);
  process.exit(1);
});
