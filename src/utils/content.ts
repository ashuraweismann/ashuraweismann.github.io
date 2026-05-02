const WORDS_PER_MINUTE = 200;

export function getReadingTime(content: string) {
	const words = content.trim().split(/\s+/).filter(Boolean).length;
	const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
	return `${minutes} min read`;
}
