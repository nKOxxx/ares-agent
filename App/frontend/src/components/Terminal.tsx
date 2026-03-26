import { useEffect, useRef } from 'react';
import type { OutputLine } from '../stores/agent';

interface TerminalProps {
  lines: OutputLine[];
}

const typeStyles: Record<string, { text: string; prefix: string }> = {
  text: { text: 'text-[--color-hermes-text]', prefix: '' },
  tool_use: { text: 'text-[--color-hermes-accent]', prefix: '$ ' },
  error: { text: 'text-[--color-hermes-red]', prefix: '! ' },
  system: { text: 'text-[--color-hermes-text-muted]', prefix: '# ' },
  result: { text: 'text-[--color-hermes-green]', prefix: '> ' },
};

export default function Terminal({ lines }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-[#131416] p-3 font-mono text-[12px] leading-5"
    >
      {lines.length === 0 ? (
        <div className="text-[--color-hermes-text-muted] flex items-center h-full">
          <span className="opacity-50">{'>'} Waiting for output...</span>
          <span className="animate-pulse ml-0.5">_</span>
        </div>
      ) : (
        lines.map((line, i) => {
          const style = typeStyles[line.type] || typeStyles.text;
          return (
            <div key={i} className={`${style.text} whitespace-pre-wrap break-all`}>
              {style.prefix && (
                <span className="opacity-50 select-none">{style.prefix}</span>
              )}
              {line.content}
            </div>
          );
        })
      )}
    </div>
  );
}
