export interface RecentItem {
  id: string;
  editUrl: string;
  rawUrl: string;
  preview: string;
}

export function getRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem('plain_recent') || '[]');
  } catch {
    return [];
  }
}

export function saveRecent(items: RecentItem[]) {
  localStorage.setItem('plain_recent', JSON.stringify(items.slice(0, 10)));
}

export function addRecent(item: RecentItem) {
  const recent = getRecent();
  recent.unshift(item);
  saveRecent(recent);
}

export function removeRecent(index: number) {
  const recent = getRecent();
  recent.splice(index, 1);
  saveRecent(recent);
}
