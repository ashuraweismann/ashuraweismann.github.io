---
layout: default
title: Archive
---

# 📦 SYSTEM ARCHIVE

> Accessing stored knowledge logs...

---

## 🔍 Search Logs

<input type="text" id="searchBox" placeholder="search logs..." onkeyup="searchPosts()" />

---

## 🧬 TAG SYSTEM

<div class="tags">
{% assign tags = site.tags %}
{% for tag in tags %}
  <span class="tag" onclick="filterTag('{{ tag[0] }}')">
    #{{ tag[0] }}
  </span>
{% endfor %}
</div>

## 🧠 NETWORKING

<ul class="post-list">
{% for post in site.posts %}
  {% if post.categories contains "networking" %}
  <li>
    <span class="date">{{ post.date | date: "%Y-%m-%d" }}</span>
    <a href="{{ post.url }}">{{ post.title }}</a>
  </li>
  {% endif %}
{% endfor %}
</ul>

---

## 🛡️ CTF

<ul class="post-list">
{% for post in site.posts %}
  {% if post.categories contains "ctf" %}
  <li>
    <span class="date">{{ post.date | date: "%Y-%m-%d" }}</span>
    <a href="{{ post.url }}">{{ post.title }}</a>
  </li>
  {% endif %}
{% endfor %}
</ul>

---

## 📘 NOTES

<ul class="post-list">
{% for post in site.posts %}
  {% if post.categories contains "notes" %}
  <li>
    <span class="date">{{ post.date | date: "%Y-%m-%d" }}</span>
    <a href="{{ post.url }}">{{ post.title }}</a>
  </li>
  {% endif %}
{% endfor %}
</ul>

---

<script>
function searchPosts() {
  let input = document.getElementById('searchBox').value.toLowerCase();
  let items = document.querySelectorAll('.post-list li');

  items.forEach(item => {
    let text = item.innerText.toLowerCase();
    item.style.display = text.includes(input) ? "" : "none";
  });
}
</script>

<link rel="stylesheet" href="/assets/css/style.css">
