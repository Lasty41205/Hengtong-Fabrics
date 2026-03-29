import React from "react";

type HighlightedTextProps = {
  text: string;
  keyword: string;
  className?: string;
};

type SearchToken =
  | {
      type: "date";
      raw: string;
      aliases: string[];
    }
  | {
      type: "text";
      raw: string;
      normalized: string;
    };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const padText = (value: number) => String(value).padStart(2, "0");

const toHalfWidth = (value: string) =>
  value.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");

const normalizeGenericText = (value: string) =>
  toHalfWidth(value || "")
    .replace(/[\-_/\\|,，.。:：;；、()（）【】\[\]{}<>《》"'“”‘’+]+/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();

const parseDateToken = (token: string) => {
  const safeToken = toHalfWidth(token).trim();
  const match = safeToken.match(/^(\d{1,2})(?:\s*[-/]\s*|\s*月\s*)(\d{1,2})(?:\s*日)?$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { month, day };
};

const buildDateAliases = (month: number, day: number) => {
  const mm = padText(month);
  const dd = padText(day);

  return [
    `${month}-${day}`,
    `${mm}-${dd}`,
    `${month}/${day}`,
    `${mm}/${dd}`,
    `${month}月${day}`,
    `${mm}月${dd}`,
    `${month}月${day}日`,
    `${mm}月${dd}日`
  ];
};

export const buildDateSearchAliases = (dateValue: Date | string) => {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(date.getTime())) return "";
  return buildDateAliases(date.getMonth() + 1, date.getDate()).join(" ");
};

const tokenizeKeywords = (keyword: string): SearchToken[] =>
  toHalfWidth(keyword)
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const dateToken = parseDateToken(item);
      if (dateToken) {
        return {
          type: "date" as const,
          raw: item,
          aliases: buildDateAliases(dateToken.month, dateToken.day).map((alias) => toHalfWidth(alias).toUpperCase())
        };
      }

      return {
        type: "text" as const,
        raw: item,
        normalized: normalizeGenericText(item)
      };
    })
    .filter((token) => (token.type === "date" ? token.aliases.length > 0 : Boolean(token.normalized)));

export const includesKeyword = (text: string, keyword: string) => {
  const tokens = tokenizeKeywords(keyword);
  if (tokens.length === 0) return false;

  const rawText = toHalfWidth(text || "").toUpperCase();
  const normalizedText = normalizeGenericText(text || "");

  return tokens.every((token) => {
    if (token.type === "date") {
      return token.aliases.some((alias) => rawText.includes(alias));
    }

    return normalizedText.includes(token.normalized);
  });
};

export function HighlightedText({ text, keyword, className }: HighlightedTextProps) {
  const safeText = text || "";
  const tokens = tokenizeKeywords(keyword);

  if (tokens.length === 0) {
    return <span className={className}>{safeText}</span>;
  }

  const highlightTerms = Array.from(
    new Set(
      tokens.flatMap((token) =>
        token.type === "date" ? token.aliases : [toHalfWidth(token.raw)]
      )
    )
  ).sort((left, right) => right.length - left.length);

  const pattern = new RegExp(`(${highlightTerms.map((term) => escapeRegExp(term)).join("|")})`, "ig");
  const parts = toHalfWidth(safeText).split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        highlightTerms.some((term) => part.toUpperCase() === term.toUpperCase()) ? (
          <mark key={`${part}-${index}`} className="keyword-highlight">
            {part}
          </mark>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        )
      )}
    </span>
  );
}
