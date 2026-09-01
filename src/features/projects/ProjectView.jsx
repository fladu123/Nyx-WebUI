import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import ChatView from '../chat/ChatView';
import { projectApi } from './projectApi';
import { FileText } from 'lucide-react';

export default function ProjectView({ project, nodes, onUpdate }) {
  const toast = useToast();
  const [tab, setTab] = useState('chat');
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [files, setFiles] = useState([]);
  const [name, setName] = useState(project.name);
  const [sysPrompt, setSysPrompt] = useState(project.system_prompt || '');
  const fileInputRef = useRef();

  // Load chats and files
  useEffect(() => {
    if (!project.id) return;

    Promise.all([
      projectApi.getProjectChats(project.id).then(setChats).catch(() => setChats([])),
      projectApi.getProjectFiles(project.id).then(setFiles).catch(() => setFiles([])),
    ]).then(() => {
      // Auto-select first chat if exists
      if (chats.length && !activeChatId) {
        setActiveChatId(chats[0].id);
      }
    });
  }, [project.id, activeChatId]);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const newChat = async () => {
    try {
      const created = await projectApi.createProjectChat(project.id);
      setChats((prev) => [created, ...prev]);
      setActiveChatId(created.id);
      setTab('chat');
      toast('Chat created', 'success');
    } catch (error) {
      toast('Failed to create chat', 'error');
    }
  };

  const deleteChat = async (chatId, event) => {
    event.stopPropagation();
    if (!confirm('Delete this chat?')) return;

    try {
      await projectApi.deleteProjectChat(chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        const remaining = chats.find((c) => c.id !== chatId);
        setActiveChatId(remaining?.id || null);
      }
      toast('Chat deleted', 'success');
    } catch (error) {
      toast('Failed to delete chat', 'error');
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const uploaded = await projectApi.uploadProjectFile(project.id, file);
      setFiles((prev) => [uploaded, ...prev]);
      toast('File uploaded', 'success');
    } catch (error) {
      toast('File upload failed', 'error');
    }

    event.target.value = '';
  };

  const deleteFile = async (fileId) => {
    try {
      await projectApi.deleteProjectFile(project.id, fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast('File deleted', 'success');
    } catch (error) {
      toast('Failed to delete file', 'error');
    }
  };

  const saveSettings = async () => {
    try {
      const updated = await projectApi.updateProject(project.id, {
        name,
        system_prompt: sysPrompt,
      });
      onUpdate(updated);
      toast('Project saved', 'success');
    } catch (error) {
      toast('Failed to save project', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left sidebar with tabs */}
      <div style={{ width: 200, background: 'var(--night-2)', borderRight: '1px solid var(--night-3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab buttons */}
        <div style={{ padding: '10px 8px', borderBottom: '1px solid var(--night-3)' }}>
          <div className="tabs" style={{ flex: 1, marginBottom: 0, borderBottom: 'none' }}>
            <div className={`tab ${tab === 'chat' ? 'active' : ''}`} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setTab('chat')}>
              Chats
            </div>
            <div className={`tab ${tab === 'files' ? 'active' : ''}`} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setTab('files')}>
              Files
            </div>
            <div className={`tab ${tab === 'settings' ? 'active' : ''}`} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setTab('settings')}>
              Settings
            </div>
          </div>
        </div>

        {/* Chats tab */}
        {tab === 'chat' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 8px 4px' }}>
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={newChat}>
                + New chat
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {chats.map((c) => (
                <div
                  key={c.id}
                  className={`nav-item ${c.id === activeChatId ? 'active' : ''}`}
                  onClick={() => setActiveChatId(c.id)}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {c.title || 'Untitled'}
                  </span>
                  <div className="nav-item-actions">
                    <button className="nav-icon-btn" onClick={(e) => deleteChat(c.id, e)}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {chats.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 4px' }}>No chats yet</div>}
            </div>
          </div>
        )}

        {/* Files tab */}
        {tab === 'files' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={uploadFile}
              style={{ display: 'none' }}
              accept=".pdf,.docx,.txt,.md,.csv"
            />
            <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => fileInputRef.current?.click()}>
              + Upload file
            </button>
            {files.map((f) => (
              <div key={f.id} className="list-item" style={{ padding: '8px 10px', marginBottom: 6 }}>
                <FileText size={15} aria-hidden="true" />
                <span className="list-item-name" style={{ fontSize: 12 }}>
                  {f.name}
                </span>
                <button className="nav-icon-btn btn-danger" onClick={() => deleteFile(f.id)}>
                  ×
                </button>
              </div>
            ))}
            {files.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 4px' }}>No files yet</div>}
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            <div className="field">
              <div className="input-label">Project name</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <div className="input-label">System prompt</div>
              <textarea
                className="input"
                value={sysPrompt}
                onChange={(e) => setSysPrompt(e.target.value)}
                rows={5}
                placeholder="You are a helpful assistant..."
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveSettings} style={{ width: '100%' }}>
              Save
            </button>
          </div>
        )}
      </div>

      {/* Right side - chat or empty state */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'chat' && activeChatId && activeChat ? (
          <ChatView
            chatId={activeChatId}
            projectSystemPrompt={sysPrompt}
            projectFiles={files}
            chatFiles={[]}
            onChatFileUploaded={() => {}}
            onChatFileDeleted={() => {}}
            nodes={nodes}
            onTitleUpdate={(cid, title) => {
              setChats((prev) => prev.map((c) => (c.id === cid ? { ...c, title } : c)));
            }}
            isStandalone={false}
          />
        ) : tab === 'chat' ? (
          <div className="empty" style={{ flex: 1 }}>
            <div className="empty-icon">◎</div>
            <div>Create a chat to get started</div>
            <button className="btn btn-primary btn-sm" onClick={newChat}>
              + New chat
            </button>
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>
    </div>
  );
}
