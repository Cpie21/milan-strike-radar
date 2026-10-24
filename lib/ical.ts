export function escapeCalendarText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

// RFC 5545 folds at 75 UTF-8 octets, without splitting a code point.
export function calendarLine(value: string) {
  const lines: string[] = [];
  let line = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += character;
    bytes += size;
  }
  lines.push(line);
  return lines.join('\r\n');
}

export function serializeCalendar(lines: string[]) {
  return lines.map(calendarLine).join('\r\n') + '\r\n';
}
