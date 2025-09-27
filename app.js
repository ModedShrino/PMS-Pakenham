// FRONTEND-ONLY PMS Prototype with localStorage 'DB'
const $ = (s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));

// ---------------- DB layer (localStorage) ----------------
const DB = {
  key: 'pms-localdb-v2',
  seed() {
    const init = {
      settings: { cancelWindowHours: 24, attendanceThreshold: 75 },
      users: [
        { id:'U1', role:'patient', email:'first.patient@example.com', pass:'patientpass', name:'First Patient', dob:'', phone:'', treatment:'', disciplinary:'', notifications:[] },
        { id:'U2', role:'doctor',  email:'doctor@example.com', pass:'docpass', name:'Dr. Steven Rao' },
        { id:'U3', role:'admin',   username:'admin@pakenham', pass:'admin123', name:'System Administrator' }
      ],
      practitioners: [
        { id:'D100', name:'Dr. Maya Patel', type:'medical' },
        { id:'D101', name:'Dr. Steven Rao', type:'medical' },
        { id:'C200', name:'Alex Kim (Counsellor)', type:'counselling' }
      ],
      appointments: [
        // { id, patientId, practitionerId, type, date, time, status:'booked'|'cancelled'|'attended' }
      ],
      waitlist: [
        // { id, patientId, practitionerId, type, date, time, createdAt }
      ],
      tickets: [
        // { id, patientId, subject, message, status, createdAt }
      ],
      attendance: [
        // { id, appointmentId, patientId, checkedAt }
      ]
    };
    localStorage.setItem(this.key, JSON.stringify(init));
    return init;
  },
  load() {
    const raw = localStorage.getItem(this.key);
    if (!raw) return this.seed();
    try { return JSON.parse(raw); } catch { return this.seed(); }
  },
  save(db){ localStorage.setItem(this.key, JSON.stringify(db)); }
};
let db = DB.load();

// ---------------- Utils ----------------
const uid = (p='id') => p + Math.random().toString(36).slice(2,9);
const todayISO = ()=> new Date().toISOString().slice(0,10);
const fmtDate = (d)=> new Date(d).toLocaleDateString();
const toast = (el, msg, t=2200)=>{ el.textContent=msg; setTimeout(()=>el.textContent='',t); };
const bellCount = $('#bellCount');

// ---------------- State ----------------
const state = { user:null }; // {id, role, name, email/username}

// ---------------- App shell helpers ----------------
const appRoot = $('#appRoot'); const whoami = $('#whoami');
function enterApp(viewId){
  document.body.classList.add('app-mode'); appRoot.classList.remove('hidden');
  $$('#appRoot .view').forEach(v=>v.classList.add('hidden')); $('#'+viewId).classList.remove('hidden');
  const name = state.user.name || '';
  if(state.user.role==='patient') whoami.textContent = `Patient: ${name}`;
  if(state.user.role==='doctor')  whoami.textContent = `Doctor: ${name}`;
  if(state.user.role==='admin')   whoami.textContent = `Administrator: ${name}`;
  refreshNotificationsBadge();
  maybeShowAttendanceBanner();
}
function logout(){
  state.user = null;
  document.body.classList.remove('app-mode'); appRoot.classList.add('hidden');
  document.body.scrollIntoView({behavior:'smooth'});
}

// ---------------- Auth ----------------
$('#patientLoginBtn').onclick = ()=>{
  const email = $('#patientEmail').value.trim();
  const pass  = $('#patientPass').value.trim();
  const u = db.users.find(x=>x.role==='patient' && x.email===email && x.pass===pass);
  if(!u) return alert('Invalid patient credentials');
  state.user = u; enterApp('patientView'); mountPatient();
};
$('#doctorLogin').onclick = ()=>{
  const email = $('#doctorEmail').value.trim();
  const pass  = $('#doctorPass').value.trim();
  const u = db.users.find(x=>x.role==='doctor' && x.email===email && x.pass===pass);
  if(!u) return alert('Invalid doctor credentials');
  state.user = u; enterApp('doctorView'); mountDoctor();
};
$('#adminLogin').onclick = ()=>{
  const user = $('#adminUser').value.trim();
  const pass = $('#adminPass').value.trim();
  const u = db.users.find(x=>x.role==='admin' && x.username===user && x.pass===pass);
  if(!u) return alert('Invalid admin credentials');
  state.user = u; enterApp('adminView'); mountAdmin();
};
$('#registerBtn').onclick = ()=>{
  const name=$('#regName').value.trim(), email=$('#regEmail').value.trim(), pass=$('#regPass').value.trim();
  const dob=$('#regDob').value, phone=$('#regPhone').value.trim();
  if(!name||!email||!pass) return alert('Please complete required fields.');
  if(db.users.some(x=>x.email===email)) return alert('Email already registered.');
  const u = { id: uid('U'), role:'patient', email, pass, name, dob, phone, treatment:'', disciplinary:'', notifications:[] };
  db.users.push(u); DB.save(db);
  alert('Account created. You can log in now.');
};

$('#logoutBtn').onclick = logout;

// ---------------- Notifications ----------------
function addNotification(patientId, text){
  const u = db.users.find(x=>x.id===patientId);
  if(!u || u.role!=='patient') return;
  u.notifications = u.notifications || [];
  u.notifications.push({ id: uid('N'), text, at: new Date().toISOString() });
  DB.save(db);
  if(state.user && state.user.id===patientId) refreshNotificationsBadge();
}
function refreshNotificationsBadge(){
  if(!(state.user && state.user.role==='patient')){ bellCount.classList.add('hidden'); return; }
  const u = db.users.find(x=>x.id===state.user.id);
  const c = (u.notifications||[]).length;
  if(c>0){ bellCount.classList.remove('hidden'); bellCount.textContent = ''; } else bellCount.classList.add('hidden');
}
$('#bellBtn').onclick = ()=>{
  if(!(state.user && state.user.role==='patient')) return;
  const u = db.users.find(x=>x.id===state.user.id);
  const list = (u.notifications||[]);
  const msgs = list.map(n=>`• ${new Date(n.at).toLocaleString()} — ${n.text}`).join('\\n') || 'No notifications.';
  alert(msgs);
  u.notifications = []; DB.save(db); refreshNotificationsBadge();
};

// ---------------- Policies ----------------
function getPolicy(){ return db.settings; }
function savePolicy({cancelWindowHours, attendanceThreshold}){
  db.settings.cancelWindowHours = Number(cancelWindowHours);
  db.settings.attendanceThreshold = Number(attendanceThreshold);
  DB.save(db);
}

// ---------------- Appointments / Waitlist ----------------
function slotTaken(practitionerId, date, time){
  return db.appointments.some(a=>a.practitionerId===practitionerId && a.date===date && a.time===time && a.status==='booked');
}
function enqueueWaitlist(patientId, practitionerId, type, date, time){
  db.waitlist.push({ id: uid('W'), patientId, practitionerId, type, date, time, createdAt: new Date().toISOString() });
  DB.save(db);
}
function promoteWaitlistIfAny(practitionerId, date, time){
  // FIFO for the exact slot
  const idx = db.waitlist.findIndex(w=>w.practitionerId===practitionerId && w.date===date && w.time===time);
  if(idx===-1) return;
  const w = db.waitlist.splice(idx,1)[0];
  const appt = { id: uid('A'), patientId: w.patientId, practitionerId, type:w.type, date, time, status:'booked' };
  db.appointments.push(appt); DB.save(db);
  addNotification(w.patientId, `You have been auto-promoted from waitlist to ${fmtDate(date)} ${time}.`);
}
function patientAppointments(patientId){
  return db.appointments.filter(a=>a.patientId===patientId).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}
function doctorAppointments(pracId){
  return db.appointments.filter(a=>a.practitionerId===pracId && a.status==='booked').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}

// ---------------- Attendance + banner ----------------
function recordCheckIn(apptId, patientId){
  db.attendance.push({ id: uid('AT'), appointmentId: apptId, patientId, checkedAt: new Date().toISOString() });
  const a = db.appointments.find(x=>x.id===apptId);
  if(a) a.status='attended';
  DB.save(db);
}
function attendancePercentage(patientId){
  const total = db.appointments.filter(a=>a.patientId===patientId).length;
  const attendedIds = new Set(db.attendance.filter(x=>x.patientId===patientId).map(x=>x.appointmentId));
  const attended = db.appointments.filter(a=>attendedIds.has(a.id)).length;
  if(total===0) return 100;
  return Math.round(attended * 100 / total);
}
function maybeShowAttendanceBanner(){
  if(!(state.user && state.user.role==='patient')) return;
  const pct = attendancePercentage(state.user.id);
  const th = getPolicy().attendanceThreshold ?? 75;
  const banner = $('#lowAttendanceBanner');
  if(pct < th){ banner.classList.remove('hidden'); } else { banner.classList.add('hidden'); }
}

// ---------------- Tickets ----------------
function createTicket(patientId, subject, message){
  db.tickets.push({ id: uid('T'), patientId, subject, message, status:'open', createdAt: new Date().toISOString() });
  DB.save(db);
}
function myTickets(patientId){
  return db.tickets.filter(t=>t.patientId===patientId).sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
}

// ---------------- Patient UI ----------------
function mountPatient(){
  // Prefill profile
  $('#pfName').value = state.user.name||'';
  $('#pfDob').value  = state.user.dob||'';
  $('#pfPhone').value= state.user.phone||'';
  $('#pfTreat').value= state.user.treatment||'';
  $('#pfDisc').value = state.user.disciplinary||'';

  // Service type + practitioners
  function loadPractitioners(){
    const type = $('#svcType').value;
    const list = db.practitioners.filter(p=>p.type===type);
    $('#bookDoctor').innerHTML = list.map(p=>`<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
  }
  $('#svcType').onchange = loadPractitioners; loadPractitioners();

  // Book
  $('#bookBtn').onclick = ()=>{
    const type = $('#svcType').value;
    const practitionerId = $('#bookDoctor').value;
    const date = $('#bookDate').value;
    const time = $('#bookTime').value;
    const msg = $('#bookMsg');
    if(!practitionerId || !date || !time) return toast(msg,'Choose practitioner, date, and time.');
    if(slotTaken(practitionerId, date, time)){
      if(confirm('Slot unavailable. Join waitlist?')){
        enqueueWaitlist(state.user.id, practitionerId, type, date, time);
        toast(msg,'Added to waitlist.'); return renderMyAppts();
      } else return;
    }
    const appt = { id: uid('A'), patientId: state.user.id, practitionerId, type, date, time, status:'booked' };
    db.appointments.push(appt); DB.save(db);
    toast(msg,'Appointment booked.'); renderMyAppts();
  };

  // Profile save
  $('#saveProfile').onclick = ()=>{
    const u = db.users.find(x=>x.id===state.user.id);
    u.name=$('#pfName').value.trim();
    u.dob =$('#pfDob').value;
    u.phone=$('#pfPhone').value.trim();
    u.treatment=$('#pfTreat').value;
    u.disciplinary=$('#pfDisc').value;
    DB.save(db);
    state.user=u;
    $('#pfMsg').textContent='Saved.'; setTimeout(()=>$('#pfMsg').textContent='',1500);
    maybeShowAttendanceBanner();
  };

  // Tickets
  $('#tkCreate').onclick = ()=>{
    const s=$('#tkSubject').value.trim(), m=$('#tkMessage').value.trim();
    if(!s||!m) return alert('Subject and message required.');
    createTicket(state.user.id, s, m); $('#tkSubject').value=''; $('#tkMessage').value='';
    renderMyTickets();
  };

  renderMyAppts(); renderMyTickets(); maybeShowAttendanceBanner();
}

function renderMyAppts(){
  const wrap = $('#myAppts');
  const rows = patientAppointments(state.user.id);
  if(rows.length===0){ wrap.innerHTML = '<p class="muted">No appointments yet.</p>'; return; }
  wrap.innerHTML = rows.map(a=>{
    const p = db.practitioners.find(p=>p.id===a.practitionerId);
    const label = p ? `${p.name} (${p.id})` : a.practitionerId;
    const chips = `<span class="badge-pill">${a.type}</span> <span class="badge-pill">${a.status}</span>`;
    return `<div class="list row">
      <div><strong>${fmtDate(a.date)} ${a.time}</strong> with ${label} ${chips}</div>
      <div>
        ${a.status==='booked'? `<button class="btn sm" data-check="${a.id}">Check in</button>
        <button class="btn sm" data-cancel="${a.id}">Cancel</button>` : ''}
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-cancel]').forEach(btn=> btn.onclick = ()=>{
    const id = btn.dataset.cancel;
    const a = db.appointments.find(x=>x.id===id);
    if(!a) return;
    // policy window
    const hours = getPolicy().cancelWindowHours ?? 24;
    const when = new Date(`${a.date}T${a.time}:00`);
    const diff = (when - new Date())/36e5;
    if(diff < hours) return alert(`Cancellation not allowed within ${hours}h.`);
    a.status='cancelled'; DB.save(db); renderMyAppts();
    // promote waitlist
    promoteWaitlistIfAny(a.practitionerId, a.date, a.time);
  });

  wrap.querySelectorAll('[data-check]').forEach(btn=> btn.onclick = ()=>{
    const id = btn.dataset.check;
    recordCheckIn(id, state.user.id);
    renderMyAppts(); maybeShowAttendanceBanner();
  });
}

function renderMyTickets(){
  const wrap = $('#myTickets');
  const rows = myTickets(state.user.id);
  if(rows.length===0){ wrap.innerHTML='<p class="muted">No tickets yet.</p>'; return; }
  wrap.innerHTML = rows.map(t=> `<div class="list row">
    <div><strong>#${t.id}</strong> ${t.subject} <span class="muted">(${t.status})</span></div>
    <div class="muted">${new Date(t.createdAt).toLocaleString()}</div>
  </div>`).join('');
}

// ---------------- Doctor UI ----------------
function mountDoctor(){
  $('#doctorMeta').textContent = new Date().toLocaleDateString();
  renderDoctorSched();
}
function renderDoctorSched(){
  const wrap = $('#doctorSched');
  // Map doctor user to practitioner id by name match (demo)
  const me = db.practitioners.find(p=>p.name===state.user.name) || db.practitioners[0];
  const rows = doctorAppointments(me.id);
  if(rows.length===0){ wrap.innerHTML = '<p class="muted">No upcoming appointments.</p>'; return; }
  wrap.innerHTML = rows.map(a=>{
    const pat = db.users.find(u=>u.id===a.patientId)?.name || 'Patient';
    return `<div class="list row">
      <div><strong>${fmtDate(a.date)} ${a.time}</strong> — ${pat} <span class="badge-pill">${a.type}</span></div>
      <div>${a.status==='booked'? `<button class="btn sm" data-mark="${a.id}">Mark attended</button>`:''}</div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-mark]').forEach(b=> b.onclick=()=>{ recordCheckIn(b.dataset.mark, db.appointments.find(x=>x.id===b.dataset.mark).patientId); renderDoctorSched(); });
}

// ---------------- Admin UI ----------------
function mountAdmin(){
  // Policy
  $('#cancelWindow').value = getPolicy().cancelWindowHours;
  $('#attendanceThresh').value = getPolicy().attendanceThreshold;
  $('#savePolicy').onclick = ()=>{
    savePolicy({ cancelWindowHours: $('#cancelWindow').value, attendanceThreshold: $('#attendanceThresh').value });
    $('#policyMsg').textContent='Saved.'; setTimeout(()=>$('#policyMsg').textContent='',1500);
  };

  // Practitioners
  function renderDocs(){
    const list = $('#doctorList');
    list.innerHTML = db.practitioners.map(p=>`
      <div class="row">
        <div>${p.name} <span class="muted">(${p.id})</span> <span class="badge-pill">${p.type}</span></div>
        <button class="btn sm" data-del="${p.id}">Remove</button>
      </div>`).join('');
    list.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
      // prevent removal if appointments exist
      if(db.appointments.some(a=>a.practitionerId===b.dataset.del && a.status==='booked')) return alert('Practitioner has booked appointments.');
      db.practitioners = db.practitioners.filter(p=>p.id!==b.dataset.del); DB.save(db); renderDocs();
    });
  }
  renderDocs();
  $('#addDoctor').onclick = ()=>{
    const id=$('#newDocId').value.trim(), name=$('#newDocName').value.trim(), type=$('#newDocType').value;
    if(!id||!name) return alert('Enter ID and name.');
    if(db.practitioners.some(p=>p.id===id)) return alert('ID exists.');
    db.practitioners.push({ id, name, type }); DB.save(db);
    $('#newDocId').value=''; $('#newDocName').value=''; renderDocs();
  };

  // Waitlist admin view
  function renderWait(){
    const w = db.waitlist.slice().sort((a,b)=> a.createdAt.localeCompare(b.createdAt));
    const wrap = $('#waitListAdmin');
    if(w.length===0){ wrap.innerHTML='<p class="muted">No waitlist entries.</p>'; return; }
    wrap.innerHTML = w.map(x=>{
      const pat = db.users.find(u=>u.id===x.patientId)?.name || 'Patient';
      const prac = db.practitioners.find(p=>p.id===x.practitionerId)?.name || x.practitionerId;
      return `<div class="list row">
        <div><strong>${fmtDate(x.date)} ${x.time}</strong> — ${pat} → ${prac} <span class="badge-pill">${x.type}</span></div>
        <div><button class="btn sm" data-promote="${x.id}">Promote</button> <button class="btn sm" data-remove="${x.id}">Remove</button></div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-promote]').forEach(b=> b.onclick=()=>{
      const w = db.waitlist.find(i=>i.id===b.dataset.promote);
      if(!w) return; if(slotTaken(w.practitionerId, w.date, w.time)) return alert('Slot still unavailable.');
      // promote
      const appt = { id: uid('A'), patientId: w.patientId, practitionerId: w.practitionerId, type:w.type, date:w.date, time:w.time, status:'booked' };
      db.appointments.push(appt);
      db.waitlist = db.waitlist.filter(i=>i.id!==w.id);
      DB.save(db);
      addNotification(w.patientId, `You have been promoted from waitlist to ${fmtDate(w.date)} ${w.time}.`);
      renderWait();
    });
    wrap.querySelectorAll('[data-remove]').forEach(b=> b.onclick=()=>{ db.waitlist = db.waitlist.filter(i=>i.id!==b.dataset.remove); DB.save(db); renderWait(); });
  }
  renderWait();
}

// ---------------- Chatbot ----------------
const botPairs = [
  [/book/i, 'To book: select service → practitioner → date/time → Book. If a slot is full, you can join the waitlist.'],
  [/cancel/i, ()=>`You can cancel from “My Appointments” if more than ${getPolicy().cancelWindowHours} hours remain.`],
  [/waitlist/i, 'Waitlist is FIFO. When a slot opens, you are auto-promoted and notified.'],
  [/policy|window|threshold/i, ()=>`Cancel window: ${getPolicy().cancelWindowHours}h. Attendance threshold: ${getPolicy().attendanceThreshold}%.`],
  [/attendance|check[- ]?in/i, 'Patients can Check in from My Appointments; doctors can mark attended from their schedule.'],
  [/counsel/i, 'Choose Service Type “Counselling” to book a session with a counsellor.'],
  [/create ticket:(.*?)-(.*)/i, (m)=>{
    if(!(state.user && state.user.role==='patient')) return 'Please log in as a patient to create a ticket.';
    const subject = m[1].trim(); const message = m[2].trim();
    if(!subject||!message) return 'Usage: create ticket: subject - message';
    createTicket(state.user.id, subject, message);
    return 'Ticket created.';
  }],
  [/.*/, 'Sorry, I can answer about booking, cancelling, waitlists, policies, attendance, and tickets.']
];
function botReply(text){
  const body = $('#botBody');
  const user = document.createElement('div'); user.className='user-msg'; user.textContent=text; body.appendChild(user);
  let resp='';
  for(const [q,a] of botPairs){
    const m = text.match(q);
    if(m){ resp = typeof a==='function'? a(m): a; break; }
  }
  const bot = document.createElement('div'); bot.className='bot-msg'; bot.textContent = resp;
  setTimeout(()=>{ body.appendChild(bot); body.scrollTop = body.scrollHeight; }, 120);
}
$('#botToggle').onclick = ()=> $('#botPanel').classList.toggle('hidden');
$('#botClose').onclick = ()=> $('#botPanel').classList.add('hidden');
$('#botSend').onclick = ()=>{ const v=$('#botInput').value.trim(); if(!v) return; $('#botInput').value=''; botReply(v); };
$('#botInput').addEventListener('keypress', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); $('#botSend').click(); } });

// ---------------- Init ----------------
(()=>{
  // nothing else
})();
