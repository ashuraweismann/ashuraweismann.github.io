export interface Project {
	name: string;
	description: string;
	techStack: string[];
	github: string;
	demo?: string;
	tags: string[];
	featured?: boolean;
}

export const projects: Project[] = [
	{
		name: 'AI Cyber Threat Intelligence & Alerting Platform',
		description:
			'Built a real-time threat intelligence system that processes vulnerability data from NVD, performs AI-driven risk analysis, filters high-severity threats, and automates alerting via Telegram using n8n.',
		techStack: ['n8n', 'Docker', 'NVD API', 'Groq API', 'Telegram'],
		github: 'https://github.com/ashuraweismann/cyber-threat-intelligence-n8n',
		tags: ['Cybersecurity', 'AI', 'Automation', 'SOC'],
		featured: true,
	},
	{
		name: 'AI Avatar Assistant',
		description:
			'A Unity-based AI assistant with a 3D avatar interface, powered by LLM backends (Groq Llama 3.3 / Gemini). Features real-time chat UI, scalable API integration, and planned enhancements like voice interaction and intelligent log analysis using data structures.',
		techStack: ['Unity', 'C#', 'Groq API', 'Gemini API', 'REST APIs'],
		github: 'https://github.com/ashuraweismann/AI-Avatar-Assistant',
		tags: ['AI', 'LLM', 'Unity', 'Tool'],
		featured: true,
	},
	{
		name: 'Self-Hosted DevOps Lab (Mini Cloud)',
		description:
			'A fully containerized mini cloud environment built with Docker to simulate real-world DevOps workflows, including CI/CD pipelines, reverse proxy setup, service orchestration, and deployment automation.',
		techStack: ['Docker', 'Nginx', 'GitHub Actions', 'Linux', 'Node.js'],
		github: 'https://github.com/ashuraweismann',
		tags: ['DevOps', 'Cloud', 'Automation', 'Infrastructure'],
		featured: true,
	},
	{
  name: 'CTF Knowledge Hub SPA',
  description:
    'A modern Single Page Application for exploring cybersecurity challenges and walkthroughs, featuring authentication, bookmarks, dark mode, and a local backend for dynamic content.',
  techStack: [
    'Vue 3',
    'TypeScript',
    'Tailwind CSS',
    'Pinia',
    'Vue Router',
    'DummyJSON API',
    'json-server'
  ],
  github: 'https://github.com/ashuraweismann/ctf-knowledge-hub',
  tags: [
    'Frontend',
    'SPA',
    'Cybersecurity',
    'Learning Platform',
    'Full-Stack (Frontend + Mock Backend)'
  ],
  featured: true,
	},
	{
		name: 'Gaming Cafe Network Infrastructure Simulation',
		description:
			'Designed and simulated a secure, scalable gaming cafe network with VLAN segmentation for gaming, staff, and Wi-Fi users. Implemented network topology, IP addressing, switching, routing, and access control concepts using Cisco Packet Tracer and recreated an advanced version in GNS3 for realistic network emulation.',
		techStack: [
			'Cisco Packet Tracer',
			'GNS3',
			'Networking',
			'VLANs',
			'IP Addressing',
			'Network Security',
			'Switching & Routing'
		],
		github: 'https://github.com/ashuraweismann/gaming-center-network',
		tags: ['Networking', 'Cybersecurity', 'Simulation', 'Infrastructure'],
		featured: false,
	},
	{
		name: 'CyberXInfinity Web Application',
		description:
			'A full-stack gamified cybersecurity learning and assessment platform featuring interactive web security labs, AI-driven hints and walkthroughs, quiz modules, aura streaks, and real-time multiplayer CTF battles.',
		techStack: ['React', 'Node.js', 'Express', 'Supabase', 'Groq API', 'Socket.IO', 'Tailwind CSS'],
		github: 'https://github.com/ashuraweismann/CyberXInfinity-Web-Application',
		tags: ['Cybersecurity', 'Gamification', 'Full-Stack', 'AI', 'CTF', 'WebSockets'],
		featured: true,
	},
	{
		name: 'Containerized DevOps AI Chat Platform',
		description:
			'A multi-container full-stack conversational AI application orchestrating frontend, backend, and database microservices with Docker Compose. Features JWT-based auth, persistent chat history, and modular AI integrations.',
		techStack: ['React', 'Node.js', 'Express', 'MongoDB', 'Docker', 'Docker Compose', 'JWT'],
		github: 'https://github.com/ashuraweismann/-devops-ai-chat-web-application',
		tags: ['DevOps', 'Docker', 'Full-Stack', 'AI', 'Microservices', 'MongoDB'],
		featured: true,
	},
	{
		name: 'Squid Proxy Access Control & Filtering Lab',
		description:
			'Simulated an enterprise-grade forward proxy architecture on Ubuntu Server using Squid. Configured isolated subnet routing, domain-based Access Control Lists (ACLs), URL filtering, and proxy transaction logging.',
		techStack: ['Squid Proxy', 'Ubuntu Server', 'VirtualBox', 'Linux', 'Bash', 'Networking'],
		github: 'https://github.com/ashuraweismann/squid-proxy-filter-lab',
		tags: ['Networking', 'SysAdmin', 'Proxy', 'Network Security', 'Linux'],
		featured: false,
	},
	{
		name: 'ClipCycle (Keyboard-First Clipboard Manager)',
		description:
			'A lightweight, keyboard-first Windows clipboard history cycler written in Python. Monitors copied text, maintains an in-memory history ring, and enables seamless clipboard cycling through global hotkeys.',
		techStack: ['Python', 'Win32 API', 'Keyboard Hooks', 'Automation'],
		github: 'https://github.com/ashuraweismann/clipcycle',
		tags: ['Python', 'Tooling', 'Automation', 'Windows'],
		featured: false,
	},
	{
		name: 'Intrusion Detection Log Analyzer',
		description:
			'A high-performance C++ security utility designed to ingest and parse system logs. Structures log records using custom linked lists to detect anomalies, suspicious authentication attempts, and intrusion patterns.',
		techStack: ['C++', 'Data Structures', 'Linux Syslog', 'CLI', 'Makefile'],
		github: 'https://github.com/ashuraweismann/Intrusion-Detection-Log-Analyzer',
		tags: ['C++', 'Systems Programming', 'Log Analysis', 'Security Tooling'],
		featured: false,
	},
	{
		name: 'CTF Writeups & Security Research Hub',
		description:
			'Comprehensive archive of hands-on capture-the-flag solutions, vulnerability analyses, and proof-of-concept writeups across PicoCTF, TryHackMe, and HackTheBox spanning Web Exploitation, Forensics, and Cryptography.',
		techStack: ['Burp Suite', 'Wireshark', 'Python', 'Linux', 'GDB', 'Web Exploitation'],
		github: 'https://github.com/ashuraweismann/ctf-writeups',
		tags: ['CTF', 'Web Exploitation', 'Penetration Testing', 'Writeups'],
		featured: false,
	}
];
