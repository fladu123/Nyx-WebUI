import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { nodesApi } from './nodesApi';
import { ScanSearch } from 'lucide-react';

export default function NodesPage({ nodes, onRefresh }) {
  const toast = useToast();
  const [probed, setProbed] = useState([]);
  const [probing, setProbing] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', priority: 2, mode: 'failover' });
  const [scanning, setScanning] = useState(false);
  const [scanSubnet, setScanSubnet] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const [addingIp, setAddingIp] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', priority: 1, mode: 'failover' });

  // Auto-probe on load
  useEffect(() => {
    probe();
  }, [nodes.length]);

  const probe = async () => {
    setProbing(true);
    try {
      const result = await nodesApi.probeAll();
      setProbed(result || []);
    } catch (error) {
      console.error('Probe failed:', error);
    } finally {
      setProbing(false);
    }
  };

  const addNode = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      toast('Please fill all fields', 'error');
      return;
    }

    try {
      await nodesApi.addNode(form.name, form.url, form.priority, form.mode);
      setForm({ name: '', url: '', priority: 2, mode: 'failover' });
      onRefresh();
      toast('Node added', 'success');
    } catch (error) {
      toast('Failed to add node', 'error');
    }
  };

  const toggleNode = async (node) => {
    try {
      await nodesApi.updateNode(node.id, { enabled: !node.enabled });
      onRefresh();
    } catch (error) {
      toast('Failed to update node', 'error');
    }
  };

  const startEdit = (node) => {
    setEditingId(node.id);
    setEditForm({ name: node.name, priority: node.priority, mode: node.mode });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (nodeId) => {
    if (!editForm.name.trim()) {
      toast('Name cannot be empty', 'error');
      return;
    }
    try {
      await nodesApi.updateNode(nodeId, {
        name: editForm.name.trim(),
        priority: Number(editForm.priority),
        mode: editForm.mode,
      });
      setEditingId(null);
      onRefresh();
      toast('Node updated', 'success');
    } catch (error) {
      toast('Failed to update node', 'error');
    }
  };

  const removeNode = async (id) => {
    if (!confirm('Remove this node?')) return;
    try {
      await nodesApi.deleteNode(id);
      onRefresh();
      toast('Node removed', 'success');
    } catch (error) {
      toast('Failed to remove node', 'error');
    }
  };

  const scanNetwork = async () => {
    setScanning(true);
    setScanResults(null);
    try {
      const res = await nodesApi.scanNetwork(scanSubnet);
      setScanResults(res);
      toast(
        res.found.length > 0
          ? `Found ${res.found.length} Ollama node(s) on ${res.subnet}`
          : `No Ollama instances found on ${res.subnet}`,
        res.found.length > 0 ? 'success' : 'error'
      );
    } catch (error) {
      toast('Scan failed — check the subnet is valid and reachable', 'error');
    } finally {
      setScanning(false);
    }
  };

  const quickAddNode = async (result) => {
    setAddingIp(result.ip);
    try {
      await nodesApi.addNode(`Ollama (${result.ip})`, result.url, 2, 'failover');
      onRefresh();
      toast(`Added ${result.ip}`, 'success');
    } catch (error) {
      toast('Could not add node', 'error');
    } finally {
      setAddingIp(null);
    }
  };

  const probedMap = Object.fromEntries((probed || []).map((p) => [p.id, p]));
  const knownUrls = new Set(nodes.map((n) => n.url.replace(/\/$/, '')));

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Nodes</div>
        <div className="page-desc">Configure Ollama instances. Failover uses priority order. Load balance distributes round-robin.</div>
      </div>

      {/* Connected nodes */}
      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="section-title">Connected nodes</div>
          <button className="btn btn-ghost btn-sm" onClick={probe} disabled={probing}>
            {probing ? <span className="spinner" /> : '↻'} Refresh
          </button>
        </div>

        {nodes.map((node) => {
          const p = probedMap[node.id] || {};
          const isEditing = editingId === node.id;
          return (
            <div key={node.id} className={`list-item ${!p.online ? 'offline' : ''}`} style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className={`node-dot ${p.online ? 'online' : 'offline'}`} />
              <div style={{ flex: 1, minWidth: 200 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      style={{ maxWidth: 180 }}
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={99}
                      style={{ maxWidth: 80 }}
                      value={editForm.priority}
                      onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                    />
                    <select
                      className="input"
                      style={{ maxWidth: 140 }}
                      value={editForm.mode}
                      onChange={(e) => setEditForm((f) => ({ ...f, mode: e.target.value }))}
                    >
                      <option value="failover">Failover</option>
                      <option value="loadbalance">Load balance</option>
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="list-item-name">{node.name}</div>
                    <div className="list-item-meta">
                      {node.url} · priority {node.priority} · {node.mode}
                    </div>
                    {p.online && (
                      <div className="list-item-meta" style={{ marginTop: 2 }}>
                        {p.latency_ms}ms · {(p.models || []).join(', ') || 'no models'}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="list-item-actions">
                {isEditing ? (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => saveEdit(node.id)}>
                      Save
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={`toggle ${node.enabled ? 'on' : ''}`}
                      onClick={() => toggleNode(node)}
                      style={{ marginRight: 8 }}
                      title="Toggle node"
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(node)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost btn-sm btn-danger" onClick={() => removeNode(node.id)}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {nodes.length === 0 && <div className="empty">No nodes configured</div>}
      </div>

      {/* Network scan */}
      <div className="section">
        <div className="section-title">Scan network</div>
        <div className="page-desc" style={{ marginBottom: 12 }}>
          Sweeps a subnet for anything answering on port 11434 and confirms it's Ollama. Leave blank to auto-detect your /24.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="192.168.1.0/24 (auto if blank)"
            value={scanSubnet}
            onChange={(e) => setScanSubnet(e.target.value)}
          />
          <button className="btn btn-primary" onClick={scanNetwork} disabled={scanning}>
            {scanning ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <ScanSearch size={14} />} {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        {scanResults && (
          <div>
            <div className="page-desc" style={{ marginBottom: 8 }}>
              Scanned {scanResults.scanned} addresses on {scanResults.subnet}
            </div>

            {scanResults.found.length === 0 && (
              <div className="empty" style={{ padding: '20px 0' }}>
                No Ollama instances found
              </div>
            )}

            {scanResults.found.map((result) => {
              const already = knownUrls.has(result.url.replace(/\/$/, ''));
              return (
                <div key={result.ip} className="list-item">
                  <div className="node-dot online" />
                  <div style={{ flex: 1 }}>
                    <div className="list-item-name">
                      {result.ip}:{result.port}
                    </div>
                    <div className="list-item-meta">{(result.models || []).join(', ') || 'no models installed'}</div>
                  </div>
                  {already ? (
                    <span className="badge badge-muted">Already added</span>
                  ) : (
                    <button className="btn btn-sm btn-primary" disabled={addingIp === result.ip} onClick={() => quickAddNode(result)}>
                      {addingIp === result.ip ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Add'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add manually */}
      <div className="section">
        <div className="section-title">Add node manually</div>
        <form onSubmit={addNode} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <div className="input-label">Name</div>
            <input
              className="input"
              placeholder="Server 2 — RX 5700 XT"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="field">
            <div className="input-label">URL</div>
            <input
              className="input"
              placeholder="http://192.168.1.X:11434"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </div>

          <div className="field">
            <div className="input-label">Priority</div>
            <input
              className="input"
              type="number"
              min={1}
              max={99}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) }))}
            />
          </div>

          <div className="field">
            <div className="input-label">Mode</div>
            <select className="input" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
              <option value="failover">Failover</option>
              <option value="loadbalance">Load balance</option>
            </select>
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <button className="btn btn-primary" type="submit">
              + Add node
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
