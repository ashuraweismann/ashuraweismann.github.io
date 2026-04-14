---
layout: default
title: Home
---

<h2 class="typing">Initializing system...</h2>

<div class="terminal">

> booting darkshadow system...
> loading modules...
> access granted ✔
<div class="cmd-box">
  <span>> </span>
  <input type="text" id="cmdInput" placeholder="type command..." />
</div>
</div>

<h1 class="glow">DARKSHADOW BLOG</h1>

<p class="subtitle">
networking • cybersecurity • ctf • systems learning
</p>

---

## 📡 SYSTEM STATUS

🟢 Network: Online  
🟢 Security Layer: Active  
🟢 Learning Mode: Enabled  

---

## 🧠 ABOUT SYSTEM

This is a knowledge terminal where I document:
- Networking fundamentals  
- Cybersecurity concepts  
- CTF challenges  

---

## 🚀 LATEST ENTRY

👉 [Understanding Internet Speed](/2026/04/12/internet-speed.html)

<link rel="stylesheet" href="/assets/css/style.css">

<script>
document.getElementById("cmdInput").addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    let cmd = this.value.trim();

    if (cmd === "cd /about") window.location.href = "/about";
    else if (cmd === "cd /posts") window.location.href = "/posts";
    else if (cmd === "home") window.location.href = "/";
    else alert("command not found");

    this.value = "";
  }
});
</script>
