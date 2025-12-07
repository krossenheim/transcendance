import React, { useEffect, useState } from 'react';

function setCookie(name: string, value: string, days = 365) {
  const d = new Date(); d.setTime(d.getTime() + days * 24*60*60*1000);
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;SameSite=Lax;expires=${d.toUTCString()}`;
}
function getCookie(name: string) {
  const m = document.cookie.split('; ').find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookie('cookie_consent')) setVisible(true);
  }, []);

  const accept = async () => {
    setCookie('cookie_consent', 'accepted');
    setVisible(false);
    // Optional: persist to server for logged-in users:
    // await fetch('/api/user/cookie-preferences', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({consent:'accepted'}) });
  };

  const reject = async () => {
    // Don't set cookie - just dismiss for this session
    // Banner will show again on next visit
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <>
      {/* Dimmed overlay */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9998,
      }} />
      {/* Cookie banner */}
      <div style={{position:'fixed',bottom:12,left:12,right:12,background:'#111',color:'#fff',padding:12,borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center',zIndex:9999}}>
        <div style={{maxWidth:'70%'}}>We use cookies to improve your experience. You may accept or reject non-essential cookies.</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={accept} style={{background:'#28a745',color:'#fff',border:'none',padding:'8px 12px',borderRadius:6,cursor:'pointer'}}>Accept</button>
          <button onClick={reject} style={{background:'#6c757d',color:'#fff',border:'none',padding:'8px 12px',borderRadius:6,cursor:'pointer'}}>Reject</button>
        </div>
      </div>
    </>
  );
}