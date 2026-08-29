import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Phone } from 'lucide-react';

// Shown after a Klarna/Clearpay checkout redirect. Deliberately doesn't read
// Firestore -- the Stripe webhook that actually confirms payment is
// asynchronous, so this page can't reliably know the true status the
// instant the customer lands here anyway. It just confirms the redirect
// worked and points them to call if they're ever unsure.
export default function PaymentStatusPage({ success }: { success: boolean }) {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-[#f8fafc] px-6 py-12 flex items-center justify-center">
      <div className="max-w-md w-full glass-card rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 bg-white text-center">
        <div className="mb-6">
          <img src="/logo.png" alt="The Eye Centre" className="h-16 w-auto mx-auto drop-shadow-sm" />
        </div>

        {success ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95 py-6">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={40} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-800">Payment received</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Thanks — your Klarna/Clearpay payment has been submitted successfully. We'll update your order shortly.
            </p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-4">You can now close this page</p>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in zoom-in-95 py-6">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle size={40} className="text-amber-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-800">Payment not completed</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              It looks like the payment was cancelled or didn't go through. No charge has been made — nothing to worry about.
            </p>
            <a
              href="tel:01162532788"
              className="inline-flex items-center gap-2 mt-2 px-5 py-3 rounded-xl font-black text-white shadow-lg hover:brightness-110 transition-all"
              style={{ backgroundColor: '#3F9185' }}
            >
              <Phone size={16} /> Call us on 0116 253 2788
            </a>
          </div>
        )}

        {id && <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest pt-6">Reference: {id.slice(0, 8).toUpperCase()}</p>}
      </div>
    </div>
  );
}