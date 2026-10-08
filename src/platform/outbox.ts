import { createBus, pid, stamp } from './bus';

/**
 * Workspace notification outbox. Every suite queues its email, SMS and in-app notices here. There is no mail or
 * SMS gateway in this build, so delivery is simulated: messages are recorded as SENT with the address they would
 * go to, and the Notification centre shows them. A real gateway would read QUEUED messages from the same place.
 */
export type NoticeChannel = 'EMAIL' | 'SMS' | 'IN_APP';
export type NoticeLevel = 'info' | 'warning' | 'critical';

export interface Notice {
  id: string;
  at: string;
  module: string;
  channel: NoticeChannel;
  level: NoticeLevel;
  /** Person, role or external party it is for */
  to: string;
  /** Address it was sent to (email, phone) where there is one */
  address?: string;
  subject: string;
  body?: string;
  /** Document or record number it is about */
  ref?: string;
  status: 'QUEUED' | 'SENT' | 'READ';
}

const bus = createBus<Notice>();

export interface NotifyInput {
  module: string;
  to: string;
  subject: string;
  body?: string;
  ref?: string;
  address?: string;
  level?: NoticeLevel;
  /** Defaults to in-app plus email */
  channels?: NoticeChannel[];
}

/** Queues a notice on each channel and returns the created records. */
export const notify = ({ channels = ['IN_APP', 'EMAIL'], level = 'info', ...n }: NotifyInput): Notice[] => {
  const at = stamp();
  const made = channels.map<Notice>((channel) => ({ id: pid('nt'), at, channel, level, status: channel === 'IN_APP' ? 'QUEUED' : 'SENT', ...n }));
  bus.push(...made);
  return made;
};

export const markRead = (id: string) => bus.set(bus.all().map((n) => (n.id === id ? { ...n, status: 'READ' } : n)));
export const markAllRead = () => bus.set(bus.all().map((n) => (n.channel === 'IN_APP' && n.status !== 'READ' ? { ...n, status: 'READ' } : n)));
export const useNotices = bus.use;
export const allNotices = bus.all;
