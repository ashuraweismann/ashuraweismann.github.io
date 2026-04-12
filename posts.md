---
layout: default
title: Posts
---

# 📦 SYSTEM ARCHIVE

> All logs, notes, and knowledge entries stored in DarkShadow system.

---

## 🧠 All Posts

<ul>
{% for post in site.posts %}
  <li>
    <a href="{{ post.url }}">
      {{ post.date | date: "%Y-%m-%d" }} → {{ post.title }}
    </a>
  </li>
{% endfor %}
</ul>
