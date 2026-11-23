import { Children } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Tag from '../common/Tag';

const TOKEN = /(\[[A-Z_]+\])/g;
const IS_TOKEN = /^\[[A-Z_]+\]$/;

// Turns [API_KEY] inside plain text into the outlined chip
function chips(children) {
  return Children.map(children, (child) =>
    typeof child === 'string'
      ? child.split(TOKEN).map((part, i) =>
          IS_TOKEN.test(part) ? <Tag key={i}>{part.slice(1, -1)}</Tag> : part
        )
      : child
  );
}

const components = {
  p: ({ children }) => <p className="mb-3 mt-0 last:mb-0">{chips(children)}</p>,
  h1: ({ children }) => <h2 className="mb-2 mt-5 font-ui text-base font-semibold first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mb-2 mt-5 font-ui text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-4 font-ui text-sm font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-faint">{children}</ol>,
  li: ({ children }) => <li>{chips(children)}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="underline decoration-crimson underline-offset-2 hover:text-white">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-crimson pl-4 text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-0 border-t border-line" />,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-line">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line bg-raised px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-t border-line px-3 py-2 align-top">{chips(children)}</td>,
};

export default function Markdown({ text }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        disallowedElements={['img']}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}