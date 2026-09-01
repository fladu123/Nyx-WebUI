import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { modelCatalogue, modelsApi } from './modelsApi';

export default function ModelsPage({ nodes }) {
  const toast = useToast();
  const [nodeId, setNodeId] = useState(nodes?.[0]?.id || '');
  const [installed, setInstalled] = useState([]);
  const [catalogue] = useState(modelCatalogue);
  const [tab, setTab] = useState('installed');
  const [pulling, setPulling] = useState(null);
  const [pullProgress, setPullProgress] = useState({});
  const [customModel, setCustomModel] = useState('');
  // Load installed models
  useEffect(() => {
    if (!nodeId) return;
    modelsApi.getInstalledModels(nodeId).then(setInstalled).catch(() => setInstalled([]));
  }, [nodeId]);

  const pullModel = async (modelName, source = 'catalogue') => {
    if (!nodeId) {
      toast('Select a node first', 'error');
      return;
    }

    setPulling(modelName);
    setPullProgress((prev) => ({ ...prev, [modelName]: { percent: 0, speed: 0 } }));

    try {
      for await (const progress of modelsApi.pullModel(nodeId, modelName)) {
        const percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
        setPullProgress((prev) => ({
          ...prev,
          [modelName]: { percent, speed: progress.status || 'Preparing...' },
        }));
      }
      const updated = await modelsApi.getInstalledModels(nodeId);
      setInstalled(updated);
      toast('Model pulled successfully', 'success');
      setPulling(null);
    } catch (error) {
      toast(`Failed to pull ${modelName}`, 'error');
      setPulling(null);
    }
  };

  const removeModel = async (modelName) => {
    if (!confirm(`Remove ${modelName}?`)) return;

    try {
      await modelsApi.removeModel(nodeId, modelName);
      setInstalled((prev) => prev.filter((m) => m.name !== modelName));
      toast('Model removed', 'success');
    } catch (error) {
      toast('Failed to remove model', 'error');
    }
  };

  const handleCustomPull = async (e) => {
    e.preventDefault();
    if (!customModel.trim()) {
      toast('Enter a model name', 'error');
      return;
    }
    await pullModel(customModel.trim(), 'custom');
    setCustomModel('');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Models</div>
        <div className="page-desc">Manage installed models on your Ollama nodes</div>
      </div>

      {/* Node selector */}
      <div className="section">
        <div className="input-label">Select node</div>
        <select className="input" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          {nodes?.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--night-3)', display: 'flex', gap: 0 }}>
        <button
          className={`tab ${tab === 'installed' ? 'active' : ''}`}
          onClick={() => setTab('installed')}
          style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          Installed ({installed.length})
        </button>
        <button
          className={`tab ${tab === 'catalogue' ? 'active' : ''}`}
          onClick={() => setTab('catalogue')}
          style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          Catalogue
        </button>
        <button
          className={`tab ${tab === 'custom' ? 'active' : ''}`}
          onClick={() => setTab('custom')}
          style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          Custom
        </button>
      </div>

      {/* Installed models */}
      {tab === 'installed' && (
        <div className="section">
          {installed.length === 0 && <div className="empty">No models installed</div>}

          {installed.map((model) => (
            <div key={model.name} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{model.name}</div>
                <div className="list-item-meta">{model.size} · {model.digest?.slice(0, 12)}</div>
              </div>
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => removeModel(model.name)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Catalogue */}
      {tab === 'catalogue' && (
        <div className="section">
          {catalogue.length === 0 && <div className="empty">Loading catalogue...</div>}

          {catalogue.map((model) => {
            const isInstalled = installed.some((m) => m.name === model.name);
            const isPulling = pulling === model.name;
            const progress = pullProgress[model.name];

            return (
              <div key={model.name} className="list-item">
                <div style={{ flex: 1 }}>
                  <div className="list-item-name">{model.name}</div>
                  <div className="list-item-meta">{model.description || 'No description'}</div>

                  {isPulling && progress && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
                        {progress.percent}% · {progress.speed}
                      </div>
                      <div
                        style={{
                          height: 4,
                          background: 'var(--night-3)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            background: 'var(--accent)',
                            width: `${progress.percent}%`,
                            transition: 'width 0.1s',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {isInstalled ? (
                  <span className="badge badge-muted">Installed</span>
                ) : (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => pullModel(model.name)}
                    disabled={pulling !== null}
                  >
                    {isPulling ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Pull'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Custom pull */}
      {tab === 'custom' && (
        <div className="section">
          <div className="page-desc" style={{ marginBottom: 16 }}>
            Pull a model by name from any registry. For example: <code>mistral:latest</code>, <code>llava</code>, etc.
          </div>

          <form onSubmit={handleCustomPull} style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="e.g., neural-chat:latest"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={pulling !== null}>
              {pulling ? 'Pulling...' : 'Pull'}
            </button>
          </form>

          {customModel && (
            <div style={{ marginTop: 16 }}>
              <div className="page-desc">Will be available after pull completes.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
