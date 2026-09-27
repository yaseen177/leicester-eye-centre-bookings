import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadVatSettings } from '../../lib/till';
import { DEFAULT_VAT_SETTINGS, type VatSettings } from '../../lib/vat';
import VatReport from './VatReport';

// VAT report as a standalone page (lives under More → Analytics).
export default function VatReportPage({ orders }: { orders: any[] }) {
  const [settings, setSettings] = useState<VatSettings | null>(null);
  useEffect(() => { loadVatSettings().then(setSettings).catch(() => setSettings({ ...DEFAULT_VAT_SETTINGS })); }, []);
  if (!settings) return <div className="p-10 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  return <VatReport orders={orders} settings={settings} />;
}
