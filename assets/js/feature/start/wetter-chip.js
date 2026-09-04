/* Das Wetterplaettchen in der Kopfleiste.

   Eigene Datei, weil es das Einzige auf Start ist, das an einem
   fremden Dienst haengt (open-meteo) und ohne Anmeldung auskommt.
   Faellt es aus, faellt nur es aus. */

import { weatherIcon } from '../../shell.js?v=7';
(() => {
  const chip = document.getElementById('wxChip');
  if (!chip) return;
  const icEl = document.getElementById('wxChipIc');
  const tEl  = document.getElementById('wxChipTemp');
  const EMOJI = code => weatherIcon(code, 14);
  const DEFAULT_LOC = { name:'Vaduz', latitude:47.141, longitude:9.521 };
  function getLoc() {
    try { const v = JSON.parse(localStorage.getItem('tvza-weather-loc') || 'null'); if (v && v.latitude != null) return v; } catch(e){}
    return DEFAULT_LOC;
  }
  let fetched = false;
  async function fetchChip() {
    if (fetched) return; fetched = true;
    chip.classList.add('loading');
    const finish = () => chip.classList.remove('loading');
    const go = async (l) => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${l.latitude}&longitude=${l.longitude}&current=temperature_2m,weather_code&timezone=auto`);
        if (!r.ok) throw 0;
        const j = await r.json();
        const c = j.current;
        if (c) { icEl.innerHTML = EMOJI(c.weather_code); tEl.textContent = Math.round(c.temperature_2m) + '°'; }
      } catch(e) { /* leave placeholder */ }
      finish();
    };
    const saved = getLoc();
    const hadSaved = (() => { try { return !!localStorage.getItem('tvza-weather-loc'); } catch(e){ return false; } })();
    if (!hadSaved && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => go({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => go(saved),
        { enableHighAccuracy:false, timeout:6000, maximumAge:1800000 });
    } else {
      go(saved);
    }
  }
  window.tvzaWeatherChip = {
    setVisible(v) {
      chip.style.display = v ? '' : 'none';
      if (v) fetchChip();
    }
  };
  // If the modules were resolved before this ran, apply that now.
  if (window.tvzaWeatherWanted !== undefined) {
    window.tvzaWeatherChip.setVisible(window.tvzaWeatherWanted);
  }
})();
