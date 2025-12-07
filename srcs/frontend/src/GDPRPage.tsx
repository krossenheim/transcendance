import { useState } from "react";

export default function GDPRPage({ showToast, onNavigateBack }: { showToast?: (m: string, t: 'success' | 'error') => void; onNavigateBack?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);

  const jwt = () => localStorage.getItem('jwt');
  const getCurrentUserId = (): number | null => {
    try {
      const jd = localStorage.getItem('jwt');
      if (!jd) return null;
      const payload = JSON.parse(atob(jd.split('.')[1]!));
      return typeof payload?.uid === 'number' ? payload.uid : (payload?.uid ? Number(payload.uid) : null);
    } catch (e) {
      return null;
    }
  };

  const fetchMyData = async () => {
    setLoading(true);
    setData(null);
    try {
      // Endpoint expects a POST with GenericAuthClientRequest { userId }
      const userId = getCurrentUserId();
      if (!userId) {
        showToast?.('Not signed in', 'error');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/auth/gdpr/me', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      showToast?.('Personal data fetched', 'success');
    } catch (err: any) {
      console.error('fetchMyData error', err);
      showToast?.('Failed to fetch personal data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const doAnonymize = async () => {
    if (!confirm('Are you sure you want to request anonymization? This will remove personal identifiers.')) return;
    setLoading(true);
    try {
      const userId = getCurrentUserId();
      if (!userId) {
        showToast?.('Not signed in', 'error');
        setLoading(false);
        return;
      }

      // include userId in body per GenericAuthClientRequest
      const res = await fetch('/api/auth/gdpr/anonymize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${jwt()}`
        },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Anonymize failed');
      showToast?.('Anonymization request successful', 'success');
      // Optionally refresh view
      await fetchMyData();
      onNavigateBack?.();
    } catch (err) {
      console.error('doAnonymize error', err);
      showToast?.('Anonymization failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const doDelete = async () => {
    if (!confirm('Are you sure you want to request account deletion? This is irreversible.')) return;
    setLoading(true);
    try {
      const userId = getCurrentUserId();
      if (!userId) {
        showToast?.('Not signed in', 'error');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/auth/gdpr/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${jwt()}`
        },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast?.('Account deletion requested', 'success');
      onNavigateBack?.();
    } catch (err) {
      console.error('doDelete error', err);
      showToast?.('Account deletion failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Manage My Data (GDPR)</h2>
          <div className="flex gap-2">
            <button onClick={() => onNavigateBack?.()} className="px-3 py-1 text-sm bg-gray-200 rounded">Back</button>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">Use the controls below to view, anonymize or delete your personal data.</p>

          <div className="flex gap-3">
            <button onClick={fetchMyData} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">View My Data</button>
            <button onClick={doAnonymize} disabled={loading} className="px-4 py-2 bg-yellow-600 text-white rounded">Request Anonymization</button>
            <button onClick={doDelete} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded">Request Account Deletion</button>
          </div>

          <div>
            {loading && <div className="text-sm text-gray-500">Processing…</div>}
            {data && (
              <pre className="mt-3 max-h-80 overflow-auto bg-gray-100 dark:bg-dark-700 p-3 rounded text-xs text-gray-800 dark:text-gray-200">{JSON.stringify(data, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
