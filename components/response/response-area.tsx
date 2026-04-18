"use client";

import { motion } from "framer-motion";
import type { ResponseSection } from "@/lib/engine/types";

interface ResponseAreaProps {
  sections: ResponseSection[];
  isStreaming: boolean;
}

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.4, ease: "easeOut" as const },
  }),
};

// Section headings that get special visual treatment
const ACCENT_HEADINGS = new Set(["🧠 Expert Insights", "Expert Insights", "📚 Sources", "References"]);
const REFERENCE_HEADINGS = new Set(["📚 Sources", "References"]);

// Extract language from fenced code block
function extractCodeBlock(content: string): { language: string; code: string } {
  const match = content.match(/^```(\w*)\n([\s\S]*?)```/);
  if (match) {
    return { language: match[1] || "text", code: match[2] };
  }
  return { language: "text", code: content };
}

// ── Helper to render text with markdown links, bold, and italic text ──────────

function renderContent(text: string) {
  if (!text) return text;

  // Combined Regex for: 1. Links, 2. Bold, 3. Italic
  // Note: We use capture groups to identify which one matched
  const combinedRegex = /(\[[\s\S]*?\]\(https?:\/\/[^\s\)]+\))|(\*\*[\s\S]*?\*\*)|(\*[\s\S]*?\*)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // 1. Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // It's a Link: [text](url)
      const linkMatch = match[1].match(/\[([\s\S]*?)\]\((https?:\/\/[^\s\)]+)\)/);
      if (linkMatch) {
        const linkText = linkMatch[1].replace(/\*/g, "").trim();
        const url = linkMatch[2];
        parts.push(
          <a
            key={`link-${match.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 my-0.5 font-bold text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-md transition-all cursor-pointer no-underline"
          >
            {linkText} ↗
          </a>
        );
      }
    } else if (match[2]) {
      // It's Bold: **text**
      const boldText = match[2].slice(2, -2);
      parts.push(
        <strong key={`bold-${match.index}`} className="font-bold text-foreground">
          {boldText}
        </strong>
      );
    } else if (match[3]) {
      // It's Italic: *text*
      const italicText = match[3].slice(1, -1);
      parts.push(
        <em key={`italic-${match.index}`} className="italic text-muted-foreground">
          {italicText}
        </em>
      );
    }

    lastIndex = combinedRegex.lastIndex;
  }

  // 2. Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // 3. Final cleanup for stray characters and rendering
  return parts.map((part, i) => {
    if (typeof part === "string") {
      // Remove any stray markdown markers that might have leaked
      return part.replace(/[\*\_\~]/g, "");
    }
    return part;
  });
}

export function ResponseArea({ sections, isStreaming }: ResponseAreaProps) {
  if (sections.length === 0) return null;

  // Track which heading we're under for styling child elements

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass mt-6 rounded-2xl p-6 border-shine"
    >
      <div className="space-y-4">
        {sections.map((section, i) => {
          const previousHeadings = sections.slice(0, i + 1).filter(s => s.type === "heading");
          const currentHeading = previousHeadings.length > 0 ? previousHeadings[previousHeadings.length - 1].content : "";
          const isAccentSection = ACCENT_HEADINGS.has(currentHeading) && section.type !== "heading";
          const isReferences = REFERENCE_HEADINGS.has(currentHeading);

          return (
            <motion.div
              key={i}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={sectionVariants}
            >
              {/* Heading */}
              {section.type === "heading" && (
                <h3
                  className={`text-lg font-semibold ${
                    ACCENT_HEADINGS.has(section.content)
                      ? "text-gradient"
                      : "text-foreground"
                  }`}
                >
                  {section.content}
                </h3>
              )}

              {/* Paragraph */}
              {section.type === "paragraph" && (
                <p className="leading-[1.75] text-muted-foreground/90 whitespace-pre-wrap">
                  {renderContent(section.content)}
                </p>
              )}

              {/* Bullet list */}
              {section.type === "bullets" && section.items && (
                <ul className={`space-y-2 ${isReferences ? "pl-2" : "pl-4"}`}>
                  {section.items.map((item, j) => (
                    <motion.li
                      key={j}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: i * 0.15 + j * 0.08,
                        duration: 0.3,
                      }}
                      className={`flex items-start gap-2 text-sm ${
                        isReferences
                          ? "font-mono text-xs text-muted-foreground/80"
                          : isAccentSection
                            ? "text-foreground/90"
                            : "text-muted-foreground"
                      }`}
                    >
                      {!isReferences && (
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            isAccentSection ? "bg-chart-2" : "bg-primary"
                          }`}
                        />
                      )}
                      {isReferences ? (
                        <span className="break-all">{renderContent(item)}</span>
                      ) : (
                        renderContent(item)
                      )}
                    </motion.li>
                  ))}
                </ul>
              )}

              {/* Code block */}
              {section.type === "code" && (
                <CodeBlock content={section.content} />
              )}

              {/* Fact-check block */}
              {section.type === "fact_check" && (
                <FactCheckBlock content={section.content} />
              )}
            </motion.div>
          );
        })}
      </div>

      {isStreaming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 flex items-center gap-1.5"
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary glow-sm"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                delay: i * 0.2,
              }}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Code Block Sub-Component ───────────────────────────────────

function CodeBlock({ content }: { content: string }) {
  const { language, code } = extractCodeBlock(content);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-[#080B18]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/40 bg-accent/50 px-4 py-2">
        <span className="font-mono text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          Copy
        </button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="text-violet-300/90 font-mono">{code}</code>
      </pre>
    </div>
  );
}

// ── Fact-Check Sub-Component ───────────────────────────────────

function FactCheckBlock({ content }: { content: string }) {
  // Detect reliability level from content
  const isHigh = content.toLowerCase().includes("high");
  const isMedium = content.toLowerCase().includes("medium");
  const hasWarning = content.toLowerCase().includes("contradiction") || content.toLowerCase().includes("warning");

  const borderColor = isHigh
    ? "border-teal-500/20"
    : isMedium
      ? "border-secondary/20"
      : "border-red-500/20";

  const bgColor = isHigh
    ? "bg-teal-500/4"
    : isMedium
      ? "bg-secondary/4"
      : "bg-red-500/4";

  return (
    <div className={`rounded-xl border p-4 ${borderColor} ${bgColor}`}>
      {hasWarning && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-secondary">
          <span>⚠️</span>
          <span>Contradictions detected</span>
        </div>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
