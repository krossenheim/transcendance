(function(){
  function setCookie(name, value, days=365){
    const d = new Date(); d.setTime(d.getTime() + days*24*60*60*1000);
    document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;SameSite=Lax;expires=' + d.toUTCString();
  }
  function getCookie(name){
    const m = document.cookie.split('; ').find(c => c.startsWith(name + '='));
    return m ? decodeURIComponent(m.split('=')[1]) : null;
  }

  function hideBanner(){
    const el = document.getElementById('cookie-banner');
    if(el) el.style.display = 'none';
  }

  function init(){
    const consent = getCookie('cookie_consent');
    if(consent){ hideBanner(); return; }

    // If cookie-banner element isn't present, attempt to load it dynamically
    if(!document.getElementById('cookie-banner')){
      fetch('/cookie-banner.html').then(r => r.text()).then(html => {
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
        attachHandlers();
      }).catch(()=>{});
    } else {
      attachHandlers();
    }
  }

  function attachHandlers(){
    const accept = document.getElementById('cookie-accept');
    const reject = document.getElementById('cookie-reject');
    if(accept) accept.addEventListener('click', () => {
      setCookie('cookie_consent', 'accepted');
      // Optionally inform server-side by sending header or calling an endpoint
      hideBanner();
    });
    if(reject) reject.addEventListener('click', () => {
      setCookie('cookie_consent', 'rejected');
      hideBanner();
    });
  }

  // initialize after DOM ready
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
