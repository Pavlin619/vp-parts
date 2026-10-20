import type { EmailContent } from './email.sender';

export interface EmailFact {
  label: string;
  /** One line each. */
  value: string[];
  isStrong?: boolean;
}

export interface EmailColumn {
  header: string;
  isNumeric?: boolean;
}

export interface EmailLink {
  text: string;
  href: string;
}

export type EmailBlock =
  | { type: 'title'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string; isStrong?: boolean }
  | { type: 'facts'; rows: EmailFact[] }
  | { type: 'table'; columns: EmailColumn[]; rows: string[][] }
  | { type: 'links'; links: EmailLink[] }
  | { type: 'note'; text: string };

export interface EmailDocument {
  subject: string;
  blocks: EmailBlock[];
}

const INK = '#1f2328';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const CELL = `padding:6px 8px;border-bottom:1px solid ${LINE}`;

/**
 * Renders one list of blocks as both the HTML and the plain-text part, so the
 * two always say the same. Every value is escaped: names and part
 * descriptions come from customers and suppliers.
 */
export function renderEmail({ subject, blocks }: EmailDocument): EmailContent {
  return {
    subject,
    html: htmlPage(subject, blocks.map(blockHtml).join('\n')),
    text: blocks.map(blockText).join('\n\n'),
  };
}

function htmlPage(subject: string, body: string): string {
  return `<!doctype html>
<html lang="bg">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:${INK};font-size:14px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:8px;padding:24px">
${body}
</div>
</body>
</html>`;
}

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'title':
      return `<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(block.text)}</h1>`;
    case 'heading':
      return `<h2 style="margin:24px 0 8px;font-size:16px">${escapeHtml(block.text)}</h2>`;
    case 'paragraph':
      return `<p style="margin:0 0 12px">${strongIf(block.isStrong, escapeHtml(block.text))}</p>`;
    case 'facts':
      return factsHtml(block.rows);
    case 'table':
      return tableHtml(block.columns, block.rows);
    case 'links':
      return linksHtml(block.links);
    case 'note':
      return `<p style="margin:24px 0 0;font-size:12px;color:${MUTED}">${escapeHtml(block.text)}</p>`;
  }
}

function factsHtml(rows: EmailFact[]): string {
  const cells = rows.map(({ label, value, isStrong }) => {
    const lines = value.map(escapeHtml).join('<br>');

    return `<tr><td style="${CELL};color:${MUTED};vertical-align:top">${escapeHtml(label)}</td><td style="${CELL};text-align:right">${strongIf(isStrong, lines)}</td></tr>`;
  });

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px">${cells.join('')}</table>`;
}

function tableHtml(columns: EmailColumn[], rows: string[][]): string {
  const align = (column: EmailColumn) =>
    column.isNumeric
      ? 'text-align:right;white-space:nowrap'
      : 'text-align:left';
  const head = columns
    .map(
      (column) =>
        `<th style="${CELL};${align(column)};font-size:12px;color:${MUTED}">${escapeHtml(column.header)}</th>`,
    )
    .join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td style="${CELL};${align(columns[index])}">${escapeHtml(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px"><tr>${head}</tr>${body}</table>`;
}

function linksHtml(links: EmailLink[]): string {
  const items = links.map(
    ({ text, href }) =>
      `<li><a href="${escapeHtml(href)}" style="color:#1d4ed8">${escapeHtml(text)}</a></li>`,
  );

  return `<ul style="margin:0 0 12px;padding-left:20px">${items.join('')}</ul>`;
}

function blockText(block: EmailBlock): string {
  switch (block.type) {
    case 'title':
    case 'paragraph':
    case 'note':
      return block.text;
    case 'heading':
      return `${block.text}\n${'-'.repeat(block.text.length)}`;
    case 'facts':
      return block.rows
        .map(({ label, value }) => `${label}: ${value.join(', ')}`)
        .join('\n');
    case 'table':
      return block.rows.map((row) => `- ${row.join(' · ')}`).join('\n');
    case 'links':
      return block.links.map(({ text, href }) => `${text}: ${href}`).join('\n');
  }
}

function strongIf(isStrong: boolean | undefined, html: string): string {
  return isStrong ? `<strong>${html}</strong>` : html;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}
