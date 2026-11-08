---
title: "Linux Seccomp-BPF: Building Syscall Allowlists for Container Hardening"
description: "A practical guide to seccomp modes, tracing the syscalls a workload really needs, writing custom seccomp profiles, and applying syscall allowlists to Docker and Kubernetes workloads while debugging the compatibility failures that follow."
pubDate: 2026-11-08
tags:
  - "linux-security"
  - "seccomp"
  - "container-hardening"
  - "kubernetes"
  - "docker"
  - "syscalls"
---

## Introduction

Namespaces decide what a process can *see*. Cgroups decide how much it can *use*. Neither decides which kernel entry points it can *call*. A container process shares the host kernel, so every syscall the kernel implements is reachable from inside the container, limited only by the process's credentials and by whatever LSM policy is attached.

That matters because each syscall handler is a substantial chunk of privileged C code. Kernel privilege-escalation bugs are frequently reachable through a single obscure syscall (`keyctl`, `io_uring_setup`, `userfaultfd`, `perf_event_open`, and friends) that a normal web service will never legitimately call. If you can remove those entry points from a workload's reachable surface, a whole class of exploits stops being usable against that workload.

seccomp-BPF is the mechanism that removes them. It is a per-thread syscall filter enforced by the kernel *before* dispatch, and it is the primary reason a default Docker container is meaningfully harder to exploit than a raw process on the host.

This article covers: how the filter works, how to trace a real workload's syscalls, how to write and apply a profile to Docker and Kubernetes, how to debug the inevitable breakage, and where seccomp stops being sufficient. Assumptions: you have a Linux host with a modern kernel (4.14+ for the full action set, 5.0+ for user notification), root or equivalent access on the container host, and basic familiarity with containers.

## Core Concepts

### What a seccomp filter actually inspects

A thread can carry a stack of seccomp filters. On every syscall, the kernel evaluates the thread's filters and takes the highest-precedence action returned. A filter is a classic BPF (cBPF) program whose input is a small, fixed structure:

```c
struct seccomp_data {
    int   nr;                   /* syscall number */
    __u32 arch;                 /* AUDIT_ARCH_* constant */
    __u64 instruction_pointer;
    __u64 args[6];              /* raw register values */
};
```

Two consequences follow immediately and shape everything else:

1. **You can match on syscall numbers and on scalar argument values, never on pointed-to memory.** The filter sees the *pointer* passed to `openat(2)`, not the path it references. This is why seccomp cannot replace file-access control, and why `openat`-blocking profiles are blunt instruments.
2. **`arch` is part of the input** because the same numeric syscall number means different things under different ABIs. A filter that compares `nr` without first validating `arch` is comparing apples to oranges on a multi-ABI system.

### Modes

Linux exposes two seccomp modes. `SECCOMP_MODE_STRICT` permits exactly four syscalls (`read`, `write`, `_exit`, `sigreturn`) and is essentially unusable outside toy programs. `SECCOMP_MODE_FILTER` is the BPF mode and is what everyone means by "seccomp" today. It requires `CONFIG_SECCOMP_FILTER` in the kernel.

### Return actions and precedence

Each filter rule yields an action. Precedence, from most to least restrictive, is: `KILL_PROCESS`, `KILL_THREAD` (historically `KILL`), `TRAP`, `ERRNO`, `USER_NOTIF`, `TRACE`, `LOG`, `ALLOW`. Practical notes:

- `KILL_PROCESS` (Linux 4.14+) is safer than `KILL_THREAD` for multi-threaded programs, because killing one thread of a process leaves an inconsistent process behind.
- `ERRNO` returns a chosen `errno` without executing the syscall; the low 16 bits of the return value carry it. `EPERM` is the habitual choice, but see the compatibility section.
- `TRAP` delivers `SIGSYS` to the thread, which is useful for debugging and for tracer-based sandboxes.
- `USER_NOTIF` (Linux 5.0+) hands the syscall to a supervising process, which can emulate or deny it; it underpins several container security tools.
- `LOG` (Linux 4.14+) logs to the audit subsystem and then *allows* the call. It is the right way to build a profile in observe-only mode, but the record only appears if the audit subsystem is actually receiving events, so confirm delivery rather than assuming.

Because precedence is fixed rather than "last filter wins," stacked filters compose restrictively: adding a filter can only narrow what is permitted, never widen it.

### no_new_privs

Installing a filter requires either `CAP_SYS_ADMIN` or the `no_new_privs` flag (`prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)`). `no_new_privs` guarantees that subsequent `execve` calls cannot gain privileges through setuid or file capabilities, which is precisely the escape a filter must not have to reason about. Container runtimes set this flag for you. Filters are inherited across `fork` and `execve`, and once installed they cannot be removed — that is the point, but it also means a misconfigured profile can only be fixed by restarting the process.

### The JSON profile format

Docker, Podman, containerd, runc and crun all consume the OCI runtime-spec seccomp format: a JSON document with `defaultAction`, optional `defaultErrnoRet`, an `architectures` list, and a `syscalls` array of `{names, action, args?}` objects. A rule with no `args` matches every invocation of that syscall name; a rule with `args` adds per-argument comparisons against the raw register values.

## Practical Walkthrough

### Step 1: confirm the current state

Before changing anything, check whether a filter is already active. `/proc/<pid>/status` reports it:

```bash
grep -E 'Seccomp' /proc/self/status
# Seccomp:          0        <- disabled
# Seccomp:          2        <- filter mode
# Seccomp_filters:  1        <- number of stacked filters
```

From inside a container, the same file tells you whether the runtime applied a profile or left you `Unconfined`. Also verify kernel support:

```bash
grep -E 'CONFIG_SECCOMP' /boot/config-$(uname -r)
# CONFIG_SECCOMP=y
# CONFIG_SECCOMP_FILTER=y
```

### Step 2: trace what the workload actually calls

The classic tool is `strace`. `-f` follows child processes and threads (without it your trace is fiction for anything that forks), `-qq` suppresses exit chatter, and `-o` writes to a file so the trace does not drown the workload's own output:

```bash
strace -f -qq -o /tmp/app.trace ./app
```

Extract the distinct syscall names:

```bash
grep -oP '^\d+\s+\K\w+(?=\()' /tmp/app.trace | sort -u
```

That pipeline anchors on the PID prefix that `-f` adds, then grabs the identifier before the opening parenthesis; `<unfinished ...>` and `resumed` continuation lines are skipped by the anchor. If you only want a frequency summary, `strace -f -c -- ./app` prints a table instead.

For long-running services, `strace` is intrusive and slow. A `bpftrace` one-liner samples syscalls kernel-side with far less overhead:

```bash
bpftrace -e 'tracepoint:raw_syscalls:sys_enter { @[comm, args->id] = count(); }'
```

This reports numeric IDs per process name; map them to names with `ausyscall --dump` (from the audit package) or `scmp_sys_resolver` (from libseccomp).

**A load-bearing caveat:** any trace is a sample, not a specification. A syscall exercised only on the error path, on a config reload, during graceful shutdown, or after a library upgrade will not appear in a happy-path trace. Generate load, run your integration tests, and re-trace after dependency changes.

### Step 3: write the profile

Start permissive enough to boot, then tighten using observed violations. A minimal illustrative profile:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "defaultErrnoRet": 1,
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "read", "write", "close", "fstat", "lseek", "mmap", "mprotect",
        "munmap", "brk", "rt_sigaction", "rt_sigprocmask", "rt_sigreturn",
        "ioctl", "pread64", "execve", "exit", "exit_group", "arch_prctl",
        "set_tid_address", "set_robust_list", "futex", "sched_getaffinity",
        "getrandom", "rseq", "prlimit64", "getpid", "gettid"
      ],
      "action": "SCMP_ACT_ALLOW"
    },
    {
      "names": ["clone3", "faccessat2"],
      "action": "SCMP_ACT_ERRNO",
      "errnoRet": 38
    }
  ]
}
```

(`defaultErrnoRet: 1` is `EPERM`; the second rule deliberately returns `ENOSYS`, 38. JSON has no comment syntax, so annotate profiles out-of-band.)

Why that second rule matters: glibc 2.34+ may attempt `clone3` for thread creation, and glibc 2.33+ may probe `faccessat2`. Returning `EPERM` tells the library "you are not allowed" and it gives up; returning `ENOSYS` tells it "this kernel does not have it" and it falls back to `clone` or `faccessat`. Several runtimes ship exactly this pattern in their default profiles. The general rule: **for syscalls that libraries probe and can emulate, return `ENOSYS`; for syscalls you genuinely want to forbid, return `EPERM`.**

Note also that restricting `architectures` to `SCMP_ARCH_X86_64` means a 32-bit call issued via `int 0x80` (which arrives with `AUDIT_ARCH_I386`) falls through to `defaultAction` instead of matching your allow rules. Unless you need 32-bit compatibility, leave the 32-bit and x32 architectures out.

### Step 4: apply it to Docker

```bash
docker run --rm \
  --security-opt seccomp=/etc/profiles/app.json \
  --security-opt no-new-privileges \
  myimage:latest
```

Verify from inside the container by reading `/proc/self/status`, and compare against a deliberately unconfined run (`--security-opt seccomp=unconfined`) when you need to isolate whether seccomp is the cause of a failure. Podman accepts the same `--security-opt seccomp=` syntax.

### Step 5: apply it to Kubernetes

Since Kubernetes 1.19, seccomp is configured through `securityContext.seccompProfile` (the older `seccomp.security.alpha.kubernetes.io/*` annotations are deprecated):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: demo
spec:
  securityContext:
    seccompProfile:
      type: Localhost
      localhostProfile: profiles/app.json
  containers:
    - name: app
      image: myimage:latest
```

Key details: `localhostProfile` is resolved relative to the kubelet's seccomp root directory, conventionally `/var/lib/kubelet/seccomp`, so the file above must exist at `/var/lib/kubelet/seccomp/profiles/app.json` **on every node that may schedule the pod**. `RuntimeDefault` delegates to the container runtime's built-in profile and requires no file distribution, which is why it is the sane baseline for most clusters. `Unconfined` disables filtering entirely.

Kubelets also expose a `seccompDefault` option that applies `RuntimeDefault` to pods that omit the field; where it is disabled, an unset field means unconfined.

### Step 6: debug the breakage

Symptoms map to actions:

| Symptom | Likely cause |
| --- | --- |
| Process dies instantly with `SIGSYS` | `KILL_PROCESS` / `KILL_THREAD` / `TRAP`, or an architecture not covered by the profile |
| `Operation not permitted` on an operation that should work | `SCMP_ACT_ERRNO` with `EPERM` |
| `Function not implemented` on a call the kernel supports | `SCMP_ACT_ERRNO` with `ENOSYS`, or a genuine kernel/config gap |

Debugging procedure:

1. Check `/proc/<pid>/status` inside the container to confirm a filter is present.
2. Run the same image with the profile removed to confirm seccomp is the differentiator.
3. Re-run with `strace -f` on the entrypoint to see which syscall returns the error. Container images often lack `strace`; build a debug variant, or `docker cp` the binary in.
4. On the host, look for audit records: `ausearch -m SECCOMP -ts recent` (and `dmesg` as a fallback) will show `KILL` and `LOG` events. If nothing appears, the audit subsystem is not receiving events and your `LOG` profile is silently doing nothing.
5. To *discover* rather than *confirm*, temporarily set `defaultAction` to `SCMP_ACT_LOG` with no deny rules, run real traffic, harvest the audit log, and diff that set against your allowlist.

Common compatibility hot spots: `getrandom` (needed by glibc and Go at startup), `rseq` (glibc 2.35+ thread setup), `mprotect`/`mmap` (JIT runtimes such as the JVM will break without them), `clone` with `CLONE_NEW*` flags plus `unshare`, `mount`, `pivot_root` and `setns` (needed only if you run nested containers inside the container), and `memfd_create` (used by some language runtimes). `seccomp-tools` can disassemble an installed filter when you need to see exactly what a runtime applied.

## Security Implications

seccomp is a *reduction of attack surface*, not a sandbox. It does not restrict file access, network reachability, or the contents of arguments, and it should never be the only control on a workload.

The interesting failure modes for someone building a profile:

- **ABI confusion.** Filtering on `nr` without pinning `arch` lets an attacker re-issue a blocked capability through a different ABI. Always validate `arch` first, or restrict the architecture list in the profile.
- **Argument checks that assume too much.** Filters see raw integers. A rule like "deny `socket` unless `args[0] == AF_INET`" is legitimate, but any rule that depends on a pointer's target is not enforceable and creates false confidence.
- **Interface gaps above the syscall layer.** `io_uring` is the canonical example: once a ring is set up, operations are submitted through shared memory and do not generate a distinct syscall per operation, so a filter that blocks `openat` does not automatically block an `openat`-equivalent submission. Related: `userfaultfd`, `perf_event_open`, `bpf`, `keyctl`, and `ptrace` are all standard entries in default deny lists for good reason.
- **Privileged workloads.** If a container legitimately needs `mount`, `unshare`, or `ptrace`, seccomp offers little there, and the real risk has moved to capabilities and LSM policy.
- **Configuration drift as an attack.** On a shared cluster, anything that lets a tenant set `seccompProfile.type: Unconfined` — or mount their own profile — silently removes the control. Treat seccomp settings as part of the API surface you police.

## Defensive Considerations

A workable hardening loop:

1. **Baseline on `RuntimeDefault` everywhere.** It is free, requires no profile distribution, and blocks the highest-value syscalls. Pod Security Standards' `restricted` profile requires `seccompProfile.type` to be `RuntimeDefault` or `Localhost`, which is a reasonable enforcement target.
2. **Then specialize with `Localhost` profiles** for workloads whose needs you actually understand. Generate candidate rules from `SCMP_ACT_LOG` observations under real load, not from a single happy-path `strace`.
3. **Pin the architecture list** to what you deploy. Drop 32-bit and x32 unless there is a documented reason.
4. **Choose errnos deliberately.** `ENOSYS` for probe-then-fallback syscalls, `EPERM` for things you are truly denying.
5. **Keep profiles in version control, in the image build or deployment pipeline**, and re-trace after every dependency or base-image upgrade. New glibc and libuv releases add syscalls; your profile will find them before your users do.
6. **Layer the controls.** Non-root UID, `allowPrivilegeEscalation: false`, a capability drop of `ALL` plus specific adds, read-only root filesystem, AppArmor or SELinux, and network policy. seccomp covers exactly one layer.
7. **Detect regressions.** Alert on containers reporting `Seccomp: 0` in `/proc/<pid>/status`, on `--security-opt seccomp=unconfined` in deployment manifests, and on `SECCOMP` audit records — a spike in `KILL` events for a normally quiet workload is worth investigating.
8. **Test with a break-glass image.** Keep a variant of the workload with `strace` and a shell so you can debug filter failures inside the same image and environment.

## Conclusion

seccomp-BPF is the mechanism that converts "the container shares the host kernel" from a blanket hazard into a bounded one. The mental model is compact: a per-thread cBPF program inspects `nr`, `arch`, `instruction_pointer`, and six raw argument words; it returns an action, with the most restrictive action across stacked filters winning; filters are inherited and permanent, and require `no_new_privs`. Because the filter cannot dereference pointers, it is a syscall gate, not a file-access or network control.

The operational discipline is what separates a useful profile from a broken deployment. Trace with `-f` under real load, expect coverage gaps, prefer runtime defaults as the floor, and prefer `ENOSYS` over `EPERM` for syscalls that libraries probe and can emulate. When something fails, the diagnosis path is short: confirm the filter is present, compare against an unconfined run, then read the audit log.

Finally, keep the scope honest. A tight allowlist meaningfully shrinks exploitability for a workload that only needs a dozen syscalls, and does much less for one that legitimately needs `mount` and `unshare`. Use seccomp as one layer of a stack that also includes dropped capabilities, non-root execution, an LSM, and a patched kernel.
