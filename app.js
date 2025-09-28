// Simple app.js using PrayTimes (assumes global PrayTimes)
const pray = new PrayTimes();
const methods = {
  "MWL":"MWL","ISNA":"ISNA","Egypt":"Egypt","Makkah":"Makkah","Karachi":"Karachi","Tehran":"Tehran","Jafari":"Jafari"
};
const defaultSettings = {
  method:"MWL", asr:"Standard", iqama:[10,5,5,10,10], notify:true
};
let settings = JSON.parse(localStorage.getItem('pt-settings')||'null') || defaultSettings;
const elems = {
  methodSelect: document.getElementById('method-select'),
  locBtn: document.getElementById('loc-btn'),
  timesDiv: document.getElementById('times'),
  date: document.getElementById('date'),
  location: document.getElementById('location'),
  next: document.getElementById('next'),
  modal: document.getElementById('modal'),
  settingsBtn: document.getElementById('settings-btn'),
  calcMethod: document.getElementById('calcMethod'),
  asrMethod: document.getElementById('asrMethod'),
  iqamaInput: document.getElementById('iqamaInput'),
  notifyToggle: document.getElementById('notifyToggle'),
  saveSettings: document.getElementById('saveSettings'),
  closeModal: document.getElementById('closeModal'),
  alarmSound: document.getElementById('alarmSound'),
};

function initUI(){
  // fill selects
  Object.keys(methods).forEach(k=>{
    const o = document.createElement('option'); o.value=k; o.textContent=k; elems.methodSelect.appendChild(o);
    const o2 = o.cloneNode(true); elems.calcMethod.appendChild(o2);
  });
  elems.methodSelect.value = settings.method;
  elems.calcMethod.value = settings.method;
  elems.asrMethod.value = settings.asr;
  elems.iqamaInput.value = settings.iqama.join(',');
  elems.notifyToggle.checked = settings.notify;
}
function saveSettingsFromModal(){
  settings.method = elems.calcMethod.value;
  settings.asr = elems.asrMethod.value;
  settings.iqama = elems.iqamaInput.value.split(',').map(n=>parseInt(n)||0);
  settings.notify = elems.notifyToggle.checked;
  localStorage.setItem('pt-settings', JSON.stringify(settings));
  elems.modal.classList.add('hidden');
  computeAndRender(lastCoords);
}
elems.settingsBtn.onclick = ()=> elems.modal.classList.remove('hidden');
elems.closeModal.onclick = ()=> elems.modal.classList.add('hidden');
elems.saveSettings.onclick = saveSettingsFromModal;
elems.methodSelect.onchange = (e)=>{ settings.method = e.target.value; localStorage.setItem('pt-settings', JSON.stringify(settings)); computeAndRender(lastCoords); }

let lastCoords = {lat:24.7136, lon:46.6753, name:'Riyadh, SA'}; // default
initUI();

function formatTime(d){
  return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function computeAndRender(coords){
  const now = new Date();
  document.getElementById('date').textContent = now.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  document.getElementById('location').textContent = coords.name || `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`;

  pray.setMethod(settings.method);
  pray.adjust({asr: settings.asr==='Hanafi' ? 'Hanafi' : 'Standard'});
  const times = pray.getTimes(now, [coords.lat, coords.lon], now.getTimezoneOffset()/ -60);
  const order = ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'];
  elems.timesDiv.innerHTML = '';
  const prayerTimes = {};
  order.forEach((k,i)=>{
    const t = times[k.toLowerCase()] || times[k];
    if(!t) return;
    const dateTime = new Date(t);
    prayerTimes[k] = dateTime;
    if(k === 'Sunrise'){
      // skip iqama for sunrise
    }
    const card = document.createElement('div');
    card.className = 'prayer';
    card.innerHTML = `<div class="name">${k}</div><div class="time">${formatTime(dateTime)}</div>` +
      (['Fajr','Dhuhr','Asr','Maghrib','Isha'].includes(k) ? `<div class="iqama">Iqama: ${getIqamaFor(k)} min</div>` : '');
    elems.timesDiv.appendChild(card);
  });

  // next prayer
  let nextName = null, nextTime = null;
  Object.entries(prayerTimes).forEach(([name, dt])=>{
    if(dt > now && (!nextTime || dt < nextTime)){ nextTime = dt; nextName = name; }
  });
  if(!nextTime){
    // if none left, compute tomorrow Fajr
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
    const t2 = pray.getTimes(tomorrow, [coords.lat, coords.lon], tomorrow.getTimezoneOffset()/ -60);
    nextName = 'Fajr'; nextTime = new Date(t2.fajr);
  }
  renderNext(nextName, nextTime);
  scheduleAlarms(prayerTimes);
}

function getIqamaFor(name){
  const map = {Fajr:0,Dhuhr:1,Asr:2,Maghrib:3,Isha:4};
  return settings.iqama[map[name]] ?? 0;
}

function renderNext(name, time){
  const now = new Date();
  const diff = Math.max(0, Math.floor((time - now)/1000));
  const hrs = Math.floor(diff/3600); const mins = Math.floor((diff%3600)/60); const secs = diff%60;
  elems.next.innerHTML = `<div>Next: <strong>${name}</strong> at ${formatTime(time)}</div><div>${hrs}h ${mins}m ${secs}s</div>`;
  // update every second
  clearInterval(window.__pt_timer);
  window.__pt_timer = setInterval(()=> renderNext(name, time), 1000);
}

function scheduleAlarms(prayerTimes){
  // Clear previous timers
  if(window.__pt_alarm_timers) window.__pt_alarm_timers.forEach(t=>clearTimeout(t));
  window.__pt_alarm_timers = [];
  const now = new Date();
  Object.entries(prayerTimes).forEach(([name, dt])=>{
    const delay = dt - now;
    if(delay<=0) return;
    const id = setTimeout(()=> fireAlarm(name), delay);
    window.__pt_alarm_timers.push(id);
    // also schedule iqama countdown notification if iqama>0
    const iq = getIqamaFor(name);
    if(iq>0){
      const iqTime = new Date(dt.getTime() + iq*60000);
      const delay2 = iqTime - now;
      if(delay2>0){
        const id2 = setTimeout(()=> fireIqama(name), delay2);
        window.__pt_alarm_timers.push(id2);
      }
    }
  });
}

function fireAlarm(name){
  // play sound and show notification
  elems.alarmSound.play().catch(()=>{});
  if(settings.notify && Notification.permission === 'granted'){
    new Notification(`${name} time`, {body:`It's time for ${name} prayer.`});
  }
}

function fireIqama(name){
  elems.alarmSound.play().catch(()=>{});
  if(settings.notify && Notification.permission === 'granted'){
    new Notification(`Iqama — ${name}`, {body:`Iqama for ${name} now.`});
  }
}

// location handling
document.getElementById('loc-btn').onclick = ()=>{
  if(!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude:lat, longitude:lon} = pos.coords;
    lastCoords = {lat, lon, name:`${lat.toFixed(3)},${lon.toFixed(3)}`};
    computeAndRender(lastCoords);
  }, err=>{
    alert('Location denied or unavailable.');
  });
};

// Ask notification permission if enabled
if(settings.notify && 'Notification' in window && Notification.permission !== 'granted'){
  Notification.requestPermission();
}

// initial compute
computeAndRender(lastCoords);

// optional: update every minute to refresh countdowns and next prayer crossing midnight
setInterval(()=> computeAndRender(lastCoords), 60_000);
