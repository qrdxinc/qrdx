import type { CSSProperties, ReactNode } from "react";
import { Column, Hr, Link, Row, Section, Text } from "react-email";
import { EMAIL_ACCENT, EMAIL_LINE, EMAIL_MUTED, EMAIL_TEXT } from "./layout";

// Building blocks shared by the event and digest templates. Their rows are
// formatted as tables in the plain-text body (data-text-format="dataTable"),
// so a label and its value don't run together there.

const numberFormat = new Intl.NumberFormat("en-US");
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export const formatCount = (value: number, locale?: string) =>
  locale
    ? new Intl.NumberFormat(locale).format(value)
    : numberFormat.format(value);

export const formatEmailDateTime = (value: Date | string, locale?: string) =>
  `${(
    locale
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })
      : dateTimeFormat
  ).format(new Date(value))} UTC`;

export const formatEmailDate = (value: Date | string, locale?: string) =>
  (locale
    ? new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : dateFormat
  ).format(new Date(value));

/** “Title” or the slug when a code has no title. */
export const codeLabel = (code: { title: string | null; slug: string }) =>
  code.title?.trim() ? `“${code.title.trim()}”` : `/${code.slug}`;

/** Between the rows of a bordered box. */
const ROW_LINE = "#f0f0f0";

const styles = {
  table: {
    border: `1px solid ${EMAIL_LINE}`,
    borderRadius: "8px",
    margin: "0 0 24px",
    padding: "4px 16px",
  },
  label: {
    color: EMAIL_MUTED,
    fontSize: "13px",
    lineHeight: "20px",
    padding: "10px 12px 10px 0",
    verticalAlign: "top",
    width: "38%",
  },
  value: {
    color: EMAIL_TEXT,
    fontSize: "14px",
    lineHeight: "20px",
    padding: "10px 0",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  rowLine: { borderTop: `1px solid ${ROW_LINE}` },
  stats: {
    border: `1px solid ${EMAIL_LINE}`,
    borderRadius: "8px",
    margin: "0 0 24px",
    padding: "16px 8px",
  },
  stat: { padding: "0 4px", textAlign: "center", verticalAlign: "top" },
  statValue: {
    color: EMAIL_TEXT,
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: "28px",
    margin: 0,
  },
  statLabel: {
    color: EMAIL_MUTED,
    fontSize: "12px",
    lineHeight: "18px",
    margin: "2px 0 0",
  },
  delta: { fontSize: "12px", lineHeight: "18px", margin: "2px 0 0" },
  sectionTitle: {
    color: EMAIL_TEXT,
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    margin: "24px 0 8px",
  },
  muted: {
    color: EMAIL_MUTED,
    fontSize: "13px",
    lineHeight: "22px",
    margin: "0 0 16px",
  },
  ranked: { margin: "0 0 24px" },
  rankedHeading: {
    color: EMAIL_MUTED,
    fontSize: "13px",
    lineHeight: "20px",
    paddingBottom: "8px",
  },
  rankedLabel: {
    color: EMAIL_TEXT,
    fontSize: "14px",
    fontWeight: 500,
    lineHeight: "20px",
    paddingRight: "12px",
    wordBreak: "break-word",
  },
  rankedLink: {
    color: EMAIL_TEXT,
    textDecoration: "underline",
    textDecorationColor: "#d4d4d4",
    textUnderlineOffset: "3px",
  },
  rankedValue: {
    color: "#525252",
    fontSize: "14px",
    lineHeight: "20px",
    textAlign: "right",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  textLink: { color: EMAIL_ACCENT, fontWeight: 500, textDecoration: "none" },
  rankedLine: {
    border: "none",
    borderTop: `1px solid ${EMAIL_LINE}`,
    margin: "8px 0",
    width: "100%",
  },
} satisfies Record<string, CSSProperties>;

/** Label/value rows in one bordered box, e.g. scan details or form answers. */
export function DetailsTable({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Section style={styles.table}>
      {rows.map((row, index) => {
        const line = index > 0 ? styles.rowLine : null;
        return (
          <Row data-text-format="dataTable" key={index}>
            <Column style={{ ...styles.label, ...line }}>{row.label}</Column>
            <Column style={{ ...styles.value, ...line }}>{row.value}</Column>
          </Row>
        );
      })}
    </Section>
  );
}

/** A few numbers side by side in one bordered box. */
export function StatGrid({
  stats,
}: {
  /** `down`: the delta is a drop (else read from a leading "-") */
  stats: {
    label: string;
    value: string;
    delta?: string | null;
    down?: boolean;
  }[];
}) {
  return (
    <Section style={styles.stats}>
      <Row data-text-format="dataTable">
        {stats.map((stat) => (
          <Column
            key={stat.label}
            style={{ ...styles.stat, width: `${100 / stats.length}%` }}
          >
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            {stat.delta ? (
              <Text
                style={{
                  ...styles.delta,
                  color:
                    (stat.down ?? stat.delta.startsWith("-"))
                      ? "#b45309"
                      : EMAIL_ACCENT,
                }}
              >
                {stat.delta}
              </Text>
            ) : null}
          </Column>
        ))}
      </Row>
    </Section>
  );
}

/**
 * A ranked list, e.g. a digest's top codes: a header row (what's listed,
 * what's counted), then one row per item with its name (a link when it has
 * an `href`) and its count on the right.
 */
export function RankedList({
  labelHeading,
  valueHeading,
  rows,
}: {
  /** Over the names, e.g. "Code" */
  labelHeading: string;
  /** Over the counts, e.g. "Scans" */
  valueHeading: string;
  /** The value already formatted (formatCount) */
  rows: { label: string; href?: string; value: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Section style={styles.ranked}>
      <Row data-text-format="dataTable">
        <Column style={styles.rankedHeading}>{labelHeading}</Column>
        <Column style={{ ...styles.rankedHeading, textAlign: "right" }}>
          {valueHeading}
        </Column>
      </Row>
      {rows.map((row, index) => (
        <Section key={`${index}-${row.label}`}>
          <Row data-text-format="dataTable">
            <Column style={styles.rankedLabel}>
              {row.href ? (
                <Link href={row.href} style={styles.rankedLink}>
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </Column>
            <Column style={styles.rankedValue}>{row.value}</Column>
          </Row>
          {index < rows.length - 1 ? <Hr style={styles.rankedLine} /> : null}
        </Section>
      ))}
    </Section>
  );
}

/** A link inside a sentence: the accent colour, no underline. */
export function EmailTextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={styles.textLink}>
      {children}
    </Link>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** Secondary lines: expiry notes, "didn't ask for this?", small print. */
export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}
