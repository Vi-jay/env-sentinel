import type { CheckReport, Finding } from './types.js';

export interface FormatOptions {
  format: 'human' | 'json' | 'github';
  color: boolean;
  version?: string;
}

export function formatReport(report: CheckReport, options: FormatOptions): string {
  if (options.format === 'json') return `${JSON.stringify(jsonReport(report, options.version), null, 2)}\n`;
  const human = formatHuman(report, options.color);
  if (options.format !== 'github') return human;
  const annotations = report.files.flatMap((file) => file.findings.map(annotationLine));
  if (annotations.length === 0) return human;
  return `${annotations.join('\n')}\n${human}`;
}

/** GitHub Actions workflow command. Property values and the message are percent-encoded. */
function annotationLine(finding: Finding): string {
  const command = finding.severity === 'error' ? 'error' : 'warning';
  const properties = [`file=${workflowEscape(finding.file)}`];
  if (finding.line !== undefined) properties.push(`line=${String(finding.line)}`);
  if (finding.endLine !== undefined && finding.endLine !== finding.line) {
    properties.push(`endLine=${String(finding.endLine)}`);
  }
  properties.push(`title=${workflowEscape(finding.code)}`);
  return `::${command} ${properties.join(',')}::${workflowEscape(finding.message)}`;
}

function workflowEscape(value: string): string {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

function jsonReport(report: CheckReport, version: string | undefined): unknown {
  return {
    ...(version ? { version } : {}),
    ok: report.ok,
    strict: report.strict,
    summary: report.summary,
    files: report.files.map((file) => ({
      path: file.path,
      role: file.role,
      ok: file.ok,
      checked: file.checked,
      findings: file.findings.map(jsonFinding),
    })),
  };
}

function jsonFinding(finding: Finding): Record<string, unknown> {
  const json: Record<string, unknown> = {
    severity: finding.severity,
    code: finding.code,
    message: finding.message,
    file: finding.file,
  };
  if (finding.line !== undefined) json.line = finding.line;
  if (finding.endLine !== undefined && finding.endLine !== finding.line) json.endLine = finding.endLine;
  if (finding.key !== undefined) json.key = finding.key;
  if (finding.maskedValue !== undefined) json.maskedValue = finding.maskedValue;
  if (finding.valueLength !== undefined) json.valueLength = finding.valueLength;
  return json;
}

function formatHuman(report: CheckReport, color: boolean): string {
  const lines: string[] = [paint('env-sentinel', color, 'bold'), ''];
  for (const file of report.files) {
    if (file.role === 'schema' && file.findings.length === 0) continue;
    lines.push(paint(file.path, color, 'bold'));
    if (file.findings.length === 0) {
      lines.push(`  ${paint('ok', color, 'green')}  ${String(file.checked)} keys checked`);
      lines.push('');
      continue;
    }
    for (const finding of file.findings) {
      const label = finding.severity === 'error' ? 'error  ' : 'warning';
      const severity = finding.severity === 'error' ? paint(label, color, 'red') : paint(label, color, 'yellow');
      const code = finding.code.padEnd(14, ' ');
      const subject = (finding.key ?? (finding.line !== undefined ? `line ${String(finding.line)}` : '')).padEnd(
        16,
        ' ',
      );
      lines.push(`  ${severity}  ${code} ${subject}  ${finding.message}`);
    }
    lines.push('');
  }
  const errorLabel = report.summary.errors === 1 ? 'error' : 'errors';
  const warningLabel = report.summary.warnings === 1 ? 'warning' : 'warnings';
  const summary = `${String(report.summary.errors)} ${errorLabel}, ${String(report.summary.warnings)} ${warningLabel}`;
  lines.push(report.ok ? paint(summary, color, 'green') : paint(summary, color, 'red'));
  return `${lines.join('\n')}\n`;
}

function paint(text: string, enabled: boolean, tone: 'red' | 'yellow' | 'green' | 'bold'): string {
  if (!enabled) return text;
  const codes: Record<typeof tone, string> = {
    red: '31',
    yellow: '33',
    green: '32',
    bold: '1',
  };
  return `\u001b[${codes[tone]}m${text}\u001b[0m`;
}
