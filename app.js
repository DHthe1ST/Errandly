const screens = ["home","request","confirmation","history"];

function show(id){
  screens.forEach(s => document.getElementById(s).classList.toggle("active", s === id));
  window.scrollTo({top:0,behavior:"smooth"});
  if(id === "history") renderHistory();
}

document.getElementById("startBtn").onclick = () => show("request");
document.querySelectorAll("[data-go]").forEach(btn => btn.onclick = () => show(btn.dataset.go));
document.getElementById("historyBtn").onclick = () => show("history");
document.getElementById("viewHistoryBtn").onclick = () => show("history");

function getOrders(){
  return JSON.parse(localStorage.getItem("errandly_orders") || "[]");
}

function saveOrder(order){
  const orders = getOrders();
  orders.unshift(order);
  localStorage.setItem("errandly_orders", JSON.stringify(orders));
}

document.getElementById("errandForm").addEventListener("submit", e => {
  e.preventDefault();

  const order = {
    id: "ERD-" + Math.random().toString(36).slice(2,8).toUpperCase(),
    description: document.getElementById("description").value.trim(),
    pickup: document.getElementById("pickup").value.trim(),
    dropoff: document.getElementById("dropoff").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    type: document.getElementById("type").value,
    status: "Pending",
    createdAt: new Date().toLocaleString()
  };

  saveOrder(order);

  document.getElementById("orderId").textContent = order.id;
  document.getElementById("summary").textContent = order.type;
  e.target.reset();
  show("confirmation");
});

function renderHistory(){
  const list = document.getElementById("historyList");
  const orders = getOrders();

  if(!orders.length){
    list.innerHTML = '<p class="muted">No requests yet. Your Errandly orders will appear here.</p>';
    return;
  }

  list.innerHTML = orders.map(o => `
    <div class="history-item">
      <div class="row"><strong>${escapeHtml(o.id)}</strong><strong class="status">${escapeHtml(o.status)}</strong></div>
      <small>${escapeHtml(o.type)} • ${escapeHtml(o.createdAt)}</small>
      <small>${escapeHtml(o.pickup)} → ${escapeHtml(o.dropoff)}</small>
      <small>${escapeHtml(o.description)}</small>
    </div>
  `).join("");
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
