import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { adminApi } from './adminApi';
import { LockKeyhole, Shield, UserRound } from 'lucide-react';

export default function AdminPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  // Load data
  useEffect(() => {
    adminApi.getPendingUsers().then(setPending).catch(() => setPending([]));
    adminApi.getAllUsers().then(setUsers).catch(() => setUsers([]));
    adminApi.getAuditLog().then(setAuditLog).catch(() => setAuditLog([]));
  }, []);

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-icon"><LockKeyhole size={24} /></div>
          <div>Admin access required</div>
        </div>
      </div>
    );
  }

  const approveUser = async (userId) => {
    try {
      await adminApi.approveUser(userId);
      setPending((prev) => prev.filter((u) => u.id !== userId));
      toast('User approved', 'success');
    } catch (error) {
      toast('Failed to approve user', 'error');
    }
  };

  const rejectUser = async (userId) => {
    if (!confirm('Reject this user?')) return;
    try {
      await adminApi.rejectUser(userId);
      setPending((prev) => prev.filter((u) => u.id !== userId));
      toast('User rejected', 'success');
    } catch (error) {
      toast('Failed to reject user', 'error');
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm('Permanently delete this user?')) return;
    try {
      await adminApi.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast('User deleted', 'success');
    } catch (error) {
      toast('Failed to delete user', 'error');
    }
  };

  const toggleRole = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await adminApi.updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast(`User role changed to ${newRole}`, 'success');
    } catch (error) {
      toast('Failed to update role', 'error');
    }
  };

  const resetPassword = async (userId) => {
    if (!confirm('Reset password for this user?')) return;
    try {
      await adminApi.resetUserPassword(userId);
      toast('Password reset link sent', 'success');
    } catch (error) {
      toast('Failed to reset password', 'error');
    }
  };

  const revokeAccess = async (userId) => {
    if (!confirm('Revoke access for this user?')) return;
    try {
      await adminApi.revokeUserAccess(userId);
      toast('Access revoked', 'success');
    } catch (error) {
      toast('Failed to revoke access', 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Admin</div>
        <div className="page-desc">Manage users and view audit log</div>
      </div>

      {/* Tabs */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--night-3)', display: 'flex', gap: 0 }}>
        <button
          className={`tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
          style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative' }}
        >
          Pending {pending.length > 0 && <span style={{ display: 'inline-block', background: 'var(--red)', width: 18, height: 18, borderRadius: 9, fontSize: 11, lineHeight: '18px', marginLeft: 6 }}>{pending.length}</span>}
        </button>
        <button
          className={`tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
          style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          Users ({users.length})
        </button>
        <button
          className={`tab ${tab === 'audit' ? 'active' : ''}`}
          onClick={() => setTab('audit')}
          style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          Audit Log
        </button>
      </div>

      {/* Pending users */}
      {tab === 'pending' && (
        <div className="section">
          {pending.length === 0 && <div className="empty">No pending users</div>}

          {pending.map((user) => (
            <div key={user.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{user.username}</div>
                <div className="list-item-meta">{user.email}</div>
              </div>
              <div className="list-item-actions">
                <button className="btn btn-sm btn-primary" onClick={() => approveUser(user.id)}>
                  Approve
                </button>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => rejectUser(user.id)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All users */}
      {tab === 'users' && (
        <div className="section">
          {users.length === 0 && <div className="empty">No users</div>}

          {users.map((user) => (
            <div key={user.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{user.username}</div>
                <div className="list-item-meta">{user.email} · Role: {user.role}</div>
              </div>
              <div className="list-item-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => toggleRole(user.id, user.role)}
                  title={`Make ${user.role === 'admin' ? 'user' : 'admin'}`}
                  aria-label={`Make ${user.role === 'admin' ? 'user' : 'admin'}`}
                >
                  {user.role === 'admin' ? <UserRound size={15} /> : <Shield size={15} />}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => resetPassword(user.id)}>
                  Reset pwd
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => revokeAccess(user.id)}>
                  Revoke
                </button>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => deleteUser(user.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audit log */}
      {tab === 'audit' && (
        <div className="section">
          {auditLog.length === 0 && <div className="empty">No audit log entries</div>}

          {auditLog.map((entry, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: i < auditLog.length - 1 ? '1px solid var(--night-3)' : 'none' }}>
              <div style={{ fontSize: 12, color: 'var(--text-1)' }}>
                <strong>{entry.username}</strong> {entry.action}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                {new Date(entry.created_at).toLocaleString()}
              </div>
              {entry.detail && (
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                  {entry.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
