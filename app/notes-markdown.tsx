import type { ReactNode } from "react";

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function isTableRow(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim());
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function NotesMarkdown({ text }: { text: string }) {
  if (!text.trim()) {
    return <p className="notes-preview-empty">Nothing here yet. Switch to Edit and start typing.</p>;
  }

  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isTableRow(line) && isTableDivider(lines[index + 1] ?? "")) {
      const headerCells = parseTableRow(line);
      const bodyRows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        bodyRows.push(parseTableRow(lines[index]));
        index += 1;
      }
      nodes.push(
        <div className="notes-table-wrap" key={key++}>
          <table className="notes-table">
            <thead>
              <tr>
                {headerCells.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^###\s+/.test(line)) {
      nodes.push(<h4 key={key++}>{renderInline(line.replace(/^###\s+/, ""))}</h4>);
      index += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      nodes.push(<h3 key={key++}>{renderInline(line.replace(/^##\s+/, ""))}</h3>);
      index += 1;
      continue;
    }
    if (/^#\s+/.test(line)) {
      nodes.push(<h2 key={key++}>{renderInline(line.replace(/^#\s+/, ""))}</h2>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={key++}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !isTableRow(lines[index]) &&
      !/^#{1,3}\s+/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    nodes.push(<p key={key++}>{renderInline(paragraphLines.join(" "))}</p>);
  }

  return <div className="notes-preview">{nodes}</div>;
}
