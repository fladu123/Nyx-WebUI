import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { documentApi } from './documentApi';

const MARKDOWN_PREVIEW_REGEX = /\n(?=#+\s)/;

function MarkdownPreview({ content }) {
  // Very simple markdown preview
  const lines = content.split('\n');
  return (
    <div style={{ padding: '20px 28px', fontSize: 14, lineHeight: 1.7, color: 'var(--text-0)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) {
          return (
            <h1 key={i} style={{ fontSize: 28, fontWeight: 600, marginTop: 20, marginBottom: 10 }}>
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={i} style={{ fontSize: 22, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} style={{ fontSize: 18, fontWeight: 500, marginTop: 12, marginBottom: 6 }}>
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <li key={i} style={{ marginLeft: 20 }}>
              {line.slice(2)}
            </li>
          );
        }
        if (line.trim() === '') {
          return <div key={i} style={{ height: 8 }} />;
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

export default function DocumentsPage() {
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  // Load documents
  useEffect(() => {
    documentApi.getDocuments().then(setDocs).catch(() => {});
  }, []);

  const openDoc = async (id) => {
    try {
      const doc = await documentApi.getDocument(id);
      setDoc(doc);
      setActiveId(id);
      setTitle(doc.title);
      setContent(doc.content);
    } catch (error) {
      toast('Failed to load document', 'error');
    }
  };

  const newDoc = async () => {
    try {
      const newDoc = await documentApi.createDocument('Untitled', '');
      setDocs((prev) => [newDoc, ...prev]);
      await openDoc(newDoc.id);
    } catch (error) {
      toast('Failed to create document', 'error');
    }
  };

  const save = async (t, c) => {
    if (!activeId) return;
    setSaving(true);
    try {
      await documentApi.updateDocument(activeId, t, c);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeId ? { ...d, title: t, updated_at: new Date().toISOString() } : d
        )
      );
    } catch (error) {
      toast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const onTitleChange = (value) => {
    setTitle(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(value, content), 800);
  };

  const onContentChange = (value) => {
    setContent(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(title, value), 800);
  };

  const deleteDoc = async (id, event) => {
    event.stopPropagation();
    if (!confirm('Delete this document?')) return;

    try {
      await documentApi.deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setDoc(null);
        setTitle('');
        setContent('');
      }
      toast('Document deleted', 'success');
    } catch (error) {
      toast('Failed to delete document', 'error');
    }
  };

  const exportDoc = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || 'document'}.md`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          background: 'var(--night-2)',
          borderRight: '1px solid var(--night-3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 10px',
            borderBottom: '1px solid var(--night-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>Documents</span>
          <button className="nav-icon-btn" onClick={newDoc} title="New document">
            +
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {docs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 4px' }}>No documents yet</div>}
          {docs.map((d) => (
            <div
              key={d.id}
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                marginBottom: 4,
                background: d.id === activeId ? 'var(--accent-bg)' : 'transparent',
                border: d.id === activeId ? '1px solid var(--accent)' : 'none',
              }}
              onClick={() => openDoc(d.id)}
            >
              <div style={{ fontSize: 12, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.title || 'Untitled'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {new Date(d.updated_at).toLocaleDateString()}
              </div>
              {d.id === activeId && (
                <button
                  className="nav-icon-btn btn-danger"
                  onClick={(e) => deleteDoc(d.id, e)}
                  style={{ opacity: 0.5, float: 'right', marginTop: -20 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      {doc ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--night-3)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--night-1)' }}>
            <input
              style={{
                flex: 1,
                fontSize: 14,
                fontWeight: 500,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-0)',
                outline: 'none',
              }}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled"
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 80 }}>
              {saving ? 'Saving...' : 'Saved'}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview((p) => !p)}>
              {preview ? 'Edit' : 'Preview'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportDoc}>
              ⬇ Export
            </button>
          </div>

          {/* Editor/Preview */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {!preview && (
              <textarea
                style={{
                  flex: 1,
                  resize: 'none',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  fontFamily: 'var(--font)',
                  padding: '20px 28px',
                  outline: 'none',
                  color: 'var(--text-0)',
                }}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="Start writing... Supports Markdown."
                spellCheck
              />
            )}
            {preview && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <MarkdownPreview content={content} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty" style={{ flex: 1 }}>
          <div className="empty-icon">◎</div>
          <div>Select a document or create one</div>
          <button className="btn btn-primary btn-sm" onClick={newDoc}>
            + New document
          </button>
        </div>
      )}
    </div>
  );
}
