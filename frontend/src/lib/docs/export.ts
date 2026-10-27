"use client";

/* A Jagora document, out to Markdown and Word. (PDF is the designed page printed through the browser.) */
import type { JDoc } from "../store";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "jagora-document";
const date = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toMarkdown(d: JDoc) {
  const out: string[] = [`# ${d.title}`, ""];
  if (d.subtitle) out.push(`*${d.subtitle}*`, "");
  out.push(`${d.kind} · Prepared by Jagora · ${date(d.created)}`, "", "## Summary", "", ...d.summary.map((s) => `- ${s}`), "");
  for (const b of d.blocks) {
    if (b.t === "h") out.push(`## ${b.text}`, "");
    else if (b.t === "p") out.push(b.text, "");
    else if (b.t === "note") out.push(`> ${b.text}`, "");
    else if (b.t === "list") out.push(...b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`)), "");
    else if (b.t === "table") {
      out.push(`| ${b.head.join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.join(" | ")} |`), "");
      if (b.caption) out.push(`*${b.caption}*`, "");
    }
  }
  out.push("## Sources", "", ...d.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`), "");
  return out.join("\n");
}

export function downloadMarkdown(d: JDoc) {
  save(new Blob([toMarkdown(d)], { type: "text/markdown;charset=utf-8" }), `${slug(d.title)}.md`);
}

export async function downloadDocx(d: JDoc) {
  const x = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ExternalHyperlink, BorderStyle, ShadingType, AlignmentType } = x;
  const INK = "0E0F12", MUTED = "5B5E66", ACCENT = "1D63ED", LINE = "DDE3EC";
  const body = { font: "Georgia", size: 22, color: "3A3D44" };
  const para = (text: string, o: Record<string, unknown> = {}) => new Paragraph({ spacing: { after: 140, line: 330 }, children: [new TextRun({ text, ...body, ...o })] });
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: d.kind.toUpperCase(), font: "Arial", size: 18, bold: true, color: ACCENT, characterSpacing: 40 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: d.title, font: "Arial", size: 52, bold: true, color: INK })] }),
  ];
  if (d.subtitle) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: d.subtitle, ...body, size: 26, color: MUTED })] }));
  children.push(
    new Paragraph({
      spacing: { after: 360 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 8 } },
      children: [new TextRun({ text: `Prepared by Jagora  ·  ${date(d.created)}`, font: "Arial", size: 18, color: MUTED })],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Summary", font: "Arial", size: 26, bold: true, color: INK })] }),
    ...d.summary.map((s) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 320 }, children: [new TextRun({ text: s, ...body })] })),
  );
  for (const b of d.blocks) {
    if (b.t === "h") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 140 }, children: [new TextRun({ text: b.text, font: "Arial", size: 28, bold: true, color: INK })] }));
    else if (b.t === "p") children.push(para(b.text));
    else if (b.t === "note")
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 200, line: 320 },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF3FD" },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
          children: [new TextRun({ text: b.text, ...body, color: "2A3550" })],
        }),
      );
    else if (b.t === "list")
      b.items.forEach((it, i) =>
        children.push(
          b.ordered
            ? new Paragraph({ spacing: { after: 80, line: 320 }, indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: `${i + 1}.  `, ...body, bold: true, color: ACCENT }), new TextRun({ text: it, ...body })] })
            : new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 320 }, children: [new TextRun({ text: it, ...body })] }),
        ),
      );
    else if (b.t === "table") {
      const cell = (t: string, head: boolean) =>
        new TableCell({
          shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "0E0F12" } : undefined,
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [new Paragraph({ children: [new TextRun({ text: t, font: head ? "Arial" : "Georgia", size: head ? 18 : 20, bold: head, color: head ? "FFFFFF" : "2B2E35" })] })],
        });
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          },
          rows: [new TableRow({ tableHeader: true, children: b.head.map((h) => cell(h, true)) }), ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) }))],
        }),
      );
      if (b.caption) children.push(new Paragraph({ spacing: { before: 80, after: 160 }, children: [new TextRun({ text: b.caption, ...body, size: 18, italics: true, color: MUTED })] }));
    }
  }
  children.push(new Paragraph({ spacing: { before: 400, after: 140 }, children: [new TextRun({ text: "Sources", font: "Arial", size: 26, bold: true, color: INK })] }));
  d.sources.forEach((s, i) =>
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `${i + 1}.  `, ...body, color: MUTED }), new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.title, ...body, color: ACCENT, underline: {} })] })],
      }),
    ),
  );
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: "Made with Jagora, the voice-first browser for Nigeria.", font: "Arial", size: 16, color: "9A9DA5" })] }));
  const doc = new Document({
    creator: "Jagora",
    title: d.title,
    styles: { default: { document: { run: { font: "Georgia" } } } },
    sections: [{ properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } }, children }],
  });
  save(await Packer.toBlob(doc), `${slug(d.title)}.docx`);
}
