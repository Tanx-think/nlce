const { WebSocket } = require('ws');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
let CONFIG;
try {
  let raw = fs.readFileSync(CONFIG_PATH, 'utf-8').trim();
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  CONFIG = JSON.parse(raw);
} catch (e) { console.error('❌ 无法加载 config.json'); process.exit(1); }

const client = new OpenAI({
  apiKey: CONFIG.apiKey,
  baseURL: CONFIG.baseURL,
  timeout: 5 * 60 * 1000,
  maxRetries: 2,
});

// ============================================================
// 模块 1：本地极速字典
// ============================================================
const LOCAL_DICT = {
  'C20199592': { lcsc: 'C20199592', pins: 100 },
  'C132324': { lcsc: 'C20199592', pins: 100 },
  '10K': { lcsc: 'C99198', pins: 2 }, '5.1K': { lcsc: 'C23186', pins: 2 },
  '1K': { lcsc: 'C11702', pins: 2 }, '4.7K': { lcsc: 'C25900', pins: 2 },
  '120R': { lcsc: 'C12076', pins: 2 }, '30K': { lcsc: 'C13862', pins: 2 },
  '100K': { lcsc: 'C25803', pins: 2 }, '510R': { lcsc: 'C12702', pins: 2 },
  '1M': { lcsc: 'C22935', pins: 2 },
  '100NF': { lcsc: 'C469550', pins: 2 }, '10UF': { lcsc: 'C469541', pins: 2 },
  '22UF': { lcsc: 'C778721', pins: 2 }, '1UF': { lcsc: 'C15849', pins: 2 },
  '4.7UF': { lcsc: 'C23733', pins: 2 }, '22PF': { lcsc: 'C107040', pins: 2 },
  '20PF': { lcsc: 'C105618', pins: 2 }, '30PF': { lcsc: 'C107040', pins: 2 },
  '100UF': { lcsc: 'C118969', pins: 2 },
  '8MHZ': { lcsc: 'C115962', pins: 2 }, '32.768KHZ': { lcsc: 'C32346', pins: 2 },
  '12MHZ': { lcsc: 'C403945', pins: 2 }, '25MHZ': { lcsc: 'C20625731', pins: 2 },
  'S8050': { lcsc: 'C2146', pins: 3 }, 'S8550': { lcsc: 'C2147', pins: 3 },
  'CH340C': { lcsc: 'C84681', pins: 16 },
  'AMS1117': { lcsc: 'C6186', pins: 4 },
  'TYPE-C': { lcsc: 'C165948', pins: -1 }, 'SD': { lcsc: 'C91145', pins: 13 },
  'OLED': { lcsc: 'C5248080', pins: 4 }, 'WS2812': { lcsc: 'C114586', pins: 4 },
  'BUZZER': { lcsc: 'C32113', pins: 2 },
  'KEY': { lcsc: 'C49234124', pins: 2 },
  'C11704': { lcsc: 'C11702', pins: 2 },
};

const TYPEC_PIN_MAP = {
  'A1': 'A1B12', 'A12': 'A1B12', 'A1B12': 'A1B12',
  'B1': 'B1A12', 'B12': 'B1A12', 'B1A12': 'B1A12',
  'A4': 'A4B9', 'A9': 'A4B9', 'A4B9': 'A4B9',
  'B4': 'B4A9', 'B9': 'B4A9', 'B4A9': 'B4A9',
  'A5': 'A5', 'B5': 'B5', 'A6': 'A6', 'B6': 'B6',
  'A7': 'A7', 'B7': 'B7', 'A8': 'A8', 'B8': 'B8'
};

function getLocalCompByLcsc(lcsc) {
  const u = (lcsc || '').toUpperCase().trim();
  if (LOCAL_DICT[u]) return LOCAL_DICT[u];
  return null;
}

function getLocalCompByName(name) {
  const u = (name || '').toUpperCase().replace(/\s+/g, '');
  if (!u) return null;
  if (/按键|开关|SWITCH|BUTTON|KEY|TACT/.test(u)) return LOCAL_DICT['KEY'];
  if (/CH340/.test(u)) return LOCAL_DICT['CH340C'];
  if (/AMS1117/.test(u)) return LOCAL_DICT['AMS1117'];
  if (/晶振|CRYSTAL|MHZ|KHZ/.test(u)) {
    if (u.includes('32.768')) return LOCAL_DICT['32.768KHZ'];
    if (u.includes('25M')) return LOCAL_DICT['25MHZ'];
    if (u.includes('12M')) return LOCAL_DICT['12MHZ'];
    return LOCAL_DICT['8MHZ'];
  }
  if (/TYPE-?C|TYPEC|USB/.test(u)) return LOCAL_DICT['TYPE-C'];
  if (/MICRO.?SD|TF|SD.?CARD/.test(u)) return LOCAL_DICT['SD'];
  if (/OLED/.test(u)) return LOCAL_DICT['OLED'];
  if (/WS2812|RGB/.test(u)) return LOCAL_DICT['WS2812'];
  if (/蜂鸣器|BUZZER|BELL/.test(u)) return LOCAL_DICT['BUZZER'];
  if (/S8050|三极管|TRANSISTOR/.test(u)) return LOCAL_DICT['S8050'];
  if (/电阻|\dRES|OHM|Ω/.test(u)) {
    if (u.includes('5.1K')) return LOCAL_DICT['5.1K'];
    if (u.includes('4.7K')) return LOCAL_DICT['4.7K'];
    if (u.includes('100K')) return LOCAL_DICT['100K'];
    if (u.includes('30K')) return LOCAL_DICT['30K'];
    if (u.includes('120')) return LOCAL_DICT['120R'];
    if (u.includes('1K')) return LOCAL_DICT['1K'];
    if (u.includes('510')) return LOCAL_DICT['510R'];
    if (u.includes('1M')) return LOCAL_DICT['1M'];
    return LOCAL_DICT['10K'];
  }
  if (/电容|CAP/.test(u)) {
    if (u.includes('100UF')) return LOCAL_DICT['100UF'];
    if (u.includes('22UF')) return LOCAL_DICT['22UF'];
    if (u.includes('10UF')) return LOCAL_DICT['10UF'];
    if (u.includes('4.7UF')) return LOCAL_DICT['4.7UF'];
    if (u.includes('1UF')) return LOCAL_DICT['1UF'];
    if (u.includes('100NF') || u.includes('0.1UF')) return LOCAL_DICT['100NF'];
    if (u.includes('22PF')) return LOCAL_DICT['22PF'];
    if (u.includes('20PF')) return LOCAL_DICT['20PF'];
    if (u.includes('30PF')) return LOCAL_DICT['30PF'];
    return LOCAL_DICT['100NF'];
  }
  return null;
}

function resolveComponent(comp) {
  const refUpper = (comp.ref || '').toUpperCase();
  const nameUpper = (comp.name || '').toUpperCase();
  const lcscUpper = (comp.lcsc || '').toUpperCase();
  if (/^SW\d*$/.test(refUpper)) {
    const isSwitchName = /按键|开关|SWITCH|BUTTON|KEY|TACT/.test(nameUpper);
    const isSwitchLcsc = lcscUpper === 'C49234124';
    if (!isSwitchName && !isSwitchLcsc) {
      return { lcsc: 'C49234124', name: '按键',
        warning: `SW ref 但 name="${comp.name}", lcsc="${comp.lcsc}" 不是按键，强制纠正为 C49234124` };
    }
    return { lcsc: 'C49234124', name: comp.name };
  }
  const byLcsc = getLocalCompByLcsc(comp.lcsc);
  if (byLcsc) return byLcsc;
  if (/^R\d*$/.test(refUpper)) {
    const u = nameUpper.replace(/\s+/g, '');
    if (u.includes('5.1K') || u.includes('5K1')) return LOCAL_DICT['5.1K'];
    if (u.includes('4.7K') || u.includes('4K7')) return LOCAL_DICT['4.7K'];
    if (u.includes('100K')) return LOCAL_DICT['100K'];
    if (u.includes('30K')) return LOCAL_DICT['30K'];
    if (u.includes('120')) return LOCAL_DICT['120R'];
    if (u.includes('510')) return LOCAL_DICT['510R'];
    if (u.includes('1M')) return LOCAL_DICT['1M'];
    if (u.includes('1K')) return LOCAL_DICT['1K'];
    return LOCAL_DICT['10K'];
  }
  if (/^C\d*$/.test(refUpper)) {
    const u = nameUpper.replace(/\s+/g, '');
    if (u.includes('100UF')) return LOCAL_DICT['100UF'];
    if (u.includes('22UF')) return LOCAL_DICT['22UF'];
    if (u.includes('10UF')) return LOCAL_DICT['10UF'];
    if (u.includes('4.7UF')) return LOCAL_DICT['4.7UF'];
    if (u.includes('1UF')) return LOCAL_DICT['1UF'];
    if (u.includes('100NF') || u.includes('0.1UF')) return LOCAL_DICT['100NF'];
    if (u.includes('22PF')) return LOCAL_DICT['22PF'];
    if (u.includes('20PF')) return LOCAL_DICT['20PF'];
    if (u.includes('30PF')) return LOCAL_DICT['30PF'];
    return LOCAL_DICT['100NF'];
  }
  return getLocalCompByName(nameUpper);
}

function getLocalPins(lcsc) {
  const u = (lcsc || '').toUpperCase();
  if (u === 'C20199592' || u === 'C132324' || u.includes('F407')) {
    const pinList = [];
    for (let i = 1; i <= 100; i++) {
      let name = 'IO' + i;
      if ([10, 19, 27, 49, 74, 99].includes(i)) name = 'VSS_' + i;
      if ([11, 22, 28, 50, 75, 100].includes(i)) name = 'VDD_' + i;
      if (i === 14) name = 'NRST';
      if (i === 94) name = 'BOOT0';
      if (i === 12) name = 'OSC_IN';
      if (i === 13) name = 'OSC_OUT';
      if (i === 68) name = 'PA9';
      if (i === 69) name = 'PA10';
      pinList.push({ pinNumber: String(i), pinName: name });
    }
    return pinList;
  }
  if (u === 'C84681') return [
    { pinNumber: '1', pinName: 'GND' }, { pinNumber: '2', pinName: 'TXD' },
    { pinNumber: '3', pinName: 'RXD' }, { pinNumber: '4', pinName: 'V3' },
    { pinNumber: '5', pinName: 'D+' }, { pinNumber: '6', pinName: 'D-' },
    { pinNumber: '7', pinName: 'NC.' }, { pinNumber: '8', pinName: 'OUT#' },
    { pinNumber: '9', pinName: 'CTS#' }, { pinNumber: '10', pinName: 'DSR#' },
    { pinNumber: '11', pinName: 'RI#' }, { pinNumber: '12', pinName: 'DCD#' },
    { pinNumber: '13', pinName: 'DTR#' }, { pinNumber: '14', pinName: 'RTS#' },
    { pinNumber: '15', pinName: 'R232' }, { pinNumber: '16', pinName: 'VCC' }
  ];
  if (u === 'C6186') return [
    { pinNumber: '1', pinName: 'GND' }, { pinNumber: '2', pinName: 'VOUT' },
    { pinNumber: '3', pinName: 'VIN' }, { pinNumber: '4', pinName: 'VOUT' }
  ];
  if (u === 'C165948') return [
    { pinNumber: 'A1B12', pinName: 'GND' }, { pinNumber: 'A4B9', pinName: 'VBUS' },
    { pinNumber: 'A5', pinName: 'CC1' }, { pinNumber: 'A6', pinName: 'DP1' },
    { pinNumber: 'A7', pinName: 'DN1' }, { pinNumber: 'A8', pinName: 'SBU1' },
    { pinNumber: 'B5', pinName: 'CC2' }, { pinNumber: 'B6', pinName: 'DP2' },
    { pinNumber: 'B7', pinName: 'DN2' }, { pinNumber: 'B8', pinName: 'SBU2' },
    { pinNumber: 'B1A12', pinName: 'GND' }, { pinNumber: 'B4A9', pinName: 'VBUS' },
    { pinNumber: '1', pinName: 'EH' }, { pinNumber: '2', pinName: 'EH' },
    { pinNumber: '3', pinName: 'EH' }, { pinNumber: '4', pinName: 'EH' }
  ];
  if (u === 'C91145') return [
    { pinNumber: '1', pinName: 'DAT2' }, { pinNumber: '2', pinName: 'CD/DAT3' },
    { pinNumber: '3', pinName: 'CMD' }, { pinNumber: '4', pinName: 'VDD' },
    { pinNumber: '5', pinName: 'CLK' }, { pinNumber: '6', pinName: 'VSS' },
    { pinNumber: '7', pinName: 'DAT0' }, { pinNumber: '8', pinName: 'DAT1' },
    { pinNumber: '9', pinName: 'CD' }, { pinNumber: '10', pinName: 'GND' },
    { pinNumber: '11', pinName: 'GND' }, { pinNumber: '12', pinName: 'GND' },
    { pinNumber: '13', pinName: 'GND' }
  ];
  if (u === 'C5248080') return [
    { pinNumber: '1', pinName: 'GND' }, { pinNumber: '2', pinName: 'VCC' },
    { pinNumber: '3', pinName: 'SCL' }, { pinNumber: '4', pinName: 'SDA' }
  ];
  if (u === 'C114586') return [
    { pinNumber: '1', pinName: 'VDD' }, { pinNumber: '2', pinName: 'DOUT' },
    { pinNumber: '3', pinName: 'VSS' }, { pinNumber: '4', pinName: 'DIN' }
  ];
  if (['C99198','C23186','C11702','C25900','C12076','C13862','C25803','C12702','C22935',
       'C469550','C469541','C778721','C15849','C23733','C107040','C105618','C118969',
       'C115962','C32346','C403945','C20625731','C32113'].includes(u)) return [
    { pinNumber: '1', pinName: '1' }, { pinNumber: '2', pinName: '2' }
  ];
  if (u === 'C2146' || u === 'C2147') return [
    { pinNumber: '1', pinName: 'B' }, { pinNumber: '2', pinName: 'E' }, { pinNumber: '3', pinName: 'C' }
  ];
  if (u === 'C49234124') return [
    { pinNumber: '1', pinName: '1' }, { pinNumber: '2', pinName: '2' }
  ];
  return null;
}

// ============================================================
// 模块 2：WebSocket
// ============================================================
const wss = new WebSocket.Server({ port: 49620, host: '127.0.0.1' });
let edaSocket = null;
const pendingRequests = new Map();
let reqCounter = 0;

function sendToEDA(type, payload) {
  return new Promise((resolve) => {
    if (!edaSocket || edaSocket.readyState !== WebSocket.OPEN) return resolve(null);
    const requestId = `req_${++reqCounter}_${Date.now()}`;
    pendingRequests.set(requestId, resolve);
    edaSocket.send(JSON.stringify({ type, requestId, ...payload }));
    setTimeout(() => { if (pendingRequests.has(requestId)) { pendingRequests.delete(requestId); resolve(null); } }, 15000);
  });
}

async function findBestMatch(comp, results) {
  const name = ((comp.name || '') + ' ' + (comp.lcsc || '')).toUpperCase();
  let minPins = 0, maxPins = Infinity;
  if (name.includes('F407')) { minPins = 99; maxPins = 101; }
  else if (name.includes('F103')) { minPins = 47; maxPins = 49; }
  else if (name.includes('CH340')) { minPins = 15; maxPins = 17; }
  else if (name.includes('ESP32')) { minPins = 38; maxPins = 41; }
  else if (name.includes('MAX485') || name.includes('TJA1050')) { minPins = 8; maxPins = 8; }
  else if (name.includes('MP1584')) { minPins = 9; maxPins = 9; }
  else if (name.includes('AMS1117')) { minPins = 3; maxPins = 4; }
  else if (name.includes('WS2812')) { minPins = 4; maxPins = 4; }
  else if (name.includes('SD') || name.includes('TF')) { minPins = 9; maxPins = 13; }
  else if (name.includes('OLED')) { minPins = 4; maxPins = 4; }

  // 被动元件：只接受精确 lcsc 匹配，找不到返回 null，不改成 results[0]
  if (minPins === 0 && maxPins === Infinity) {
    const exact = results.find(x => x.lcsc === comp.lcsc);
    if (exact) return exact;
    const refPrefix = (comp.ref || '').toUpperCase().charAt(0);
    if ('CRLDSWJ'.includes(refPrefix)) return null;
    return results[0];
  }

  const wantS3 = name.includes('S3');
  const target = (minPins + maxPins) / 2;
  let best = null, bestScore = -Infinity;
  for (const r of results) {
    const pins = await sendToEDA('get-pins-request', { uuid: r.uuid });
    if (!pins || pins.length === 0) continue;
    if (pins.length < minPins || pins.length > maxPins) continue;
    if (wantS3) {
      const rn = ((r.name || '') + ' ' + (r.description || '') + ' ' + (r.lcsc || '')).toUpperCase();
      if (!rn.includes('S3') && !rn.includes('ESP32S3')) continue;
    }
    const score = -Math.abs(pins.length - target);
    if (score > bestScore) {
      best = { ...r, pinCount: pins.length, pins };
      bestScore = score;
      if (Math.abs(pins.length - target) === 0) break;
    }
  }
  return best;
}

function correctPin(pinId, pins, isTypeC) {
  let foundPin = pins.find(pinItem => String(pinItem.pinNumber) === pinId);
  if (foundPin) return String(foundPin.pinNumber);
  foundPin = pins.find(pinItem => (pinItem.pinName || '').toUpperCase() === pinId.toUpperCase());
  if (foundPin) return String(foundPin.pinNumber);
  if (isTypeC) {
    const mapped = TYPEC_PIN_MAP[pinId.toUpperCase()];
    if (mapped) {
      foundPin = pins.find(pinItem => String(pinItem.pinNumber) === mapped);
      if (foundPin) return String(foundPin.pinNumber);
    }
  }
  return null;
}

// ============================================================
// 模块 5：强制拓扑修复（v3.5 增加 EN/IO0 完全重建）
// ============================================================
function normalizePinNameForMatch(name) {
  return (name || '').toUpperCase().replace(/[^A-Z0-9#+\-]/g, '');
}

function findPinByCandidates(pins, candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  const normCands = list.map(c => normalizePinNameForMatch(c)).filter(Boolean);
  for (const cand of normCands) {
    const exact = pins.find(p => normalizePinNameForMatch(p.pinName) === cand);
    if (exact) return exact;
  }
  for (const cand of normCands) {
    if (cand.length < 2) continue;
    const inc = pins.find(p => normalizePinNameForMatch(p.pinName).includes(cand));
    if (inc) return inc;
  }
  for (const cand of list) {
    const c = (cand || '').toUpperCase();
    if (c.length !== 1) continue;
    const exact = pins.find(p => (p.pinName || '').toUpperCase() === c);
    if (exact) return exact;
  }
  return null;
}

function forceCriticalTopology(circuit, uuidToPins, lcscToUuid, boardType) {
  const fixLogs = [];
  const nets = circuit.nets;
  const comps = circuit.components;

  function log(msg) { fixLogs.push(msg); console.log(msg); }

  function getCompPins(comp) {
    if (!comp) return [];
    const uuid = lcscToUuid.get(comp.lcsc) || comp.lcsc;
    return uuidToPins.get(uuid) || getLocalPins(comp.lcsc) || [];
  }

  function getPin(comp, candidates) {
    if (!comp) return null;
    const p = findPinByCandidates(getCompPins(comp), candidates);
    return p ? String(p.pinNumber) : null;
  }

  function removeFromNet(ref, pin) {
    if (!pin) return;
    const item = `${ref}.${pin}`;
    for (const n of Object.keys(nets)) nets[n] = nets[n].filter(x => x !== item);
  }

  function add(net, ref, pin) {
    if (!pin) return;
    const item = `${ref}.${pin}`;
    if (!nets[net]) nets[net] = [];
    if (!nets[net].includes(item)) nets[net].push(item);
    for (const n of Object.keys(nets)) {
      if (n !== net) nets[n] = nets[n].filter(x => x !== item);
    }
  }

  // ============================================================
  // ESP32 双 NPN 自动下载（仅 dev 模式）
  // ============================================================
  const esp32 = comps.find(c => (c.name || '').toUpperCase().includes('ESP32'));
  const ch340 = comps.find(c => c.lcsc === 'C84681' || (c.name || '').toUpperCase().includes('CH340'));
  let dualNpnFixed = false;

  if (boardType === 'dev' && esp32 && ch340) {
    const s8050s = comps.filter(c => (c.name || '').toUpperCase().includes('S8050'));
    const q1 = s8050s[0];
    const q2 = s8050s[1];
    if (q1 && q2) {
      const dtr = getPin(ch340, ['DTR#', 'DTR', 'DTR_N']);
      const rts = getPin(ch340, ['RTS#', 'RTS', 'RTS_N']);
      const en = getPin(esp32, ['EN', 'CHIP_PU', 'ENABLE']);
      const io0 = getPin(esp32, ['IO0', 'GPIO0', 'BOOT']);
      const q1b = getPin(q1, ['B', 'BASE']);
      const q1c = getPin(q1, ['C', 'COLLECTOR']);
      const q1e = getPin(q1, ['E', 'EMITTER']);
      const q2b = getPin(q2, ['B', 'BASE']);
      const q2c = getPin(q2, ['C', 'COLLECTOR']);
      const q2e = getPin(q2, ['E', 'EMITTER']);

      log(`🔧 双 NPN 引脚定位: DTR=${dtr}, RTS=${rts}, EN=${en}, IO0=${io0}`);
      log(`🔧 Q1(${q1.ref}): B=${q1b}, C=${q1c}, E=${q1e}`);
      log(`🔧 Q2(${q2.ref}): B=${q2b}, C=${q2c}, E=${q2e}`);

      const missing = [];
      if (!dtr) missing.push('CH340.DTR');
      if (!rts) missing.push('CH340.RTS');
      if (!en) missing.push('ESP32.EN');
      if (!io0) missing.push('ESP32.IO0');
      if (!q1b || !q1c || !q1e) missing.push(`${q1.ref}.B/C/E`);
      if (!q2b || !q2c || !q2e) missing.push(`${q2.ref}.B/C/E`);

      if (missing.length > 0) {
        log(`⚠️ 双 NPN 强修跳过，缺少引脚: ${missing.join(', ')}`);
      } else {
        removeFromNet(ch340.ref, dtr); removeFromNet(q1.ref, q1b); removeFromNet(q2.ref, q2e);
        add('ESP_DTR', ch340.ref, dtr); add('ESP_DTR', q1.ref, q1b); add('ESP_DTR', q2.ref, q2e);
        removeFromNet(ch340.ref, rts); removeFromNet(q1.ref, q1e); removeFromNet(q2.ref, q2b);
        add('ESP_RTS', ch340.ref, rts); add('ESP_RTS', q1.ref, q1e); add('ESP_RTS', q2.ref, q2b);
        removeFromNet(q1.ref, q1c); removeFromNet(esp32.ref, en);
        add('ESP_EN', q1.ref, q1c); add('ESP_EN', esp32.ref, en);
        removeFromNet(q2.ref, q2c); removeFromNet(esp32.ref, io0);
        add('ESP_IO0', q2.ref, q2c); add('ESP_IO0', esp32.ref, io0);
        dualNpnFixed = true;
        log('🔧 硬修复: ESP32 双 NPN 自动下载电路建立 (DTR/RTS 交叉互锁)');
      }
    } else {
      log(`⚠️ 开发板模式但未找到 2 个 S8050（找到 ${s8050s.length} 个）`);
    }
  }

  // ============================================================
  // ⭐ v3.5 新增：ESP_EN 网络完全重建（dev 模式）
  // ESP_EN = ESP32.EN + Q1.C + R1.1(10K上拉) + C6.1(RC延时) + SW1.1(RESET按钮)
  // R1.2 -> 3V3, C6.2 -> GND, SW1.2 -> GND
  // ============================================================
  if (boardType === 'dev' && esp32) {
    const en = getPin(esp32, ['EN', 'CHIP_PU', 'ENABLE']);
    const q1 = comps.filter(c => (c.name || '').toUpperCase().includes('S8050'))[0];
    const q1c = q1 ? getPin(q1, ['C', 'COLLECTOR']) : null;
    const r1 = comps.find(c => c.ref === 'R1');
    const sw1 = comps.find(c => c.ref === 'SW1');
    const c6 = comps.find(c => c.ref === 'C6');

    if (en) {
      removeFromNet(esp32.ref, en);
      add('ESP_EN', esp32.ref, en);
      if (q1c) { removeFromNet(q1.ref, q1c); add('ESP_EN', q1.ref, q1c); }

      let enMembers = [`${esp32.ref}.${en}`];
      if (q1c) enMembers.push(`${q1.ref}.${q1c}`);

      if (r1) {
        const r1Pins = getCompPins(r1);
        const r1a = r1Pins[0], r1b = r1Pins[1];
        if (r1a && r1b) {
          removeFromNet(r1.ref, String(r1a.pinNumber));
          removeFromNet(r1.ref, String(r1b.pinNumber));
          add('ESP_EN', r1.ref, String(r1a.pinNumber));
          add('3V3', r1.ref, String(r1b.pinNumber));
          enMembers.push(`${r1.ref}.${r1a.pinNumber}`);
          log(`🔧 R1(${r1.ref}) EN上拉: R1.${r1a.pinNumber} -> ESP_EN, R1.${r1b.pinNumber} -> 3V3`);
        }
      } else {
        log(`⚠️ EN 上拉电阻 R1 缺失`);
      }

      if (sw1) {
        const sw1Pins = getCompPins(sw1);
        const sw1a = sw1Pins[0], sw1b = sw1Pins[1];
        if (sw1a && sw1b) {
          removeFromNet(sw1.ref, String(sw1a.pinNumber));
          removeFromNet(sw1.ref, String(sw1b.pinNumber));
          add('ESP_EN', sw1.ref, String(sw1a.pinNumber));
          add('GND', sw1.ref, String(sw1b.pinNumber));
          enMembers.push(`${sw1.ref}.${sw1a.pinNumber}`);
          log(`🔧 SW1(${sw1.ref}) RESET: SW1.${sw1a.pinNumber} -> ESP_EN, SW1.${sw1b.pinNumber} -> GND`);
        }
      }

      if (c6) {
        const c6Pins = getCompPins(c6);
        const c6a = c6Pins[0], c6b = c6Pins[1];
        if (c6a && c6b) {
          removeFromNet(c6.ref, String(c6a.pinNumber));
          removeFromNet(c6.ref, String(c6b.pinNumber));
          add('ESP_EN', c6.ref, String(c6a.pinNumber));
          add('GND', c6.ref, String(c6b.pinNumber));
          enMembers.push(`${c6.ref}.${c6a.pinNumber}`);
          log(`🔧 C6(${c6.ref}) EN RC延时: C6.${c6a.pinNumber} -> ESP_EN, C6.${c6b.pinNumber} -> GND`);
        }
      }

      log(`🔧 ESP_EN 完全重建: ${enMembers.join(' + ')}`);
    }
  }

  // ============================================================
  // ⭐ v3.5 新增：ESP_IO0 网络完全重建
  // ESP_IO0 = ESP32.IO0 + Q2.C + R2.1(10K上拉) + SW2.1(BOOT按钮)
  // R2.2 -> 3V3, SW2.2 -> GND
  // ============================================================
  if (boardType === 'dev' && esp32) {
    const io0 = getPin(esp32, ['IO0', 'GPIO0', 'BOOT']);
    const q2 = comps.filter(c => (c.name || '').toUpperCase().includes('S8050'))[1];
    const q2c = q2 ? getPin(q2, ['C', 'COLLECTOR']) : null;
    const r2 = comps.find(c => c.ref === 'R2');
    const sw2 = comps.find(c => c.ref === 'SW2');

    if (io0) {
      removeFromNet(esp32.ref, io0);
      add('ESP_IO0', esp32.ref, io0);
      if (q2c) { removeFromNet(q2.ref, q2c); add('ESP_IO0', q2.ref, q2c); }

      let io0Members = [`${esp32.ref}.${io0}`];
      if (q2c) io0Members.push(`${q2.ref}.${q2c}`);

      if (r2) {
        const r2Pins = getCompPins(r2);
        const r2a = r2Pins[0], r2b = r2Pins[1];
        if (r2a && r2b) {
          removeFromNet(r2.ref, String(r2a.pinNumber));
          removeFromNet(r2.ref, String(r2b.pinNumber));
          add('ESP_IO0', r2.ref, String(r2a.pinNumber));
          add('3V3', r2.ref, String(r2b.pinNumber));
          io0Members.push(`${r2.ref}.${r2a.pinNumber}`);
          log(`🔧 R2(${r2.ref}) IO0上拉: R2.${r2a.pinNumber} -> ESP_IO0, R2.${r2b.pinNumber} -> 3V3`);
        }
      } else {
        log(`⚠️ IO0 上拉电阻 R2 缺失`);
      }

      if (sw2) {
        const sw2Pins = getCompPins(sw2);
        const sw2a = sw2Pins[0], sw2b = sw2Pins[1];
        if (sw2a && sw2b) {
          removeFromNet(sw2.ref, String(sw2a.pinNumber));
          removeFromNet(sw2.ref, String(sw2b.pinNumber));
          add('ESP_IO0', sw2.ref, String(sw2a.pinNumber));
          add('GND', sw2.ref, String(sw2b.pinNumber));
          io0Members.push(`${sw2.ref}.${sw2a.pinNumber}`);
          log(`🔧 SW2(${sw2.ref}) BOOT: SW2.${sw2a.pinNumber} -> ESP_IO0, SW2.${sw2b.pinNumber} -> GND`);
        }
      }

      log(`🔧 ESP_IO0 完全重建: ${io0Members.join(' + ')}`);
    }
  }

  // ============================================================
  // 降级：只有双 NPN 未建立时才允许 DTR/RTS 直连 EN/IO0
  // ============================================================
  if (!dualNpnFixed && boardType === 'dev') {
    const q1Fallback = comps.find(c => (c.name || '').toUpperCase().includes('S8050'));
    if (esp32 && q1Fallback && ch340) {
      const dtr = getPin(ch340, ['DTR#', 'DTR', 'DTR_N']);
      const rts = getPin(ch340, ['RTS#', 'RTS', 'RTS_N']);
      const en = getPin(esp32, ['EN', 'CHIP_PU', 'ENABLE']);
      const io0 = getPin(esp32, ['IO0', 'GPIO0', 'BOOT']);
      if (dtr && en) { add('DTR_EN', ch340.ref, dtr); add('DTR_EN', esp32.ref, en); }
      if (rts && io0) { add('RTS_IO0', ch340.ref, rts); add('RTS_IO0', esp32.ref, io0); }
      log('🔧 降级修复: ESP32 无完整双 NPN，DTR/RTS 直连 EN/IO0');
    }
  } else if (dualNpnFixed) {
    log('✅ 双 NPN 已建立，跳过 DTR/RTS 直连降级');
  }

  // ============================================================
  // Type-C 强修
  // ============================================================
  const typec = comps.find(c => c.lcsc === 'C165948' || (c.name || '').toUpperCase().includes('TYPE-C'));
  if (typec) {
    const typecPins = getCompPins(typec);
    const vbusPins = typecPins.filter(p => (p.pinName || '').toUpperCase().includes('VBUS'));
    const gndPins = typecPins.filter(p => {
      const n = (p.pinName || '').toUpperCase();
      return n === 'GND' || n === 'VSS';
    });
    for (const v of vbusPins) add('5V', typec.ref, String(v.pinNumber));
    for (const g of gndPins) add('GND', typec.ref, String(g.pinNumber));
    if (vbusPins.length > 0) log(`🔧 Type-C VBUS x${vbusPins.length} -> 5V`);
    if (gndPins.length > 0) log(`🔧 Type-C GND x${gndPins.length} -> GND`);

    const ehPins = typecPins.filter(p => {
      const n = (p.pinName || '').toUpperCase();
      return n === 'EH' || n === 'SHELL' || n === 'SHIELD';
    });
    for (const e of ehPins) add('GND', typec.ref, String(e.pinNumber));
    if (ehPins.length > 0) log(`🔧 Type-C EH x${ehPins.length} -> GND（屏蔽壳接地）`);

    const cc1 = getPin(typec, ['CC1']);
    const cc2 = getPin(typec, ['CC2']);
    for (const [ccName, ccPin] of [['CC1', cc1], ['CC2', cc2]]) {
      if (!ccPin) continue;
      const item = `${typec.ref}.${ccPin}`;
      let ccNet = null;
      for (const n of Object.keys(nets)) {
        if (nets[n].includes(item)) { ccNet = n; break; }
      }
      if (!ccNet) { log(`⚠️ Type-C.${ccName} 悬空，必须接 5.1K 到 GND`); continue; }
      const ccItems = nets[ccNet].filter(x => x !== item && x.startsWith('R'));
      if (ccItems.length === 0) { log(`⚠️ Type-C.${ccName} 未接电阻（网络 ${ccNet}），必须接 5.1K 到 GND`); continue; }
      for (const rItem of ccItems) {
        const rRef = rItem.split('.')[0];
        const rComp = comps.find(c => c.ref === rRef);
        if (rComp && rComp.lcsc !== 'C23186') {
          log(`⚠️ Type-C.${ccName} 串的 ${rRef}(${rComp.lcsc}) 不是 5.1K，请手动改为 C23186`);
        }
      }
    }
  }

  // ============================================================
  // CH340 强修：V3、D+/D-
  // ============================================================
  if (ch340) {
    const v3 = getPin(ch340, ['V3']);
    if (v3) {
      const v3Item = `${ch340.ref}.${v3}`;
      let v3Net = null;
      for (const n of Object.keys(nets)) if (nets[n].includes(v3Item)) { v3Net = n; break; }
      if (!v3Net) { log(`⚠️ CH340C V3 悬空，必须接 100nF 到 GND（C469550）`); }
      else {
        const hasCap = nets[v3Net].some(x => x.startsWith('C'));
        if (!hasCap) log(`⚠️ CH340C V3 网络 ${v3Net} 没有电容，必须接 100nF 到 GND`);
      }
    }
    if (typec) {
      const chDp = getPin(ch340, ['D+', 'DP', 'UD+']);
      const chDm = getPin(ch340, ['D-', 'DN', 'UD-']);
      const typecDp1 = getPin(typec, ['DP1']);
      const typecDp2 = getPin(typec, ['DP2']);
      const typecDn1 = getPin(typec, ['DN1']);
      const typecDn2 = getPin(typec, ['DN2']);
      if (chDp && (typecDp1 || typecDp2)) {
        removeFromNet(ch340.ref, chDp);
        add('USB_DP', ch340.ref, chDp);
        if (typecDp1) { removeFromNet(typec.ref, typecDp1); add('USB_DP', typec.ref, typecDp1); }
        if (typecDp2) { removeFromNet(typec.ref, typecDp2); add('USB_DP', typec.ref, typecDp2); }
        log(`🔧 USB D+: CH340.${chDp} + Type-C DP1/DP2`);
      }
      if (chDm && (typecDn1 || typecDn2)) {
        removeFromNet(ch340.ref, chDm);
        add('USB_DN', ch340.ref, chDm);
        if (typecDn1) { removeFromNet(typec.ref, typecDn1); add('USB_DN', typec.ref, typecDn1); }
        if (typecDn2) { removeFromNet(typec.ref, typecDn2); add('USB_DN', typec.ref, typecDn2); }
        log(`🔧 USB D-: CH340.${chDm} + Type-C DN1/DN2`);
      }
    }
  }

  // ============================================================
  // MCU <-> CH340 UART
  // ============================================================
  const mcu = comps.find(c => (c.name || '').toUpperCase().match(/STM32|ESP32|GD32/));
  if (mcu && ch340) {
    const isEsp32 = (mcu.name || '').toUpperCase().includes('ESP32');
    const mcuRxCands = isEsp32 ? ['RXD0', 'U0RXD'] : ['PA10', 'RXD0', 'RX', 'RXD'];
    const mcuTxCands = isEsp32 ? ['TXD0', 'U0TXD'] : ['PA9', 'TXD0', 'TX', 'TXD'];
    const chTx = getPin(ch340, ['TXD', 'TX', 'TXD0']);
    const chRx = getPin(ch340, ['RXD', 'RX', 'RXD0']);
    const mcuRx = getPin(mcu, mcuRxCands);
    const mcuTx = getPin(mcu, mcuTxCands);
    if (chTx && mcuRx) {
      removeFromNet(ch340.ref, chTx); removeFromNet(mcu.ref, mcuRx);
      add('UART_RX', ch340.ref, chTx); add('UART_RX', mcu.ref, mcuRx);
      log(`🔧 CH340.TXD -> MCU.RX (${ch340.ref}.${chTx} <-> ${mcu.ref}.${mcuRx})`);
    } else {
      log(`⚠️ CH340.TXD 或 MCU.RX 找不到: chTx=${chTx}, mcuRx=${mcuRx}`);
    }
    if (chRx && mcuTx) {
      removeFromNet(ch340.ref, chRx); removeFromNet(mcu.ref, mcuTx);
      add('UART_TX', ch340.ref, chRx); add('UART_TX', mcu.ref, mcuTx);
      log(`🔧 CH340.RXD -> MCU.TX (${ch340.ref}.${chRx} <-> ${mcu.ref}.${mcuTx})`);
    } else {
      log(`⚠️ CH340.RXD 或 MCU.TX 找不到: chRx=${chRx}, mcuTx=${mcuTx}`);
    }
  }

  // ============================================================
  // ⭐ v3.5：OLED I2C 网络名改为 GPIO9/GPIO8（共享排针）
  // ============================================================
  if (boardType === 'dev' && esp32) {
    const oled = comps.find(c => c.lcsc === 'C5248080' || (c.name || '').toUpperCase().includes('OLED'));
    if (oled) {
      const oledScl = getPin(oled, ['SCL', 'SCK']);
      const oledSda = getPin(oled, ['SDA']);
      const oledVcc = getPin(oled, ['VCC', 'VDD']);
      const oledGnd = getPin(oled, ['GND', 'VSS']);
      // OLED_I2C_ADAPTER
      // S3：SCL=IO9, SDA=IO8；WROOM-32：SCL=IO22, SDA=IO21
      let espScl = getPin(esp32, ['IO9', 'GPIO9']);
      if (!espScl) espScl = getPin(esp32, ['IO22', 'GPIO22']);
      let espSda = getPin(esp32, ['IO8', 'GPIO8']);
      if (!espSda) espSda = getPin(esp32, ['IO21', 'GPIO21']);
      if (oledScl && espScl) {
        removeFromNet(oled.ref, oledScl);
        removeFromNet(esp32.ref, espScl);
        const sclNet = (espScl === getPin(esp32, ['IO9', 'GPIO9'])) ? 'GPIO9' : 'GPIO22';
        add(sclNet, oled.ref, oledScl);
        add(sclNet, esp32.ref, espScl);
        // LOG_FIX_V38
        log(`🔧 OLED.SCL -> ${esp32.ref}.${espScl} (net=${sclNet})`);
      } else {
        log(`⚠️ OLED.SCL 或 ESP32.IO9 找不到: oledScl=${oledScl}, espScl=${espScl}`);
      }
      if (oledSda && espSda) {
        removeFromNet(oled.ref, oledSda);
        removeFromNet(esp32.ref, espSda);
        const sdaNet = (espSda === getPin(esp32, ['IO8', 'GPIO8'])) ? 'GPIO8' : 'GPIO21';
        add(sdaNet, oled.ref, oledSda);
        add(sdaNet, esp32.ref, espSda);
        log(`🔧 OLED.SDA -> ${esp32.ref}.${espSda} (net=${sdaNet})`);
      } else {
        log(`⚠️ OLED.SDA 或 ESP32.IO8 找不到: oledSda=${oledSda}, espSda=${espSda}`);
      }
      if (oledVcc) { removeFromNet(oled.ref, oledVcc); add('3V3', oled.ref, oledVcc); log(`🔧 OLED.VCC -> 3V3`); }
      if (oledGnd) { removeFromNet(oled.ref, oledGnd); add('GND', oled.ref, oledGnd); log(`🔧 OLED.GND -> GND`); }
    }
  }

  // ============================================================
  // MCU VDD/VSS
  // ============================================================
  if (mcu) {
    const pins = getCompPins(mcu);
    for (const pinItem of pins) {
      const n = (pinItem.pinName || '').toUpperCase();
      if (n.startsWith('VDD') || n === '3V3' || n === 'VCC') add('3V3', mcu.ref, pinItem.pinNumber);
      if (n.startsWith('VSS') || n === 'GND' || n === 'EPAD') add('GND', mcu.ref, pinItem.pinNumber);
    }
    log(`🔧 MCU ${mcu.ref} VDD/VSS 挂载完成`);
  }

  // ============================================================
  // 单点清理白名单
  // ============================================================
  const TEMP_NET_PATTERNS = [
    /^Net_/i, /^DTR_Q[12]$/i, /^RTS_Q[12]$/i, /^EN_NET$/i, /^IO0_NET$/i,
    /^DTR_EN$/i, /^RTS_IO0$/i, /^DTR_to_Q\d_B$/i, /^RTS_to_Q\d_B$/i,
    /^Q[12]_[BCE]$/i, /^DTR#$/i, /^RTS#$/i, /^R1_Q1$/i, /^R2_Q2$/i,
  ];
  function isTempNet(netName) { return TEMP_NET_PATTERNS.some(p => p.test(netName)); }

  const singlePinTempNets = [];
  const singlePinKeptNets = [];
  for (const netName of Object.keys(nets)) {
    const items = nets[netName];
    if (!Array.isArray(items)) continue;
    if (items.length === 0) { delete nets[netName]; continue; }
    if (items.length === 1) {
      if (isTempNet(netName)) singlePinTempNets.push(netName);
      else singlePinKeptNets.push(netName);
    }
  }
  for (const netName of singlePinTempNets) {
    const pin = nets[netName][0];
    if (!circuit.unused) circuit.unused = [];
    if (!circuit.unused.includes(pin)) circuit.unused.push(pin);
    delete nets[netName];
  }
  if (singlePinTempNets.length > 0) log(`🔧 清理临时单点网络 ${singlePinTempNets.length} 个: ${singlePinTempNets.join(', ')}`);
  if (singlePinKeptNets.length > 0) {
    const keepInfo = singlePinKeptNets.map(n => `${n}(仅 ${nets[n][0]})`).join(', ');
    log(`⚠️ 以下信号网络只连了 1 个引脚，已保留，请在 EDA 里手动补线: ${keepInfo}`);
  }

  return fixLogs;
}

// ============================================================
// 模块 6：布局
// ============================================================
function layout(circuit) {
  const comps = circuit.components;
  const mcu = comps.find(c => /^U\d+/.test(c.ref) && (c.name || '').toUpperCase().match(/STM32|ESP32/));
  if (mcu) { mcu.x = 800; mcu.y = 600; }
  const caps = comps.filter(c => /^C\d+/.test(c.ref));
  caps.forEach((c, i) => { c.x = 1100 + (i % 2) * 100; c.y = 400 + Math.floor(i / 2) * 100; });
  const resistors = comps.filter(c => /^R\d+/.test(c.ref));
  resistors.forEach((c, i) => { c.x = 300 + (i % 5) * 150; c.y = 1400 + Math.floor(i / 5) * 150; });
  const conns = comps.filter(c => /^J\d+/.test(c.ref));
  conns.forEach((c, i) => { c.x = 50; c.y = 200 + i * 300; });
  const others = comps.filter(c => c.ref !== (mcu?.ref) && !/^C\d+/.test(c.ref) && !/^R\d+/.test(c.ref) && !/^J\d+/.test(c.ref));
  others.forEach((c, i) => { c.x = 300 + (i % 4) * 200; c.y = 200 + Math.floor(i / 4) * 200; });
}

// ============================================================
// 模块 7：Prompt 分流
// ============================================================
function detectBoardType(userMessage) {
  const msg = userMessage || '';
  const devHints = ['开发板', 'OLED', 'CH340', '串口下载', 'USB转串口', '屏幕', '显示', 'arduino'];
  const coreHints = ['核心板'];
  const devScore = devHints.filter(h => msg.toLowerCase().includes(h.toLowerCase())).length;
  const coreScore = coreHints.filter(h => msg.includes(h)).length;
  if (coreScore > 0 && devScore === 0) return 'core';
  return 'dev';
}

function buildPlanPrompt(boardType) {
  const base = [
    '你是电路设计助手，严格按用户需求输出元件。',
    '输出必须直接以 <<<PLAN>>> 开头，只输出 JSON，不要代码块。',
    '【关键】不要输出 x 和 y 坐标，只输出 ref, lcsc, name。',
    '<<<PLAN>>>',
    '{ "components": [ { "ref": "U1", "lcsc": "C8734", "name": "STM32F103" } ], "groups": [ { "id": "all", "name": "全部", "comps": ["U1"] } ] }',
    '【已确认编号】',
    '- STM32F103C8T6: C8734',
    '- STM32F407VET6: C20199592',
    '- CH340C: C84681',
    '- MP1584EN: C454188',
    '- AMS1117-3.3: C6186',
    '- Type-C 16P: C165948',
    '- ESP32-WROOM-32: C701342',
    '- ESP32-S3-WROOM-1: 请传名称搜索，不要编 lcsc',
    '- OLED SSD1306 I2C 4P: C5248080',
    '- S8050: C2146',
    '- 10K: C99198 / 5.1K: C23186 / 100nF: C469550 / 10uF: C469541',
    '【其他芯片请直接传名称即可，我会查本地库】',
  ];

  const devPrompt = [
    '**🚨 当前模式：ESP32 开发板（CH340 串口下载 + OLED）**',
    '',
    '**必须生成的元件清单（缺任何一个都不行）：**',
    '1. U1: ESP32-S3-WROOM-1 模组（N16R8 或用户指定）',
    '2. U2: AMS1117-3.3（C6186）',
    '3. U3: CH340C（C84681）',
    '4. J1: Type-C 16P（C165948）',
    '5. Q1, Q2: S8050（C2146）×2（自动下载电路）',
    '6. **R1: 10K（C99198）——固定是 ESP32 EN 上拉到 3V3**',
    '7. **R2: 10K（C99198）——固定是 ESP32 IO0 上拉到 3V3**',
    '8. R3, R4: 5.1K（C23186）×2，Type-C CC1/CC2 下拉到 GND',
    '9. **SW1: 按键（C49234124）——固定是 RESET 按钮，一端接 EN、一端接 GND**',
    '10. **SW2: 按键（C49234124）——固定是 BOOT 按钮，一端接 IO0、一端接 GND**',
    '11. U4: OLED SSD1306 I2C 4P（C5248080）',
    '12. C1: 10uF（C469541），AMS1117 输入去耦',
    '13. C2: 10uF（C469541），AMS1117 输出去耦',
    '14. C3, C4: 100nF（C469550）×2，ESP32 VDD 去耦',
    '15. C5: 100nF（C469550），CH340C V3 去耦到 GND（**必须，不能省**）',
    '16. **C6: 100nF（C469550）——固定是 ESP32 EN 的 RC 延时电容，一端接 EN、一端接 GND**',
    '17. J2, J3: 排针（左右各 20 脚，把 GPIO 引出）',
    '',
    '**🚨 网表生成时的强约束（AI 必须遵守，否则强修会强制纠正）：**',
    '- **R1 只允许接 EN 和 3V3**：R1.1 -> ESP32.EN，R1.2 -> 3V3',
    '- **R2 只允许接 IO0 和 3V3**：R2.1 -> ESP32.IO0，R2.2 -> 3V3',
    '- **SW1 只允许接 EN 和 GND**：SW1.1 -> ESP32.EN，SW1.2 -> GND',
    '- **SW2 只允许接 IO0 和 GND**：SW2.1 -> ESP32.IO0，SW2.2 -> GND',
    '- **C6 只允许接 EN 和 GND**：C6.1 -> ESP32.EN，C6.2 -> GND',
    '- **R1/R2 绝对不要接到 DTR/RTS/CH340 的任何网络**',
    '- SW1/SW2 的 name 必须是"按键"，不能写成"10K"',
    '- CH340C 的 V3 引脚必须接 100nF 到 GND，不能悬空',
    '- Type-C CC1/CC2 必须用 5.1K（C23186），不是 10K',
    '- ESP32-WROOM 系列内置晶振，不要加 Y1 晶振元件',
    '- OLED 用 I2C，SCL 接 ESP32 IO9，SDA 接 ESP32 IO8',
  ];

  const corePrompt = [
    '**🚨 当前模式：ESP32 核心板（无 CH340、无 OLED）**',
    '',
    '**必须生成的元件清单：**',
    '1. U1: ESP32-S3-WROOM-1 模组',
    '2. U2: AMS1117-3.3（C6186）',
    '3. J1: Type-C 16P（C165948），仅供电 + USB-JTAG',
    '4. SW1: 按键（C49234124），RESET',
    '5. SW2: 按键（C49234124），BOOT',
    '6. R3, R4: 5.1K（C23186）×2，Type-C CC1/CC2 下拉到 GND',
    '7. R1, R2: 10K（C99198）×2，EN/IO0 上拉到 3V3',
    '8. C1~C4: 10uF ×2 + 100nF ×2',
    '9. J2, J3: 排针（左右各 20 脚）',
    '',
    '**🚨 核心板禁止生成：CH340C、S8050、OLED、双 NPN 自动下载电路。**',
    '**🚨 Type-C DP1/DN1 直连 ESP32 IO20(D+) / IO19(D-)，走 USB-JTAG 下载。**',
    '**🚨 Type-C CC1/CC2 必须用 5.1K（C23186）。**',
  ];

  return base.concat(boardType === 'dev' ? devPrompt : corePrompt).join('\n');
}


function assessNetsQuality(nets, plan, boardType) {
  const issues = [];
  const netCount = Object.keys(nets).length;
  const minExpected = Math.max(Math.ceil(plan.components.length * 1.5), 10);
  if (netCount < minExpected) issues.push(`网络数 ${netCount} < 预期 ${minExpected}`);
  const refsInNets = new Set();
  for (const n of Object.keys(nets)) {
    for (const item of (nets[n] || [])) if (typeof item === 'string' && item.includes('.')) refsInNets.add(item.split('.')[0]);
  }
  const missing = plan.components.map(c => c.ref).filter(r => !refsInNets.has(r));
  if (missing.length) issues.push(`元件未连接: ${missing.join(', ')}`);
  return { pass: issues.length === 0, issues, netCount, minExpected };
}

const SYSTEM_PROMPT_NETS = [
  '你是电路设计助手，只生成指定元件组的 nets。',
  '输出必须直接以 <<<NETS>>> 开头，只输出 JSON，不要代码块。',
  '<<<NETS>>>',
  '{ "nets": { "网络名": ["ref.引脚号"] } }',
  '规则：电阻电容 2 引脚，三极管 3 引脚，按键 2 引脚，CH340C 16 引脚，ESP32-S3 41 引脚。',
  '紧凑输出，不要缩进。',
  '**排针 J2/J3 的每一个引脚都必须连接到某个网络（通常是 MCU 的 GPIO 或电源）**',
  '**不要把不同 GPIO 连到同一个网络（那是短路）**',
].join('\n');

function extractJson(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.replace(/```json\n?/g, '').replace(/```/g, '');
  const start = str.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return str.substring(start, i + 1); }
  }
  return null;
}

function safeParseJson(str) {
  if (!str) return null;
  let openBrace = (str.match(/{/g) || []).length;
  let closeBrace = (str.match(/}/g) || []).length;
  let openBracket = (str.match(/\[/g) || []).length;
  let closeBracket = (str.match(/\]/g) || []).length;
  while (closeBrace < openBrace) { str += '}'; closeBrace++; }
  while (closeBracket < openBracket) { str += ']'; closeBracket++; }
  try { return JSON.parse(str); }
  catch (e) {
    let fixed = str.replace(/,\s*([\]}])/g, '$1');
    fixed = fixed.replace(/}\s*{/g, '}, {');
    fixed = fixed.replace(/]\s*\[/g, '], [');
    try { return JSON.parse(fixed); } catch (e2) { return null; }
  }
}

async function callAI(systemPrompt, userPrompt, tools = null, maxRounds = 30) {
  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
  let round = 0;
  while (round < maxRounds) {
    round++;
    const completion = await client.chat.completions.create({
      model: CONFIG.model, messages,
      max_tokens: 8192,
      ...(tools ? { tools, tool_choice: 'auto' } : {})
    });
    const msg = completion.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) { if (completion.choices[0].finish_reason === "length") { console.log("AI输出被截断，返回__TRUNCATED__"); return "__TRUNCATED__"; } return msg.content || ""; }
    for (const tc of msg.tool_calls) {
      const fn = tc.function.name;
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch(e) {}
      let result = '{}';
      if (fn === 'search_component') {
        const local = getLocalCompByLcsc(args.keyword) || getLocalCompByName(args.keyword);
        if (local) {
          console.log(`   ⚡ 命中字典: ${args.keyword}`);
          result = JSON.stringify([{ name: args.keyword, lcsc: local.lcsc, uuid: local.lcsc }]);
        } else {
          const r = await sendToEDA('search-component-request', { keyword: args.keyword });
          result = JSON.stringify(r || []);
        }
      } else if (fn === 'get_component_pins') {
        const localPins = getLocalPins(args.uuid);
        if (localPins) {
          console.log(`   ⚡ 命中字典引脚: ${args.uuid}`);
          result = JSON.stringify(localPins);
        } else {
          const r = await sendToEDA('get-pins-request', { uuid: args.uuid });
          result = JSON.stringify(r || []);
        }
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }
  return '';
}

async function handleChat(ws, userMessage) {
  const startTime = Date.now();
  try {
    const boardType = detectBoardType(userMessage);
    console.log(`\n🎯 识别板型: ${boardType === 'dev' ? '开发板（CH340 + OLED）' : '核心板（USB-JTAG）'}`);

    console.log('\n========== 阶段 1：生成 Plan ==========');
    const planPrompt = buildPlanPrompt(boardType);
    const planRaw = await callAI(planPrompt, userMessage, [
      { type: 'function', function: { name: 'search_component', description: '搜索元件', parameters: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] } } }
    ], 40);

    const planIdx = planRaw.indexOf('<<<PLAN>>>');
    const planBody = planIdx !== -1 ? planRaw.substring(planIdx + 11) : planRaw;
    const planJson = extractJson(planBody);
    if (!planJson) return ws.send(JSON.stringify({ type: 'chat-reply', content: 'AI 未返回有效规划' }));

    let plan = safeParseJson(planJson);
    if (!plan) {
      console.error('PLAN JSON 原文：\n', planJson);
      return ws.send(JSON.stringify({ type: 'error', content: 'PLAN JSON 解析失败，请重试' }));
    }

    if (!Array.isArray(plan.components) || plan.components.length === 0) return ws.send(JSON.stringify({ type: 'error', content: '元件清单为空' }));
    if (!Array.isArray(plan.groups) || plan.groups.length === 0) plan.groups = [{ id: 'all', name: '全部', comps: plan.components.map(c => c.ref) }];
    if (plan.components.length <= 15 && plan.groups.length > 1) {
      plan.groups = [{ id: 'all', name: '全部', comps: plan.components.map(c => c.ref) }];
    }

    console.log(`✅ 阶段 1 完成: ${plan.components.length} 元件, ${plan.groups.length} 组`);
    ws.send(JSON.stringify({ type: 'chat-reply', content: `已规划 ${plan.components.length} 个元件，${plan.groups.length} 批生成…` }));

    console.log('\n========== 阶段 1.5：本地纠正 + EDA 拉引脚 ==========');
    const lcscToUuid = new Map();
    const uuidToPins = new Map();
    const edaAvailable = edaSocket && edaSocket.readyState === WebSocket.OPEN;
    if (!edaAvailable) console.log('   ⚠️ EDA 未连接，全部走本地假引脚');

    for (const comp of plan.components) {
      const resolved = resolveComponent(comp);
      if (resolved) {
        if (resolved.warning) console.log(`   ⚠️ ${comp.ref}: ${resolved.warning}`);
        if (resolved.lcsc && resolved.lcsc !== comp.lcsc) {
          console.log(`   🔧 ${comp.ref} 编号修正: ${comp.lcsc} -> ${resolved.lcsc}`);
          comp.lcsc = resolved.lcsc;
        }
        if (resolved.name && comp.name !== resolved.name) comp.name = resolved.name;
      }

      if (edaAvailable) {
        let searchKeyword = comp.lcsc;
        if (!searchKeyword && comp.name && /^U\d*$/i.test(comp.ref || '')) {
          searchKeyword = comp.name;
          console.log('   WARN ' + comp.ref + ' lcsc为空，用name兜底搜索');
        }
        if (!searchKeyword && /^J\d*$/.test(comp.ref || '')) {
          searchKeyword = '2.54mm 排针';
          console.log('   WARN ' + comp.ref + ' lcsc 为空，用 ' + searchKeyword + ' 兜底搜索');
        }
        if (!searchKeyword) {
          console.log('   ERROR ' + comp.ref + ' lcsc 和 ref 都无法搜索，跳过 EDA');
          continue;
        }
        const results = await sendToEDA('search-component-request', { keyword: searchKeyword });
        if (results && results.length > 0) {
          let best = await findBestMatch(comp, results);
          if (best === null && comp.name) {
            const nameResults = await sendToEDA('search-component-request', { keyword: comp.name });
            if (nameResults && nameResults.length > 0) {
              best = await findBestMatch(comp, nameResults);
              if (best) console.log('   FIX ' + comp.ref + ' 按 name 兜底成功: ' + best.lcsc);
            }
          }
          if (best === null) {
          } else if (best && best.uuid) {
            if (best.lcsc && best.lcsc !== comp.lcsc && best.pinCount) {
              console.log(`   🔧 ${comp.ref} 编号修正(EDA): ${comp.lcsc} -> ${best.lcsc}`);
              comp.lcsc = best.lcsc;
            }
            lcscToUuid.set(comp.lcsc, best.uuid);
            const pins = best.pins || await sendToEDA('get-pins-request', { uuid: best.uuid });
            if (pins && pins.length > 0) {
              uuidToPins.set(best.uuid, pins);
              console.log(`   ✅ ${comp.ref}: EDA 真实引脚 (${pins.length} 脚)`);
              continue;
            }
          }
        }
        console.log(`   ⚠️ ${comp.ref} (${comp.lcsc}) EDA 搜索失败，回退本地`);
      }

      const localPins = getLocalPins(comp.lcsc);
      if (localPins) {
        uuidToPins.set(comp.lcsc, localPins);
        lcscToUuid.set(comp.lcsc, comp.lcsc);
        console.log(`   ⚠️ ${comp.ref}: 本地假引脚 (${localPins.length} 脚)`);
      } else {
        console.log(`   ❌ ${comp.ref} (${comp.lcsc}) 无任何引脚来源`);
      }
    }

    console.log('\n========== 阶段 2：生成网表 ==========');
    const groupResults = [];
    for (const group of plan.groups) {
      console.log(`\n>>> 组「${group.name}」(${group.comps.length} 元件)`);
      const groupComps = plan.components.filter(c => group.comps.includes(c.ref));
      const pinsInfo = groupComps.map(c => {
        const uuid = lcscToUuid.get(c.lcsc) || c.lcsc;
        const pins = uuidToPins.get(uuid) || getLocalPins(c.lcsc) || [];
        return { ref: c.ref, name: c.name, lcsc: c.lcsc, pins: pins.map(pinItem => ({ n: pinItem.pinNumber, name: pinItem.pinName })) };
      });
      const userContent = [
        `完整元件: ${plan.components.map(c => `${c.ref}(${c.name || c.lcsc})`).join(', ')}`,
        `本组元件: ${group.comps.join(', ')}`,
        `引脚定义: ${JSON.stringify(pinsInfo, null, 2)}`,
        `只输出 <<<NETS>>> 开头的内容`
      ].join('\n');
      let nets = null;
      const maxAttempts = 3;
      let currentPrompt = userContent;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const netsRaw = await callAI(SYSTEM_PROMPT_NETS, currentPrompt, null, 1);
          if (netsRaw === '__TRUNCATED__') {
            console.log(`   ⚠️ 第 ${attempt}/${maxAttempts} 次：AI 输出被截断`);
            if (attempt < maxAttempts) currentPrompt += `\n\n**第 ${attempt} 次被截断，请精简输出。**`;
            continue;
          }
          const netsIdx = netsRaw.indexOf('<<<NETS>>>');
          if (netsIdx === -1) { console.log(`   ⚠️ 第 ${attempt}/${maxAttempts} 次：未找到 <<<NETS>>>`); continue; }
          const netsJson = extractJson(netsRaw.substring(netsIdx + 10));
          if (!netsJson) { console.log(`   ⚠️ 第 ${attempt}/${maxAttempts} 次：无法提取 JSON`); continue; }
          const parsed = safeParseJson(netsJson);
          if (!parsed) { console.log(`   ⚠️ 第 ${attempt}/${maxAttempts} 次：JSON 解析失败`); continue; }
          const quality = assessNetsQuality(parsed.nets || {}, plan, boardType);
          if (!quality.pass) {
            console.log(`   ⚠️ 第 ${attempt}/${maxAttempts} 次质量不达标: ${quality.issues.join('; ')}`);
            if (parsed.nets) nets = parsed.nets;
            if (attempt < maxAttempts) currentPrompt += `\n\n**第 ${attempt} 次问题：${quality.issues.join('; ')}。必须补齐！**`;
            continue;
          }
          nets = parsed.nets;
          console.log(`   ✅ ${quality.netCount} 网络（第 ${attempt} 次尝试，质量通过）`);
          break;
        } catch(e) {
          console.log(`   ❌ 第 ${attempt}/${maxAttempts} 次：${e.message}`);
        }
      }
      if (nets) groupResults.push({ nets });
      else console.log(`   ❌ ${maxAttempts} 次全失败，依赖强修`);
    }

    console.log('\n========== 阶段 3：合并 + 纠正 + 强修 ==========');
    const validRefs = new Set(plan.components.map(c => c.ref));
    const mergedNets = {};
    for (const { nets } of groupResults) {
      for (const netName of Object.keys(nets)) {
        const items = nets[netName];
        if (!Array.isArray(items)) continue;
        if (!mergedNets[netName]) mergedNets[netName] = [];
        for (const item of items) {
          if (typeof item !== 'string' || !item.includes('.')) continue;
          const parts = item.split('.');
          if (!validRefs.has(parts[0])) continue;
          if (/^[RCDL]\d+$/.test(parts[0]) && parseInt(parts[1]) > 2) continue;
          if (/^Q\d+$/.test(parts[0]) && parseInt(parts[1]) > 3) continue;
          if (!mergedNets[netName].includes(item)) mergedNets[netName].push(item);
        }
      }
    }

    console.log('--- 引脚纠正 ---');
    for (const netName of Object.keys(mergedNets)) {
      const items = mergedNets[netName];
      const newItems = [];
      for (const item of items) {
        const [ref, pinId] = item.split('.');
        const comp = plan.components.find(c => c.ref === ref);
        if (!comp) { newItems.push(item); continue; }
        const uuid = lcscToUuid.get(comp.lcsc) || comp.lcsc;
        const pins = uuidToPins.get(uuid) || getLocalPins(comp.lcsc) || [];
        if (pins.length === 0) { newItems.push(item); continue; }
        const isTypeC = comp.lcsc === 'C165948' || (comp.name || '').toUpperCase().includes('TYPE-C');
        const corrected = correctPin(pinId, pins, isTypeC);
        if (corrected) newItems.push(`${ref}.${corrected}`);
        else console.log(`   ⚠️ ${item} 无法纠正`);
      }
      mergedNets[netName] = newItems;
    }

    console.log('--- 网络归一化 ---');
    const normalizedNets = {};
    for (const oldName of Object.keys(mergedNets)) {
      let target = oldName;
      if (/GND|VSS/i.test(oldName)) target = 'GND';
      else if (/5V|VBUS|VIN/i.test(oldName)) target = '5V';
      else if (/3V3|VCC|VDD|VOUT/i.test(oldName) && !/GND/i.test(oldName)) target = '3V3';
      if (!normalizedNets[target]) normalizedNets[target] = [];
      for (const item of mergedNets[oldName]) if (!normalizedNets[target].includes(item)) normalizedNets[target].push(item);
    }

    const circuit = { components: plan.components, nets: normalizedNets, unused: [] };
    console.log('--- 强制拓扑修复 ---');
    const fixLogs = forceCriticalTopology(circuit, uuidToPins, lcscToUuid, boardType);
    if (fixLogs.length > 0) {
      ws.send(JSON.stringify({ type: 'chat-reply', content: '🔧 拓扑强修日志：\n' + fixLogs.join('\n') }));
    }
    layout(circuit);

    const usedPins = new Set();
    for (const n of Object.keys(circuit.nets)) for (const item of circuit.nets[n]) usedPins.add(item);
    for (const comp of circuit.components) {
      const uuid = lcscToUuid.get(comp.lcsc) || comp.lcsc;
      const pins = uuidToPins.get(uuid) || getLocalPins(comp.lcsc) || [];
      for (const pinItem of pins) {
        const key = `${comp.ref}.${pinItem.pinNumber}`;
        if (!usedPins.has(key) && !circuit.unused.includes(key)) circuit.unused.push(key);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ 最终: ${circuit.components.length} 元件, ${Object.keys(circuit.nets).length} 网络, 耗时 ${elapsed} 秒`);
    ws.send(JSON.stringify({ type: 'chat-reply', content: `✅ 生成完成（耗时 ${elapsed} 秒）` }));

    if (edaSocket && edaSocket.readyState === WebSocket.OPEN) {
      const _cj = JSON.stringify(circuit);
      console.log('[DIAG] 发送给 EDA: ' + _cj.length + ' 字节, ' + circuit.components.length + ' 元件, ' + Object.keys(circuit.nets).length + ' 网络');
      edaSocket.send(JSON.stringify({ type: 'generate-circuit', data: _cj }));
      ws.send(JSON.stringify({ type: 'circuit-generated', content: JSON.stringify(circuit), elapsed }));
    } else {
      ws.send(JSON.stringify({ type: 'error', content: 'EDA 插件未连接' }));
    }
  } catch(e) {
    console.error('聊天失败:', e.message);
    ws.send(JSON.stringify({ type: 'error', content: 'AI 调用失败: ' + e.message }));
  }
}

wss.on('connection', (ws) => {
  console.log('✅ 客户端已连接');
  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch(e) { return; }
    if (msg.type === 'register-eda') {
      edaSocket = ws;
      console.log('EDA 插件已注册');
      ws.send(JSON.stringify({ type: 'registered' }));
    } else if (msg.type === 'search-component-result') {
      const resolve = pendingRequests.get(msg.requestId);
      if (resolve) { resolve(msg.results); pendingRequests.delete(msg.requestId); }
    } else if (msg.type === 'get-pins-result') {
      const resolve = pendingRequests.get(msg.requestId);
      if (resolve) { resolve(msg.pins); pendingRequests.delete(msg.requestId); }
    } else if (msg.type === 'chat') {
      await handleChat(ws, msg.content);
    }
  });
  ws.on('close', () => { if (edaSocket === ws) edaSocket = null; });
});

console.log('============================================================');
console.log('  NLCE Bridge Server v3.7 (质量校验 + 自动重试)');
console.log('============================================================');
console.log('  WebSocket 已启动: ws://127.0.0.1:49620');
console.log('============================================================');