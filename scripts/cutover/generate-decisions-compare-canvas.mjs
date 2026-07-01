import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'compare-decisions-compact.json'), 'utf8')
)

const out = path.join(
  process.env.USERPROFILE,
  '.cursor',
  'projects',
  'c-Users-slema-sudan-err-portal',
  'canvases',
  'decisions-fdw-canonical-compare.canvas.tsx'
)

const content = `import {
  H1, H2, Stack, Row, Text, Table, Stat, TextInput, useHostTheme, useCanvasState,
} from 'cursor/canvas';
import type { TableRowTone } from 'cursor/canvas';

const SUMMARY = ${JSON.stringify(data.summary)} as const;

type Row = {
  k: string; s: string; fa: number | null; ca: number | null;
  fs: number | null; cs: number | null; fd: string | null; cd: string | null;
  fr: string; cr: string; fp: string; cp: string; m: string;
};

const ROWS: Row[] = ${JSON.stringify(data.rows)};

function fmt(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function pair(a: string | number | null, b: string | number | null): string {
  const left = a == null || a === '' ? '—' : String(a);
  const right = b == null || b === '' ? '—' : String(b);
  return left === right ? left : left + ' | ' + right;
}

function rowTone(r: Row): TableRowTone | undefined {
  if (r.s === 'fdw_only') return 'danger';
  if (r.m) return 'warning';
  return 'success';
}

export default function DecisionsFdwCanonicalCompare() {
  const theme = useHostTheme();
  const [filter, setFilter] = useCanvasState('filter', '');

  const q = filter.trim().toLowerCase();
  const visible = q
    ? ROWS.filter((r) => r.k.toLowerCase().includes(q) || r.m.toLowerCase().includes(q) || r.s.includes(q))
    : ROWS;

  const tableRows = visible.map((r) => [
    r.k,
    r.s,
    pair(fmt(r.fa), fmt(r.ca)),
    pair(fmt(r.fs), fmt(r.cs)),
    pair(r.fd, r.cd),
    pair(r.fr, r.cr),
    pair(r.fp, r.cp),
    r.m || 'ok',
  ]);

  const tones = visible.map(rowTone);

  return (
    <Stack gap={16} style={{ padding: 16, fontFamily: theme.fonts?.sans }}>
      <H1>Decisions: FDW vs Canonical</H1>
      <Text style={{ color: theme.fg.secondary }}>
        Source: public.distribution_decision (FDW) vs distribution_decision_master_sheet_1. Matched by airtable_record_id. 2026-06-26.
      </Text>
      <Row gap={12} wrap>
        <Stat label="FDW rows" value={String(SUMMARY.fdw_count)} />
        <Stat label="Canonical rows" value={String(SUMMARY.canon_count)} />
        <Stat label="Matched" value={String(SUMMARY.matched)} tone="success" />
        <Stat label="FDW only" value={String(SUMMARY.fdw_only)} tone={SUMMARY.fdw_only ? 'danger' : 'neutral'} />
        <Stat label="Field mismatches" value={String(SUMMARY.with_field_mismatches)} tone={SUMMARY.with_field_mismatches ? 'warning' : 'success'} />
      </Row>
      <Text style={{ color: theme.fg.secondary, fontSize: 12 }}>
        Paired cells show FDW | Canonical when values differ. Partner may show rec id on FDW side; canonical keeps display text by design.
      </Text>
      <TextInput
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by decision_id_proposed..."
      />
      <H2>All decisions ({visible.length} rows)</H2>
      <Table
        headers={[
          'decision_id_proposed',
          'Status',
          'Amount (FDW | Canon)',
          'Sum alloc (FDW | Canon)',
          'Date (FDW | Canon)',
          'Restriction (FDW | Canon)',
          'Partner (FDW | Canon)',
          'Notes',
        ]}
        rows={tableRows}
        rowTone={tones}
        striped
        stickyHeader
      />
    </Stack>
  );
}
`

fs.writeFileSync(out, content)
console.log('Wrote', out)
