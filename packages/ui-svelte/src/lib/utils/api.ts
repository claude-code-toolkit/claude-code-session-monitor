import type { Session } from '$lib/data/schema';

const API_PORT = import.meta.env.VITE_API_PORT || '4451';
const API_BASE = `http://127.0.0.1:${API_PORT}`;

export function getLastAgentMessage(session: Session): string | undefined {
	// Find the last assistant message from recentOutput
	const assistantMessages = session.recentOutput?.filter((o) => o.role === 'assistant') || [];
	if (assistantMessages.length === 0) return undefined;
	return assistantMessages[assistantMessages.length - 1].content;
}

export async function focusOrOpenSession(
	cwd: string,
	sessionId: string,
	status: string,
	lastAgentMessage?: string
): Promise<'focused' | 'opened' | 'failed'> {
	try {
		const res = await fetch(`${API_BASE}/focus-or-open`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cwd, sessionId, status, lastAgentMessage })
		});
		const data = await res.json();
		return data.action;
	} catch {
		return 'failed';
	}
}
