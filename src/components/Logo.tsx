import { useState } from 'react';

/** Shows /logo.png if you add one to the public folder; otherwise a simple cross mark. */
export function Logo({ light = false }: { light?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl font-bold ${light ? 'bg-white/10 text-gold-400' : 'bg-brand-900 text-gold-400'}`}>✝</span>
  ) : (
    <img src="/logo.png" alt="" className="h-10 w-10 object-contain" onError={() => setFailed(true)} />
  );
}
