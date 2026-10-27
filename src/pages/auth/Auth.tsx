import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { toWaNumber } from '@/lib/whatsapp';
import { env } from '@/lib/env';
import { Logo } from '@/components/Logo';
import { SITE } from '@/config/site';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-5 flex flex-col items-center gap-3 text-white">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg"><Logo /></span>
          <span className="text-center leading-tight"><span className="block font-serif text-2xl font-bold tracking-wide">GOFAMINT</span><span className="block text-sm text-brand-200">{SITE.assembly}</span></span>
        </Link>
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
        <div className="-mt-2 text-right"><Link className="text-sm font-medium text-brand-700 hover:underline" to="/forgot-password">Forgot password?</Link></div>
        {err != null && <ErrorBox error={err} />}
        <Button type="submit" loading={busy} className="w-full">Sign in</Button>
        <p className="text-center text-sm text-gray-600">New here? <Link className="font-medium text-brand-700 underline" to="/register">Create an account</Link></p>
      </form>
    </Shell>
  );
}

export function Register() {
  const { signUp } = useAuth();
  const [f, setF] = useState({ first_name: '', last_name: '', whatsapp: '', date_of_birth: '', email: '', pw: '', agree: false });
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (!toWaNumber(f.whatsapp)) { setErr(new Error('Please enter a valid WhatsApp number, for example 0803 123 4567.')); return; }
    setBusy(true);
    try {
      const r = await signUp(f.email.trim(), f.pw, {
        first_name: f.first_name.trim(), last_name: f.last_name.trim(), whatsapp: f.whatsapp.trim(),
        date_of_birth: f.date_of_birth, assembly_slug: env.publicAssemblySlug,
      });
      setDone(r.needsConfirmation ? 'confirm' : 'ok');
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <Shell title="Join our church family">
      {done ? (
        <div className="space-y-4 text-sm text-gray-700">
          <p className="font-semibold text-brand-900">Thank you. Your registration has been sent to the church office.</p>
          {done === 'confirm' && <p>First, open the confirmation email we sent you and click the link.</p>}
          <p>Once the office approves it, they will send an <strong>activation code to your WhatsApp</strong>. Then sign in with your email and password and enter the code to activate your account.</p>
          <Link to="/login" className="font-medium text-brand-700 underline">Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><Input required autoComplete="given-name" value={f.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
            <Field label="Last name"><Input required autoComplete="family-name" value={f.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
          </div>
          <Field label="WhatsApp number" hint="We will send your activation code here. Example: 0803 123 4567"><Input required type="tel" inputMode="tel" autoComplete="tel" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
          <Field label="Date of birth"><Input required type="date" max={new Date().toISOString().slice(0, 10)} value={f.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" required autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Password" hint="At least 8 characters"><Input type="password" required minLength={8} autoComplete="new-password" value={f.pw} onChange={(e) => set('pw', e.target.value)} /></Field>
          <label className="flex items-start gap-2 text-xs text-gray-600"><input type="checkbox" required checked={f.agree} onChange={(e) => set('agree', e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-700" />I agree that the church office may use these details to set up my membership and message me on WhatsApp.</label>
          {err != null && <ErrorBox error={err} />}
          <Button type="submit" loading={busy} className="w-full">Register</Button>
          <p className="text-center text-sm text-gray-600">Already registered? <Link className="font-medium text-brand-700 underline" to="/login">Sign in</Link></p>
        </form>
      )}
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    // Supabase answers "success" for emails it does not know, so nobody can discover who is registered.
    // That means an error here is a real problem (too many requests, or the email service is down),
    // and the member should be told instead of waiting for an email that will never come.
    if (error) {
      console.error('Password reset email failed:', error.message);
      setErr(new Error(/rate limit|too many|seconds/i.test(error.message)
        ? 'Too many requests. Please wait a few minutes and try again.'
        : 'We could not send the email right now. Please try again in a few minutes, or contact the church office.'));
      return;
    }
    setSent(true);
  }
  return (
    <Shell title="Reset your password">
      {sent ? (
        <div className="space-y-4 text-sm text-gray-700">
          <p className="font-semibold text-brand-900">Check your email.</p>
          <p>If an account exists for <strong>{email}</strong>, we have sent a link to choose a new password. It may take a few minutes. Check your spam folder too.</p>
          <p className="text-gray-500">No email? Contact the church office and they can help you.</p>
          <Link to="/login" className="font-medium text-brand-700 underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-gray-600">Enter the email you registered with. We will send you a link to set a new password.</p>
          <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {err != null && <ErrorBox error={err} />}
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
          <p className="text-center text-sm text-gray-600"><Link className="font-medium text-brand-700 underline" to="/login">Back to sign in</Link></p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);   // null = still checking the link
  const [pw, setPw] = useState({ a: '', b: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const [done, setDone] = useState(false);

  // The reset email links straight to this page with a one-time code in the address. Swap that code for a
  // signed-in session here, so the link never depends on Supabase's redirect list and an email app that
  // previews the link cannot use the code up before the member taps it.
  const verifying = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    if (!tokenHash || params.get('type') !== 'recovery' || verifying.current) return;
    verifying.current = true;
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
      window.history.replaceState({}, '', '/reset-password'); // take the code out of the address bar
      setReady(!error);
    });
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true); });
    void supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const t = setTimeout(() => setReady((r) => r ?? false), 5000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (pw.a.length < 8) { setErr(new Error('Use at least 8 characters.')); return; }
    if (pw.a !== pw.b) { setErr(new Error('The two passwords do not match.')); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy(false);
    if (error) { setErr(new Error(error.message)); return; }
    setDone(true); setTimeout(() => nav('/app', { replace: true }), 1500);
  }

  return (
    <Shell title="Choose a new password">
      {done ? <p className="text-sm font-semibold text-emerald-700">Password changed. Taking you in...</p>
        : ready === null ? <p className="text-sm text-gray-600">Checking your link...</p>
        : ready === false ? (
          <div className="space-y-4 text-sm text-gray-700">
            <p>This reset link is invalid or has expired.</p>
            <Link to="/forgot-password" className="font-medium text-brand-700 underline">Request a new link</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="New password" hint="At least 8 characters"><Input type="password" required minLength={8} autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
            <Field label="Repeat new password"><Input type="password" required minLength={8} autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
            {err != null && <ErrorBox error={err} />}
            <Button type="submit" loading={busy} className="w-full">Save new password</Button>
          </form>
        )}
    </Shell>
  );
}
