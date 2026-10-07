/**
 * Starter outlines for the template builder.
 *
 * These are only a first draft of the steps: the CA edits, removes and
 * reorders them before saving, and nothing here is written to the database
 * until the form is submitted. They exist so the first template takes a
 * minute rather than an afternoon of blank-page staring.
 */

export type PresetStep = {
  title: string;
  due_offset_days: number;
  requires_document: boolean;
  requires_review: boolean;
};

export type Preset = {
  key: string;
  name: string;
  /** Matched loosely against the firm's service names to preselect one. */
  match: string;
  blurb: string;
  steps: PresetStep[];
};

const doc = (title: string, due_offset_days: number): PresetStep => ({
  title, due_offset_days, requires_document: true, requires_review: false,
});
const rev = (title: string, due_offset_days: number): PresetStep => ({
  title, due_offset_days, requires_document: false, requires_review: true,
});
const step = (title: string, due_offset_days: number): PresetStep => ({
  title, due_offset_days, requires_document: false, requires_review: false,
});

export const PRESETS: Preset[] = [
  {
    key: "gst",
    name: "GST monthly",
    match: "gst",
    blurb: "Invoices in, returns filed. 7 steps over 10 days.",
    steps: [
      doc("Collect sales and purchase invoices", 0),
      step("Reconcile purchases against GSTR-2B", 2),
      step("Compute the tax payable", 3),
      rev("Confirm the summary with the client", 4),
      step("Pay the tax", 5),
      step("File GSTR-1", 8),
      rev("File GSTR-3B", 10),
    ],
  },
  {
    key: "tds",
    name: "TDS quarterly",
    match: "tds",
    blurb: "Deductions to Form 16A. 6 steps over 14 days.",
    steps: [
      doc("Collect the quarter's deduction details", 0),
      step("Verify every deductee PAN", 2),
      step("Compute TDS payable with interest", 4),
      step("Deposit the challans", 6),
      rev("Prepare and validate the quarterly return", 10),
      step("File the return and issue Form 16A", 14),
    ],
  },
  {
    key: "itr",
    name: "Income tax return",
    match: "itr",
    blurb: "Proofs to acknowledgement. 8 steps over 20 days.",
    steps: [
      doc("Collect Form 16, bank statements and investment proofs", 0),
      doc("Collect last year's return and the books", 2),
      step("Reconcile with AIS and Form 26AS", 5),
      step("Compute total income and deductions", 8),
      rev("Put the computation sheet up for review", 11),
      step("Get the client's written confirmation", 14),
      step("File the return", 18),
      rev("E-verify and save the acknowledgement", 20),
    ],
  },
  {
    key: "audit",
    name: "Statutory audit",
    match: "audit",
    blurb: "Books to signed report. 7 steps over 30 days.",
    steps: [
      doc("Collect trial balance, ledgers and bank statements", 0),
      step("Vouch expenses and verify balances", 6),
      step("Check statutory dues and compliances", 12),
      doc("Obtain management representation letter", 16),
      step("Draft the financial statements", 20),
      rev("Partner review of the draft report", 25),
      rev("Sign and issue the audit report", 30),
    ],
  },
];

export const BLANK_STEP: PresetStep = {
  title: "", due_offset_days: 0, requires_document: false, requires_review: false,
};
