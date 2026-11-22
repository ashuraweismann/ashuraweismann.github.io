---
title: "Linux Landlock LSM: Building Unprivileged Filesystem Sandboxes for Untrusted Code"
description: "A practical, intermediate-level guide to Landlock: how the LSM models rulesets, handled access rights, and inheritance; how to build a minimal unprivileged filesystem sandboxer; how to combine it with seccomp and namespaces; and what it does and does not protect against."
pubDate: 2026-11-22
tags:
  - "linux"
  - "landlock"
  - "sandboxing"
  - "lsm"
  - "seccomp"
  - "containers"
  - "security"
---

## Introduction

Sooner or later every Linux engineer ends up running code they do not fully trust: a CTF binary handed to them by an opponent, a plugin loaded into a long-lived service, a build script from a pull request, or a model-generated helper script. The classic answers all have friction. `chroot` needs root, and on its own it is escapable by a process that keeps a directory descriptor or regains privileges. Containers give a strong boundary, but they need an OCI runtime and a good deal of machinery — and although rootless containers built on user namespaces avoid root-equivalent privileges, they still require that setup. SELinux and AppArmor are policy systems owned by the administrator, not by the process being confined. Seccomp filters syscalls and arguments but knows nothing about paths: it can allow `openat(2)` but cannot say *which* paths may be opened.

Landlock fills that gap. It is a Linux Security Module that lets an **unprivileged process voluntarily restrict itself** — and every descendant it later spawns — using a filesystem access policy it defines in its own address space. It landed in Linux 5.13 and has grown a new ABI revision roughly once a year since.

This article assumes Linux 5.13 or newer with Landlock enabled in the kernel's LSM list (the default on current mainstream distribution kernels). The examples target ABI 3 (Linux 6.2) or later for truncate support and degrade gracefully below that. It walks through the model, a working sandboxer, integration with seccomp and namespaces, and the ways a Landlock sandbox can be weaker than it looks.

## Core Concepts

### Where Landlock sits

Landlock is a *stackable* LSM. That means it coexists with SELinux, AppArmor, Smack, and Yama rather than replacing them, and its checks are evaluated **after** the capability-based access checks in the kernel. A consequence worth remembering: Landlock restrictions are not bypassed by `CAP_DAC_OVERRIDE` or `CAP_SYS_ADMIN`. A root process that restricts itself stays restricted.

Being a built-in LSM, it has to be enabled at boot — either listed in `CONFIG_LSM` when the kernel was built, or named on the `lsm=` kernel command line. When it is, it appears in the LSM list:

```bash
cat /sys/kernel/security/lsm
# example: lockdown,capability,landlock,yama,integrity,apparmor
```

That path only exists when `securityfs` is mounted (systemd and most init scripts mount it; minimal containers often do not). The fallback is the kernel config:

```bash
grep -E 'CONFIG_SECURITY_LANDLOCK|^CONFIG_LSM=' /boot/config-$(uname -r)
```

The authoritative check is the ABI probe used in Step 2: `landlock_create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION)`. It fails with `ENOSYS` on kernels older than 5.13, and with `EOPNOTSUPP` when the code is compiled in but Landlock is not enabled in the boot LSM list.

### Rulesets, rules, and domains

Landlock exposes three syscalls (444–446 on x86-64, different elsewhere, so always use the `__NR_*` constants). glibc provides **no wrappers** for any of them: you call `syscall(2)` directly, as the sample below does, or use a helper library such as the `liblandlock` project maintained alongside the kernel code.

| Syscall | Purpose |
|---|---|
| `landlock_create_ruleset` | Create an empty ruleset; also used with a `NULL` attribute to query the ABI version |
| `landlock_add_rule` | Attach an allow rule (a path plus a rights mask) to a ruleset |
| `landlock_restrict_self` | Bind the ruleset to the calling thread; returns nothing and cannot be undone |

Once `landlock_restrict_self` succeeds, the calling thread acquires a **Landlock domain**. The domain is inherited across `fork`, `clone`, and `execve`, and it is *monotonic*: a confined process can add further restrictions but can never relax an inherited one. This stacking property is what makes Landlock safe to nest — a launcher can apply its own policy, then exec a program that applies a stricter one.

`landlock_restrict_self` requires either that `PR_SET_NO_NEW_PRIVS` has already been set, or that the caller holds `CAP_SYS_ADMIN`. The unprivileged path is `no_new_privs`, which conveniently also blocks privilege gain through setuid binaries.

### The handled-access model (the most common mistake)

A ruleset does not express deny-everything-except-a-list. It says: for the rights listed in `handled_access_fs`, deny by default and allow only what the rules permit. Rights **not** in the handled mask are not enforced at all and remain freely usable.

This is a deliberate design choice: it lets a policy degrade gracefully when a program uses a filesystem feature the policy author never thought about. It is also the single most common source of false confidence. If you forget `LANDLOCK_ACCESS_FS_TRUNCATE`, `truncate(2)` and `O_TRUNC` still work. If you forget `LANDLOCK_ACCESS_FS_IOCTL_DEV`, device ioctls are unrestricted. If you handle `LANDLOCK_ACCESS_FS_REFER` but never grant it, every cross-directory rename and link inside the sandbox fails.

Rules are strictly **additive**. There is no deny rule, no negative ACL, and no way to carve a hole out of an allowed directory. If you allow `/home/user` read-write, you have allowed the whole subtree read-write.

### Renames, links, and `REFER`

`LANDLOCK_ACCESS_FS_REFER` (ABI 2+) confuses more people than any other right, so it is worth stating precisely:

- It is required for operations that **change a file's parent directory**: `rename(2)`/`renameat2(2)` where the source and destination directories differ, and `link(2)`/`linkat(2)` when the new link is created in a directory other than the source file's own.
- It is **not** required to rename a file within a single directory, to create a file, or to unlink one. Atomic-save patterns that write `dir/.name.tmp` and rename it to `dir/name` keep working; patterns that stage in a separate directory and rename across do not.
- When it is required, it is checked against **both** the source and the destination directory, so both must grant it.
- A denial is reported as `EXDEV` (Invalid cross-device link), not `EACCES`. That is deliberate on the kernel's side, and it has a sharp edge: GNU `mv` treats `EXDEV` as a cross-filesystem move and quietly falls back to copy-then-unlink, so if both directories are writable the move still appears to succeed. Use `ln` or a direct `renameat2(2)` call when you want to observe the policy.

Practical consequence for the sample below: `REFER` is in the handled mask on ABI 2+ but is never granted, so reparenting operations inside the sandbox fail while same-directory renames work.

### Access rights and ABI versions

Kernels advertise a Landlock ABI version, and each version adds rights. Passing a bit the running kernel does not know makes `landlock_create_ruleset` fail with `EINVAL`, so you must mask your desired rights by the ABI version you read at startup — never build the mask purely from your build host's headers.

| ABI | Kernel (approx.) | Notable addition |
|---|---|---|
| 1 | 5.13 | Base filesystem rights (`EXECUTE`, `READ_FILE`, `READ_DIR`, `WRITE_FILE`, `REMOVE_*`, `MAKE_*`) |
| 2 | 5.19 | `LANDLOCK_ACCESS_FS_REFER` — cross-directory rename/link |
| 3 | 6.2 | `LANDLOCK_ACCESS_FS_TRUNCATE` |
| 4 | 6.7 | TCP `bind`/`connect` restriction (`handled_access_net`) |
| 5 | 6.10 | `LANDLOCK_ACCESS_FS_IOCTL_DEV` |
| 6 | 6.12 | Scoping of abstract UNIX sockets and signals (`scoped`) |

Treat that table as a rough map only — always query `LANDLOCK_CREATE_RULESET_VERSION` rather than inferring from `uname`. Note that network and scope restrictions live in *separate* handled masks (`handled_access_net`, `scoped`); the sample in this article handles filesystem rights only, so network operations remain completely unrestricted.

Two build-host caveats. First, `<linux/landlock.h>` only ships with kernel headers from 5.13 onward, and constants such as `LANDLOCK_ACCESS_FS_REFER` only exist in headers from the corresponding release; on older build hosts either vendor a recent copy of the header or define the missing constants yourself. Second, if you compile against headers newer than the running kernel, the attribute struct you pass can be larger than the one the kernel knows, and `landlock_create_ruleset` rejects it with `E2BIG`; build against the target's headers or pass a shorter explicit size covering only the fields you set.

### Inheriting a domain: threads, descriptors, and `ioctl`

The domain attaches to the **thread**, not the process. A multithreaded program must have every thread call `landlock_restrict_self`, or restrict before creating any threads. Threads created earlier are unaffected. This is a real hazard for services that apply a sandbox after initialisation.

Landlock also does not revoke file descriptors that are already open. Its hooks fire when a path is resolved and an object is acted on (`open`, `mkdir`, `mknod`, `link`, `rename`, `unlink`, `truncate`) — they do not fire for `read(2)` or `write(2)` on an fd you already hold. An inherited fd to `/etc/shadow` therefore remains readable inside an otherwise airtight sandbox.

The one filesystem right that belongs to a different class is `LANDLOCK_ACCESS_FS_IOCTL_DEV` (ABI 5+): it is evaluated at `ioctl(2)` time against the device node's path, so it applies to device descriptors opened *before* `landlock_restrict_self`, including a terminal inherited from the parent. If you handle the right and grant it nowhere, ioctls on those inherited descriptors start failing; if you leave it unhandled, they keep working. Either way, the timing is unlike every other filesystem right and deserves an explicit decision.

## Practical Walkthrough

### Step 1: Verify support

```bash
cat /sys/kernel/security/lsm | grep -o landlock
uname -r
```

If `landlock` is missing, the LSM was not enabled at boot (check `CONFIG_LSM` and `lsm=` on the kernel command line) or the kernel predates 5.13. If `/sys/kernel/security/lsm` does not exist because `securityfs` is not mounted, use the config check or the ABI probe instead.

### Step 2: A minimal sandboxer

The kernel tree ships `samples/landlock/sandboxer.c` as a canonical reference; here is a compact equivalent you can read end-to-end.

```c
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <stdbool.h>
#include <stdio.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

static int ll_create_ruleset(const struct landlock_ruleset_attr *a, size_t s, __u32 f) {
    return syscall(__NR_landlock_create_ruleset, a, s, f);
}
static int ll_add_rule(int fd, enum landlock_rule_type t, const void *a, __u32 f) {
    return syscall(__NR_landlock_add_rule, fd, t, a, f);
}
static int ll_restrict_self(int fd, __u32 f) {
    return syscall(__NR_landlock_restrict_self, fd, f);
}

/* Rights understood by the running kernel, per ABI version. */
static __u64 supported_fs_rights(int abi) {
    __u64 m = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_WRITE_FILE |
              LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR |
              LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_REMOVE_FILE |
              LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_DIR |
              LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK |
              LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_BLOCK |
              LANDLOCK_ACCESS_FS_MAKE_SYM;
    if (abi >= 2) m |= LANDLOCK_ACCESS_FS_REFER;
    if (abi >= 3) m |= LANDLOCK_ACCESS_FS_TRUNCATE;
    if (abi >= 5) m |= LANDLOCK_ACCESS_FS_IOCTL_DEV;
    return m;
}

/* Returns 0 on success. A missing path is only tolerated when !required. */
static int add_path_rule(int ruleset_fd, const char *path, __u64 access, bool required) {
    int fd = open(path, O_PATH | O_CLOEXEC);
    if (fd < 0) {
        if (!required && errno == ENOENT) {
            fprintf(stderr, "note: %s absent, skipping rule\n", path);
            return 0;
        }
        perror(path);
        return -1;
    }
    struct landlock_path_beneath_attr pb = {
        .allowed_access = access,
        .parent_fd = fd,
    };
    int rc = ll_add_rule(ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, &pb, 0);
    if (rc) perror("landlock_add_rule");
    close(fd);
    return rc;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <cmd> [args...]\n", argv[0]); return 2; }

    int abi = ll_create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 0) { perror("Landlock unavailable"); return 1; }
    fprintf(stderr, "landlock ABI %d\n", abi);

    /* Handle every right the kernel knows: anything not explicitly allowed is denied. */
    struct landlock_ruleset_attr attr = { .handled_access_fs = supported_fs_rights(abi) };
    int rs = ll_create_ruleset(&attr, sizeof(attr), 0);
    if (rs < 0) { perror("landlock_create_ruleset"); return 1; }

    const __u64 ro = LANDLOCK_ACCESS_FS_EXECUTE |
                     LANDLOCK_ACCESS_FS_READ_FILE |
                     LANDLOCK_ACCESS_FS_READ_DIR;
    __u64 rw = ro | LANDLOCK_ACCESS_FS_WRITE_FILE |
               LANDLOCK_ACCESS_FS_REMOVE_FILE | LANDLOCK_ACCESS_FS_REMOVE_DIR |
               LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_DIR |
               LANDLOCK_ACCESS_FS_MAKE_SYM;
    if (abi >= 3) rw |= LANDLOCK_ACCESS_FS_TRUNCATE;

    /* Runtime, read-only. /bin, /sbin, /lib and /lib64 are optional so the
       sample works on both merged-/usr and split-/usr systems. */
    if (add_path_rule(rs, "/usr", ro, true) ||
        add_path_rule(rs, "/bin", ro, false) ||
        add_path_rule(rs, "/sbin", ro, false) ||
        add_path_rule(rs, "/lib", ro, false) ||
        add_path_rule(rs, "/lib64", ro, false))
        return 1;

    /* Device nodes most programs expect. */
    const __u64 dev = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE;
    if (add_path_rule(rs, "/dev/null", dev, true) ||
        add_path_rule(rs, "/dev/zero", dev, false) ||
        add_path_rule(rs, "/dev/urandom", dev, false))
        return 1;

    /* The only writable tree. Note: REFER is deliberately not granted here. */
    if (add_path_rule(rs, "/tmp/work", rw, true))
        return 1;

    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) { perror("no_new_privs"); return 1; }
    if (ll_restrict_self(rs, 0)) { perror("landlock_restrict_self"); return 1; }
    close(rs);

    execvp(argv[1], &argv[1]);
    perror("execvp");
    return 1;
}
```

Notice what the policy *does not* say: it never mentions `/etc`, `/home`, or `/root`. Because every right is in the handled mask, those paths are denied by construction. Note also that `/etc` is genuinely needed by many programs (`nsswitch.conf`, `resolv.conf`, `localtime`), which is why realistic policies end up listing a handful of specific files or directories read-only. The dynamic loader tolerates a missing `/etc/ld.so.cache` (it falls back to the default search paths), but nothing else in `/etc` comes for free.

Every rule addition is checked and aborts on failure. Publishing a security sample that silently swallows `landlock_add_rule` errors is how a sandbox quietly ends up with a different policy than the one in the source file.

### Step 3: Compile and run

```bash
gcc -O2 -Wall -Wextra -o sandboxer sandboxer.c
mkdir -p /tmp/work

./sandboxer /bin/sh -c 'echo hello > /tmp/work/ok.txt && cat /tmp/work/ok.txt'
# landlock ABI 6
# hello
```

The shell starts successfully, which proves the read/execute rules cover the dynamic loader and the shell binary. Now probe the boundary.

### Step 4: A CTF-style boundary test matrix

Each case below lists the exact command and what a correct policy should produce. The first three lines define helpers you can drop into CI; because the sandboxer prints its ABI line on stderr, both helpers discard output.

```bash
denied()  { ./sandboxer "$@" >/dev/null 2>&1 && echo "FAIL (allowed): $*" || echo "ok (denied): $*"; }
allowed() { ./sandboxer "$@" >/dev/null 2>&1 && echo "ok (allowed): $*" || echo "FAIL (denied): $*"; }

# 1. Read a world-readable file outside the allow-list -> EACCES.
#    (/etc/hostname is readable by everyone, so a denial can only come from Landlock.)
./sandboxer cat /etc/hostname
# cat: /etc/hostname: Permission denied   (exit 1)

# 2. Create and read inside the writable tree -> allowed.
./sandboxer sh -c 'mkdir -p /tmp/work/a /tmp/work/b && echo hi > /tmp/work/a/f && cat /tmp/work/a/f'
# hi

# 3. Create inside a read-only allow-listed tree -> EACCES.
./sandboxer touch /usr/local/nope
# touch: cannot touch '/usr/local/nope': Permission denied   (exit 1)

# 4a. Rename within a single directory -> allowed (REFER is not required).
./sandboxer sh -c 'echo x > /tmp/work/a/f && mv /tmp/work/a/f /tmp/work/a/g && ls /tmp/work/a/g'
# /tmp/work/a/g

# 4b. Link that changes the parent directory -> EXDEV (REFER handled, never granted).
./sandboxer sh -c 'mkdir -p /tmp/work/a /tmp/work/b && touch /tmp/work/a/f && ln /tmp/work/a/f /tmp/work/b/g'
# ln: failed to create hard link '/tmp/work/b/g' => '/tmp/work/a/f': Invalid cross-device link   (exit 1)

# 5. Symlink pivot: the link target is resolved, then checked.
./sandboxer sh -c 'ln -sf /etc/hostname /tmp/work/s && cat /tmp/work/s'
# cat: /tmp/work/s: Permission denied   (exit 1)

# 6. Setuid binary -> no privilege gain (PR_SET_NO_NEW_PRIVS is set).
./sandboxer /usr/bin/passwd < /dev/null
# Runs with your own UID, cannot even read /etc/passwd, and exits non-zero.
# The exact message varies; the point is that no elevated process ever exists.
```

Case 5 is the interesting one. Landlock follows the symlink and evaluates the *resolved* object, so a symlink inside an allowed directory does not become a tunnel to `/etc/hostname` or `/etc/shadow`.

Case 4 shows the opposite failure mode and is the one people get wrong. `REFER` is in the handled mask because `supported_fs_rights()` adds it for ABI >= 2, but no rule grants it, so a rename or link that changes the parent directory fails with `EXDEV`. That is why the test uses `ln`: GNU `mv` would see `EXDEV`, assume a cross-filesystem move, and complete the operation by copying and unlinking, hiding the denial. To see the behaviour flip, add `LANDLOCK_ACCESS_FS_REFER` to the `rw` mask and re-run — the link then succeeds, at the cost of allowing files to be moved between any directories your rules cover.

To see denials in context rather than as a bare `EACCES`:

```bash
strace -f -e trace=%file ./sandboxer cat /etc/hostname 2>&1 | grep -i -e eacces -e exdev
```

### Step 5: Combining with seccomp and namespaces

Landlock governs *objects*; seccomp governs *syscalls*; namespaces govern *views*. Each covers the others' blind spots.

- **Order matters.** Landlock is a set of syscalls. If a seccomp filter that kills unknown syscalls is installed first, the Landlock calls will be killed. Apply Landlock, then install seccomp.
- **Both need `PR_SET_NO_NEW_PRIVS`.** Set it once; both mechanisms accept it.
- **Both are inherited across `execve`** — which is why they compose well for wrapping untrusted binaries.
- **Namespaces first, Landlock last.** Create a user/mount/PID/network namespace, `pivot_root` into a minimal tree, then apply Landlock before exec. Landlock's rules are keyed to the underlying filesystem objects rather than to the path string used to reach them, so they keep holding when the mount namespace is manipulated — a bind mount of an allowed tree stays allowed, and mounting something else over it does not silently extend the policy.

## Security Implications

From an attacker's point of view, a Landlock sandbox is a well-defined puzzle. The seams worth probing:

- **Pre-opened descriptors.** Landlock checks paths, not handles. Anything the launcher opened before `landlock_restrict_self` stays fully usable for `read(2)`, `write(2)`, and `mmap(2)` even if its path is outside the policy, and it survives `execve` unless `O_CLOEXEC` was set. `openat(2)` relative to a stray directory fd is still evaluated on the resolved path, so such an fd does not unlock new files — but the fd you already hold is itself a capability.
- **`ioctl(2)` timing.** If `LANDLOCK_ACCESS_FS_IOCTL_DEV` is handled, device ioctls are checked at `ioctl(2)` time against the device's path, including on descriptors opened long before the restriction. A terminal, GPU, or DRM node inherited from the launcher becomes a policy question at the moment of the ioctl, not at the moment of `open`.
- **`/proc`.** If the policy allows reading `/proc`, the sandbox can read the `cmdline` and (for same-UID, dumpable processes) the `environ` of its neighbours, which frequently contain secrets. Consider denying `/proc` wholesale. A narrow rule on `/proc/self` is fragile: it is resolved to `/proc/<pid>` when the rule is created, so it covers the process that built the ruleset but not the descendants it later forks.
- **UNIX sockets and signals.** Before ABI 6 there is no scoping of abstract UNIX socket connections or signals, so a sandboxed process can still talk to a privileged daemon's abstract socket or signal a peer. ABI 4+ adds TCP bind/connect rules, but not UDP or raw sockets, and none of that applies unless you handle `handled_access_net` explicitly.
- **Multithreaded escapes.** If the sandbox is applied after threads exist, unconfined threads remain.
- **No denial audit trail.** Unlike SELinux or AppArmor, Landlock does not emit its own audit records; a denial appears to the caller as `EACCES` (or `EXDEV` for reparenting). That is fine for the caller and awkward for the operator — plan for it in observability design.

Equally important: Landlock is not a container. It does not virtualise IPC, PIDs, or the network, and it does not restrict most syscalls. For genuinely hostile code, it is one layer, not the layer.

## Defensive Considerations

- **Handle rights deliberately, not maximally.** Building the handled mask from the ABI query is the right default, but including a right you never grant is a behavioural decision: handling `REFER` without granting it breaks every cross-directory rename and link (including some atomic-save and `git` patterns), handling `TRUNCATE` breaks `truncate(2)` and `O_TRUNC`, and handling `IOCTL_DEV` breaks ioctls on inherited device descriptors. Decide per right whether your workload can tolerate denial; for rights you leave unhandled, document the residual risk (a left-unhandled `TRUNCATE` means a confined process can still destroy any file it can write).
- **Default to deny; allow narrowly.** Prefer a small number of read-only directories plus one writable working directory, and add specific files (for example `/dev/null` or `/etc/ld.so.cache`) as needed rather than whitelisting `/etc`.
- **Sanitise the fd table before restricting.** Set `O_CLOEXEC` on everything you open, and close inherited fds in the child before applying the policy.
- **Restrict before spawning threads,** or ensure every thread calls `landlock_restrict_self` with proper synchronisation.
- **Always set `no_new_privs`.** It costs nothing and neutralises setuid-based escalation inside the sandbox.
- **Layer with seccomp, namespaces, rlimits, and cgroups.** A typical hardened launcher uses all of them; each catches a different class of mistake.
- **Reuse existing plumbing where it exists.** systemd's `RestrictFileSystems=` unit directive applies Landlock policy to a service, which is far less error-prone than hand-rolling syscalls in every daemon.
- **Write negative tests into CI.** The matrix above is cheap; asserting that `/etc/hostname` is *unreadable* inside the sandbox is more valuable than asserting the happy path works.
- **Re-check after kernel upgrades.** Because the handled mask is derived at runtime from the queried ABI, a newer kernel silently starts handling rights your workload was previously allowed to use. Pin expectations with a version check and a regression test on every kernel you ship on.

## Conclusion

Landlock gives Linux something it historically lacked: a way for an ordinary process to declare the only filesystem it needs and have the kernel enforce that for the rest of its life, with no root, no daemon, and no administrator-authored policy. The model is small — three syscalls, a handled-rights bitmask, and an additive set of path-beneath rules — and the inheritance semantics are unusually well behaved, because restrictions only ever accumulate.

The subtleties are where the security lives. The handled-access model means omissions fail *open*, not closed, while adding a right without granting it can break working programs. Rules cannot express exclusions. Domains bind to threads and never revoke open descriptors, and `ioctl(2)` on a device is checked at a different moment than every other filesystem operation. And the feature is a moving target, with new rights and new scopes arriving in new ABI revisions. Used with an ABI-aware mask, a narrow allow-list, `no_new_privs`, and companion layers such as seccomp and namespaces, Landlock is a practical and low-friction sandbox for untrusted code. Used carelessly, it is a comfortable illusion — which, in security, is the worse of the two outcomes.
