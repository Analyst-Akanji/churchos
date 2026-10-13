/** Turns "0803 123 4567", "+234 803 123 4567" or "2348031234567" into wa.me format (digits only, with country code). */
export function toWaNumber(input?: string | null): string | null {
  if (!input) return null;
  const plus = input.trim().startsWith('+');
  let d = input.replace(/\D/g, '');
  if (!d) return null;
  if (!plus) {
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1);   // Nigerian local format
    else if (d.length === 10 && /^[789]/.test(d)) d = '234' + d;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}
/** Opens WhatsApp (on the sender's own phone or WhatsApp Web) with the message ready to send. */
export const waLink = (number: string | null, text: string) => `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;

export function activationMessage(firstName: string, assemblyName: string, code: string, origin: string): string {
  return `Hello ${firstName}, this is the church office of ${assemblyName}. Your activation code is ${code}.\n\nPlease sign in at ${origin}/login with the email you registered with, then enter this code to activate your account. The code works once and expires in 14 days.\n\nGod bless you.`;
}
export const last10 = (s?: string | null) => (s ?? '').replace(/\D/g, '').slice(-10);
export function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}
