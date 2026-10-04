import { useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api';

const ST = ['Open', 'In Progress', 'Closed'];
const cls = s => (s === 'In Progress' ? 'IP' : s);

export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem('user')); } catch { return null; } });
  useEffect(() => { if (getToken()) api('/me').then(u => { sessionStorage.setItem('user', JSON.stringify(u)); setUser(u); }).catch(() => {}); }, []);
  const login = ({ token, user }) => { setToken(token); sessionStorage.setItem('user', JSON.stringify(user)); setUser(user); };
  const logout = () => { setToken(null); sessionStorage.removeItem('user'); setUser(null); };
  return user && getToken() ? <Main user={user} onLogout={logout} /> : <Auth onAuth={login} />;
}

function Auth({ onAuth }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr('');
    try { onAuth(await api(reg ? '/auth/register' : '/auth/login', 'POST', f)); } catch (x) { setErr(x.message); }
  };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card auth" onSubmit={submit}>
      <h1>Issue Tracker</h1>
      {reg && <label>Name<input value={f.name} onChange={set('name')} /></label>}
      <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
      <label>Password<input type="password" value={f.password} onChange={set('password')} /></label>
      <div className="err">{err}</div>
      <div className="row"><button className="p">{reg ? 'Register' : 'Login'}</button>
        <button type="button" className="l" onClick={() => { setReg(!reg); setErr(''); }}>{reg ? 'Have an account? Login' : 'Need an account? Register'}</button></div>
    </form>
  );
}

function Main({ user, onLogout }) {
  const [view, setView] = useState({ t: 'list' });
  const [issues, setIssues] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('All');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, s] = await Promise.all([api('/issues' + (filter !== 'All' ? '?status=' + encodeURIComponent(filter) : '')), api('/dashboard')]);
      setIssues(i); setStats(s);
    } catch (x) { setErr(x.message); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const again = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [load]);
  useEffect(() => { api('/users').then(setUsers).catch(() => {}); }, [view.t]);
  const back = () => { setView({ t: 'list' }); load(); };

  return (
    <div className="w">
      <header><h1>Issue Tracker</h1><div className="row"><span className="mu">{user.name}</span><span className={'b ' + (user.role === 'admin' ? 'Open' : 'Closed')}>{user.role}</span>
        {user.role === 'admin' && <button onClick={() => setView({ t: view.t === 'users' ? 'list' : 'users' })}>{view.t === 'users' ? 'Issues' : 'Users'}</button>}
        <button onClick={onLogout}>Logout</button></div></header>
      {err && <div className="err">{err}</div>}
      {view.t === 'list' && <>
        <div className="mu mb">{user.role === 'admin' ? 'Admin view: all issues' : 'Showing issues you created or are assigned to'}</div>
        {stats && <div className="grid">
          <Stat n={stats.total} l="Total" /><Stat n={stats.byStatus.Open} l="Open" c="Open" />
          <Stat n={stats.byStatus['In Progress']} l="In Progress" c="IP" /><Stat n={stats.byStatus.Closed} l="Closed" c="Closed" />
          <Stat n={stats.assignedToMe} l="Assigned to me" />
        </div>}
        <div className="row mb">
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto', margin: 0 }}>{['All', ...ST].map(s => <option key={s}>{s}</option>)}</select>
          <span className="sp" /><button className="p" onClick={() => setView({ t: 'form' })}>+ New issue</button>
        </div>
        {issues.length === 0 && <div className="card mu">No issues yet.</div>}
        {issues.map(i => (
          <div key={i.id} className="card it" onClick={() => setView({ t: 'detail', id: i.id })}>
            <div className="row"><b>{i.title}</b><span className="sp" /><span className={'b ' + cls(i.status)}>{i.status}</span></div>
            <div className="mu">{i.assignee_name || 'Unassigned'} · {i.comment_count} comment(s)</div>
          </div>))}
      </>}
      {view.t === 'users' && <AdminUsers me={user} />}
      {view.t === 'form' && <IssueForm id={view.id} users={users} admin={user.role === 'admin'} onDone={back} />}
      {view.t === 'detail' && <Detail id={view.id} user={user} users={users} onBack={back} onEdit={() => setView({ t: 'form', id: view.id })} />}
    </div>
  );
}

const Stat = ({ n, l, c }) => <div className="stat"><b className={c}>{n}</b><span>{l}</span></div>;

function IssueForm({ id, users, admin, onDone }) {
  const [f, setF] = useState({ title: '', description: '', status: 'Open', assignee_id: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (id) api('/issues/' + id).then(i => setF({ title: i.title, description: i.description, status: i.status, assignee_id: i.assignee_id ?? '' })).catch(x => setErr(x.message)); }, [id]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr('');
    const body = { title: f.title, description: f.description, status: f.status };
    if (admin) body.assignee_id = f.assignee_id === '' ? null : Number(f.assignee_id);
    try { await api(id ? '/issues/' + id : '/issues', id ? 'PUT' : 'POST', body); onDone(); } catch (x) { setErr(x.message); }
  };
  return (
    <div className="card"><h1>{id ? 'Edit issue' : 'New issue'}</h1>
      <label>Title<input value={f.title} onChange={set('title')} /></label>
      <label>Description<textarea value={f.description} onChange={set('description')} /></label>
      <label>Status<select value={f.status} onChange={set('status')}>{ST.map(s => <option key={s}>{s}</option>)}</select></label>
      {admin && <label>Assignee<select value={f.assignee_id} onChange={set('assignee_id')}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      <div className="err">{err}</div>
      <div className="row"><button className="p" onClick={save}>Save</button><button onClick={onDone}>Cancel</button></div>
    </div>
  );
}

function Detail({ id, user, onBack, onEdit }) {
  const [i, setI] = useState(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api('/issues/' + id).then(setI).catch(x => setErr(x.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const again = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [load]);
  const run = fn => async () => { setErr(''); try { await fn(); } catch (x) { setErr(x.message); } };
  const del = run(async () => { if (confirm('Delete this issue?')) { await api('/issues/' + id, 'DELETE'); onBack(); } });
  const status = e => run(async () => { await api('/issues/' + id, 'PUT', { status: e.target.value }); await load(); })();
  const comment = run(async () => { if (!text.trim()) return; await api(`/issues/${id}/comments`, 'POST', { text }); setText(''); await load(); });
  if (!i) return <div className="card">{err || 'Loading…'}</div>;
  return (<>
    <div className="card">
      <div className="row"><button className="l" onClick={onBack}>← Back</button><span className="sp" />{(i.creator_id === user.id || user.role === 'admin') && <button onClick={onEdit}>Edit</button>}
        {(i.creator_id === user.id || user.role === 'admin') && <button className="d" onClick={del}>Delete</button>}</div>
      <h1 style={{ marginTop: 8 }}>{i.title} <span className={'b ' + cls(i.status)}>{i.status}</span></h1>
      <p className="mu">By {i.creator_name} · Assigned to {i.assignee_name || 'Unassigned'} · {new Date(i.created_at).toLocaleString()}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{i.description || <span className="mu">No description.</span>}</p>
      <label className="mu">Status <select value={i.status} onChange={status} style={{ width: 'auto' }}>{ST.map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="err">{err}</div>
    </div>
    <div className="card"><b>Comments ({i.comments.length})</b>
      {i.comments.map(c => <div className="cm" key={c.id}><span className="mu">{c.user_name} · {new Date(c.created_at).toLocaleString()}</span><div style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div></div>)}
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write a comment…" style={{ marginTop: 10 }} />
      <button className="p" onClick={comment}>Add comment</button>
    </div>
  </>);
}

function AdminUsers({ me }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const load = () => api('/admin/users').then(setRows).catch(x => setErr(x.message));
  useEffect(() => { load(); }, []);
  const setRole = async (id, role) => { setErr(''); try { await api(`/admin/users/${id}/role`, 'PUT', { role }); await load(); } catch (x) { setErr(x.message); } };
  return (
    <div className="card"><b>Users ({rows.length})</b><div className="err">{err}</div>
      {rows.map(u => (
        <div className="cm row" key={u.id}>
          <div className="sp"><b>{u.name}</b><div className="mu">{u.email} · {u.created} created · {u.assigned} assigned</div></div>
          <select value={u.role} disabled={u.id === me.id} onChange={e => setRole(u.id, e.target.value)} style={{ width: 'auto', margin: 0 }}>
            <option>user</option><option>admin</option>
          </select>
        </div>))}
    </div>
  );
}
