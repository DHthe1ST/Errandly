const screens=["home","request","confirmation","history"];
let formMode="request";

function show(id){
  screens.forEach(s=>document.getElementById(s).classList.toggle("active",s===id));
  window.scrollTo({top:0,behavior:"smooth"});
  if(id==="history") renderHistory();
  if(id==="home") renderUpcomingHome();
}

function setFormMode(mode){
  formMode=mode;
  const scheduled=mode==="schedule";
  document.getElementById("requestTitle").textContent=scheduled?"Schedule an errand":"Request an errand";
  document.getElementById("requestIntro").textContent=scheduled
    ?"Choose when you want Errandly to handle it."
    :"Tell us what needs to be done and where the errand is located.";
  document.getElementById("scheduleFields").hidden=!scheduled;
  document.getElementById("scheduledDate").required=scheduled;
  document.getElementById("scheduledTime").required=scheduled;
  document.getElementById("submitBtn").textContent=scheduled?"Schedule Errand":"Submit Request";
}

function openRequest(type="General Errand"){
  setFormMode("request");
  document.getElementById("type").value=type;
  updateLocationFields();
  show("request");
}

function openSchedule(){
  setFormMode("schedule");
  document.getElementById("type").value="General Errand";
  const d=new Date();
  d.setDate(d.getDate()+1);
  document.getElementById("scheduledDate").value=d.toISOString().slice(0,10);
  document.getElementById("scheduledTime").value="10:00";
  updateLocationFields();
  show("request");
}

function updateLocationFields(){
  const type=document.getElementById("type").value;
  const route=["Pickup","Delivery"].includes(type);
  document.getElementById("routeFields").hidden=!route;
  document.getElementById("normalLocationField").hidden=route;
  document.getElementById("location").required=!route;
  document.getElementById("pickupLocation").required=route;
  document.getElementById("deliveryLocation").required=route;
}

document.getElementById("startBtn").onclick=()=>openRequest();
document.getElementById("scheduleBtn").onclick=()=>openSchedule();
document.getElementById("type").addEventListener("change",updateLocationFields);

document.querySelectorAll(".quick-card").forEach(card=>{
  card.addEventListener("click",()=>openRequest(card.dataset.type));
});

document.querySelectorAll("[data-go]").forEach(btn=>btn.onclick=()=>{
  if(btn.dataset.go==="home") setFormMode("request");
  show(btn.dataset.go);
});

document.getElementById("historyBtn").onclick=()=>show("history");
document.getElementById("viewHistoryBtn").onclick=()=>show("history");

function getOrders(){
  return JSON.parse(localStorage.getItem("errandly_orders")||"[]");
}

function saveOrder(order){
  const orders=getOrders();
  orders.unshift(order);
  localStorage.setItem("errandly_orders",JSON.stringify(orders));
}

function formatSchedule(date,time){
  if(!date||!time) return "";
  const dt=new Date(`${date}T${time}`);
  return dt.toLocaleString([],{
    weekday:"short",day:"numeric",month:"short",
    year:"numeric",hour:"numeric",minute:"2-digit"
  });
}

document.getElementById("errandForm").addEventListener("submit",e=>{
  e.preventDefault();

  const type=document.getElementById("type").value;
  const route=["Pickup","Delivery"].includes(type);
  const scheduled=formMode==="schedule";
  const date=document.getElementById("scheduledDate").value;
  const time=document.getElementById("scheduledTime").value;

  const order={
    id:"ERD-"+Math.random().toString(36).slice(2,8).toUpperCase(),
    description:document.getElementById("description").value.trim(),
    location:route?"":document.getElementById("location").value.trim(),
    pickupLocation:route?document.getElementById("pickupLocation").value.trim():"",
    deliveryLocation:route?document.getElementById("deliveryLocation").value.trim():"",
    phone:document.getElementById("phone").value.trim(),
    type,
    mode:scheduled?"Scheduled":"Now",
    scheduledDate:scheduled?date:"",
    scheduledTime:scheduled?time:"",
    scheduledFor:scheduled?formatSchedule(date,time):"",
    status:"Pending",
    createdAt:new Date().toLocaleString()
  };

  saveOrder(order);

  document.getElementById("orderId").textContent=order.id;
  document.getElementById("summary").textContent=order.type;

  const routeOrder=["Pickup","Delivery"].includes(order.type);
  document.getElementById("summaryNormalLocationRow").hidden=routeOrder;
  document.getElementById("summaryPickupRow").hidden=!routeOrder;
  document.getElementById("summaryDeliveryRow").hidden=!routeOrder;
  document.getElementById("summaryScheduleRow").hidden=!scheduled;

  document.getElementById("summaryLocation").textContent=order.location;
  document.getElementById("summaryPickup").textContent=order.pickupLocation;
  document.getElementById("summaryDelivery").textContent=order.deliveryLocation;
  document.getElementById("summarySchedule").textContent=order.scheduledFor;

  document.getElementById("confirmationEyebrow").textContent=scheduled?"ERRAND SCHEDULED":"REQUEST RECEIVED";
  document.getElementById("confirmationTitle").textContent=scheduled?"You're all set.":"We're on it.";
  document.getElementById("confirmationText").textContent=scheduled
    ?"Your scheduled errand has been saved on this device."
    :"Your Errandly request has been saved on this device.";

  e.target.reset();
  setFormMode("request");
  updateLocationFields();
  show("confirmation");
});

function renderHistory(){
  const list=document.getElementById("historyList"),orders=getOrders();

  if(!orders.length){
    list.innerHTML='<p class="muted">No requests yet. Your Errandly orders will appear here.</p>';
    return;
  }

  list.innerHTML=orders.map(o=>`
    <div class="history-item">
      <div class="row">
        <strong>${escapeHtml(o.id)}</strong>
        <strong class="status">${escapeHtml(o.status)}</strong>
      </div>
      <small>${escapeHtml(o.type)} • ${escapeHtml(o.mode||"Now")} • ${escapeHtml(o.createdAt)}</small>
      ${o.scheduledFor?`<small>Scheduled for: ${escapeHtml(o.scheduledFor)}</small>`:""}
      ${o.pickupLocation&&o.deliveryLocation
        ?`<small>Pickup: ${escapeHtml(o.pickupLocation)}</small><small>Delivery: ${escapeHtml(o.deliveryLocation)}</small>`
        :`<small>Location: ${escapeHtml(o.location)}</small>`}
      <small>${escapeHtml(o.description)}</small>
    </div>
  `).join("");
}

function renderUpcomingHome(){
  const box=document.getElementById("upcomingHome");
  const scheduled=getOrders().filter(o=>o.mode==="Scheduled" && o.status==="Pending");

  if(!scheduled.length){
    box.innerHTML="";
    return;
  }

  const next=scheduled[0];
  box.innerHTML=`
    <div class="upcoming-card">
      <div>
        <p class="eyebrow">UPCOMING ERRAND</p>
        <strong>${escapeHtml(next.type)}</strong>
        <small>${escapeHtml(next.scheduledFor||"Scheduled")}</small>
      </div>
      <button class="mini-btn" id="upcomingBtn">View</button>
    </div>
  `;
  document.getElementById("upcomingBtn").onclick=()=>show("history");
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

renderUpcomingHome();

if("serviceWorker"in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}