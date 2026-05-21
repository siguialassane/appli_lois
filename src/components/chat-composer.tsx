import { useRef, useEffect, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isPending: boolean;
  suggestions?: string[];
  showSuggestions?: boolean;
  onSelectSuggestion?: (s: string) => void;
}

const SuggestedActions = memo(function SuggestedActions({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
}) {
  return (
    <div className="grid gap-2 pb-3 sm:grid-cols-2">
      {suggestions.map((suggestion, index) => (
        <motion.div
          key={suggestion}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ delay: 0.05 * index, duration: 0.22 }}
          className={index > 1 ? "hidden sm:block" : "block"}
        >
          <button
            type="button"
            onClick={() => onSelect(suggestion)}
            className="w-full rounded-[18px] border border-[--line] bg-[--surface] px-4 py-3.5 text-left text-[14px] text-[--ink-soft] transition hover:bg-[--surface-strong] hover:border-[rgba(255,255,255,0.15)]"
          >
            {suggestion}
          </button>
        </motion.div>
      ))}
    </div>
  );
});

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isPending,
  suggestions = [],
  showSuggestions = false,
  onSelectSuggestion,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="w-full">
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="mb-3"
          >
            <SuggestedActions
              suggestions={suggestions}
              onSelect={onSelectSuggestion ?? (() => {})}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-2 rounded-[28px] border border-[--line] bg-[--composer] px-4 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.12)]">
        <label className="sr-only" htmlFor="chat-input">
          Question
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (value.trim() && !isPending) onSubmit();
            }
          }}
          rows={1}
          placeholder="Pose ta question juridique..."
          autoFocus
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-[--ink] outline-none placeholder:text-[--muted]"
        />

        {isPending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Arrêter la génération"
            style={{ backgroundColor: "rgba(120,120,120,0.35)", color: "#cccccc" }}
            className="mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:opacity-80"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="10" height="10" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            aria-label="Envoyer"
            style={{
              backgroundColor: value.trim() ? "var(--accent)" : "var(--send-idle-bg)",
              color: value.trim() ? "#ffffff" : "var(--send-idle-fg)",
              boxShadow: value.trim() ? "none" : "inset 0 0 0 1px var(--line)",
            }}
            className="mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 13V3M3 8l5-5 5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      <p className="mt-1.5 text-center text-[11px] text-[--muted]">Pas un avis d'avocat</p>
    </div>
  );
}
