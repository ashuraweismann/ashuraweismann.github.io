---
title: "🔍 eBPF for Security: Building a Runtime Threat Detection Agent"
description: "A practical guide to using eBPF for security monitoring, including writing simple eBPF programs to trace syscalls, detect suspicious behavior, and integrate with SIEM."
pubDate: 2026-10-16
tags:
  - "eBPF"
  - "Linux Security"
  - "Threat Detection"
  - "SIEM"
  - "bpftrace"
---

## Introduction

Runtime threat detection asks a simple question: what is happening on this host right now? Traditional host-based tools often rely on polling logs, parsing audit records, or instrumenting userland processes. These approaches can miss short-lived activity, add overhead, or require modifying the workloads being monitored. eBPF offers a different path: a programmable execution environment inside the Linux kernel that can observe system calls, process execution, file access, and network events with relatively low overhead.

This article is an intermediate-level guide to building a small runtime threat detection agent with eBPF. We will cover the core concepts, walk through practical examples using bpftrace and BCC, discuss how to ship events to a SIEM, and examine the security implications of using eBPF for defense. The examples assume a Linux system with a modern kernel, BTF support, and root or appropriate capabilities to load eBPF programs. They are educational starting points, not production-hardened agents.

## Core Concepts

### eBPF execution model

eBPF is a register-based virtual machine in the Linux kernel. You write a program, compile it to eBPF bytecode, and load it into the kernel. The kernel verifier checks the program for safety before it runs. The verifier enforces rules such as bounded loops, valid memory access, and a limited instruction set. After verification, the program may be just-in-time compiled to native machine code.

eBPF programs attach to hooks. Common hooks for security include:

- **Tracepoints**: stable kernel tracing points, such as `syscalls:sys_enter_execve`.
- **kprobes**: dynamic probes on kernel functions, useful when no tracepoint exists.
- **fentry/fexit**: modern function entry and exit tracing, often more efficient than kprobes.
- **LSM hooks**: Linux Security Module hooks that can observe or enforce security decisions.
- **XDP and TC**: network hooks for packet processing, useful for network security but outside this article's focus.

For runtime threat detection, syscall tracepoints and process lifecycle hooks are often the most accessible starting points.

### Maps and ring buffers

eBPF programs cannot directly call arbitrary kernel functions or access user memory without helpers. They communicate with user space through **maps**. A map is a key-value data structure shared between kernel and user space. Common map types include hash maps, arrays, per-CPU maps, and ring buffers.

A **ring buffer** is a modern, efficient way to send events to user space. Older programs often used perf buffers. For high-volume event streams, a ring buffer can reduce overhead and memory copying. In security agents, maps are also useful for storing configuration, counters, and allowlists.

### BTF and CO-RE

BPF Type Format (BTF) provides type information for kernel data structures. Compile Once, Run Everywhere (CO-RE) uses BTF to let eBPF programs adapt to different kernel versions without recompilation. This is important for portable security tools. You can check for kernel BTF at `/sys/kernel/btf/vmlinux`.

### Tooling

Several toolchains make eBPF easier:

- **bpftrace**: a high-level language for quick tracing and one-liners.
- **BCC**: a Python and C framework with embedded eBPF programs, good for prototypes.
- **libbpf**: a C library for production eBPF programs, often used with CO-RE.
- **cilium/ebpf** and **aya**: Go and Rust libraries for building eBPF agents in those languages.

For learning and rapid detection experiments, bpftrace and BCC are excellent. For production, libbpf or a language-specific library may be more appropriate.

## Practical Walkthrough

### Assumptions and environment check

The examples assume a Linux kernel with BTF enabled, bpftrace or BCC installed, and root privileges. First, check the kernel version and BTF availability:

```bash
uname -r
ls /sys/kernel/btf/vmlinux
```

If BTF is missing, ensure your running kernel was compiled with BTF support (`CONFIG_DEBUG_INFO_BTF=y`), which is standard on modern enterprise and cloud Linux distributions (Ubuntu 20.04+, Debian 11+, RHEL 8.2+). Kernel header packages (`linux-headers`) are not required for kernel BTF itself, though development toolchains like BCC still need them to compile programs against kernel structures. Install bpftrace using your distribution package manager, for example `apt install bpftrace` on Debian-like systems. Running eBPF tools usually requires root or capabilities such as `CAP_BPF` and `CAP_PERFMON` on newer kernels.

### Counting syscalls by process

A simple baseline is to count syscalls per process name:

```bash
bpftrace -e 'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }'
```

This attaches to the raw syscall enter tracepoint. `comm` is the current process name. `@[comm] = count()` creates a map keyed by process name and increments a counter. Run it for a few seconds, then press Ctrl-C to print the map. This helps you understand normal activity on a host before writing detection rules.

### Tracing process execution

Process execution is a high-value security event. This bpftrace one-liner logs execve calls:

```bash
bpftrace -e 'tracepoint:syscalls:sys_enter_execve { printf("%s (pid=%d) execs %s\n", comm, pid, str(args->filename)); }'
```

`str(args->filename)` reads a user-space string safely. `pid` is the current process ID. This produces a lot of output on a busy system, so filters are essential.

### Detecting suspicious shell spawns

A common detection is a web server worker process spawning an interactive shell (e.g. `/bin/sh` or `/bin/bash`), often indicating a web shell or remote command execution. To avoid alerting on every routine worker execution, match both the web server caller and the target binary path:

```bash
bpftrace -e 'tracepoint:syscalls:sys_enter_execve /(comm == "nginx" || comm == "apache2") && (str(args->filename) == "/bin/sh" || str(args->filename) == "/bin/bash" || str(args->filename) == "/usr/bin/bash" || str(args->filename) == "/bin/dash")/ { printf("ALERT: Shell spawned by web server %s (pid=%d): %s\n", comm, pid, str(args->filename)); }'
```

Checking both the parent process name (`comm`) and the target executable (`args->filename`) significantly reduces false positives while catching reverse shells and injected shell commands.

### Monitoring sensitive file access

Another useful signal is access to sensitive files such as `/etc/shadow`:

```bash
bpftrace -e 'tracepoint:syscalls:sys_enter_openat /str(args->filename) == "/etc/shadow"/ { printf("%s (pid=%d) uid=%d opened /etc/shadow\n", comm, pid, uid); }'
```

This uses the `openat` syscall tracepoint. `uid` is a built-in bpftrace variable. This is detection only; it does not block the access. For enforcement, you would need an LSM-based program or another blocking hook.

### Building a small BCC agent for SIEM integration

bpftrace is great for exploration, but a SIEM integration often needs structured events. The following BCC example emits process execution events as JSON. BCC uses embedded C and Python callbacks.

```python
from bcc import BPF
import json

bpf_text = r'''
#include <uapi/linux/ptrace.h>
#include <linux/sched.h>

struct exec_event_t {
    u32 pid;
    u32 uid;
    char comm[16];
    char filename[256];
};

BPF_PERF_OUTPUT(exec_events);

int syscall__execve(struct pt_regs *ctx, const char __user *filename,
                    const char __user *const __user *argv) {
    struct exec_event_t event = {};
    event.pid = bpf_get_current_pid_tgid() >> 32;
    event.uid = bpf_get_current_uid_gid();
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    bpf_probe_read_user_str(&event.filename, sizeof(event.filename), filename);
    exec_events.perf_submit(ctx, &event, sizeof(event));
    return 0;
}
'''

b = BPF(text=bpf_text)
syscall = b.get_syscall_fnname('execve')
b.attach_kprobe(event=syscall, fn_name='syscall__execve')

def handle_event(cpu, data, size):
    event = b['exec_events'].event(data)
    record = {
        'event': 'execve',
        'pid': event.pid,
        'uid': event.uid,
        'comm': event.comm.decode('utf-8', 'replace'),
        'filename': event.filename.decode('utf-8', 'replace'),
    }
    print(json.dumps(record))
    # Ship to SIEM here: TLS, syslog, Kafka, or another transport.

b['exec_events'].open_perf_buffer(handle_event)
print('Tracing execve. Press Ctrl-C to stop.')
while True:
    try:
        b.perf_buffer_poll()
    except KeyboardInterrupt:
        exit()
```

This program defines a struct `exec_event_t`, creates a perf output map named `exec_events`, and attaches a kprobe to the `execve` syscall. The helper `bpf_get_current_pid_tgid()` returns a 64-bit value where the upper 32 bits are the process ID. `bpf_get_current_comm()` copies the process name. `bpf_probe_read_user_str()` safely reads the filename from user memory. The Python callback decodes the bytes and prints JSON. To integrate with a SIEM, replace `print` with a function that sends the JSON over TLS, writes to syslog, or publishes to a message queue.

### Normalizing events for a SIEM

A useful event schema includes a timestamp, hostname, event type, process ID, parent process ID, user ID, process name, and arguments. You can enrich the BCC example by reading the parent PID with `bpf_get_current_task()` and following `real_parent`, but that requires more kernel structure knowledge. Start simple and add fields as needed. Send events over an authenticated and encrypted channel, and validate them on the SIEM side.

## Security Implications

eBPF is powerful, and that power cuts both ways. Loading eBPF programs typically requires elevated privileges such as `CAP_BPF` and `CAP_PERFMON`, or `CAP_SYS_ADMIN` on older kernels. An attacker who already has root can use eBPF to hide processes, intercept syscalls, or exfiltrate data. Kernel verifier bugs have historically led to privilege escalation, so keeping the kernel patched is important. We will not cite specific CVEs here, but the general risk is real.

Unprivileged eBPF is controlled by the `kernel.unprivileged_bpf_disabled` sysctl. A value of `0` allows unprivileged users to load some program types, which expands the attack surface. A value of `1` disables unprivileged BPF permanently until reboot (acting as an immutable one-way latch; attempts to set it back to 0 will be rejected with an error). A value of `2` disables unprivileged BPF while still permitting an administrator to re-enable it at runtime by setting it back to 0. Defenders should generally set this to `1` for production hardening or `2` if administrative workflows may need temporary re-enabling.

Detection evasion is another concern. An attacker may kill the agent, unload its BPF programs, or use userland evasion techniques such as `LD_PRELOAD`. A kernel-level attacker can tamper with the agent or the kernel itself. Your agent should be monitored, its configuration should be integrity-checked, and alerts should be sent to a remote SIEM so that local tampering does not erase evidence.

Data sensitivity matters too. Syscall traces can capture filenames, command-line arguments, and sometimes credentials or tokens. Protect event logs with encryption, access controls, and redaction. Finally, performance is a security property: a detection rule that floods the SIEM or consumes too much CPU can become a denial-of-service risk. Filter in the kernel where possible, and rate-limit in user space.

## Defensive Considerations

Start with least privilege. Instead of running the agent as full root, use a systemd service with only the capabilities it needs, such as `CAP_BPF` and `CAP_PERFMON`. On older kernels you may need `CAP_SYS_ADMIN`. Apply hardening directives such as `NoNewPrivileges=yes`, `ProtectSystem=strict`, and `PrivateTmp=yes` where compatible with your tooling. Test carefully because BPF loading may require access to `/sys/fs/bpf` or other paths.

Disable unprivileged BPF unless you have a clear requirement. For example:

```bash
sysctl -w kernel.unprivileged_bpf_disabled=1
```

To persist the setting, add it to a file under `/etc/sysctl.d/`. Setting the value to `1` provides maximum immutability since it cannot be changed back to `0` without rebooting the system.

Monitor BPF activity on your hosts. Tools such as `bpftool prog list` and `bpftool map list` show loaded programs and maps. Unexpected programs can indicate malicious or unmanaged eBPF use. Audit logs and immutable logging can help. In container environments, restrict the `bpf` syscall with seccomp profiles and drop capabilities such as `CAP_BPF` and `CAP_SYS_ADMIN` from workloads that do not need them.

Secure the SIEM pipeline. Use TLS with certificate validation, authenticate agents, enforce rate limits, and validate event schemas. Redact sensitive fields before transmission. Tune detections to reduce false positives, and maintain a baseline of normal behavior.

Consider enforcement carefully. eBPF LSM hooks can block actions such as execve or file open, but a bug in an enforcement policy can break production. Run new policies in monitor mode first, then move to enforcement with rollback plans. Keep the kernel and eBPF tooling updated, and follow your distribution's security advisories.

## Conclusion

eBPF gives defenders a programmable, relatively efficient way to observe runtime behavior inside the Linux kernel. You can start with bpftrace one-liners to explore syscalls and detect suspicious process execution or sensitive file access. For structured events and SIEM integration, BCC or libbpf can emit JSON records that flow into your existing monitoring pipeline. The same capabilities that make eBPF useful for defense also make it attractive to attackers, so treat eBPF as privileged infrastructure. Restrict unprivileged BPF, run agents with least privilege, monitor loaded programs, protect event data, and tune detections against a baseline. With those practices, eBPF becomes a practical building block for a runtime threat detection agent rather than just another source of noise.
