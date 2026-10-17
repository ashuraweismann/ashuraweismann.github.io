---
title: "Linux Capabilities Abuse: Practical Privilege Escalation and Hardening"
description: "A hands-on walkthrough of Linux capability sets, common file-capability misconfigurations that lead to privilege escalation, and practical hardening measures for CTFs, servers, and containers."
pubDate: 2026-10-17
tags:
  - "linux"
  - "capabilities"
  - "privilege-escalation"
  - "hardening"
  - "ctf"
  - "containers"
---

## Introduction

On a traditional UNIX system, privilege is binary: a process either runs as UID 0 and can do almost anything, or it runs as an ordinary user and is subject to permission checks. That model forces administrators into an uncomfortable choice. A daemon that only needs to bind to port 443 either runs as root with unlimited power, or runs unprivileged and needs a workaround.

Linux capabilities were introduced in the 2.2 kernel to break that monolith apart. Instead of one all-powerful UID, the kernel defines a set of distinct privileges, each guarding a specific class of checks. Binding to a low port, changing a file's owner, tracing another process, and mounting a filesystem are now separate permissions that can be granted independently.

The model is sound, but the operational reality is messy. Tools like `setcap` make it trivial to hand a binary far more authority than it needs, and the results are easy to forget. Every capability attached to a file is a potential privilege escalation primitive, and a single `getcap -r /` is often the fastest win in a CTF challenge or on a misconfigured production host.

This article explains how the capability model actually works, how common misconfigurations are turned into root shells, and how to audit and reduce that attack surface. Throughout, we assume a modern Linux kernel (4.3 or newer, for ambient capabilities), the `libcap` userland tools (`getcap`, `setcap`, `capsh`, `getpcaps`) installed, and that enumeration is being performed from an unprivileged local account. Examples use a deliberately misconfigured lab system; do not apply the `setcap` commands below to a machine you care about.

## Core Concepts

### What a capability is

A capability is a named bit in a bitmask. When the kernel is about to perform a privileged check, it either consults a capability or falls back to a UID comparison. For example, `setuid(2)` succeeds for an unprivileged process if it holds `CAP_SETUID`. Reading a file whose mode forbids it succeeds if the caller holds `CAP_DAC_READ_SEARCH` or `CAP_DAC_OVERRIDE`.

The number of capabilities grows with the kernel. `CAP_PERFMON` and `CAP_BPF` arrived in Linux 5.8, and `CAP_CHECKPOINT_RESTORE` in 5.9. You can always inspect the full list on a running system:

```bash
capsh --print
capsh --decode=000001ffffffffff
```

`capsh --print` shows the current process's sets plus the human-readable names of the bits that are set. `--decode` turns a hex mask into capability names, which is exactly what you need when you read a bitmask out of `/proc`.

### The five capability sets

Capabilities are a property of a thread, not of a UID, and each thread carries several sets:

- **Permitted (`CapPrm`)** — the maximum set of capabilities the thread can ever have effective. A capability can only be added to the effective set if it is already permitted.
- **Effective (`CapEff`)** — the set the kernel actually consults. A capability in permitted but not effective is inert until raised.
- **Inheritable (`CapInh`)** — capabilities preserved across `execve()` and combined with the executed file's inheritable set. It is largely unused in practice, which is why ambient capabilities were added.
- **Bounding (`CapBnd`)** — a ceiling. Threads can only drop bits from it, never add them back (except via privileged mechanisms). It limits what can ever appear in permitted after an `execve()`.
- **Ambient (`CapAmb`)** — added in Linux 4.3. Ambient capabilities survive `execve()` of an unprivileged program, solving the problem that inheritable-set semantics were too awkward for real use.

You can read a process's sets directly:

```bash
grep -E '^Cap' /proc/self/status
getpcaps $$
```

### File capabilities and the execve transformation

File capabilities are stored in the `security.capability` extended attribute of an executable. `setcap` writes that attribute; `getcap` reads it. The suffix letters describe which sets the file grants:

```bash
sudo setcap cap_net_bind_service=ep /usr/local/bin/myserver
getcap /usr/local/bin/myserver
# /usr/local/bin/myserver cap_net_bind_service=ep
```

Here `p` means the capability is added to the process's permitted set at exec time, and `e` means the file's effective bit is set, promoting the resulting permitted set into the effective set. Without `e`, the program receives the capability but cannot use it until it raises it explicitly with `capset()`.

On `execve()`, the kernel computes the new sets roughly as follows (simplified from `capabilities(7)`):

- `P'(permitted) = (P(inheritable) & F(inheritable)) | (F(permitted) & P(bounding)) | P'(ambient)`
- `P'(effective) = F(effective) ? P'(permitted) : P'(ambient)`
- ambient capabilities are cleared when the executed file is privileged (set-user-ID or carrying file capabilities)

Two practical consequences matter for an attacker:

1. The **bounding set caps everything**. A process whose bounding set lacks `CAP_SYS_ADMIN` will never obtain it from a file capability.
2. File capabilities are **ignored on filesystems mounted `nosuid`** — the same rule that disables set-user-ID binaries.

One more subtlety: file capabilities on an interpreted script are effectively ignored, because the kernel ends up executing the interpreter, and the interpreter is the file whose capabilities are applied. A `setcap` on a shell script is not the shortcut people expect.

## Practical Walkthrough

### Step 1 — Enumerate

The first command on any Linux privilege-escalation checklist is a recursive capability scan:

```bash
getcap -r / 2>/dev/null
```

`-r` recurses, and the redirection suppresses the expected flood of permission errors from paths you cannot traverse. Run as an unprivileged user this scan is incomplete; run it as root (or with `sudo`) when you have the option, and pay attention to `/usr/bin`, `/usr/local/bin`, `/opt`, and anything in a user-writable location.

Do not stop at the filesystem. Service managers can grant capabilities at runtime without ever touching a file's xattr:

```bash
grep -RiE 'AmbientCapabilities|CapabilityBoundingSet' \
  /etc/systemd/system /lib/systemd/system 2>/dev/null
```

Finally, confirm what your own shell already holds:

```bash
capsh --print
grep -E '^Cap(Eff|Prm|Bnd)' /proc/self/status
```

A `CapEff` of `0000000000000000` is normal for an unprivileged user. When probing a running service, `getpcaps <pid>` shows the same information for that process.

### Step 2 — Map the capability to a primitive

A capability is only useful if you can reach code that exercises it. The high-value ones are worth memorising:

| Capability | Practical primitive |
|---|---|
| `CAP_SETUID` / `CAP_SETGID` | Change your UID to 0 |
| `CAP_DAC_READ_SEARCH` | Read any file, including `/etc/shadow` |
| `CAP_DAC_OVERRIDE` | Read, write, or execute any file |
| `CAP_FOWNER` | `chmod` files you do not own |
| `CAP_CHOWN` | Change ownership of arbitrary files |
| `CAP_SETFCAP` | Write file capabilities onto binaries |
| `CAP_SYS_PTRACE` | Inspect and write the memory of other processes |
| `CAP_SYS_ADMIN` | Mount, namespaces, and a long tail — effectively root |
| `CAP_SYS_MODULE` | Load kernel modules |
| `CAP_SYS_CHROOT` | `chroot(2)`, a component of classic chroot escapes |

### Case A — CAP_SETUID on an interpreter

Take the classic lab misconfiguration:

```bash
sudo setcap cap_setuid+ep /usr/bin/python3
getcap /usr/bin/python3
# /usr/bin/python3 cap_setuid+ep
```

Any user can now run:

```bash
/usr/bin/python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'
```

`os.setuid(0)` normally fails for a non-root process. Here the calling thread holds `CAP_SETUID` in its effective set, so the kernel permits the transition to UID 0. The spawned shell inherits the root effective UID. Confirm what you actually got with `id` and `grep Cap /proc/self/status` — depending on the kernel's traditional UID-0 handling and the bounding set, you may or may not end up with a full permitted set, and it is worth knowing which.

The same primitive applies to Perl (`POSIX::setuid(0)`), Ruby, Node, and any other interpreter that exposes a `setuid` wrapper. This is precisely why capability-aware tools are listed in the GTFOBins capability table.

A useful refinement: if the binary only has `p` and not `e` (e.g. `cap_setuid+p`), the capability sits in permitted and cannot be used directly. A process may raise a permitted capability into its effective set without extra privileges, so an attacker can recover the primitive through `ctypes` and the `capset(2)` syscall. Do not assume a missing `e` is a mitigation.

### Case B — CAP_DAC_READ_SEARCH on a file utility

```bash
sudo setcap cap_dac_read_search+ep /usr/bin/tar
tar -cvf /tmp/shadow.tar /etc/shadow
tar -xvf /tmp/shadow.tar -C /tmp
cat /tmp/etc/shadow
```

`CAP_DAC_READ_SEARCH` bypasses file read checks and directory read/execute checks, but not write checks. The archive is created in `/tmp` as the invoking user, so once extracted it is readable. Any file-copying or archiving utility works the same way: `cp`, `rsync`, `zip`, `find -exec cat`.

`CAP_DAC_OVERRIDE` is the stronger sibling: it also bypasses write and execute checks, meaning an attacker can append a new UID 0 entry to `/etc/passwd` or overwrite `/etc/ld.so.preload`.

### Case C — CAP_FOWNER and CAP_CHOWN

`CAP_FOWNER` bypasses the ownership checks on file metadata operations. It does not grant write access to file contents, but it does let you change permissions on files you do not own:

```bash
chmod 777 /etc/shadow
```

With write access to `/etc/shadow` you can install a password hash you control and escalate via `su`. `CAP_CHOWN` is equivalent in effect: change the owner of `/etc/shadow` to yourself, and you inherit the owner's write permission.

### Case D — CAP_SETFCAP

`CAP_SETFCAP` lets you write the `security.capability` attribute. That is a direct escalation path, because you can decorate a binary you control:

```bash
cp /usr/bin/python3 /tmp/py
setcap cap_setuid+ep /tmp/py
/tmp/py -c 'import os; os.setuid(0); os.system("/bin/sh")'
```

Note that the copy must reside on a filesystem that honours file capabilities, and `nosuid` mounts will silently neutralise the trick.

### Case E — The heavyweights

`CAP_SYS_ADMIN` is commonly described as the new root, and justifiably so. It covers `mount(2)`, many namespace operations, and a long tail of privileged administrative calls. `CAP_SYS_MODULE` means arbitrary kernel code. `CAP_SYS_PTRACE` means you can attach to any process, including a root daemon, and manipulate its memory with `process_vm_writev(2)` or `ptrace(2)` — a legitimate debugging tool in the right hands and a reliable escalation in the wrong ones. If you find any of these on a binary reachable from an unprivileged account, treat the host as already compromised.

### Case F — Writable binaries carrying capabilities

File capabilities are only as trustworthy as the file they live on. Check ownership and permissions on every result from `getcap -r /`:

```bash
stat -c '%A %U:%G %n' /usr/bin/tar
```

If the binary, or a directory it resolves through, is writable by a group you belong to, you do not need to exploit the capability at all — you simply replace the binary with your own and inherit the capability on the next execution.

## Security Implications

From an attacker's perspective, capabilities are attractive because discovery is a single command and exploitation requires almost no tooling. There is no compiler, no kernel exploit, and no noisy crash. A `setcap cap_setuid+ep` left behind by a hurried deployment becomes a permanent, silent backdoor for any local user.

The detection story is correspondingly subtle. Capability changes are extended-attribute writes, so they do not show up in file-content hashes. They do not set the setuid bit, so `find / -perm -4000` misses them entirely. The privilege escalation itself happens inside a normally trusted binary: an `execve` of `/usr/bin/python3` that then calls `setuid(0)` looks unremarkable to a naive log review.

In containers the picture is similar but the blast radius depends on the boundary. The Docker default capability set is already meaningful — it includes `CAP_CHOWN`, `CAP_DAC_OVERRIDE`, `CAP_FOWNER`, `CAP_SETUID`, `CAP_SETGID`, `CAP_NET_RAW`, and `CAP_SETFCAP`, among others. That is a deliberate design choice for compatibility, not a hard security boundary. A `--privileged` container receives every capability and effectively shares the host's kernel privileges. `CAP_NET_RAW` alone enables ARP spoofing and crafted-packet attacks against neighbours on the same network segment.

One important nuance: capabilities are scoped to user namespaces. A process that is unprivileged on the host can hold a full capability set inside a user namespace it created, but those bits do not translate to host root. Do not confuse the two when reading `/proc/<pid>/status` from inside a container.

## Defensive Considerations

### Inventory and audit

Treat the set of binaries carrying file capabilities as configuration, and review it like any other privileged configuration:

```bash
getcap -r / 2>/dev/null
```

Run this as root on a schedule and in the build pipeline for golden images. Keep an explicit allowlist; on most systems the legitimate set is short or empty. Flag anything under `/tmp`, `/home`, `/opt`, or `/var`.

### Enforce least privilege at the service level

For systemd units, grant the narrowest capability that works, and pair it with a bounding set so the grant cannot be expanded later:

```ini
[Service]
User=mydaemon
ExecStart=/usr/local/bin/myserver --port 443
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
ProtectSystem=strict
PrivateTmp=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
```

`NoNewPrivileges=yes` stops `execve()` from granting privileges through set-user-ID binaries or file capabilities. Be precise about what it does: it does not remove capabilities the process already holds, so it is a complement to a tight bounding set, not a replacement.

### Protect the files that carry capabilities

Every binary with a file capability must be owned by root, not writable by group or other, and located in a directory with the same properties. Verify on any system where unprivileged users can install software. Where file capabilities are unnecessary, remove them:

```bash
sudo setcap -r /usr/local/bin/somebinary
```

### Harden mounts

Mount user-writable filesystems with `nosuid,nodev,noexec` where practical, especially `/tmp`, `/var/tmp`, and `/home`. The `nosuid` flag disables both set-user-ID binaries and file capabilities, which closes the copy-and-decorate path shown earlier.

### Containers

Start from an empty capability set and add back only what the workload actually needs:

```bash
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myimage
```

Avoid `--privileged`. When a container mounts host paths, remember that `CAP_DAC_OVERRIDE` inside the container applies to those mounts too.

### Detection and monitoring

The strongest controls are preventive, but detection catches what policy misses:

- Monitor writes to the `security.capability` attribute and to executable directories with auditd (`-w /usr/local/bin -p wa -k bin_write`).
- Alert on unexpected `capset(2)` calls, particularly from processes whose effective UID is not root.
- Periodically diff the output of `getcap -r /` against a known-good baseline.
- Feed file-integrity monitoring on extended attributes, not just content hashes.
- In high-assurance environments, use seccomp and an LSM (AppArmor or SELinux) to further constrain what a process can do even if a capability is present.

## Conclusion

Linux capabilities are a genuine improvement over the all-or-nothing root model, but they move the security decision from the kernel to the administrator. Every `setcap` invocation is a deliberate grant of authority to a file, and that grant persists silently through software updates, container images, and forgotten deployment scripts.

The offensive lesson is that capability enumeration should be the first local check performed on any Linux target, and that mapping a capability to a usable primitive is usually straightforward: interpreters turn `CAP_SETUID` into a root shell, archivers turn `CAP_DAC_READ_SEARCH` into `/etc/shadow`, and permission-manipulation capabilities turn metadata operations into full compromise. Do not overlook setuid-less paths either — writable binaries and overlooked service-manager configuration are equally effective.

The defensive lesson is that least privilege must be enforced in more than one place at a time. Grant the narrowest capability, cap it with a bounding set, disable privilege acquisition with `NoNewPrivileges`, keep the file root-owned and non-writable, harden the mounts, drop capabilities in containers, and audit the result continuously. A single missing layer is often all an attacker needs.
