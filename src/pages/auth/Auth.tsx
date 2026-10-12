import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-5 flex items-center justify-center gap-2 text-white"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500 text-xl font-bold">✝</span><span className="text-xl font-semibold">ChurchOS</span></Link>
        <Card title={title}>{children}</Card>
      </div>
    </div>
  );
}

export function Login() {
  const { signIn, session, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  if (!loading && session) return <Navigate to={loc.state?.from ?? '/app'} replace />;
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await signIn(email.trim(), pw); nav(loc.state?.from ?? '/app', { replace: true }); } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Shell title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {err != null && <ErrorBox error={err} />}
        <Button type="submit" loading={busy} className="w-full">Sign in</Button>
        <p className="text-center text-sm text-gray-600">New here? <Link className="font-medium text-brand-700 underline" to="/register">Create an account</Link></p>
      </form>
    </Shell>
  );
}

export function Register() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await signUp(email.trim(), pw);
      setDone(r.needsConfirmation ? 'Check your email and click the confirmation link, then sign in.' : 'Account created. Sign in to continue.');
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Shell title="Create your account">
      {done ? (
        <div className="space-y-4 text-sm"><p className="text-gray-700">{done}</p><p className="text-gray-600">After signing in, enter the invite code your church office gave you to link your account to your member record.</p><Link to="/login" className="font-medium text-brand-700 underline">Go to sign in</Link></div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" hint="At least 8 characters"><Input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {err != null && <ErrorBox error={err} />}
          <Button type="submit" loading={busy} className="w-full">Create account</Button>
          <p className="text-center text-sm text-gray-600">Already registered? <Link className="font-medium text-brand-700 underline" to="/login">Sign in</Link></p>
        </form>
      )}
    </Shell>
  );
}
