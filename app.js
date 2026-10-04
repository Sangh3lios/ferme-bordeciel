const SUPABASE_URL = "https://wwxckwlkipqivexfantv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jLeIPtgbI6ACcGi1nmDJpQ_9FaeFSgN";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = { user:null, profile:null, view:"dashboard", products:[], destinations:[], entries:[], profiles:[] };

const money = n => Number(n||0).toFixed(2).replace(".",",")+" septimes";
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

async function init(){
  const {data:{session}} = await db.auth.getSession();
  if(session) await loadApp(session.user); else renderLogin();
  db.auth.onAuthStateChange(async (_event,session)=>{
    if(session) await loadApp(session.user); else {state.user=null;state.profile=null;renderLogin();}
  });
}

async function loadApp(user){
  state.user=user;
  const [{data:profile,error:pErr},{data:products},{data:destinations}] = await Promise.all([
    db.from("profiles").select("*").eq("id",user.id).single(),
    db.from("products").select("*").eq("active",true).order("name"),
    db.from("destinations").select("*").order("id")
  ]);
  if(pErr){ alert(pErr.message); return; }
  state.profile=profile; state.products=products||[]; state.destinations=destinations||[];
  state.view=profile.role==="admin"?"dashboard":"declare";
  await refresh(); render();
}

async function refresh(){
  const q = state.profile.role==="admin"
    ? db.from("harvest_register").select("*").order("created_at",{ascending:false})
    : db.from("harvests").select("*").eq("employee_id",state.user.id).order("created_at",{ascending:false});
  const {data,error}=await q;
  if(error) alert(error.message);
  state.entries=data||[];
  if(state.profile.role==="admin"){
    const {data:p}=await db.from("profiles").select("*").order("name");
    state.profiles=p||[];
  }
}

function renderLogin(){
 document.getElementById("app").innerHTML=`<main><div class="card login"><h1>⚔ Registre de la Ferme</h1><p class="sub">Bordeciel · registre partagé</p>
 <form onsubmit="login(event)"><label>Email</label><input id="email" type="email" required>
 <label>Mot de passe</label><input id="password" type="password" required>
 <div id="err" class="error"></div><button style="margin-top:14px;width:100%">Entrer au registre</button></form></div></main>`;
}
async function login(e){
 e.preventDefault(); const {error}=await db.auth.signInWithPassword({email:email.value,password:password.value});
 if(error) document.getElementById("err").textContent=error.message;
}
async function logout(){await db.auth.signOut()}

function layout(){
 const admin=state.profile.role==="admin";
 document.getElementById("app").innerHTML=`<header><div><h1>⚔ Registre de la Ferme</h1><div class="sub">${admin?"Administration":"Espace employé"} · ${esc(state.profile.name)}</div></div><button class="secondary" onclick="logout()">Déconnexion</button></header>
 <main><nav>${admin?`
 <button onclick="go('dashboard')" class="${state.view==="dashboard"?"active":""}">Tableau de bord</button>
 <button onclick="go('register')" class="${state.view==="register"?"active":""}">Registre</button>
 <button onclick="go('employees')" class="${state.view==="employees"?"active":""}">Employés</button>
 <button onclick="go('prices')" class="${state.view==="prices"?"active":""}">Tarifs</button>
 <button onclick="go('payments')" class="${state.view==="payments"?"active":""}">Salaires</button>`:`
 <button onclick="go('declare')" class="${state.view==="declare"?"active":""}">Déclarer</button>
 <button onclick="go('mine')" class="${state.view==="mine"?"active":""}">Mon registre</button>`}</nav>${viewHtml()}</main>`;
}
function go(v){state.view=v;render()}
function render(){layout()}

function viewHtml(){
 if(state.profile.role==="admin"){
  return ({dashboard:adminDashboard,register:register,employees:employees,prices:prices,payments:payments}[state.view]||adminDashboard)();
 }
 return ({declare:declare,mine:mine}[state.view]||declare)();
}
function declare(){
 return `<section><div class="card"><h2>Nouvelle déclaration</h2><div class="formgrid">
 <div><label>Produit</label><select id="prod">${state.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
 <div><label>Quantité</label><input id="qty" type="number" min=".01" step=".01" value="1"></div>
 <div><label>Destination</label><select id="dest">${state.destinations.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div></div>
 <div class="notice">Le calcul du salaire est effectué par la base de données : 50 % du tarif normal, +10 % en export, et tarif normal conservé pour la Garde de Solitude malgré la gratuité.</div>
 <button onclick="submitHarvest()">Enregistrer la récolte</button></div></section>`;
}
async function submitHarvest(){
 const {error}=await db.from("harvests").insert({employee_id:state.user.id,product_id:prod.value,quantity:Number(qty.value),destination_id:dest.value});
 if(error){alert(error.message);return}
 alert("Récolte enregistrée."); await refresh(); state.view="mine"; render();
}
function mine(){return `<section><div class="card"><h2>Mon registre</h2>${table(state.entries,false)}</div></section>`}
function table(rows,admin){
 return `<div class="tablewrap"><table><thead><tr><th>Date</th>${admin?"<th>Employé</th>":""}<th>Produit</th><th>Qté</th><th>Destination</th><th>Valeur</th><th>Salaire</th><th>Statut</th></tr></thead><tbody>
 ${rows.map(e=>`<tr><td>${new Date(e.created_at).toLocaleString("fr-FR")}</td>${admin?`<td>${esc(e.employee_name)}</td>`:""}<td>${esc(e.product_name||state.products.find(p=>p.id===e.product_id)?.name)}</td><td>${e.quantity}</td><td>${esc(e.destination_name||state.destinations.find(d=>d.id===e.destination_id)?.name)}</td><td>${money(e.total_sale)}</td><td>${money(e.wage)}</td><td>${e.paid?"✅ Payé":"⏳ À payer"}</td></tr>`).join("")||`<tr><td colspan="${admin?8:7}">Aucune déclaration.</td></tr>`}</tbody></table></div>`;
}
function adminDashboard(){
 const es=state.entries, value=es.reduce((s,e)=>s+Number(e.total_sale),0), wages=es.filter(e=>!e.paid).reduce((s,e)=>s+Number(e.wage),0), qty=es.reduce((s,e)=>s+Number(e.quantity),0);
 return `<section><div class="grid"><div class="card"><div class="label">Production</div><div class="metric">${qty}</div></div><div class="card"><div class="label">Valeur commerciale</div><div class="metric">${money(value)}</div></div><div class="card"><div class="label">Salaires à payer</div><div class="metric">${money(wages)}</div></div><div class="card"><div class="label">Employés</div><div class="metric">${state.profiles.filter(p=>p.role==="employee").length}</div></div></div><div class="card"><h2>Dernières déclarations</h2>${table(es.slice(0,10),true)}</div></section>`;
}
function register(){return `<section><div class="card"><h2>Registre complet</h2>${table(state.entries,true)}</div></section>`}
function employees(){return `<section><div class="card"><h2>Employés</h2><p class="sub">Les comptes sont créés dans Supabase Auth. Cette page affiche les profils déjà créés.</p><div class="tablewrap"><table><tr><th>Nom</th><th>Rôle</th><th>ID</th></tr>${state.profiles.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.role}</td><td class="small">${p.id}</td></tr>`).join("")}</table></div></div></section>`}
async function savePrice(id,value){
 const {error}=await db.from("products").update({price:Number(value)}).eq("id",id);
 if(error) alert(error.message);
}
function prices(){return `<section><div class="card"><h2>Tarifs de vente</h2><p class="sub">Export : +10 %. Garde de Solitude : gratuit pour le client, salaire au tarif normal.</p>
 ${state.products.map(p=>`<div class="formgrid" style="align-items:end"><div><label>${esc(p.name)}</label><input id="price_${p.id}" type="number" step=".01" min="0" value="${p.price}"></div><div><button onclick="savePrice('${p.id}',document.getElementById('price_${p.id}').value).then(refresh).then(render)">Enregistrer</button></div></div>`).join("")}</div></section>`}
async function pay(id){
 const unpaid=state.entries.filter(e=>e.employee_id===id&&!e.paid);
 if(!unpaid.length){alert("Aucun salaire en attente.");return}
 const total=unpaid.reduce((s,e)=>s+Number(e.wage),0);
 const {error}=await db.from("payments").insert({employee_id:id,total,entries_count:unpaid.length});
 if(error){alert(error.message);return}
 const {error:e}=await db.from("harvests").update({paid:true}).eq("employee_id",id).eq("paid",false);
 if(e)alert(e.message); await refresh(); render();
}
function payments(){
 const groups={};state.entries.forEach(e=>{if(!groups[e.employee_id])groups[e.employee_id]={sum:0,count:0};if(!e.paid){groups[e.employee_id].sum+=Number(e.wage);groups[e.employee_id].count++}});
 return `<section><div class="card"><h2>Salaires</h2><table><tr><th>Employé</th><th>Déclarations</th><th>Montant</th><th></th></tr>
 ${Object.entries(groups).map(([id,g])=>`<tr><td>${esc(state.profiles.find(p=>p.id===id)?.name||id)}</td><td>${g.count}</td><td>${money(g.sum)}</td><td><button onclick="pay('${id}')">Marquer payé</button></td></tr>`).join("")||`<tr><td colspan="4">Aucun salaire en attente.</td></tr>`}</table></div></section>`;
}
init();
