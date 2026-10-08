'use strict';
(() => {
  if (globalThis.SeatSettings) return;
  const key = 'workstation-studio-seats-v1';
  const models = Object.freeze([
    {id:'cloud-headset',label:'蓝色耳机云',shape:'cloud',color:0x45baf3,accessory:'headset',image:1},
    {id:'yellow-alfred',label:'黄色 Alfred',shape:'alfred',color:0xffd52f,accessory:'alfred',image:2},
    {id:'lilac-star',label:'紫色月亮星',shape:'star',color:0xbf92ee,accessory:'moon',image:3},
    {id:'coral-beret',label:'珊瑚贝雷帽',shape:'bean',color:0xff8c78,accessory:'beret',image:4},
    {id:'ivory-scarf',label:'奶白围巾团',shape:'puff',color:0xf6f0df,accessory:'scarf',image:5},
    {id:'rose-heart',label:'玫瑰墨镜心',shape:'heart',color:0xed6aaa,accessory:'sunglasses',image:6},
    {id:'orange-bowtie',label:'橙色领结团',shape:'triangle',color:0xffad4c,accessory:'bowtie',image:7}
  ].map(Object.freeze));
  const listeners = new Set();
  const validNumber = number => Number.isInteger(number) && number >= 1 && number <= 7;
  const model = id => models.find(item => item.id === id);
  const defaultValue = number => ({number,name:'',modelId:models[number-1].id});
  const cleanName = value => Array.from(String(value).normalize('NFC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim()).slice(0,24).join('');
  function parse(raw) {
    const defaults = Array.from({length:7},(_,i)=>defaultValue(i+1));
    if(typeof raw!=='string'||raw.length>16384)return defaults;
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.seats) || data.seats.length > 7) return defaults;
      const seen = new Set(), parsed = [];
      for (const seat of data.seats) {
        if (!seat || !validNumber(seat.number) || seen.has(seat.number) || typeof seat.name !== 'string' || !model(seat.modelId)) return defaults;
        seen.add(seat.number); parsed.push({number:seat.number,name:cleanName(seat.name),modelId:seat.modelId});
      }
      for(const seat of parsed)defaults[seat.number-1]=seat;
    } catch { /* Corrupt or unavailable local preferences fall back safely. */ }
    return defaults;
  }
  const load = () => { try { return parse(globalThis.localStorage?.getItem(key)); } catch { return parse(null); } };
  let seats = load();
  const notify = () => { for (const listener of listeners) listener(); };
  const get = number => { if (!validNumber(number)) throw Error('Invalid seat'); return {...seats[number-1]}; };
  function save(number,value) {
    if (!validNumber(number) || !value || typeof value.name !== 'string' || !model(value.modelId)) throw Error('请选择有效的工位与形象');
    const next = seats.map(seat=>({...seat}));next[number-1]={number,name:cleanName(value.name),modelId:value.modelId};
    let persisted = false;
    try { if (globalThis.localStorage) { globalThis.localStorage.setItem(key,JSON.stringify({version:1,seats:next})); persisted = true; } } catch { /* Apply for this page and report the storage limitation. */ }
    seats = next; notify();return {persisted,value:get(number)};
  }
  globalThis.SeatSettings = Object.freeze({key,models,model,get,cleanName,save,reset:number=>save(number,defaultValue(number)),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},reload(){seats=load();notify();}});
  globalThis.addEventListener?.('storage',event=>{if(event.key===key||event.key===null)globalThis.SeatSettings.reload();});
})();
