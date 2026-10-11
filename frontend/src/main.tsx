import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudOff,
  FileImage,
  Film,
  History,
  Info,
  Layers3,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Upload,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4100/api';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.avi', '.mkv'];

type View = 'dashboard' | 'analyze' | 'history';
type AuthMode = 'login' | 'register';
type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type ApiState = 'checking' | 'ready' | 'offline';

type User = {
  id: number;
  email: string;
  display_name: string;
};

type MediaFile = {
  id: number;
  original_name: string;
  media_type: 'image' | 'video';
  content_type: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  created_at: string;
};

type Finding = {
  name: string;
  value: unknown;
  severity: 'low' | 'medium' | 'high' | string;
  interpretation: string;
};

type FrameFinding = {
  frame_index: number;
  timestamp_seconds: number;
  score: number;
  findings?: Finding[];
};

type AnalysisResult = {
  width?: number;
  height?: number;
  fps?: number;
  frame_count?: number;
  duration_seconds?: number;
  sampled_frames?: number;
  findings?: Finding[];
  metadata_findings?: Finding[];
  frame_findings?: FrameFinding[];
};

type Analysis = {
  id: number;
  file: MediaFile;
  status: JobStatus | string;
  model_version: string;
  model_score?: number | null;
  confidence?: number | null;
  category?: string | null;
  summary?: string | null;
  result?: AnalysisResult | null;
  processing_ms?: number | null;
  error?: string | null;
  created_at: string;
  updated_at?: string;
};

type ApiErrorShape = {
  detail?: string;
  message?: string;
};

type UploadResponse = {
  analysis_id: number;
  status: JobStatus;
  file: MediaFile;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = options.body instanceof FormData
    ? {}
    : { 'Content-Type': 'application/json' };

  try {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    let payload: ApiErrorShape | T | null = null;
    try {
      payload = (await response.json()) as ApiErrorShape | T;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail = payload && typeof payload === 'object' && 'detail' in payload
        ? payload.detail
        : payload && typeof payload === 'object' && 'message' in payload
          ? payload.message
          : undefined;
      throw new ApiError(detail || `Request failed (${response.status})`, response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof TypeError) {
      throw new Error('FrameTrace API is unreachable. Check that the backend is running and try again.');
    }
    throw error;
  }
}

function readStoredUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<User>;
    if (typeof parsed.id !== 'number' || typeof parsed.email !== 'string' || typeof parsed.display_name !== 'string') {
      throw new Error('Invalid stored session');
    }
    return parsed as User;
  } catch {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return null;
  }
}

function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isActive(status?: string): boolean {
  return status === 'QUEUED' || status === 'PROCESSING';
}

function statusLabel(status?: string): string {
  if (status === 'QUEUED') return 'Queued';
  if (status === 'PROCESSING') return 'Processing';
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'FAILED') return 'Failed';
  return status || 'Unknown';
}

function categoryLabel(category?: string | null): string {
  if (category === 'manipulation-likelihood') return 'Potential indicators';
  if (category === 'authentic-likelihood') return 'Lower indicator level';
  if (category === 'inconclusive') return 'Inconclusive';
  return 'Awaiting assessment';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatBytes(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return 'Not available';
    }
  }
  return String(value);
}

function scorePercent(score?: number | null): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 10;
}

function scoreText(score?: number | null): string {
  return `${scorePercent(score).toFixed(1)}%`;
}

function validateFile(file: File): string | null {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return 'Unsupported file type. Use JPG, PNG, WEBP, MP4, MOV, AVI, or MKV.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'This file is larger than the 100 MB upload limit.';
  }
  return null;
}

function App() {
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [view, setView] = useState<View>('dashboard');
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiState, setApiState] = useState<ApiState>(user ? 'checking' : 'ready');

  const signOut = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setSelected(null);
    setAnalyses([]);
    setUser(null);
    setApiState('ready');
  }, []);

  const loadAnalyses = useCallback(async (silent = false) => {
    if (!user) return;
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const response = await api<{ items: Analysis[] }>('/analyses');
      setAnalyses(response.items || []);
      setApiState('ready');
      setError('');
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        signOut();
        return;
      }
      setApiState('offline');
      setError(errorMessage(loadError, 'Could not load your analysis history.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [signOut, user]);

  useEffect(() => {
    if (user) void loadAnalyses();
  }, [loadAnalyses, user]);

  const refreshAnalysis = useCallback(async (id: number): Promise<Analysis> => {
    try {
      const current = await api<Analysis>(`/analyses/${id}`);
      setSelected((previous) => previous?.id === id ? current : previous);
      setAnalyses((previous) => previous.map((item) => item.id === id ? current : item));
      setApiState('ready');
      return current;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) signOut();
      throw refreshError;
    }
  }, [signOut]);

  async function openCreatedAnalysis(id: number) {
    try {
      const current = await refreshAnalysis(id);
      setSelected(current);
      setView('dashboard');
    } catch (openError) {
      setError(errorMessage(openError, 'The analysis was created, but its report could not be opened.'));
    }
  }

  async function retryAnalysis(id: number) {
    try {
      setError('');
      const restarted = await api<Analysis>(`/analyses/${id}/start`, { method: 'POST' });
      setSelected(restarted);
      setAnalyses((previous) => previous.map((item) => item.id === id ? restarted : item));
    } catch (retryError) {
      setError(errorMessage(retryError, 'Could not restart this analysis.'));
    }
  }

  if (!user) return <Login onAuth={setUser} />;

  const selectView = (nextView: View) => {
    setView(nextView);
    setSelected(null);
    setError('');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand"><Shield size={18} /><span>FRAMETRACE</span></div>
          <div className="brand-subtitle">VISUAL EVIDENCE LAB</div>
          <div className="model-badge">
            <span className="status-dot online" />
            <div><span>BASELINE MODEL</span><strong>0.1 / RESEARCH</strong></div>
            <CircleHelp size={14} aria-label="Model information" />
          </div>
          <nav className="primary-nav" aria-label="Primary navigation">
            <NavItem active={view === 'dashboard' && !selected} icon={<Layers3 size={17} />} label="Workspace" onClick={() => selectView('dashboard')} />
            <NavItem active={view === 'analyze' && !selected} icon={<Upload size={17} />} label="New review" onClick={() => selectView('analyze')} />
            <NavItem active={view === 'history' && !selected} icon={<History size={17} />} label="History" onClick={() => selectView('history')} />
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="account">
            <div className="avatar">{user.display_name.slice(0, 1).toUpperCase()}</div>
            <div className="account-copy"><strong>{user.display_name}</strong><small>{user.email}</small></div>
          </div>
          <button className="sign-out" onClick={signOut}><LogOut size={15} /> <span>Sign out</span></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">FRAMETRACE <span>/</span> {selected ? 'REPORT' : view.toUpperCase()}</div>
            <h1>{selected ? selected.file.original_name : view === 'analyze' ? 'Start a media review' : view === 'history' ? 'Your review history' : 'Evidence workspace'}</h1>
          </div>
          <div className={`connection ${apiState}`}>
            {apiState === 'offline' ? <CloudOff size={14} /> : <span className="status-dot" />}
            <span>{apiState === 'checking' ? 'CHECKING API' : apiState === 'offline' ? 'API UNAVAILABLE' : 'API READY'}</span>
          </div>
        </header>

        {error && <ErrorBanner message={error} onDismiss={() => setError('')} onRetry={() => void loadAnalyses(true)} />}

        {selected ? (
          <Report
            analysis={selected}
            onBack={() => setSelected(null)}
            onRetry={() => void retryAnalysis(selected.id)}
            refreshAnalysis={refreshAnalysis}
          />
        ) : view === 'analyze' ? (
          <Analyze onCreated={openCreatedAnalysis} />
        ) : view === 'history' ? (
          <HistoryView items={analyses} isLoading={isLoading} isRefreshing={isRefreshing} onRefresh={() => void loadAnalyses(true)} onOpen={setSelected} onAnalyze={() => selectView('analyze')} />
        ) : (
          <Dashboard items={analyses} isLoading={isLoading} onOpen={setSelected} onAnalyze={() => selectView('analyze')} onHistory={() => selectView('history')} onRefresh={() => void loadAnalyses(true)} />
        )}
      </main>
    </div>
  );
}

function Login({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { email: email.trim(), password }
        : { email: email.trim(), password, display_name: displayName.trim() };
      const response = await api<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      onAuth(response.user);
    } catch (authError) {
      setError(errorMessage(authError, 'Authentication failed. Check your details and try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <div className="login-mark"><Shield size={18} /> FRAMETRACE</div>
        <div className="intro-content">
          <div className="eyebrow">MEDIA FORENSICS WORKSPACE</div>
          <h1>Make room for <em>better questions.</em></h1>
          <p>FrameTrace is an honest media evidence lab. It looks for measurable visual and file signals in images and sampled video, then keeps the evidence, model score, and limits together.</p>
          <div className="intro-points">
            <div><CheckCircle2 size={16} /><span>See how a file was measured</span></div>
            <div><CheckCircle2 size={16} /><span>Keep every review in one private history</span></div>
            <div><CheckCircle2 size={16} /><span>Probabilistic signals, never a verdict</span></div>
          </div>
        </div>
        <div className="auth-footer">FRAME / TRACE / CONTEXT <span>v0.1</span></div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-heading">
          <span className="kicker">{mode === 'login' ? 'WELCOME BACK' : 'NEW WORKSPACE'}</span>
          <h2 id="auth-title">{mode === 'login' ? 'Open your workspace' : 'Create your analyst account'}</h2>
          <p>{mode === 'login' ? 'Sign in to review your private media analyses.' : 'Start with a local account. You can analyze media as soon as you sign in.'}</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex Morgan" autoComplete="name" minLength={2} maxLength={100} required /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="analyst@example.com" autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your workspace password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : undefined} required /></label>
          {error && <div className="inline-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
          <button className="button primary-button full-button" type="submit" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? 'Connecting…' : mode === 'login' ? 'Open workspace' : 'Create account'}
            {!busy && <ArrowUpRight size={16} />}
          </button>
        </form>
        <div className="auth-switch">
          <span>{mode === 'login' ? 'New to FrameTrace?' : 'Already have an account?'}</span>
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in instead'}
          </button>
        </div>
        <p className="auth-note"><Info size={14} /> Analysis is probabilistic research output and should not be used as definitive proof.</p>
      </section>
    </main>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} title={label}>{icon}<span>{label}</span>{active && <ChevronRight size={14} className="nav-arrow" />}</button>;
}

function WorkflowSteps({ current }: { current: 'workspace' | 'upload' | 'processing' | 'report' | 'history' }) {
  const steps = [
    { key: 'upload', label: 'Upload', note: 'Choose media' },
    { key: 'processing', label: 'Processing', note: 'Measure signals' },
    { key: 'report', label: 'Report', note: 'Read evidence' },
    { key: 'history', label: 'History', note: 'Keep the trace' },
  ];
  const currentIndex = current === 'workspace' ? -1 : steps.findIndex((step) => step.key === current);
  return <div className="workflow" aria-label="Review workflow">{steps.map((step, index) => <div className={`workflow-step${index === currentIndex ? ' current' : ''}${index < currentIndex ? ' complete' : ''}`} key={step.key}><span className="workflow-number">{index < currentIndex ? '✓' : index + 1}</span><div><strong>{step.label}</strong><small>{step.note}</small></div>{index < steps.length - 1 && <span className="workflow-line" />}</div>)}</div>;
}

function StageStatus({ stage }: { stage: 'uploading' | 'starting' | 'opening' }) {
  const label = stage === 'uploading' ? 'Uploading your file' : stage === 'starting' ? 'Creating the job' : 'Opening your report';
  return <div className="stage-status"><span className="status-dot online" />{label}</div>;
}

function Dashboard({ items, isLoading, onOpen, onAnalyze, onHistory, onRefresh }: { items: Analysis[]; isLoading: boolean; onOpen: (analysis: Analysis) => void; onAnalyze: () => void; onHistory: () => void; onRefresh: () => void }) {
  const completed = items.filter((item) => item.status === 'COMPLETED').length;
  const active = items.filter((item) => isActive(item.status)).length;
  const completionRate = items.length ? Math.round((completed / items.length) * 100) : 0;

  return (
    <div className="page dashboard-page">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">A CALMER WAY TO REVIEW MEDIA</div>
          <h2>Turn a file into a traceable evidence review.</h2>
          <p>Upload an image or sampled video. FrameTrace checks visual residuals, file context, and available metadata so you can ask better questions of the source.</p>
          <div className="hero-meta"><span><span className="status-dot online" /> Your workspace is private</span><span>Research baseline / 0.1</span></div>
        </div>
        <div className="hero-action"><div className="hero-orbit"><Layers3 size={29} /></div><button className="button primary-button" onClick={onAnalyze}><Upload size={16} /> Start a review <ArrowUpRight size={15} /></button></div>
      </section>

      <WorkflowSteps current="workspace" />

      <section className="orientation-card">
        <div><div className="kicker">HOW TO READ A REPORT</div><h2>A score is one signal in a larger record.</h2></div>
        <p>The model score is a probability-like indicator from this research baseline. It does not prove who made a file, whether it is authentic, or whether editing happened. Start with the measured findings and source context.</p>
      </section>

      <div className="metric-grid">
        <MetricCard label="Total analyses" value={items.length} detail="Across your workspace" icon={<Layers3 size={17} />} />
        <MetricCard label="Completed" value={completed} detail={items.length ? `${completionRate}% completion rate` : 'No reports yet'} icon={<CheckCircle2 size={17} />} tone="green" />
        <MetricCard label="In queue" value={active} detail={active ? 'Analysis in progress' : 'Queue is clear'} icon={<Clock3 size={17} />} tone={active ? 'amber' : undefined} />
      </div>

      <section className="panel recent-panel">
        <div className="section-heading">
           <div><div className="kicker">YOUR REVIEW QUEUE</div><h2>Recent reviews</h2><p>Every upload moves through processing, a report, and this private history.</p></div>
          <button className="icon-button" onClick={onRefresh} title="Refresh analyses" aria-label="Refresh analyses"><RefreshCw size={16} /></button>
        </div>
         {isLoading ? <AnalysisSkeleton /> : items.length ? <div className="analysis-list">{items.slice(0, 6).map((item) => <AnalysisRow key={item.id} item={item} onClick={() => onOpen(item)} />)}</div> : <EmptyState icon={<FileImage size={25} />} title="Your lab is ready" body="Upload an image or sampled video to create your first evidence review." actionLabel="Start a review" onAction={onAnalyze} />}
        {!isLoading && items.length > 6 && <button className="text-button" onClick={onHistory}>Open history <ArrowUpRight size={14} /></button>}
      </section>
      <Disclaimer />
    </div>
  );
}

function MetricCard({ label, value, detail, icon, tone }: { label: string; value: number | string; detail: string; icon: React.ReactNode; tone?: 'green' | 'amber' }) {
  return <div className={`metric-card${tone ? ` ${tone}` : ''}`}><div className="metric-icon">{icon}</div><div className="metric-label">{label}</div><strong>{value}</strong><span>{detail}</span></div>;
}

function AnalysisSkeleton() {
  return <div className="skeleton-list" aria-label="Loading analyses"><div className="skeleton-row"><span /><div><i /><i /></div><b /></div><div className="skeleton-row"><span /><div><i /><i /></div><b /></div><div className="skeleton-row"><span /><div><i /><i /></div><b /></div></div>;
}

function Analyze({ onCreated }: { onCreated: (id: number) => void | Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'starting' | 'opening'>('idle');
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const busy = stage !== 'idle';

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    const validationError = validateFile(nextFile);
    if (validationError) {
      setFile(null);
      setSelectionError(validationError);
      return;
    }
    setSelectionError('');
    setError('');
    setFile(nextFile);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) chooseFile(event.dataTransfer.files?.[0]);
  }

  async function submit() {
    if (!file || busy) return;
    setError('');
    try {
      setStage('uploading');
      const body = new FormData();
      body.append('file', file);
      const uploaded = await api<UploadResponse>('/files', { method: 'POST', body });
      setStage('starting');
      await api<Analysis>(`/analyses/${uploaded.analysis_id}/start`, { method: 'POST' });
      setStage('opening');
      await onCreated(uploaded.analysis_id);
    } catch (submitError) {
      setError(errorMessage(submitError, 'The media could not be analyzed.'));
      setStage('idle');
    }
  }

  const stageCopy = stage === 'uploading' ? 'Uploading media…' : stage === 'starting' ? 'Starting analysis…' : stage === 'opening' ? 'Opening your report…' : 'Create evidence report';

  return (
    <div className="page analyze-page">
      <WorkflowSteps current="upload" />
      <section className="analysis-intro"><div><div className="kicker">STEP 1 / UPLOAD</div><h2>Bring one file into the lab.</h2><p>FrameTrace analyzes still images and sampled video frames. We validate the file first, then keep your report updated while the job runs.</p></div><div className="limit-chip"><Shield size={15} /> 100 MB maximum</div></section>
      <div className="analyze-layout">
        <section className={`dropzone${dragging ? ' dragging' : ''}${file ? ' has-file' : ''}`} onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={handleDrop}>
          <div className="drop-icon"><Upload size={24} /></div>
          <h3>{file ? 'File ready for review' : 'Drop a file to begin'}</h3>
          <p>{file ? 'Check the filename and size, then create a private evidence report.' : 'Or browse from your device. Supported: JPG, PNG, WEBP, MP4, MOV, AVI, and MKV.'}</p>
          <label className="button secondary-button browse-button">{file ? 'Choose a different file' : 'Browse files'}<input type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.mkv,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska" onChange={handleInput} disabled={busy} /></label>
          {file && <div className="selected-file"><div className="file-type-icon">{file.type.startsWith('video') ? <Film size={18} /> : <FileImage size={18} />}</div><div><strong>{file.name}</strong><span>{file.type.startsWith('video') ? 'Video sample' : 'Image'} <i>·</i> {formatBytes(file.size)}</span></div><button className="remove-file" type="button" onClick={() => setFile(null)} disabled={busy} aria-label="Remove selected file"><X size={16} /></button></div>}
          {(selectionError || error) && <div className="inline-error upload-error" role="alert"><AlertTriangle size={15} /><span>{selectionError || error}</span></div>}
           <button className="button primary-button start-button" onClick={() => void submit()} disabled={!file || busy}>{busy && <Loader2 size={16} className="spin" />}{stageCopy}{!busy && <ArrowUpRight size={15} />}</button>
           {busy && <div className="job-progress"><StageStatus stage={stage} /><span className="progress-bar"><i /></span><small>Your report will open as soon as the job is created. Processing status comes from the API.</small></div>}
        </section>
         <aside className="guidance-card"><div className="guidance-heading"><Info size={17} /><h3>What FrameTrace can and cannot tell you</h3></div><div className="guidance-item"><span>01</span><div><strong>Visual signals</strong><p>Recompression, noise, texture, color variation, and dimensions.</p></div></div><div className="guidance-item"><span>02</span><div><strong>File context</strong><p>Frame timing, available metadata, and sampled video frames.</p></div></div><div className="guidance-item"><span>03</span><div><strong>Not a verdict</strong><p>Signals can come from ordinary editing, resizing, or platform pipelines.</p></div></div></aside>
      </div>
      <Disclaimer />
    </div>
  );
}

function AnalysisRow({ item, onClick }: { item: Analysis; onClick: () => void }) {
  const isVideo = item.file.media_type === 'video';
  return <button className="analysis-row" onClick={onClick} aria-label={`Open ${item.file.original_name} report`}><div className={`type-icon ${isVideo ? 'video' : 'image'}`}>{isVideo ? <Film size={18} /> : <FileImage size={18} />}</div><div className="analysis-main"><strong title={item.file.original_name}>{item.file.original_name}</strong><small>{isVideo ? 'Video' : 'Image'} <i>·</i> {formatDate(item.created_at)} <i>·</i> {item.model_version}</small></div><div className="row-score">{item.status === 'COMPLETED' ? scoreText(item.model_score) : '—'}<small>{item.status === 'COMPLETED' ? 'score' : 'result'}</small></div><Status status={item.status} /><ChevronRight size={16} className="row-arrow" /></button>;
}

function Status({ status }: { status?: string }) {
  return <span className={`job-status ${status?.toLowerCase() || 'unknown'}`}><i />{statusLabel(status)}</span>;
}

function HistoryView({ items, isLoading, isRefreshing, onRefresh, onOpen, onAnalyze }: { items: Analysis[]; isLoading: boolean; isRefreshing: boolean; onRefresh: () => void; onOpen: (analysis: Analysis) => void; onAnalyze: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | JobStatus>('ALL');
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalized || item.file.original_name.toLowerCase().includes(normalized) || item.status.toLowerCase().includes(normalized);
      return matchesQuery && (filter === 'ALL' || item.status === filter);
    });
  }, [filter, items, query]);

  return (
    <div className="page history-page">
      <WorkflowSteps current="history" />
      <section className="history-toolbar panel">
        <div><div className="kicker">STEP 4 / HISTORY</div><h2>Keep the evidence trail together.</h2><p>Open a report to revisit its model score, findings, metadata, and limitations. In-progress jobs remain visible here.</p></div>
        <div className="toolbar-actions"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filenames" aria-label="Search filenames" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as 'ALL' | JobStatus)} aria-label="Filter analyses by status"><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="PROCESSING">Processing</option><option value="QUEUED">Queued</option><option value="FAILED">Failed</option></select><button className="icon-button" onClick={onRefresh} title="Refresh history" aria-label="Refresh history" disabled={isRefreshing}>{isRefreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}</button></div>
      </section>
       <section className="panel history-list-panel">
         <div className="list-summary"><span>{isLoading ? 'Loading your review history…' : `${filteredItems.length} ${filteredItems.length === 1 ? 'review' : 'reviews'}`}</span>{(query || filter !== 'ALL') && <button className="text-button" onClick={() => { setQuery(''); setFilter('ALL'); }}>Clear filters <X size={13} /></button>}</div>
        {isLoading ? <AnalysisSkeleton /> : items.length === 0 ? <EmptyState icon={<History size={25} />} title="Your archive is empty" body="Completed and in-progress analyses will appear here." actionLabel="Analyze media" onAction={onAnalyze} /> : filteredItems.length === 0 ? <EmptyState icon={<Search size={25} />} title="No matching reports" body="Try a different filename or reset the status filter." actionLabel="Clear filters" onAction={() => { setQuery(''); setFilter('ALL'); }} /> : <div className="analysis-list">{filteredItems.map((item) => <AnalysisRow key={item.id} item={item} onClick={() => onOpen(item)} />)}</div>}
      </section>
      <Disclaimer />
    </div>
  );
}

function Report({ analysis, onBack, onRetry, refreshAnalysis }: { analysis: Analysis; onBack: () => void; onRetry: () => void; refreshAnalysis: (id: number) => Promise<Analysis> }) {
  useEffect(() => {
    if (!isActive(analysis.status)) return undefined;
    let timer: number | undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const current = await refreshAnalysis(analysis.id);
        if (!cancelled && isActive(current.status)) timer = window.setTimeout(() => void poll(), 1800);
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 4000);
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [analysis.id, analysis.status, refreshAnalysis]);

  const result = analysis.result || {};
  const findings = result.findings || [];
  const metadata = result.metadata_findings || [];
  const frameFindings = result.frame_findings || [];
  const score = scorePercent(analysis.model_score);
  const mediaDetails = [analysis.file.content_type || analysis.file.media_type, formatBytes(analysis.file.size_bytes), analysis.file.width && analysis.file.height ? `${analysis.file.width} × ${analysis.file.height}px` : null].filter(Boolean).join('  ·  ');

  return (
    <div className="page report-page">
      <button className="back-button" onClick={onBack}>← Back to workspace</button>
      {analysis.status === 'QUEUED' || analysis.status === 'PROCESSING' ? <><WorkflowSteps current="processing" /><section className="panel processing-card"><div className="processing-orb"><Loader2 size={26} className="spin" /></div><div className="kicker">STEP 2 / {statusLabel(analysis.status).toUpperCase()} · JOB #{analysis.id}</div><h2>{analysis.status === 'QUEUED' ? 'Your review is in the queue.' : 'Reading the file and sampled frames.'}</h2><p>FrameTrace is validating the media, measuring visual signals, and assembling the report. This page updates from the job status returned by the API.</p><div className="processing-stages"><span className="done">✓ File received</span><span className={analysis.status === 'PROCESSING' ? 'active' : ''}>◌ Measuring signals</span><span>○ Building report</span></div><div className="processing-track"><span /></div><small>There is no invented progress percentage. The next step appears when processing is complete.</small></section></> : analysis.status === 'FAILED' ? <section className="panel failed-card"><div className="failed-icon"><AlertTriangle size={22} /></div><div><div className="kicker">JOB #{analysis.id} / FAILED</div><h2>Analysis could not be completed</h2><p>{analysis.error || 'The backend did not return a usable report for this file.'}</p><button className="button secondary-button" onClick={onRetry}><RefreshCw size={15} /> Try again</button></div></section> : <>
        <WorkflowSteps current="report" />
        <section className="report-heading"><div className="report-title"><div className={`report-type ${analysis.file.media_type}`}>{analysis.file.media_type === 'video' ? <Film size={21} /> : <FileImage size={21} />}</div><div><div className="kicker">STEP 3 / EVIDENCE REPORT #{analysis.id}</div><h2>{analysis.file.original_name}</h2><p>{mediaDetails}<span> · </span>{formatDate(analysis.created_at)}</p></div></div><div className={`assessment ${analysis.category || 'inconclusive'}`}><span>MODEL-LED SIGNAL</span><strong>{categoryLabel(analysis.category)}</strong><small>{scoreText(analysis.model_score)} model score <i>·</i> {scoreText(analysis.confidence)} confidence</small></div></section>
        <div className="report-grid">
           <section className="panel score-panel"><div className="section-heading compact"><div><div className="kicker">PRIMARY SIGNAL</div><h3>Model score, in plain language</h3></div><span className="research-tag">RESEARCH BASELINE</span></div><div className="score-layout"><div className="score-ring" style={{ '--score': `${score}%` } as CSSProperties}><div><strong>{score.toFixed(1)}%</strong><span>model score</span></div></div><div className="score-copy"><p>{analysis.summary || 'The model returned a probabilistic score based on five normalized forensic features.'}</p><div className="score-scale"><div><span>Lower indicator level</span><b>{score <= 35 ? 'Current range' : ''}</b></div><span className="scale-track"><i style={{ width: `${score}%` }} /></span><div><span>More potential indicators</span><b>{score > 65 ? 'Current range' : ''}</b></div></div></div></div><div className="model-line"><span>Model version</span><strong>{analysis.model_version || 'Unknown'}</strong></div><div className="score-note"><Info size={15} /><span>This score describes the model’s output for this file. It does not establish authenticity, manipulation, intent, or provenance.</span></div></section>
           <section className="panel info-panel"><div className="section-heading compact"><div><div className="kicker">FILE + JOB CONTEXT</div><h3>What was processed</h3></div><CheckCircle2 size={17} className="section-check" /></div><InfoRow label="Status" value={statusLabel(analysis.status)} /><InfoRow label="Processing time" value={analysis.processing_ms ? `${analysis.processing_ms} ms` : 'Not recorded'} /><InfoRow label="Media type" value={analysis.file.media_type === 'video' ? 'Sampled video' : 'Still image'} />{result.duration_seconds ? <InfoRow label="Video duration" value={`${result.duration_seconds.toFixed(2)} s`} /> : null}{result.sampled_frames ? <InfoRow label="Frames sampled" value={String(result.sampled_frames)} /> : null}</section>
        </div>
        <section className="panel"><div className="section-heading compact"><div><div className="kicker">MEASURED SIGNALS</div><h3>Forensic indicators</h3><p>Measurements that may provide context, not proof of editing.</p></div><span className="count-badge">{findings.length}</span></div><FindingList findings={findings} empty="No additional forensic signals were produced." /></section>
        <section className="panel"><div className="section-heading compact"><div><div className="kicker">FILE CONTEXT</div><h3>Metadata findings</h3><p>Metadata can be removed or rewritten by ordinary tools.</p></div><span className="count-badge">{metadata.length}</span></div><FindingList findings={metadata} empty="No metadata findings were returned." /></section>
         {frameFindings.length > 0 && <section className="panel frame-panel"><div className="section-heading compact"><div><div className="kicker">VIDEO SAMPLING</div><h3>Sampled frame findings</h3><p>{frameFindings.length} evenly spaced frames from the source video.</p></div><span className="count-badge">{frameFindings.length}</span></div><div className="frame-table"><div className="frame-table-header"><span>FRAME</span><span>TIMESTAMP</span><span>MODEL SCORE</span></div>{frameFindings.map((frame) => <div className="frame-row" key={frame.frame_index}><strong>#{frame.frame_index}</strong><span>{frame.timestamp_seconds.toFixed(2)} s</span><b>{scoreText(frame.score)}</b></div>)}</div></section>}
         <section className="panel limitations-panel"><div className="section-heading compact"><div><div className="kicker">READ BEFORE SHARING</div><h3>What this report cannot establish</h3></div><Info size={17} /></div><div className="limitations-grid"><span>It cannot prove a file is authentic or manipulated.</span><span>It cannot identify who edited a file or recover its original source.</span><span>Compression, resizing, metadata changes, and platform processing can affect signals.</span></div></section>
        <Disclaimer />
      </>}
    </div>
  );
}

function FindingList({ findings, empty }: { findings: Finding[]; empty: string }) {
  if (!findings.length) return <div className="subtle-empty"><Info size={15} /><span>{empty}</span></div>;
  return <div className="finding-list">{findings.map((finding, index) => <Finding key={`${finding.name}-${index}`} item={finding} />)}</div>;
}

function Finding({ item }: { item: Finding }) {
  const severity = item.severity?.toLowerCase() || 'low';
  return <div className="finding"><span className={`severity ${severity}`} /><div><div className="finding-title"><strong>{item.name}</strong><span className={`severity-label ${severity}`}>{severity}</span></div><small>Measured value: {formatValue(item.value)}</small><p>{item.interpretation}</p></div></div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="info-row"><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ icon, title, body, actionLabel, onAction }: { icon: React.ReactNode; title: string; body: string; actionLabel: string; onAction: () => void }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><span>{body}</span><button className="button secondary-button" onClick={onAction}>{actionLabel} <ArrowUpRight size={14} /></button></div>;
}

function ErrorBanner({ message, onDismiss, onRetry }: { message: string; onDismiss: () => void; onRetry: () => void }) {
  return <div className="error-banner" role="alert"><AlertTriangle size={17} /><div><strong>We hit a snag</strong><span>{message}</span></div><button className="text-button" onClick={onRetry}>Retry</button><button className="icon-button quiet" onClick={onDismiss} aria-label="Dismiss error"><X size={16} /></button></div>;
}

function Disclaimer() {
  return <div className="disclaimer"><AlertTriangle size={15} /><span>Automated analysis is probabilistic. Review individual signals and source context; false positives and false negatives are possible.</span></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
