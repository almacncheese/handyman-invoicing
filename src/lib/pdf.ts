import PDFDocument from 'pdfkit';
import { formatUsd } from './money';
import { lineTotalCents, type QuoteLineItem } from './calculations';

export type PdfBusiness = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  primaryColor?: string | null;
};

export type PdfDocInput = {
  kind: 'Estimate' | 'Invoice';
  number: string;
  title?: string | null;
  createdAt: Date;
  customer?: { name?: string | null; email?: string | null; address?: string | null } | null;
  lineItems: QuoteLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents?: number | null;
  amountPaidCents?: number | null;
  amountDueCents?: number | null;
  notes?: string | null;
  terms?: string | null;
  dueAt?: Date | null;
};

function sanitizeColor(c?: string | null): string {
  if (c && /^#[0-9a-fA-F]{6}$/.test(c.trim())) return c.trim();
  return '#4f46e5';
}

const INK = '#0b0f1e';
const MUTED = '#4a5170';
const LINE = '#dcdff0';

export function renderDocumentPdf(business: PdfBusiness, doc: PdfDocInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const accent = sanitizeColor(business.primaryColor);
      const pdf = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];
      pdf.on('data', (c) => chunks.push(c as Buffer));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      const left = 50;
      const right = pdf.page.width - 50;
      const contentWidth = right - left;

      // Accent band
      pdf.rect(0, 0, pdf.page.width, 10).fill(accent);

      // Business (left) + document meta (right)
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(business.name, left, 44, { width: 320 });
      const contact = [business.phone, business.email, business.website, business.address]
        .filter(Boolean)
        .join('  ·  ');
      if (contact) {
        pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(contact, left, 70, { width: 320 });
      }

      pdf.font('Helvetica-Bold').fontSize(22).fillColor(accent).text(doc.kind.toUpperCase(), right - 220, 44, {
        width: 220,
        align: 'right',
      });
      pdf.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(`#${doc.number}`, right - 220, 74, {
        width: 220,
        align: 'right',
      });
      pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(
        `Date: ${doc.createdAt.toLocaleDateString()}`,
        right - 220,
        90,
        { width: 220, align: 'right' },
      );
      if (doc.dueAt) {
        pdf.text(`Due: ${doc.dueAt.toLocaleDateString()}`, right - 220, 104, { width: 220, align: 'right' });
      }

      // Bill to
      let y = 130;
      pdf.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('BILL TO', left, y);
      y += 15;
      pdf.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(doc.customer?.name || '—', left, y, { width: 300 });
      y += 16;
      pdf.font('Helvetica').fontSize(9).fillColor(MUTED);
      if (doc.customer?.address) {
        pdf.text(doc.customer.address, left, y, { width: 300 });
        y += 13;
      }
      if (doc.customer?.email) {
        pdf.text(doc.customer.email, left, y, { width: 300 });
        y += 13;
      }
      if (doc.title) {
        pdf.font('Helvetica-Oblique').fontSize(10).fillColor(INK).text(doc.title, left, y, { width: contentWidth });
        y += 16;
      }

      // Table header
      y += 14;
      const amtX = right - 110;
      pdf.rect(left, y, contentWidth, 22).fill('#f2f3f8');
      pdf.fillColor(MUTED).font('Helvetica-Bold').fontSize(9);
      pdf.text('DESCRIPTION', left + 10, y + 7);
      pdf.text('AMOUNT', amtX, y + 7, { width: 100, align: 'right' });
      y += 28;

      pdf.font('Helvetica').fontSize(10);
      for (const line of doc.lineItems) {
        if (y > pdf.page.height - 150) {
          pdf.addPage();
          y = 60;
        }
        const desc = line.description || line.type;
        pdf.fillColor(INK).text(desc, left + 10, y, { width: contentWidth - 130 });
        pdf.fillColor(MUTED).fontSize(8).text(String(line.type).toUpperCase(), left + 10, y + 13);
        pdf.fillColor(INK).fontSize(10).text(formatUsd(lineTotalCents(line)), amtX, y, {
          width: 100,
          align: 'right',
        });
        const h = pdf.heightOfString(desc, { width: contentWidth - 130 });
        y += Math.max(h, 14) + 12;
        pdf.moveTo(left, y - 6).lineTo(right, y - 6).strokeColor(LINE).lineWidth(0.5).stroke();
      }

      // Totals
      y += 8;
      const totalsX = right - 240;
      const totalsW = 240;
      const row = (label: string, value: string, opts?: { bold?: boolean; color?: string }) => {
        pdf.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts?.bold ? 11 : 10);
        pdf.fillColor(opts?.color || MUTED).text(label, totalsX, y, { width: totalsW - 100 });
        pdf.fillColor(opts?.color || INK).text(value, totalsX + totalsW - 110, y, { width: 110, align: 'right' });
        y += opts?.bold ? 20 : 16;
      };
      row('Subtotal', formatUsd(doc.subtotalCents));
      row('Tax', formatUsd(doc.taxCents));
      pdf.moveTo(totalsX, y - 2).lineTo(right, y - 2).strokeColor(LINE).lineWidth(1).stroke();
      y += 4;
      row('Total', formatUsd(doc.totalCents), { bold: true, color: INK });
      if (doc.kind === 'Invoice') {
        if (doc.amountPaidCents != null) row('Paid', formatUsd(doc.amountPaidCents));
        if (doc.amountDueCents != null) row('Balance due', formatUsd(doc.amountDueCents), { bold: true, color: accent });
      } else if (doc.depositCents) {
        row('Deposit to schedule', formatUsd(doc.depositCents), { color: accent });
      }

      // Notes + terms
      y += 20;
      if (doc.notes) {
        if (y > pdf.page.height - 120) { pdf.addPage(); y = 60; }
        pdf.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', left, y);
        y += 14;
        pdf.font('Helvetica').fontSize(9).fillColor(INK).text(doc.notes, left, y, { width: contentWidth });
        y = pdf.y + 14;
      }
      if (doc.terms) {
        if (y > pdf.page.height - 120) { pdf.addPage(); y = 60; }
        pdf.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('TERMS', left, y);
        y += 14;
        pdf.font('Helvetica').fontSize(8).fillColor(MUTED).text(doc.terms, left, y, { width: contentWidth });
      }

      // Footer
      pdf.font('Helvetica').fontSize(8).fillColor(MUTED).text(
        'Generated with HandyQuote',
        left,
        pdf.page.height - 40,
        { width: contentWidth, align: 'center' },
      );

      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}
