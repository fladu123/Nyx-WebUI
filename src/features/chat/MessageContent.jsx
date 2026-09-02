import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { BrainCircuit } from 'lucide-react';
import 'katex/dist/katex.min.css';

export default function MessageContent({ content, streaming }) {
  const [thinkOpen, setThinkOpen] = useState(true);

  if (!content) return null;

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let thinkMatch;
  const thinkBlocks = [];
  while ((thinkMatch = thinkRegex.exec(content)) !== null) {
    thinkBlocks.push(thinkMatch[1]);
  }

  const displayContent = content.replace(/<think>[\s\S]*?<\/think>/g, '');

  return (
    <>
      {thinkBlocks.length > 0 && (
        <div className="think-block">
          <div className="think-header" onClick={() => setThinkOpen(!thinkOpen)}>
            <span className="think-label"><BrainCircuit size={14} /> Reasoning</span>
          </div>
          {thinkOpen && <div className="think-body">{thinkBlocks.join('\n')}</div>}
        </div>
      )}

      <div className="msg-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            pre: ({ children }) => <>{children}</>,
            code: ({ className, children, ...props }) => {
              const language = /language-(\w+)/.exec(className || '')?.[1];
              const code = String(children).replace(/\n$/, '');
              return language || code.includes('\n')
                ? <CodeBlock lang={language || 'plain'} code={code} />
                : <code className={className} {...props}>{children}</code>;
            },
            a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
          }}
        >
          {displayContent}
        </ReactMarkdown>
        {streaming && <span style={{ color: 'var(--accent)' }}>▌</span>}
      </div>
    </>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang}</span>
        <button
          className={`copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-body">{code}</div>
    </div>
  );
}
