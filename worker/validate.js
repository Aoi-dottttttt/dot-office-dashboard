const statuses = new Set(['running', 'waiting', 'available', 'unknown']);
const executionKeys = ['model', 'reasoningEffort', 'modelSource', 'reasoningEffortSource'];
const taskKeys = ['number', 'status', 'title', 'summary', 'featured', 'goal', 'latestResult', 'blocker', 'category', 'observedAt', ...executionKeys];
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const allowed = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const text = (value, max = 3000) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const optional = (value, predicate) => value == null || predicate(value);
export function validExecution(item) {
  if (!record(item)) return false;
  return [['model',160], ['reasoningEffort',80]].every(([key,max]) =>
    optional(item[key], value => text(value,max) && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)) &&
    optional(item[key+'Source'], value => ['requested','runtime','unknown'].includes(value)) &&
    (!['requested','runtime'].includes(item[key+'Source']) || typeof item[key] === 'string')
  );
}
export function validSnapshot(data) {
  if (!allowed(data,['schemaVersion','updatedAt','maxConcurrency','capacityKnown','maintenance','slots','waiting','recent'])) return false;
  if (data.schemaVersion !== 2 || data.maxConcurrency !== 7 || typeof data.capacityKnown !== 'boolean' || !time(data.updatedAt) || Date.parse(data.updatedAt) > Date.now()+300000) return false;
  if (!Array.isArray(data.slots) || data.slots.length !== 7 || !data.slots.every(slot =>
    allowed(slot,taskKeys) && Number.isInteger(slot.number) && slot.number >= 1 && slot.number <= 7 && statuses.has(slot.status) && text(slot.title,120) && text(slot.summary) &&
    optional(slot.featured,value => typeof value === 'boolean') && optional(slot.observedAt,time) && (slot.status !== 'running' || time(slot.observedAt)) &&
    ['goal','latestResult','blocker'].every(key => optional(slot[key],value => text(value))) && optional(slot.category,value => text(value,120)) && validExecution(slot)
  ) || new Set(data.slots.map(slot => slot.number)).size !== 7) return false;
  if (!Array.isArray(data.waiting) || data.waiting.length > 20 || !data.waiting.every(item => allowed(item,['title','description','observedAt','kind',...executionKeys]) && text(item.title,120) && text(item.description) && time(item.observedAt) && ['external','decision','paused'].includes(item.kind) && validExecution(item))) return false;
  if (!Array.isArray(data.recent) || data.recent.length > 50 || !data.recent.every(item => allowed(item,['title','result','observedAt','status',...executionKeys]) && text(item.title,120) && text(item.result) && time(item.observedAt) && ['completed','stopped'].includes(item.status) && validExecution(item))) return false;
  const maintenance = data.maintenance;
  return allowed(maintenance,['status','intervalMinutes','observedAt','description']) && ['enabled','paused','unknown'].includes(maintenance.status) && Number.isInteger(maintenance.intervalMinutes) && maintenance.intervalMinutes >= 1 && maintenance.intervalMinutes <= 10080 && text(maintenance.description) && time(maintenance.observedAt);
}
