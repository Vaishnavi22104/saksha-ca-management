#!/usr/bin/env python3
"""Builds the demo documents that scripts/seed.mjs uploads to storage.

Everything here is fictitious: invented firms, invented PANs, invented
amounts. The point is that when someone clicks a document in the demo, a
plausible-looking PDF or spreadsheet opens instead of a blank file.
"""
import csv
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

random.seed(20260930)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo-files")
os.makedirs(OUT, exist_ok=True)

INK = colors.HexColor("#141414")
GREY = colors.HexColor("#6B6B6B")
LINE = colors.HexColor("#CFCFCF")
BAND = colors.HexColor("#F2F2F2")

SS = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=SS["Normal"], fontName="Helvetica-Bold", fontSize=15,
                    textColor=INK, spaceAfter=2, leading=18)
SUB = ParagraphStyle("sub", parent=SS["Normal"], fontName="Helvetica", fontSize=9,
                     textColor=GREY, spaceAfter=10, leading=12)
BODY = ParagraphStyle("body", parent=SS["Normal"], fontName="Helvetica", fontSize=9,
                      textColor=INK, leading=13, spaceAfter=6)
SECT = ParagraphStyle("sect", parent=SS["Normal"], fontName="Helvetica-Bold", fontSize=10,
                      textColor=INK, spaceBefore=10, spaceAfter=5)
FOOT = ParagraphStyle("foot", parent=SS["Normal"], fontName="Helvetica-Oblique", fontSize=7.5,
                      textColor=GREY, alignment=TA_CENTER, leading=10)
STAMP = ParagraphStyle("stamp", parent=SS["Normal"], fontName="Helvetica-Bold", fontSize=9,
                       textColor=colors.HexColor("#2E6B2E"), spaceBefore=8)


def table(data, widths, align_right=(), head=True, font=8):
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", font),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if head:
        style += [
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", font),
            ("BACKGROUND", (0, 0), (-1, 0), BAND),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
        ]
    for col in align_right:
        style.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def doc(name, title, subtitle, flow, footer="Computer-generated demonstration document. Not a real record."):
    path = os.path.join(OUT, name)
    d = SimpleDocTemplate(path, pagesize=A4, title=title,
                          leftMargin=18 * mm, rightMargin=18 * mm,
                          topMargin=16 * mm, bottomMargin=14 * mm)
    story = [Paragraph(title, H1), Paragraph(subtitle, SUB)] + flow
    story += [Spacer(1, 14), Paragraph(footer, FOOT)]
    d.build(story)
    print(f"  {name:44s} {os.path.getsize(path):>7,} bytes")


def rupees(n):
    return f"{n:,.2f}"


# ---------------------------------------------------------------- 1. sales invoices
def sales_invoices():
    rows = [["Inv no.", "Date", "Customer", "GSTIN", "Taxable", "GST 18%", "Total"]]
    total_tx = total_gst = 0.0
    names = ["Deshmukh Hardware", "Nashik Agro Supplies", "Vibrant Interiors", "Patil & Sons",
             "Shree Ganesh Traders", "Konark Electricals", "Sahyadri Foods", "Mahalaxmi Steel",
             "Pune Paper Mart", "Radhe Plastics", "Gokhale Furnishings", "Asmita Enterprises"]
    for i, nm in enumerate(names, start=1):
        tx = round(random.uniform(18000, 340000), 2)
        gst = round(tx * 0.18, 2)
        total_tx += tx
        total_gst += gst
        rows.append([f"ABC/26-27/{100 + i}", f"{(i * 2) + 1:02d}-09-2026", nm,
                     f"27{chr(65 + i)}AAPD{1100 + i * 7}J1Z{i % 9}",
                     rupees(tx), rupees(gst), rupees(tx + gst)])
    rows.append(["", "", "Total", "", rupees(total_tx), rupees(total_gst),
                 rupees(total_tx + total_gst)])

    flow = [
        Paragraph("Outward supplies register for the month, as recorded in the books of account.", BODY),
        table(rows, [24 * mm, 18 * mm, 40 * mm, 32 * mm, 22 * mm, 19 * mm, 23 * mm],
              align_right=(4, 5, 6)),
        Paragraph("Summary", SECT),
        table([["Particulars", "Amount (Rs.)"],
               ["Total taxable value", rupees(total_tx)],
               ["CGST @ 9%", rupees(total_gst / 2)],
               ["SGST @ 9%", rupees(total_gst / 2)],
               ["Invoice value", rupees(total_tx + total_gst)],
               ["Number of invoices", str(len(names))]],
              [70 * mm, 40 * mm], align_right=(1,)),
    ]
    doc("sales-invoices-sep-2026.pdf", "Sales Invoice Register",
        "ABC Traders &nbsp;·&nbsp; PAN ABCPG1234K &nbsp;·&nbsp; GSTIN 27ABCPG1234K1Z5 "
        "&nbsp;·&nbsp; September 2026", flow)


# ---------------------------------------------------------------- 2. purchase bills
def purchase_bills():
    rows = [["Bill no.", "Date", "Supplier", "GSTIN", "Taxable", "ITC 18%", "In 2B"]]
    total_tx = total_itc = 0.0
    sup = [("Suvarna Packaging", "Y"), ("Kirloskar Spares", "Y"), ("Nagpur Transport Co.", "Y"),
           ("Bhagyashree Stationers", "N"), ("Vidarbha Chemicals", "Y"), ("Anand Printers", "Y"),
           ("Sai Logistics", "N"), ("Metro Cash & Carry", "Y"), ("Hindustan Cables", "Y")]
    for i, (nm, in2b) in enumerate(sup, start=1):
        tx = round(random.uniform(9000, 210000), 2)
        itc = round(tx * 0.18, 2)
        total_tx += tx
        total_itc += itc if in2b == "Y" else 0
        rows.append([f"P-{2400 + i * 3}", f"{(i * 3) + 2:02d}-09-2026", nm,
                     f"27{chr(70 + i)}BBQR{2200 + i * 5}L1Z{(i + 3) % 9}",
                     rupees(tx), rupees(itc), in2b])
    rows.append(["", "", "Total", "", rupees(total_tx), rupees(total_itc), ""])

    flow = [
        Paragraph("Inward supplies for the month, with the GSTR-2B matching status against each bill.", BODY),
        table(rows, [22 * mm, 18 * mm, 42 * mm, 32 * mm, 22 * mm, 20 * mm, 14 * mm],
              align_right=(4, 5)),
        Paragraph("Input tax credit position", SECT),
        table([["Particulars", "Amount (Rs.)"],
               ["ITC as per books", rupees(round(total_tx * 0.18, 2))],
               ["ITC available in GSTR-2B", rupees(total_itc)],
               ["Difference to be followed up with suppliers",
                rupees(round(total_tx * 0.18 - total_itc, 2))]],
              [95 * mm, 40 * mm], align_right=(1,)),
        Paragraph("Two bills (Bhagyashree Stationers, Sai Logistics) are not reflected in GSTR-2B "
                  "for the month. Credit on these has been kept in abeyance.", BODY),
    ]
    doc("purchase-bills-sep-2026.pdf", "Purchase Bill Register",
        "ABC Traders &nbsp;·&nbsp; GSTIN 27ABCPG1234K1Z5 &nbsp;·&nbsp; September 2026", flow)


# ---------------------------------------------------------------- 3. bank statement
def bank_statement():
    rows = [["Date", "Particulars", "Ref", "Debit", "Credit", "Balance"]]
    bal = 842150.00
    entries = [
        ("01-09-2026", "Opening balance", "", 0, 0),
        ("03-09-2026", "NEFT IN  DESHMUKH HARDWARE", "N2609031", 0, 236000),
        ("04-09-2026", "CHQ 004512  SUVARNA PACKAGING", "004512", 118500, 0),
        ("07-09-2026", "UPI IN  NASHIK AGRO", "UPI7741", 0, 87320),
        ("09-09-2026", "GST PMT-06 CHALLAN", "CIN2609", 164000, 0),
        ("11-09-2026", "RTGS IN  VIBRANT INTERIORS", "R2609112", 0, 401000),
        ("14-09-2026", "SALARY SEP 2026 (11 STAFF)", "SAL0926", 388000, 0),
        ("16-09-2026", "ELECTRICITY MSEDCL", "BBPS221", 24380, 0),
        ("18-09-2026", "NEFT IN  PATIL AND SONS", "N2609181", 0, 152400),
        ("21-09-2026", "CHQ 004513  VIDARBHA CHEMICALS", "004513", 96200, 0),
        ("24-09-2026", "TDS 194C SEP 2026", "CIN2610", 18600, 0),
        ("26-09-2026", "UPI IN  KONARK ELECTRICALS", "UPI8802", 0, 64750),
        ("29-09-2026", "BANK CHARGES + GST", "CHG0926", 1180, 0),
        ("30-09-2026", "RTGS IN  SAHYADRI FOODS", "R2609301", 0, 288000),
    ]
    tot_d = tot_c = 0.0
    for dt, part, ref, dr, cr in entries:
        bal = bal - dr + cr
        tot_d += dr
        tot_c += cr
        rows.append([dt, part, ref, rupees(dr) if dr else "", rupees(cr) if cr else "", rupees(bal)])
    rows.append(["", "Total", "", rupees(tot_d), rupees(tot_c), rupees(bal)])

    flow = [
        table([["Account holder", "ABC Traders"],
               ["Account number", "XXXXXXXX4417 (Current)"],
               ["Branch / IFSC", "Sitabuldi, Nagpur / DEMO0004417"],
               ["Statement period", "01-09-2026 to 30-09-2026"]],
              [42 * mm, 90 * mm], head=False, font=8.5),
        Spacer(1, 10),
        table(rows, [20 * mm, 56 * mm, 20 * mm, 24 * mm, 24 * mm, 26 * mm],
              align_right=(3, 4, 5)),
        Paragraph("Closing balance as on 30-09-2026: Rs. " + rupees(bal), SECT),
    ]
    doc("bank-statement-sep-2026.pdf", "Statement of Account",
        "Demonstration Bank Ltd. &nbsp;·&nbsp; September 2026", flow)


# ---------------------------------------------------------------- 4. GSTR-3B ack
def gstr3b_ack():
    flow = [
        table([["ARN", "AA270926114872K"],
               ["GSTIN", "27ABCPG1234K1Z5"],
               ["Legal name", "ABC Traders"],
               ["Return period", "September 2026"],
               ["Form", "GSTR-3B"],
               ["Date of filing", "18-10-2026"],
               ["Filed by", "Authorised signatory (EVC)"]],
              [42 * mm, 90 * mm], head=False, font=9),
        Paragraph("Tax liability and payment", SECT),
        table([["Description", "IGST", "CGST", "SGST", "Cess"],
               ["Output tax", "0.00", "2,14,380.00", "2,14,380.00", "0.00"],
               ["Input tax credit claimed", "0.00", "1,32,910.00", "1,32,910.00", "0.00"],
               ["Tax paid in cash", "0.00", "81,470.00", "81,470.00", "0.00"],
               ["Interest / late fee", "0.00", "0.00", "0.00", "0.00"]],
              [52 * mm, 22 * mm, 26 * mm, 26 * mm, 20 * mm], align_right=(1, 2, 3, 4)),
        Paragraph("Status: FILED. This acknowledgement is system generated.", STAMP),
    ]
    doc("gstr3b-acknowledgement-sep-2026.pdf", "Return Filing Acknowledgement",
        "Goods and Services Tax &nbsp;·&nbsp; Form GSTR-3B &nbsp;·&nbsp; September 2026", flow)


# ---------------------------------------------------------------- 5. ITR-V
def itr_ack():
    flow = [
        table([["Acknowledgement number", "284471960281026"],
               ["PAN", "AAFFR9012M"],
               ["Name", "Raj Enterprises"],
               ["Assessment year", "2026-27"],
               ["Form number", "ITR-5"],
               ["Filed on", "26-09-2026"],
               ["e-Verified on", "26-09-2026 (Aadhaar OTP)"]],
              [50 * mm, 82 * mm], head=False, font=9),
        Paragraph("Computation of income and tax", SECT),
        table([["Particulars", "Amount (Rs.)"],
               ["Gross total income", "48,62,140"],
               ["Deductions under Chapter VI-A", "1,50,000"],
               ["Total income", "47,12,140"],
               ["Tax on total income", "14,13,642"],
               ["Health and education cess", "56,546"],
               ["Total tax and interest payable", "14,70,188"],
               ["Taxes paid (advance tax, TDS, self assessment)", "14,70,188"],
               ["Net amount payable", "0"]],
              [95 * mm, 38 * mm], align_right=(1,)),
        Paragraph("Status: SUCCESSFULLY E-VERIFIED. No further action required.", STAMP),
    ]
    doc("itr-v-acknowledgement-ay2026-27.pdf", "ITR-V Acknowledgement",
        "Income Tax Department &nbsp;·&nbsp; Assessment Year 2026-27", flow)


# ---------------------------------------------------------------- 6. Form 16A
def form16a():
    flow = [
        table([["Certificate number", "QWERTY2609A"],
               ["Deductor", "XYZ Pvt Ltd,  TAN NGPX12345B"],
               ["Deductee", "Mahesh Contractors,  PAN AMCPK7788D"],
               ["Section", "194C - Payments to contractors"],
               ["Period", "Quarter 1, FY 2026-27"]],
              [46 * mm, 86 * mm], head=False, font=9),
        Paragraph("Details of tax deducted and deposited", SECT),
        table([["Quarter", "Amount paid", "Tax deducted", "Tax deposited", "Challan / BSR", "Date"],
               ["Q1", "6,40,000.00", "6,400.00", "6,400.00", "0004329 / 21072", "07-05-2026"],
               ["Q1", "3,15,000.00", "3,150.00", "3,150.00", "0004331 / 21072", "06-06-2026"],
               ["Q1", "4,80,000.00", "4,800.00", "4,800.00", "0004338 / 21072", "05-07-2026"],
               ["Total", "14,35,000.00", "14,350.00", "14,350.00", "", ""]],
              [18 * mm, 27 * mm, 25 * mm, 26 * mm, 34 * mm, 22 * mm], align_right=(1, 2, 3)),
        Paragraph("Verified as per the records of the deductor. Generated from TRACES.", STAMP),
    ]
    doc("form-16a-q1-fy2026-27.pdf", "Form 16A",
        "Certificate of tax deducted at source &nbsp;·&nbsp; Quarter 1, FY 2026-27", flow)


# ---------------------------------------------------------------- 7. board resolution
def board_resolution():
    body = [
        "<b>RESOLVED THAT</b> the audited financial statements of the Company for the financial "
        "year ended 31 March 2026, comprising the Balance Sheet, the Statement of Profit and Loss, "
        "the Cash Flow Statement and the notes forming part thereof, as placed before the Board, "
        "be and are hereby approved and adopted.",
        "<b>RESOLVED FURTHER THAT</b> M/s Sharma &amp; Associates, Chartered Accountants, be and are "
        "hereby authorised to represent the Company before the income tax authorities and the goods "
        "and services tax authorities for the said financial year, and to sign, verify and file all "
        "returns, forms and submissions on behalf of the Company.",
        "<b>RESOLVED FURTHER THAT</b> Ms Meera Iyer, Director, be and is hereby authorised to sign the "
        "financial statements and to do all such acts as may be necessary to give effect to the above.",
    ]
    flow = [
        table([["Company", "XYZ Private Limited"],
               ["CIN", "U74999MH2019PTC000000 (demo)"],
               ["Meeting", "Board meeting held at the registered office"],
               ["Date", "14 September 2026, 11:00 hrs"],
               ["Directors present", "Meera Iyer, Suresh Iyer, Anita Rane"]],
              [40 * mm, 92 * mm], head=False, font=9),
        Paragraph("Extract of the resolutions passed", SECT),
    ] + [Paragraph(p, BODY) for p in body] + [
        Spacer(1, 18),
        KeepTogether(table([["Certified true copy", ""],
                            ["", ""],
                            ["Meera Iyer", ""],
                            ["Director  (DIN 00000000)", ""]],
                           [70 * mm, 60 * mm], head=False, font=8.5)),
    ]
    doc("board-resolution-fy2025-26.pdf", "Certified Extract of Board Resolution",
        "XYZ Private Limited &nbsp;·&nbsp; 14 September 2026", flow)


# ---------------------------------------------------------------- CSV files
def csvs():
    def write(name, header, rows, note=None):
        path = os.path.join(OUT, name)
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)
            if note:
                w.writerow([])
                w.writerow([note])
        print(f"  {name:44s} {os.path.getsize(path):>7,} bytes")

    write("tds-deductions-q2-fy2026-27.csv",
          ["Deductee", "PAN", "Section", "Nature of payment", "Date", "Amount paid",
           "Rate %", "TDS", "Challan", "Deposited on"],
          [["Mahesh Contractors", "AMCPK7788D", "194C", "Civil work", "12-07-2026", 640000, 1, 6400, "0004401", "07-08-2026"],
           ["Deepa Consultancy", "ADPPD2211F", "194J", "Professional fees", "18-07-2026", 225000, 10, 22500, "0004401", "07-08-2026"],
           ["Nagpur Transport Co.", "AAFTN9090H", "194C", "Freight", "02-08-2026", 318000, 2, 6360, "0004415", "06-09-2026"],
           ["Kiran Salvi", "AKSPS1234Q", "194J", "Technical services", "09-08-2026", 90000, 2, 1800, "0004415", "06-09-2026"],
           ["Vaibhav Rent LLP", "AAVFV5566R", "194I", "Office rent", "01-09-2026", 480000, 10, 48000, "0004427", "05-10-2026"],
           ["Sai Logistics", "AASFS7788T", "194C", "Freight", "14-09-2026", 156000, 2, 3120, "0004427", "05-10-2026"],
           ["Anand Printers", "AAAPA3344M", "194C", "Printing", "22-09-2026", 74000, 1, 740, "0004427", "05-10-2026"]],
          "Prepared for Form 26Q, Quarter 2, FY 2026-27. Total TDS: 88920")

    write("trial-balance-mar-2026.csv",
          ["Code", "Ledger", "Group", "Debit", "Credit"],
          [["1000", "Cash in hand", "Current Assets", 48200, 0],
           ["1010", "Bank - Current account 4417", "Current Assets", 842150, 0],
           ["1100", "Sundry debtors", "Current Assets", 1864300, 0],
           ["1200", "Closing stock", "Current Assets", 1244000, 0],
           ["1300", "Furniture and fixtures", "Fixed Assets", 386000, 0],
           ["1310", "Computers", "Fixed Assets", 214500, 0],
           ["1320", "Accumulated depreciation", "Fixed Assets", 0, 182400],
           ["2000", "Sundry creditors", "Current Liabilities", 0, 1122700],
           ["2100", "GST payable", "Current Liabilities", 0, 162940],
           ["2110", "TDS payable", "Current Liabilities", 0, 88920],
           ["2200", "Secured loan - term loan", "Loans", 0, 1450000],
           ["3000", "Capital account", "Capital", 0, 2400000],
           ["4000", "Sales", "Income", 0, 18642000],
           ["4100", "Other income", "Income", 0, 96400],
           ["5000", "Purchases", "Expenses", 12480000, 0],
           ["5100", "Salaries and wages", "Expenses", 4656000, 0],
           ["5200", "Rent", "Expenses", 480000, 0],
           ["5300", "Power and fuel", "Expenses", 292560, 0],
           ["5400", "Freight outward", "Expenses", 474000, 0],
           ["5500", "Bank charges", "Expenses", 14160, 0],
           ["5600", "Depreciation", "Expenses", 182400, 0],
           ["5700", "Professional fees", "Expenses", 216590, 0]],
          "Totals: Debit 24568860  Credit 24568860")

    write("salary-register-sep-2026.csv",
          ["Employee", "Designation", "Basic", "HRA", "Allowances", "Gross",
           "PF", "Professional tax", "TDS", "Net pay"],
          [["Sunil Kadam", "Accountant", 32000, 12800, 6400, 51200, 3840, 200, 0, 47160],
           ["Rupali Jadhav", "Accounts assistant", 24000, 9600, 4800, 38400, 2880, 200, 0, 35320],
           ["Imran Shaikh", "Store keeper", 21000, 8400, 4200, 33600, 2520, 200, 0, 30880],
           ["Nilesh Warke", "Sales executive", 28000, 11200, 9800, 49000, 3360, 200, 0, 45440],
           ["Pooja Deshpande", "Office manager", 42000, 16800, 8400, 67200, 5040, 200, 2100, 59860],
           ["Ravi Tiwari", "Driver", 18000, 7200, 3600, 28800, 2160, 200, 0, 26440],
           ["Aarti Gawande", "Housekeeping", 14000, 5600, 2800, 22400, 1680, 200, 0, 20520]],
          "7 employees. Gross 290600  Net 265620")


# ---------------------------------------------------------------- images
def images():
    # A cancelled cheque, drawn as a clean image so it previews well.
    W, H = 1100, 470
    img = Image.new("RGB", (W, H), (245, 246, 242))
    d = ImageDraw.Draw(img)

    def font(sz, bold=False):
        for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),):
            try:
                return ImageFont.truetype(p, sz)
            except OSError:
                pass
        return ImageFont.load_default()

    d.rectangle([8, 8, W - 9, H - 9], outline=(120, 130, 140), width=2)
    for i in range(0, W, 6):  # guilloche-ish background texture
        d.line([(i, 0), (i - 60, H)], fill=(236, 238, 232), width=1)
    d.text((28, 26), "DEMONSTRATION BANK LTD.", font=font(24, True), fill=(30, 45, 70))
    d.text((28, 58), "SITABULDI BRANCH, NAGPUR 440012", font=font(13), fill=(90, 100, 115))
    d.text((W - 300, 30), "Date  3 0 0 9 2 0 2 6", font=font(16, True), fill=(30, 30, 30))

    d.text((28, 120), "Pay", font=font(15), fill=(60, 60, 60))
    d.line([(75, 145), (W - 40, 145)], fill=(140, 145, 150), width=1)
    d.text((85, 122), "ABC TRADERS", font=font(20, True), fill=(20, 20, 20))

    d.text((28, 176), "Rupees", font=font(15), fill=(60, 60, 60))
    d.line([(95, 200), (W - 220, 200)], fill=(140, 145, 150), width=1)
    d.text((105, 178), "One lakh eighteen thousand five hundred only", font=font(17), fill=(20, 20, 20))
    d.rectangle([W - 210, 168, W - 40, 206], outline=(140, 145, 150), width=1)
    d.text((W - 200, 176), "Rs. 1,18,500.00", font=font(17, True), fill=(20, 20, 20))

    d.text((28, 250), "A/c No.  XXXXXXXX4417", font=font(14), fill=(50, 50, 50))
    d.text((28, 274), "SUVARNA PACKAGING PVT LTD", font=font(14, True), fill=(50, 50, 50))
    d.text((W - 300, 258), "Authorised Signatory", font=font(13), fill=(90, 95, 105))
    d.line([(W - 310, 250), (W - 60, 250)], fill=(150, 155, 160), width=1)

    d.text((34, H - 74), "0 0 4 5 1 2      D E M O 0 0 0 4 4 1 7      4 4 1 7 0 0 1 2      3 1",
           font=font(20, True), fill=(35, 40, 50))

    # The two diagonal lines and the word that make it a cancelled cheque.
    d.line([(120, 100), (420, 300)], fill=(200, 40, 40), width=5)
    d.line([(120, 300), (420, 100)], fill=(200, 40, 40), width=5)
    d.text((150, 185), "CANCELLED", font=font(34, True), fill=(200, 40, 40))

    p = os.path.join(OUT, "cancelled-cheque.png")
    img.save(p, "PNG", optimize=True)
    print(f"  {'cancelled-cheque.png':44s} {os.path.getsize(p):>7,} bytes")

    # A deliberately unreadable scan: this is the file the CA rejects in the
    # demo, so the rejection reason has to be visibly true.
    W2, H2 = 900, 1180
    bad = Image.new("RGB", (W2, H2), (232, 228, 214))
    b = ImageDraw.Draw(bad)
    b.text((60, 60), "TAX INVOICE", font=font(30, True), fill=(60, 60, 60))
    b.text((60, 110), "Deshmukh Hardware", font=font(20), fill=(70, 70, 70))
    y = 210
    for i in range(22):
        b.line([(60, y), (60 + random.randint(300, 780), y)], fill=(120, 118, 110), width=6)
        y += 40
    bad = bad.filter(ImageFilter.GaussianBlur(radius=5.5))
    b2 = ImageDraw.Draw(bad)
    b2.polygon([(0, 0), (W2, 0), (W2, 120), (0, 210)], fill=(28, 26, 24))  # shadow across the page
    bad = bad.rotate(-7, expand=False, fillcolor=(18, 18, 18))
    p2 = os.path.join(OUT, "invoice-scan-unreadable.jpg")
    bad.save(p2, "JPEG", quality=38, optimize=True)
    print(f"  {'invoice-scan-unreadable.jpg':44s} {os.path.getsize(p2):>7,} bytes")


if __name__ == "__main__":
    print("Building demo documents into scripts/demo-files/")
    sales_invoices()
    purchase_bills()
    bank_statement()
    gstr3b_ack()
    itr_ack()
    form16a()
    board_resolution()
    csvs()
    images()
    print("Done.")
