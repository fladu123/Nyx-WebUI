import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { chatApi } from './chatApi';
import AutoTextarea from './AutoTextarea';
import MessageContent from './MessageContent';
import OwlIcon from '../../shared/icons/OwlIcon';
import { Download, FileText, ImagePlus, Paperclip, Send, Sigma, Trash2 } from 'lucide-react';

const COMPRESS_THRESHOLD = 30;

// Vision model detection
const VISION_MODELS = ['llava', 'moondream', 'minicpm-v', 'llama3.2-vision', 'bakllava', 'llava-phi3'];
const TOOL_MODELS = ['llama3.1', 'llama3.2', 'llama3.3', 'mistral', 'mixtral', 'qwen2.5', 'command-r'];

// Common LaTeX snippets rendered by KaTeX; cursorBack places the caret inside
// the snippet's first empty {} instead of at the very end.
const MATH_SNIPPETS = [
  { label: '√', insert: '\\sqrt{}', cursorBack: 1, title: 'Square root' },
  { label: 'aⁿ', insert: '^{}', cursorBack: 1, title: 'Superscript' },
  { label: 'aₙ', insert: '_{}', cursorBack: 1, title: 'Subscript' },
  { label: 'a⁄b', insert: '\\frac{}{}', cursorBack: 3, title: 'Fraction' },
  { label: '∑', insert: '\\sum_{}^{}', cursorBack: 4, title: 'Sum' },
  { label: '∫', insert: '\\int_{}^{}', cursorBack: 4, title: 'Integral' },
  { label: 'π', insert: '\\pi', cursorBack: 0, title: 'Pi' },
  { label: '∞', insert: '\\infty', cursorBack: 0, title: 'Infinity' },
  { label: '±', insert: '\\pm', cursorBack: 0, title: 'Plus-minus' },
  { label: '×', insert: '\\times', cursorBack: 0, title: 'Times' },
  { label: '÷', insert: '\\div', cursorBack: 0, title: 'Divide' },
  { label: '≤', insert: '\\leq', cursorBack: 0, title: 'Less or equal' },
  { label: '≥', insert: '\\geq', cursorBack: 0, title: 'Greater or equal' },
  { label: '≠', insert: '\\neq', cursorBack: 0, title: 'Not equal' },
  { label: '≈', insert: '\\approx', cursorBack: 0, title: 'Approximately' },
  { label: 'α', insert: '\\alpha', cursorBack: 0, title: 'Alpha' },
  { label: 'β', insert: '\\beta', cursorBack: 0, title: 'Beta' },
  { label: 'θ', insert: '\\theta', cursorBack: 0, title: 'Theta' },
  { label: '°', insert: '^{\\circ}', cursorBack: 0, title: 'Degree' },
];

export default function ChatView({
  chatId,
  projectSystemPrompt,
  projectFiles,
  chatFiles,
  onChatFileUploaded,
  onChatFileDeleted,
  nodes,
  onTitleUpdate,
  isStandalone,
}) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [nodeInfo, setNodeInfo] = useState('');
  const [responseStats, setResponseStats] = useState({});
  const [images, setImages] = useState([]);
  const [webSearch, setWebSearch] = useState(false);
  const [temperature, setTemperature] = useState(0.8);
  const [showParams, setShowParams] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [showMath, setShowMath] = useState(false);

  const bottomRef = useRef();
  const imgInputRef = useRef();
  const fileInputRef = useRef();
  const textareaRef = useRef(null);

  const isVision = model && VISION_MODELS.some((v) => model.toLowerCase().includes(v));
  const supportsTool = model && TOOL_MODELS.some((v) => model.toLowerCase().includes(v));
  const tooLong = messages.length >= COMPRESS_THRESHOLD;

  // Load messages
  useEffect(() => {
    if (!chatId) return;
    chatApi.getMessages(chatId).then(setMessages).catch(() => {});
  }, [chatId]);

  // Load models
  useEffect(() => {
    chatApi
      .getModels()
      .then((ms) => {
        const names = ms.map((m) => m.name);
        setModels(names);
        if (names.length && !model) setModel(names[0]);
      })
      .catch(() => {});
  }, [nodes, model]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleImagePick = (e) => {
    Array.from(e.target.files || []).forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result.split(',')[1];
        setImages((prev) => [...prev, { b64, preview: ev.target.result, name: f.name }]);
      };
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const handleChatFileUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const fi = await chatApi.uploadChatFile(chatId, f);
      onChatFileUploaded?.(chatId, fi);
      toast('File attached', 'success');
    } catch (error) {
      toast('File upload failed', 'error');
    }
    e.target.value = '';
  };

  const compress = async () => {
    if (!model) return;
    setCompressing(true);
    try {
      const res = await chatApi.compressChat(chatId, model);
      setMessages(res.messages || []);
      toast('Chat compressed', 'success');
    } catch (error) {
      toast('Compression failed', 'error');
    } finally {
      setCompressing(false);
    }
  };

  // Inserts `before` + selection + `after` at the cursor. If nothing is
  // selected, the caret lands `cursorBack` characters before the snippet's end.
  const insertAtCursor = (before, after = '', cursorBack = 0) => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart : input.length;
    const end = el ? el.selectionEnd : input.length;
    const selected = input.slice(start, end);
    const snippet = `${before}${selected}${after}`;
    const next = input.slice(0, start) + snippet + input.slice(end);
    setInput(next);

    const caretPos = selected ? start + snippet.length : start + snippet.length - cursorBack;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caretPos, caretPos);
    });
  };

  const insertMath = (snippet, cursorBack = 0) => insertAtCursor(snippet, '', cursorBack);
  const insertInlineMath = () => insertAtCursor('$', '$', 1);
  const insertBlockMath = () => insertAtCursor('$$\n', '\n$$', 3);

  const send = async () => {
    if (!input.trim() && images.length === 0) return;

    const command = /^(?:\.\/|\/)(compact|titel|title|context)(?:\s+(.+))?\s*$/i.exec(input.trim());
    if (command && images.length === 0) {
      const action = command[1].toLowerCase();
      const argument = command[2]?.trim();
      setInput('');

      if (action === 'compact') {
        if (!model) {
          toast('Select a model before compacting', 'error');
          return;
        }
        await compress();
        return;
      }

      if (action === 'titel' || action === 'title') {
        const source = messages.find((message) => message.role === 'user')?.content;
        if (!argument && (!model || !source)) {
          toast('Add a message or provide a title first', 'error');
          return;
        }
        try {
          const title = argument || (await chatApi.generateTitle(model, source)).title;
          await chatApi.updateChat(chatId, { title });
          onTitleUpdate?.(chatId, title);
          toast('Chat title updated', 'success');
        } catch (error) {
          toast('Failed to update chat title', 'error');
        }
        return;
      }
    }

    if (!model) return;

    const isContextRequest = command?.[1].toLowerCase() === 'context';
    const content = isContextRequest
      ? 'Based only on this conversation and its attached context, summarize what you currently know. State any uncertainty and do not introduce information not present in this chat.'
      : input.trim();
    setInput('');
    const imgs = images.map((i) => i.b64);
    setImages([]);
    setStreaming(true);
    setAwaitingResponse(true);
    setNodeInfo('');

    const history = [...messages];
    const userMsg = { role: 'user', content, ...(imgs.length ? { images: imgs } : {}) };
    const displayMsg = {
      ...userMsg,
      id: Date.now(),
      images: imgs.length ? imgs.map((_, i) => images[i].preview) : undefined,
    };
    if (!isContextRequest) {
      setMessages((prev) => [...prev, displayMsg]);
    }

    // Save user message
    if (!isContextRequest) {
      await chatApi.addMessage(chatId, 'user', content, imgs.length ? imgs : null).catch(() => {});
    }

    // Build context
    const contextMsgs = [];
    if (projectSystemPrompt) {
      contextMsgs.push({ role: 'system', content: projectSystemPrompt });
    }
    const allFiles = [...(projectFiles || []), ...(chatFiles || [])];
    if (allFiles.length) {
      const fileText = allFiles
        .map((f) => `File: ${f.name}\n${f.content || ''}`)
        .join('\n\n---\n\n');
      contextMsgs.push({ role: 'system', content: `Context files:\n\n${fileText}` });
    }

    const allMsgs = [...contextMsgs, ...history.map((m) => ({ role: m.role, content: m.content })), userMsg];

    const payload = {
      model,
      messages: allMsgs,
      options: { temperature },
      ...(webSearch && supportsTool
        ? {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'web_search',
                  description: 'Search the web',
                  parameters: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let responseDuration = 0;
    let responseNode = '';
    const responseStartedAt = Date.now();
    try {
      for await (const obj of chatApi.streamChat(payload)) {
        if (obj.node) {
          setNodeInfo(obj.node);
          responseNode = obj.node;
          continue;
        }

        const piece = obj.message?.content || '';
        if (piece) {
          setAwaitingResponse(false);
          fullText += piece;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
          );
        }

        if (obj.prompt_eval_count !== undefined || obj.eval_count !== undefined) {
          promptTokens = obj.prompt_eval_count || 0;
          completionTokens = obj.eval_count || 0;
        }
        if (obj.done) {
          responseDuration = Date.now() - responseStartedAt;
        }
      }
    } catch (error) {
      toast(`Streaming error: ${error.message}`, 'error');
      console.error('Stream error:', error);
    }

    setAwaitingResponse(false);
    setStreaming(false);

    // Save assistant message
    if (fullText) {
      setResponseStats((previous) => ({
        ...previous,
        [assistantId]: {
          promptTokens,
          completionTokens,
          durationMs: responseDuration || Date.now() - responseStartedAt,
          node: responseNode,
        },
      }));
      await chatApi.addMessage(chatId, 'assistant', fullText).catch(() => {});
    }

    // Generate title for new chats
    if (history.length === 0 && fullText) {
      try {
        const titleRes = await chatApi.generateTitle(model, content);
        await chatApi.updateChat(chatId, { title: titleRes.title });
        onTitleUpdate?.(chatId, titleRes.title);
      } catch {
        // Title generation failed, continue
      }
    }
  };

  const deleteMsg = async (id) => {
    await chatApi.deleteMessage(chatId, id).catch(() => {});
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const saveAsDocument = async (content_text) => {
    const title = content_text.split('\n')[0].slice(0, 60) || 'From chat';
    try {
      await chatApi.saveDocument(title, content_text);
      toast('Saved to Documents', 'success');
    } catch (error) {
      toast('Failed to save', 'error');
    }
  };

  return (
    <div className="chat-wrap">
      <div className="chat-toolbar">
        <select className="input" style={{ maxWidth: 200 }} value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {supportsTool && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Web search
          </label>
        )}

        <button className="btn btn-ghost btn-sm" onClick={() => setShowParams((p) => !p)}>
          Parameters
        </button>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const md = messages.map((m) => `**${m.role === 'user' ? 'You' : 'Nyx'}**\n\n${m.content}`).join('\n\n---\n\n');
            const blob = new Blob([md], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'chat.md';
            a.click();
          }}
        >
          <Download size={14} /> Export
        </button>
      </div>

      {showParams && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--night-3)',
            background: 'var(--night-2)',
            display: 'flex',
            gap: 24,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Temperature: {temperature.toFixed(2)}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: 120 }}
            />
          </label>
        </div>
      )}

      {tooLong && (
        <div className="compress-banner">
          <span className="compress-text">
            This chat is getting long ({messages.length} messages). Compressing will summarise older messages to free up context.
          </span>
          <button
            className="btn btn-sm"
            style={{
              borderColor: 'rgba(251,191,36,0.4)',
              color: 'var(--amber)',
              background: 'transparent',
              flexShrink: 0,
            }}
            onClick={compress}
            disabled={compressing || !model}
          >
            {compressing ? <span className="spinner" /> : 'Compress'}
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div>Start a conversation</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id || i} className="msg">
            <div className={`msg-role ${msg.role}`}>
              {msg.role === 'user' ? 'You' : <OwlIcon size={14} />}
            </div>

            {msg.images && msg.images.map((src, j) => (
              <img
                key={j}
                src={src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`}
                style={{ maxWidth: 240, borderRadius: 8, marginBottom: 4 }}
                alt="attachment"
              />
            ))}

            <MessageContent
              content={msg.content}
              streaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
            />

            {streaming && awaitingResponse && i === messages.length - 1 && msg.role === 'assistant' && (
              <div className="assistant-waiting" role="status">
                <span className="ollama-loader" aria-hidden="true" />
                <span>
                  {nodeInfo ? `Loading ${model} on ${nodeInfo}...` : `Preparing ${model}...`}
                </span>
              </div>
            )}

            {!streaming && msg.role === 'assistant' && responseStats[msg.id] && (
              <div className="msg-meta">
                {responseStats[msg.id].node && <span>{responseStats[msg.id].node}</span>}
                <span>{responseStats[msg.id].promptTokens} prompt tokens</span>
                <span>{responseStats[msg.id].completionTokens} completion tokens</span>
                <span>{(responseStats[msg.id].durationMs / 1000).toFixed(1)}s</span>
              </div>
            )}

            {!streaming && msg.role === 'assistant' && (
              <div className="msg-delete" style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => saveAsDocument(msg.content)}
                  title="Save to Documents"
                >
                  Save as doc
                </button>
                <button className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={() => deleteMsg(msg.id)} title="Delete message" aria-label="Delete message">
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            {!streaming && msg.role === 'user' && (
              <div className="msg-delete">
                <button className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={() => deleteMsg(msg.id)} title="Delete message" aria-label="Delete message">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={img.preview} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} alt="preview" />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'var(--red)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {isStandalone && chatFiles && chatFiles.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {chatFiles.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--night-3)', borderRadius: 6, fontSize: 11, color: 'var(--text-1)' }}>
                <FileText size={13} aria-hidden="true" /> {f.name}
                <button
                  onClick={() => onChatFileDeleted?.(chatId, f.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, lineHeight: 1, padding: 0, marginLeft: 2 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {showMath && (
          <div className="math-panel">
            <div className="math-panel-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={insertInlineMath}>
                $x$ inline
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={insertBlockMath}>
                $$x$$ block
              </button>
            </div>
            <div className="math-panel-grid">
              {MATH_SNIPPETS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="math-key"
                  title={s.title}
                  onClick={() => insertMath(s.insert, s.cursorBack)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-input-box">
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${showMath ? 'active' : ''}`}
            style={{ padding: '4px' }}
            onClick={() => setShowMath((v) => !v)}
            title="Math input"
            aria-label="Math input"
          >
            <Sigma size={16} />
          </button>

          {isVision && (
            <>
              <input
                type="file"
                ref={imgInputRef}
                accept="image/*"
                multiple
                onChange={handleImagePick}
                style={{ display: 'none' }}
              />
              <button className="btn btn-ghost btn-icon" style={{ padding: '4px' }} onClick={() => imgInputRef.current?.click()} aria-label="Attach image" title="Attach image">
                <ImagePlus size={16} />
              </button>
            </>
          )}

          {isStandalone && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={handleChatFileUpload}
                style={{ display: 'none' }}
              />
              <button className="btn btn-ghost btn-icon" style={{ padding: '4px' }} title="Attach file" onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={16} />
              </button>
            </>
          )}

          <AutoTextarea
            ref={textareaRef}
            value={input}
            onChange={setInput}
            placeholder="Message"
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />

          <button className="send-btn" onClick={send} disabled={streaming || (!input.trim() && images.length === 0)} title="Send message" aria-label="Send message">
            {streaming ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Send size={16} />}
          </button>
        </div>

        <div className="chat-input-hints">
          <span>Enter to send · Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
