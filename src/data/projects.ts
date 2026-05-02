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
		name: 'CTF Ops Dashboard',
		description:
			'A static-first dashboard for tracking challenge categories, writeup progress, and post-competition retrospectives.',
		techStack: ['Astro', 'TypeScript', 'Tailwind CSS'],
		github: 'https://github.com/ashuraweismann',
		tags: ['CTF', 'Tool'],
		featured: true,
	},
	{
		name: 'Zero-Downtime Deploy Lab',
		description:
			'A lab environment for documenting GitHub Actions, container rollouts, and pragmatic deployment hardening patterns.',
		techStack: ['Docker', 'GitHub Actions', 'Nginx'],
		github: 'https://github.com/ashuraweismann',
		tags: ['DevOps', 'Tool'],
		featured: true,
	},
	{
		name: 'Recon Notes Archive',
		description:
			'A searchable note system for web recon tactics, bug bounty checklists, and post-exploitation observations.',
		techStack: ['Astro', 'MDX', 'Fuse.js'],
		github: 'https://github.com/ashuraweismann',
		tags: ['Web', 'CTF'],
		featured: true,
	},
	{
		name: 'Internal CLI Toolkit',
		description:
			'A small collection of scripts for local automation, environment setup, and repeatable incident-response workflows.',
		techStack: ['Node.js', 'Bash', 'TypeScript'],
		github: 'https://github.com/ashuraweismann',
		tags: ['Tool', 'DevOps'],
	},
];
