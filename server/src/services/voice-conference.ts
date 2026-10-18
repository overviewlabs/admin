import { randomUUID } from 'node:crypto';

/** Reservations count toward capacity before any asynchronous credential mint. */
export class VoiceConference {
  readonly id = randomUUID();
  readonly commentId = randomUUID();
  readonly members = new Map<string, string>();
  readonly messages = new Map<string, { speaker: string; text: string }>();
  closed = false;
  constructor(readonly originAgentId: string, readonly anchorSessionId: string) {
    this.members.set(originAgentId, anchorSessionId);
  }
  reserve(agentId: string) {
    if (this.closed) throw new Error('The call has ended.');
    if (this.members.has(agentId)) throw new Error('This agent is already in the call.');
    if (this.members.size >= 5) throw new Error('A call can include at most five agents.');
    const reservation = randomUUID();
    this.members.set(agentId, reservation);
    return reservation;
  }
  record(id: string, speaker: string, text: string) {
    if (!this.messages.has(id) && this.messages.size >= 1000) throw new Error('Conference transcript limit reached. Start a new call.');
    this.messages.set(id, { speaker: speaker.replace(/[\r\n*_]/g, ' '), text });
    return `<!-- overview-conference -->\n### Conference Call\n\n---\n\n${[...this.messages.values()].map(m => `**${m.speaker}**\n\n${m.text}`).join('\n\n')}\n\n---`;
  }
}
