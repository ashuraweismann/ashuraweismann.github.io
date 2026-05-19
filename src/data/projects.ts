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
	featured: true,
	}
];
