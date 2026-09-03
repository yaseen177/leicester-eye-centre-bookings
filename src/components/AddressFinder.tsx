import { useState } from 'react';

// Postcode -> select-from-list address capture, backed by the address-lookup
// Worker (which proxies to Ideal Postcodes, keeping the API key off the
// client). Deliberately has NO manual free-text fallback -- Abbas asked for
// every address to be verified, so the only way to set one is to select a
// real match from the list. See address-lookup-worker/README.md for what
// happens on an unmatched/new-build postcode (the 404 suggestions Ideal
// Postcodes returns), which is the one edge case this can't fully solve.

export interface AddressValue {
  line1: string;
  line2: string;
  town: string;
  county: string;
  postcode: string;
  udprn: string | number | null;
  verified: boolean;
}

export const blankAddress = (): AddressValue => ({
  line1: '', line2: '', town: '', county: '', postcode: '', udprn: null, verified: false
});

const ADDRESS_LOOKUP_WORKER_URL = 'https://address-lookup.yaseen-hussain18.workers.dev/lookup';

interface AddressFinderProps {
  value: AddressValue;
  onChange: (address: AddressValue) => void;
}

export default function AddressFinder({ value, onChange }: AddressFinderProps) {
  const [postcodeInput, setPostcodeInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const findAddress = async () => {
    if (!postcodeInput.trim()) return;
    setIsSearching(true);
    setSearchError('');
    setResults([]);
    setSuggestions([]);
    setHasSearched(true);
    try {
      const res = await fetch(`${ADDRESS_LOOKUP_WORKER_URL}?postcode=${encodeURIComponent(postcodeInput.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.addresses || data.addresses.length === 0) {
        setSearchError(data.error || "No addresses found for that postcode — double-check it's correct.");
        if (data.suggestions?.length) setSuggestions(data.suggestions);
        return;
      }
      setResults(data.addresses);
    } catch (e) {
      setSearchError("Couldn't look up that postcode — check your connection and try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddress = (addr: any) => {
    onChange({
      line1: addr.line1 || '',
      line2: addr.line2 || '',
      town: addr.town || '',
      county: addr.county || '',
      postcode: addr.postcode || postcodeInput.trim(),
      udprn: addr.udprn || null,
      verified: true
    });
    setResults([]);
    setHasSearched(false);
  };

  const clearAddress = () => {
    onChange(blankAddress());
    setPostcodeInput('');
    setResults([]);
    setSuggestions([]);
    setHasSearched(false);
  };

  if (value.verified) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start justify-between gap-3">
        <div className="text-sm text-slate-700 leading-relaxed">
          <p className="font-bold">{value.line1}{value.line2 ? `, ${value.line2}` : ''}</p>
          <p>{value.town}{value.county ? `, ${value.county}` : ''}</p>
          <p className="font-bold">{value.postcode}</p>
        </div>
        <button type="button" onClick={clearAddress} className="text-xs font-bold text-red-500 hover:underline shrink-0">Change</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text" placeholder="Enter your postcode"
          value={postcodeInput}
          onChange={e => setPostcodeInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findAddress(); } }}
          className="flex-1 p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium"
        />
        <button
          type="button" onClick={findAddress} disabled={isSearching || !postcodeInput.trim()}
          className="px-5 py-4 rounded-xl font-bold text-white shrink-0 disabled:opacity-50 transition-all"
          style={{ backgroundColor: '#3F9185' }}
        >
          {isSearching ? '…' : 'Find Address'}
        </button>
      </div>

      {searchError && (
        <div className="px-1">
          <p className="text-xs font-bold text-red-500">{searchError}</p>
          {suggestions.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">Did you mean: {suggestions.join(', ')}?</p>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-50">
          {results.map((addr, i) => (
            <button
              key={i} type="button" onClick={() => selectAddress(addr)}
              className="w-full text-left p-3 text-sm hover:bg-slate-50 font-medium"
            >
              {[addr.line1, addr.line2, addr.town].filter(Boolean).join(', ')}
            </button>
          ))}
        </div>
      )}

      {hasSearched && !isSearching && results.length === 0 && !searchError && (
        <p className="text-xs text-slate-400 px-1">No addresses returned.</p>
      )}
    </div>
  );
}