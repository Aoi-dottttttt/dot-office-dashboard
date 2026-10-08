'use strict';
globalThis.DashboardState = Object.freeze({
  freshFor: 12 * 60 * 1000,
  labels: Object.freeze({ running: '进行中', waiting: '等待中', available: '暂无任务（快照）', unknown: '未核实' }),
  executionFields: Object.freeze(['model', 'reasoningEffort', 'modelSource', 'reasoningEffortSource']),
  validExecution(item) {
    if (!item || typeof item !== 'object') return false;
    return [['model', 160], ['reasoningEffort', 80]].every(([key, max]) =>
      (item[key] == null || (typeof item[key] === 'string' && item[key].trim().length > 0 && item[key].length <= max && !/[\u0000-\u001f\u007f]/.test(item[key]))) &&
      (item[key + 'Source'] == null || ['requested', 'runtime', 'unknown'].includes(item[key + 'Source'])) &&
      (!['requested', 'runtime'].includes(item[key + 'Source']) || typeof item[key] === 'string')
    );
  },
  execution(item) {
    const idle = item.status === 'available';
    return [['model', '模型'], ['reasoningEffort', '推理强度']].map(([key, label]) => {
      const source = !idle && ['requested', 'runtime'].includes(item[key + 'Source']) && typeof item[key] === 'string' && item[key].trim() ? item[key + 'Source'] : 'unknown';
      const value = source === 'unknown' ? (idle ? '暂无任务' : '未核实') : item[key];
      const sourceLabel = source === 'requested' ? '申请值' : source === 'runtime' ? '运行值' : '';
      const description = source === 'requested' ? '启动时申请的配置；实际运行值尚未核实' : source === 'runtime' ? '已由运行时信息核实' : idle ? '此工位的快照中没有执行任务' : '没有可核实的配置来源';
      return { key, label, value, source, sourceLabel, description };
    });
  },
  overview(data, now = Date.now(), transportOk = true) {
    const verified = data.slots.filter(slot => this.inspect(slot, now, transportOk).fresh && slot.status !== 'unknown');
    return {
      running: transportOk ? verified.filter(slot => slot.status === 'running').length : null,
      waiting: transportOk ? verified.filter(slot => slot.status === 'waiting').length : null,
      available: transportOk ? verified.filter(slot => slot.status === 'available').length : null,
      pending: transportOk ? data.slots.length - verified.length : data.slots.length
    };
  },
  inspect(slot, now = Date.now(), transportOk = true) {
    const observed = typeof slot.observedAt === 'string' ? Date.parse(slot.observedAt) : NaN;
    const valid = Number.isFinite(observed) && observed <= now;
    const age = valid ? Math.max(0, now - observed) : null;
    const fresh = valid && age <= this.freshFor;
    return {
      age, fresh, valid,
      animate: slot.status === 'running' && fresh && transportOk,
      stale: valid && !fresh,
      label: this.labels[slot.status] || this.labels.unknown,
      ageLabel: !valid ? '观察时间未核实' : age < 60000 ? '刚刚核对' : age < 3600000 ? `${Math.floor(age / 60000)} 分钟前核对` : age < 86400000 ? `${Math.floor(age / 3600000)} 小时前核对` : `${Math.floor(age / 86400000)} 天前核对`
    };
  }
});
