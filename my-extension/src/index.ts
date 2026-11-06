import extensionConfig from '../extension.json' with { type: 'json' };

let isGenerating = false;

export function activate(status?: 'onStartupFinished', arg?: string): void {}

export function about(): void {
	eda.sys_Dialog.showInformationMessage(
		eda.sys_I18n.text('EasyEDA extension SDK v', undefined, undefined, extensionConfig.version),
		eda.sys_I18n.text('About'),
	);
}

const NET_TO_PIN_NAMES: Record<string, string[]> = {
	'5V': ['VCC', 'VBUS', 'VIN', '5V', 'VCC5'],
	'GND': ['GND', 'VSS', 'GROUND', 'AGND', 'DGND', 'VSSA'],
	'3V3': ['V3', '3V3', 'VOUT', 'VDDA', 'VDD', 'VBAT'],
	'D+': ['D+', 'DP', 'DP1', 'DP2', 'UD+'],
	'D-': ['D-', 'DN', 'DN1', 'DN2', 'UD-'],
	'CC1': ['CC1'], 'CC2': ['CC2'], 'TXD': ['TXD', 'TX'], 'RXD': ['RXD', 'RX'],
	'BAT': ['BAT', 'BAT+'], 'CHRG': ['CHRG', 'CHRG#'], 'STDBY': ['STDBY', 'STDBY#'],
	'PROG': ['PROG'], 'CE': ['CE', 'CE#'], 'TEMP': ['TEMP'],
	'SW': ['SW', 'LX'], 'FB': ['FB'], 'EN': ['EN', 'EN#'],
	'COMP': ['COMP'], 'FREQ': ['FREQ'], 'BST': ['BST'],
	'OSC_IN': ['OSC_IN', 'PD0-OSC_IN', 'PD0', 'OSC1'],
	'OSC_OUT': ['OSC_OUT', 'PD1-OSC_OUT', 'PD1', 'OSC2'],
	'NRST': ['NRST', 'RST', 'RESET'],
	'BOOT0': ['BOOT0'],
};

function normalizePinName(name: string): string {
	return (name || '').toUpperCase().replace(/[^A-Z0-9+\-]/g, '');
}

function pinMatchesNet(pinName: string, netName: string): boolean {
	const n = normalizePinName(pinName);
	const u = netName.toUpperCase();
	if (n === u) return true;
	const aliases = NET_TO_PIN_NAMES[u] || [u];
	for (const a of aliases) {
		const na = normalizePinName(a);
		if (n === na) return true;
		if (na.length >= 3 && n.includes(na)) return true;
	}
	return false;
}

function isPassiveComponent(pins: any[]): boolean {
	if (pins.length !== 2) return false;
	return pins.every(p => /^\d+$/.test((p.pinName || '').trim()));
}

function isShellPin(n: string): boolean {
	const x = normalizePinName(n);
	return x === 'EH' || x === 'SHELL' || x === 'SHIELD' || x === 'MP' || x === 'MOUNT' || x === 'EP';
}

function isNoConnectPin(n: string): boolean {
	const x = normalizePinName(n);
	return x === 'SBU1' || x === 'SBU2' || x === 'SBU' || x === 'NC' || x === 'NC.';
}

function isGpioPin(name: string): boolean {
	const n = (name || '').toUpperCase();
	return /^P[A-Z]\d+/.test(n) || /^P[A-Z]-\w+/.test(n);
}

function isBootPin(name: string): boolean {
	const n = normalizePinName(name);
	return n === 'BOOT0' || n === 'BOOT1';
}

function isGndNet(n: string): boolean {
	const x = n.toUpperCase();
	return x === 'GND' || x === 'GROUND' || x === 'VSS' || x === 'VSSA';
}
function isPowerNet(n: string): boolean {
	const x = n.toUpperCase();
	return x === '5V' || x === 'VCC' || x === 'VIN' || x === 'VBUS' || x === 'VDD';
}
function is3V3Net(n: string): boolean {
	const x = n.toUpperCase();
	return x === '3V3' || x === 'VOUT' || x === 'V3' || x === 'VDDA';
}

async function safeAwait(fn: () => Promise<any>, errLog: string[]): Promise<boolean> {
	try { const r = await fn(); return !!r; }
	catch (e) { errLog.push(String(e).substring(0, 120)); return false; }
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function findComponentByLcsc(lcsc: string, log: string[]): Promise<any> {
	try {
		const r = await eda.lib_Device.searchByProperties(
			{ supplierId: lcsc }, undefined, undefined, undefined, 5, 1
		);
		if (r && r.length > 0) return r[0];
	} catch (e) {}

	try {
		const r = await eda.lib_Device.getByLcscIds(lcsc);
		if (r && r.length > 0) return r[0];
	} catch (e) {}

	try {
		const r = await eda.lib_Device.search(lcsc, undefined, undefined, undefined, 10, 1);
		if (r && r.length > 0) {
			const exact = r.find((x: any) => (x.supplierId || x.lcsc || '') === lcsc);
			if (exact) return exact;
			if (/^C\d{6,9}$/.test(lcsc)) {
				for (let i = 1; i < lcsc.length; i++) {
					const shorter = lcsc.substring(0, i) + lcsc.substring(i + 1);
					const match = r.find((x: any) => (x.supplierId || x.lcsc || '') === shorter);
					if (match) {
						log.push(`🔧 lcsc 模糊匹配：${lcsc} → ${shorter}`);
						return match;
					}
				}
			}
		}
	} catch (e) {}

	return null;
}

async function handleSearchComponent(keyword: string): Promise<any[]> {
	try {
		const results = await eda.lib_Device.search(keyword, undefined, undefined, undefined, 10, 1);
		if (!results || results.length === 0) return [];
		return results.slice(0, 10).map((r: any) => ({
			name: r.name || '',
			uuid: r.uuid || '',
			libraryUuid: r.libraryUuid || '0819f05c4eef4c71ace90d822a990e87',
			lcsc: r.supplierId || r.lcsc || '',
			description: r.description || '',
			manufacturer: r.manufacturer || '',
			package: r.footprintName || '',
		}));
	} catch (e) {
		console.error('搜索失败:', e);
		return [];
	}
}

async function handleGetPins(uuid: string, libraryUuid: string): Promise<any[]> {
	let temp: any = null;
	try {
		temp = await eda.sch_PrimitiveComponent.create(
			{
				libraryUuid: libraryUuid || '0819f05c4eef4c71ace90d822a990e87',
				uuid,
			},
			-9999, -9999, '', 0, false, false, false
		);
		if (!temp) return [];
		const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(
			temp.getState_PrimitiveId()
		);
		await eda.sch_PrimitiveComponent.delete(temp.getState_PrimitiveId());
		return (pins || []).map((p: any) => ({
			pinNumber: p.pinNumber,
			pinName: p.pinName,
			pinType: p.pinType || '',
		}));
	} catch (e) {
		if (temp) {
			try { await eda.sch_PrimitiveComponent.delete(temp.getState_PrimitiveId()); } catch (e2) {}
		}
		return [];
	}
}

interface LineSegment {
	net: string;
	x1: number; y1: number;
	x2: number; y2: number;
	wireIdx: number;
}

interface OverlapInfo {
	net1: string; net2: string;
	sameNet: boolean;
	x1: number; y1: number;
	x2: number; y2: number;
	length: number;
}

function segmentsOverlap(s1: LineSegment, s2: LineSegment): { x1: number; y1: number; x2: number; y2: number; length: number } | null {
	const s1Horiz = s1.y1 === s1.y2;
	const s2Horiz = s2.y1 === s2.y2;
	const s1Vert = s1.x1 === s1.x2;
	const s2Vert = s2.x1 === s2.x2;

	if (s1Horiz && s2Horiz) {
		if (s1.y1 !== s2.y1) return null;
		const a1 = Math.min(s1.x1, s1.x2), a2 = Math.max(s1.x1, s1.x2);
		const b1 = Math.min(s2.x1, s2.x2), b2 = Math.max(s2.x1, s2.x2);
		const start = Math.max(a1, b1), end = Math.min(a2, b2);
		if (end > start) return { x1: start, y1: s1.y1, x2: end, y2: s1.y1, length: end - start };
		return null;
	}
	if (s1Vert && s2Vert) {
		if (s1.x1 !== s2.x1) return null;
		const a1 = Math.min(s1.y1, s1.y2), a2 = Math.max(s1.y1, s1.y2);
		const b1 = Math.min(s2.y1, s2.y2), b2 = Math.max(s2.y1, s2.y2);
		const start = Math.max(a1, b1), end = Math.min(a2, b2);
		if (end > start) return { x1: s1.x1, y1: start, x2: s1.x1, y2: end, length: end - start };
		return null;
	}
	return null;
}

async function fetchAllWiresWithRetry(maxRetries: number = 5, delayMs: number = 600): Promise<{ wires: any[]; retries: number } | null> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			const wires = await eda.sch_PrimitiveWire.getAll();
			if (wires && Array.isArray(wires) && wires.length > 0) return { wires, retries: i };
		} catch (e) {}
		if (i < maxRetries - 1) await sleep(delayMs);
	}
	return null;
}


// ============================================================
// ⭐ 信号/电源短路检测（v3.6）
// ============================================================
function detectSignalShorts(netToPins: Record<string, any[]>, pinsByRef: Record<string, any[]>): string[] {
  const lines: string[] = [];

  // 1. 找 MCU（引脚数 > 20 且含 GPIO 名）
  let mcuRef: string | null = null;
  for (const ref of Object.keys(pinsByRef)) {
    const pins = pinsByRef[ref];
    if (pins.length < 20) continue;
    const hasGpio = pins.some(p => /^(IO\d+|GPIO\d+|PA\d+|PB\d+|PC\d+)$/i.test((p.pinName || "").trim()));
    if (hasGpio) { mcuRef = ref; break; }
  }

  if (!mcuRef) {
    lines.push("ℹ️ 未找到 MCU（引脚数 < 20 或无 GPIO），跳过信号短路检测");
  } else {
    const gpioNetMap = new Map<string, any[]>();
    let shortCount = 0;

    for (const netName of Object.keys(netToPins)) {
      const pinsInNet = netToPins[netName];
      const mcuGpios = pinsInNet.filter(p =>
        p.ref === mcuRef && /^(IO\d+|GPIO\d+|PA\d+|PB\d+|PC\d+)$/i.test((p.pinName || "").trim())
      );
      if (mcuGpios.length >= 2) {
        gpioNetMap.set(netName, mcuGpios);
        shortCount++;
      }
    }

    if (shortCount === 0) {
      lines.push(`✅ 无信号短路：MCU ${mcuRef} 的所有 GPIO 分布在不同网络`);
    } else {
      lines.push(`🔴 发现 ${shortCount} 处信号短路！MCU ${mcuRef} 的多个 GPIO 被连到同一网络：`);
      for (const [netName, pins] of gpioNetMap) {
        const pinList = pins.map(p => `${p.pinNumber}(${p.pinName})`).join(", ");
        lines.push(`   🔴 网络【${netName}】同时连了 ${pins.length} 个 GPIO: ${pinList}`);
      }
    }
  }

  // 2. 电源短路（同一网络同时有 VDD 和 GND）
  for (const netName of Object.keys(netToPins)) {
    const pinsInNet = netToPins[netName];
    const hasPower = pinsInNet.some(p => /^(VDD|VCC|3V3|5V|VBUS|VIN)/i.test((p.pinName || "").trim()));
    const hasGnd = pinsInNet.some(p => /^(GND|VSS|VSSA|AGND|DGND|PGND)$/i.test((p.pinName || "").trim()));
    if (hasPower && hasGnd) {
      lines.push(`🔴 电源短路：网络【${netName}】同时含 VDD/VCC 和 GND`);
    }
  }

  // 3. 统计 GND/5V/3V3 网络规模，判断走线风格
  for (const netName of Object.keys(netToPins)) {
    if (/^(GND|5V|3V3|VBUS|VIN)$/i.test(netName)) {
      const count = netToPins[netName].length;
      const style = count > 5 ? "菊花链/主干" : "独立标签";
      lines.push(`ℹ️ 电源网络【${netName}】共 ${count} 个引脚（${style}）`);
    }
  }

  return lines;
}

async function checkOverlapsInternal(silent: boolean): Promise<string> {
	const lines: string[] = [];
	try {
		const fetched = await fetchAllWiresWithRetry(5, 600);
		if (!fetched) {
			lines.push('=== 线路重叠检测 ===');
			lines.push('');
			lines.push('❌ 检测失败：无法从 EDA 获取走线数据（可能渲染未完成）');
			if (!silent) eda.sys_Dialog.showInformationMessage(lines.join('\n'), '线路重叠检测');
			return lines.join('\n');
		}
		const { wires } = fetched;
		const segments: LineSegment[] = [];
		for (let i = 0; i < wires.length; i++) {
			const wire = wires[i];
			let net = '';
			try { net = wire.getState_Net?.() || ''; } catch (e) {}
			if (!net) { try { net = wire.getState_NetName?.() || ''; } catch (e) {} }
			if (!net) { try { net = wire.getState_NetLabel?.() || ''; } catch (e) {} }
			if (!net) net = '未命名';
			const points = wire.getState_Points?.() ?? wire.getState_Line?.() ?? null;
			if (!points || !Array.isArray(points) || points.length < 4) continue;
			for (let j = 0; j < points.length - 2; j += 2) {
				segments.push({ net, x1: points[j], y1: points[j + 1], x2: points[j + 2], y2: points[j + 3], wireIdx: i });
			}
		}
		const overlaps: OverlapInfo[] = [];
		for (let i = 0; i < segments.length; i++) {
			for (let j = i + 1; j < segments.length; j++) {
				const s1 = segments[i], s2 = segments[j];
				if (s1.wireIdx === s2.wireIdx) continue;
				const ov = segmentsOverlap(s1, s2);
				if (ov) {
					overlaps.push({ net1: s1.net, net2: s2.net, sameNet: s1.net === s2.net, x1: ov.x1, y1: ov.y1, x2: ov.x2, y2: ov.y2, length: ov.length });
				}
			}
		}
		const badOverlaps = overlaps.filter(o => !o.sameNet);
		const okOverlaps = overlaps.filter(o => o.sameNet);
		lines.push('=== 线路重叠检测 ===');
		if (badOverlaps.length === 0 && okOverlaps.length === 0) {
			lines.push(`✅ 无任何线路重叠（${segments.length} 段线段）`);
		} else if (badOverlaps.length === 0) {
			lines.push(`✅ 无危险重叠（${okOverlaps.length} 处同网络冗余，不影响电气）`);
		} else {
			lines.push(`🔴 危险重叠: ${badOverlaps.length} 处`);
			lines.push(`🟡 冗余重叠: ${okOverlaps.length} 处`);
			for (let i = 0; i < Math.min(badOverlaps.length, 10); i++) {
				const o = badOverlaps[i];
				lines.push(`${i + 1}. 【${o.net1}】 × 【${o.net2}】  (${o.x1},${o.y1})→(${o.x2},${o.y2})`);
			}
		}
		if (!silent) eda.sys_Dialog.showInformationMessage(lines.join('\n'), '线路重叠检测');
	} catch (e) {
		lines.push(`❌ 检测出错: ${String(e)}`);
		if (!silent) eda.sys_Dialog.showInformationMessage(lines.join('\n'), '线路重叠检测');
	}
	return lines.join('\n');
}

export async function checkWireOverlaps(): Promise<void> {
	await checkOverlapsInternal(false);
}

async function executeCircuitJson(jsonStr: string): Promise<void> {
if (isGenerating) {
eda.sys_Dialog.showInformationMessage('⚠️ 正在生成中，请稍候…', '提示');
return;
}
isGenerating = true;
const startTime = Date.now();
const log: string[] = [];
const errLog: string[] = [];

	try {
		let config: any;
		try { config = JSON.parse(jsonStr); }
		catch (e) { eda.sys_Dialog.showInformationMessage(`JSON 解析失败: ${String(e)}`, '错误'); return; }

		const { components } = config;
		if (!Array.isArray(components)) {
			eda.sys_Dialog.showInformationMessage('JSON 格式错误', '错误');
			return;
		}

		const pinsByRef: Record<string, any[]> = {};
		const usedDesignators = new Set<string>();

		log.push(`=== 放置元件 (${components.length} 个) ===`);

		for (const comp of components) {
			let target: any = null;

			if (comp.lcsc) {
				target = await findComponentByLcsc(comp.lcsc, log);

// ⭐ 终极防崩：如果按 lcsc 找不到，强行用名字搜一个顶上，绝不让元件缺失！
if (!target && comp.name) {
try {
const r = await eda.lib_Device.search(comp.name, undefined, undefined, undefined, 3, 1);
if (r && r.length > 0) target = r[0];
} catch(e) {}
}
			}

			if (!target && comp.search) {
				try {
					const r = await eda.lib_Device.search(comp.search, undefined, undefined, undefined, 5, 1);
					if (r && r.length > 0) target = r[0];
				} catch (e) {}
			}

			
// ⭐ 第二重兜底：按 comp.name 找（针对 C469541 这种失效编号）
if (!target && comp.name) {
try {
const r = await eda.lib_Device.search(comp.name, undefined, undefined, undefined, 5, 1);
if (r && r.length > 0) {
target = r[0];
log.push(`🔧 兜底搜索: ${comp.ref} (${comp.lcsc}) 按名称找到 ${r[0].name || r[0].description}`);
}
} catch (e) {}
}

if (!target || !target.uuid) {
				log.push(`❌ 未找到: ${comp.ref} (lcsc=${comp.lcsc})`);
				continue;
			}

			const rotation = comp.rotation ?? 0;
			const x = Math.round(comp.x || 500);
			const y = Math.round(comp.y || 500);

			let created: any = null;
			try {
				created = await eda.sch_PrimitiveComponent.create(
					{ libraryUuid: '0819f05c4eef4c71ace90d822a990e87', uuid: target.uuid },
					x, y, '', rotation, false, true, true
				);
			} catch (e) {
				log.push(`❌ ${comp.ref} create 异常: ${String(e).substring(0, 100)}`);
				continue;
			}

			if (!created) {
				log.push(`❌ ${comp.ref} create 返回空`);
				continue;
			}

			let fd = comp.ref;
			if (usedDesignators.has(fd)) fd = `${fd}_${usedDesignators.size + 1}`;
			usedDesignators.add(fd);

			try {
				await eda.sch_PrimitiveComponent.modify(
					created.getState_PrimitiveId(),
					{ designator: fd, name: comp.name || target.name || fd }
				);
			} catch (e) {}

			const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(
				created.getState_PrimitiveId()
			);

			const refPinsRaw: any[] = [];
			if (pins) for (const pin of pins) {
				refPinsRaw.push({
					x: pin.x, y: pin.y,
					pinName: pin.pinName, pinNumber: pin.pinNumber,
					ref: fd,
				});
			}

			let cx = x, cy = y;
			if (refPinsRaw.length > 0) {
				cx = Math.round(refPinsRaw.reduce((s, p) => s + p.x, 0) / refPinsRaw.length);
				cy = Math.round(refPinsRaw.reduce((s, p) => s + p.y, 0) / refPinsRaw.length);
			}

			const refPins: any[] = refPinsRaw.map(p => ({ ...p, cx, cy }));

			pinsByRef[fd] = refPins;
			log.push(`✅ ${fd} (${refPins.length} 引脚)`);
		}

		const nets = config.nets;
		const unusedRefs: string[] = [...(config.unused || [])];
		const netToPins: Record<string, any[]> = {};
		const refToNets: Record<string, string[]> = {};

		function addPinToNet(pin: any, netName: string): void {
			if (!netToPins[netName]) netToPins[netName] = [];
			if (!netToPins[netName].find(p => p.ref === pin.ref && p.pinNumber === pin.pinNumber)) {
				netToPins[netName].push(pin);
			}
		}

		if (nets && typeof nets === 'object') {
			for (const netName of Object.keys(nets)) {
				const items: string[] = nets[netName];
				if (!Array.isArray(items)) continue;
				for (const item of items) {
					if (typeof item !== 'string') continue;
					if (item.includes('.')) {
						const dotIdx = item.indexOf('.');
						const compRef = item.substring(0, dotIdx);
						const pinId = item.substring(dotIdx + 1);
						const refPins = pinsByRef[compRef];
						if (!refPins) continue;

						let pin = refPins.find(p => p.pinNumber === pinId);
						if (!pin) {
							const upperId = pinId.toUpperCase();
							pin = refPins.find(p => (p.pinName || '').toUpperCase() === upperId);
						}
						if (!pin) {
							const normId = normalizePinName(pinId);
							pin = refPins.find(p => normalizePinName(p.pinName || '') === normId);
						}
						if (!pin) {
							log.push(`⚠️ ${netName}: 找不到引脚 ${item}`);
							continue;
						}
						addPinToNet(pin, netName);
					}
				}
			}

			for (const netName of Object.keys(nets)) {
				const items: string[] = nets[netName];
				if (!Array.isArray(items)) continue;
				for (const item of items) {
					if (typeof item !== 'string') continue;
					if (item.includes('.')) continue;
					if (!refToNets[item]) refToNets[item] = [];
					if (!refToNets[item].includes(netName)) refToNets[item].push(netName);
				}
			}

			for (const ref of Object.keys(refToNets)) {
				const refPins = pinsByRef[ref];
				if (!refPins) continue;
				if (isPassiveComponent(refPins)) continue;

				const netsOfComp = refToNets[ref];
				for (const netName of netsOfComp) {
					const u = netName.toUpperCase();
					for (const pin of refPins) {
						if (pinMatchesNet(pin.pinName, u)) addPinToNet(pin, netName);
					}
				}
			}

			function isRefAlreadyAssigned(ref: string): boolean {
				for (const n of Object.keys(netToPins)) {
					if (netToPins[n].some(p => p.ref === ref)) return true;
				}
				return false;
			}

			for (const ref of Object.keys(refToNets)) {
				const refPins = pinsByRef[ref];
				if (!refPins) continue;
				if (!isPassiveComponent(refPins)) continue;
				if (isRefAlreadyAssigned(ref)) continue;

				const sorted = [...refPins].sort((a, b) => (parseInt(a.pinNumber) || 0) - (parseInt(b.pinNumber) || 0));
				const netsOfComp = refToNets[ref];

				if (netsOfComp.length >= 2) {
					const nonGnd = netsOfComp.filter(n => !isGndNet(n));
					const gndNets = netsOfComp.filter(n => isGndNet(n));
					const ordered = [...nonGnd, ...gndNets];
					addPinToNet(sorted[0], ordered[0]);
					addPinToNet(sorted[1], ordered[1]);
					log.push(`🔧 ${ref}: ${sorted[0].pinNumber}→${ordered[0]}, ${sorted[1].pinNumber}→${ordered[1]}`);
				} else if (netsOfComp.length === 1) {
					addPinToNet(sorted[0], netsOfComp[0]);
					addPinToNet(sorted[1], 'GND');
					log.push(`🔧 ${ref}: ${sorted[0].pinNumber}→${netsOfComp[0]}, ${sorted[1].pinNumber}→GND`);
				}
			}
		}

		for (const ref of Object.keys(pinsByRef)) {
			for (const pin of pinsByRef[ref]) {
				if (isShellPin(pin.pinName)) {
					let inNet = false;
					for (const netName of Object.keys(netToPins)) {
						if (netToPins[netName].find(p => p.ref === pin.ref && p.pinNumber === pin.pinNumber)) {
							inNet = true; break;
						}
					}
					if (!inNet) addPinToNet(pin, 'GND');
				}
			}
		}

		for (const ref of Object.keys(pinsByRef)) {
			for (const pin of pinsByRef[ref]) {
				if (isBootPin(pin.pinName)) {
					let inNet = false;
					for (const netName of Object.keys(netToPins)) {
						if (netToPins[netName].find(p => p.ref === pin.ref && p.pinNumber === pin.pinNumber)) {
							inNet = true; break;
						}
					}
					if (!inNet) {
						addPinToNet(pin, 'GND');
						log.push(`🔧 ${pin.ref}.${pin.pinNumber} (${pin.pinName}) 自动接 GND`);
					}
				}
			}
		}

		const EXIT_DIST = 80;

		function getExitPoint(pin: any): { x: number; y: number } {
			const px = Math.round(pin.x);
			const py = Math.round(pin.y);
			const dx = px - pin.cx;
			const dy = py - pin.cy;
			if (Math.abs(dx) > Math.abs(dy)) {
				return { x: dx > 0 ? px + EXIT_DIST : px - EXIT_DIST, y: py };
			} else {
				return { x: px, y: dy > 0 ? py + EXIT_DIST : py - EXIT_DIST };
			}
		}

		log.push('');
		log.push(`=== 布线 ===`);

		const allPins: any[] = [];
		for (const ref of Object.keys(pinsByRef)) {
			for (const pin of pinsByRef[ref]) allPins.push(pin);
		}
		if (allPins.length === 0) {
			eda.sys_Dialog.showInformationMessage(log.join('\n'), '执行报告');
			return;
		}

		const allY = allPins.map(p => p.y);
		const maxYGlobal = Math.max(...allY);
		const minYGlobal = Math.min(...allY);

		const orderedNets: { name: string; pins: any[]; type: string }[] = [];
		for (const n of Object.keys(netToPins)) if (isGndNet(n)) orderedNets.push({ name: n, pins: netToPins[n], type: 'gnd' });
		for (const n of Object.keys(netToPins)) if (isPowerNet(n)) orderedNets.push({ name: n, pins: netToPins[n], type: 'pwr' });
		for (const n of Object.keys(netToPins)) if (is3V3Net(n)) orderedNets.push({ name: n, pins: netToPins[n], type: '3v3' });
		for (const n of Object.keys(netToPins)) if (!isGndNet(n) && !isPowerNet(n) && !is3V3Net(n)) orderedNets.push({ name: n, pins: netToPins[n], type: 'sig' });

		// ⭐ 优化后的布线逻辑：电源/地独立打标签，纯信号保留上下主干
		let upperIdx = 0, lowerIdx = 0;

		for (const netInfo of orderedNets) {
			const { name, pins, type } = netInfo;
			if (pins.length === 0) continue;

			if (type === 'gnd' || type === 'pwr' || type === '3v3') {
				// ⭐ 针对电源和地：不再画长横线，而是每个引脚拉出后打标签
				let flagType: 'Power' | 'Ground' = 'Power';
				let flagNetName = name;
				if (type === 'gnd') { flagType = 'Ground'; flagNetName = 'GND'; }
				else if (type === 'pwr') { flagNetName = '5V'; }
				else if (type === '3v3') { flagNetName = '3V3'; }

				let okCount = 0;
				for (const pin of pins) {
					const px = Math.round(pin.x), py = Math.round(pin.y);
let ex = px, ey = py, rotation = 0;
if (type === 'gnd') { ey += 120; rotation = 0; }
else { ey -= 120; rotation = 0; }

const path = [[px, py, ex, ey]];
await safeAwait(() => eda.sch_PrimitiveWire.create(path, 'NET_' + name), errLog);
const flagOk = await safeAwait(() => eda.sch_PrimitiveComponent.createNetFlag(flagType, flagNetName, ex, ey, rotation, false), errLog);
if (flagOk) okCount++;
				}
				log.push(`  → ${name} (${type}): 独立打标签 ${okCount}/${pins.length}`);
			} else {
				// ⭐ 针对信号线：保留上下主干逻辑，但大幅压缩偏移距离
				const upperPins = pins.filter(p => p.y > p.cy);
				const lowerPins = pins.filter(p => p.y <= p.cy);
				const upperTrunkY = upperPins.length > 0 ? Math.round(Math.max(...upperPins.map(p => p.y)) + 60 + upperIdx * 20) : 0;
				const lowerTrunkY = lowerPins.length > 0 ? Math.round(Math.min(...lowerPins.map(p => p.y)) - 60 - lowerIdx * 20) : 0;

				let upperOk = 0, lowerOk = 0;

				if (upperPins.length > 0) {
					const exits = upperPins.map(p => getExitPoint(p));
					const xs = exits.map(e => e.x);
					const uMinX = Math.min(...xs), uMaxX = Math.max(...xs);
					if (uMinX !== uMaxX) {
						await safeAwait(() => eda.sch_PrimitiveWire.create([[uMinX, upperTrunkY, uMaxX, upperTrunkY]], 'NET_' + name), errLog);
					}
					for (const pin of upperPins) {
						const exit = getExitPoint(pin);
						const px = Math.round(pin.x), py = Math.round(pin.y);
						const ex = Math.round(exit.x), ey = Math.round(exit.y);
						const path: number[][] = [];
						if (ex !== px || ey !== py) path.push([px, py, ex, ey]);
						if (ey !== upperTrunkY) path.push([ex, ey, ex, upperTrunkY]);
						if (path.length === 0) { upperOk++; continue; }
						const ok = await safeAwait(() => eda.sch_PrimitiveWire.create(path, 'NET_' + name), errLog);
						if (ok) upperOk++;
					}
				}

				if (lowerPins.length > 0) {
					const exits = lowerPins.map(p => getExitPoint(p));
					const xs = exits.map(e => e.x);
					const lMinX = Math.min(...xs), lMaxX = Math.max(...xs);
					if (lMinX !== lMaxX) {
						await safeAwait(() => eda.sch_PrimitiveWire.create([[lMinX, lowerTrunkY, lMaxX, lowerTrunkY]], 'NET_' + name), errLog);
					}
					for (const pin of lowerPins) {
						const exit = getExitPoint(pin);
						const px = Math.round(pin.x), py = Math.round(pin.y);
						const ex = Math.round(exit.x), ey = Math.round(exit.y);
						const path: number[][] = [];
						if (ex !== px || ey !== py) path.push([px, py, ex, ey]);
						if (ey !== lowerTrunkY) path.push([ex, ey, ex, lowerTrunkY]);
						if (path.length === 0) { lowerOk++; continue; }
						const ok = await safeAwait(() => eda.sch_PrimitiveWire.create(path, 'NET_' + name), errLog);
						if (ok) lowerOk++;
					}
				}

				// 如果信号线既在上面又在下面，还是需要一根竖线连起来，但尽量靠左
				if (upperPins.length > 0 && lowerPins.length > 0) {
					const allCx = pins.map(p => p.cx);
					const connectX = Math.round(Math.min(...allCx) - 60); // 从 150 缩短到 60
					await safeAwait(() => eda.sch_PrimitiveWire.create([[connectX, lowerTrunkY, connectX, upperTrunkY]], 'NET_' + name), errLog);
					await safeAwait(() => eda.sch_PrimitiveWire.create([[connectX, upperTrunkY, Math.min(...upperPins.map(p => getExitPoint(p).x)), upperTrunkY]], 'NET_' + name), errLog);
					await safeAwait(() => eda.sch_PrimitiveWire.create([[connectX, lowerTrunkY, Math.min(...lowerPins.map(p => getExitPoint(p).x)), lowerTrunkY]], 'NET_' + name), errLog);
				}

				log.push(`  → ${name} (sig): 上${upperOk}/${upperPins.length}, 下${lowerOk}/${lowerPins.length}`);

				if (upperPins.length > 0) upperIdx++;
				if (lowerPins.length > 0) lowerIdx++;
			}
		}

		const inNetKeysNow = new Set<string>();
		for (const n of Object.keys(netToPins)) {
			for (const p of netToPins[n]) inNetKeysNow.add(`${p.ref}.${p.pinNumber}`);
		}

		for (const ref of Object.keys(pinsByRef)) {
			for (const pin of pinsByRef[ref]) {
				const key = `${pin.ref}.${pin.pinNumber}`;
				if (inNetKeysNow.has(key)) continue;
				if (unusedRefs.includes(key)) continue;
				if (isNoConnectPin(pin.pinName) || isGpioPin(pin.pinName)) unusedRefs.push(key);
			}
		}

		const unusedSetNow = new Set(unusedRefs);
		const autoAddedUnused: string[] = [];
		for (const ref of Object.keys(pinsByRef)) {
			for (const pin of pinsByRef[ref]) {
				const key = `${pin.ref}.${pin.pinNumber}`;
				if (inNetKeysNow.has(key)) continue;
				if (unusedSetNow.has(key)) continue;
				unusedSetNow.add(key);
				autoAddedUnused.push(`${key}(${pin.pinName})`);
			}
		}

		if (autoAddedUnused.length > 0) {
			log.push('');
			log.push(`🔧 自动兜底标记悬空: ${autoAddedUnused.join(', ')}`);
			unusedRefs.length = 0;
			for (const u of unusedSetNow) unusedRefs.push(u);
		}

		const allPinKeys = new Set<string>();
		for (const ref of Object.keys(pinsByRef)) for (const pin of pinsByRef[ref]) allPinKeys.add(`${pin.ref}.${pin.pinNumber}`);
		const inNetKeys = new Set<string>();
		for (const n of Object.keys(netToPins)) for (const p of netToPins[n]) inNetKeys.add(`${p.ref}.${p.pinNumber}`);
		const unusedKeys = new Set(unusedRefs);

		const unconnected: string[] = [];
		for (const key of allPinKeys) {
			if (inNetKeys.has(key)) continue;
			if (unusedKeys.has(key)) continue;
			unconnected.push(key);
		}

		log.push('');
		log.push(`=== 完整性检查 ===`);
		log.push(`总引脚数: ${allPinKeys.size} / 已连接: ${inNetKeys.size} / 悬空(unused): ${unusedKeys.size}`);

		if (unconnected.length > 0) log.push(`⚠️ 未连接也未标记悬空: ${unconnected.join(', ')}`);
		else log.push('✅ 所有引脚都有归宿');

		if (errLog.length > 0) {
			log.push('');
			log.push(`=== 异常 (前8条) ===`);
			log.push([...new Set(errLog)].slice(0, 8).join('\n'));
		}

		log.push('');
		log.push('');
		log.push('=== 信号/电源短路检测 ===');
		const shortReports = detectSignalShorts(netToPins, pinsByRef);
		for (const line of shortReports) log.push(line);

		const overlapReport = await checkOverlapsInternal(true);
		log.push(overlapReport);
	}
	catch (e) { log.push(''); log.push(`❌ 严重错误: ${String(e)}`); }
	finally {
isGenerating = false;
const elapsed = Math.round((Date.now() - startTime) / 1000);
log.push('');
log.push('⏱️ 本次生成总耗时: ' + elapsed + ' 秒');
eda.sys_Dialog.showInformationMessage(log.join('\\n'), '✅ 执行报告 · 生成完成');
}
}

export async function generateFromQuery(): Promise<void> {
	const CIRCUIT_JSON = JSON.stringify({
		components: [{ ref: 'U1', lcsc: 'C84681', x: 450, y: 450, rotation: 0, name: 'CH340C' }],
		nets: { '5V': ['U1'], 'GND': ['U1'], '3V3': ['U1'] },
		unused: [],
	}, null, 2);
	eda.sys_Dialog.showInputDialog('粘贴电路 JSON：', '确认后放置元件并连线', '生成电路', 'text', CIRCUIT_JSON, {},
		async (input: string) => { if (input) await executeCircuitJson(input); });
}

const WS_ID = 'ai-bridge';
const WS_URI = 'ws://127.0.0.1:49620';

export function connectToBridge(): void {
	try {
		eda.sys_WebSocket.register(
			WS_ID, WS_URI,
			async (event) => {
				try {
					const msg = JSON.parse(event.data as string);
					console.log('收到消息类型:', msg.type);

					if (msg.type === 'search-component-request') {
						console.log('收到搜索请求:', msg.keyword);
						const results = await handleSearchComponent(msg.keyword);
						console.log('搜索结果数量:', results.length);
						eda.sys_WebSocket.send(WS_ID, JSON.stringify({
							type: 'search-component-result',
							requestId: msg.requestId,
							results,
						}));
						return;
					}

					if (msg.type === 'get-pins-request') {
						console.log('收到引脚查询请求:', msg.uuid);
						const pins = await handleGetPins(msg.uuid, msg.libraryUuid);
						console.log('引脚数量:', pins.length);
						eda.sys_WebSocket.send(WS_ID, JSON.stringify({
							type: 'get-pins-result',
							requestId: msg.requestId,
							pins,
						}));
						return;
					}

					if (msg.type === 'generate-circuit') {
						await executeCircuitJson(msg.data);
					}
				} catch (e) {
					console.error('处理消息失败:', e);
				}
			},
			() => {
				try {
					eda.sys_WebSocket.send(WS_ID, JSON.stringify({ type: 'register-eda' }));
					console.log('已连接 AI 服务并发送注册');
				} catch (e) {}
			}
		);
	} catch (e) {
		eda.sys_Dialog.showInformationMessage(`连接失败: ${String(e)}`, '错误');
	}
}

export function disconnectBridge(): void {
	try { eda.sys_WebSocket.close(WS_ID, 1000, '用户主动断开'); } catch (e) {}
}

export async function reportAllCoordinates(): Promise<void> {
	try {
		const reportLines: string[] = [];
		const allComponents = await eda.sch_PrimitiveComponent.getAll();
		const wires = await eda.sch_PrimitiveWire.getAll();
		const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
		for (const wire of wires || []) {
			const points = wire.getState_Points?.() ?? wire.getState_Line?.() ?? null;
			if (!points || !Array.isArray(points) || points.length < 4) continue;
			for (let j = 0; j < points.length - 2; j += 2) {
				segments.push({ x1: points[j], y1: points[j + 1], x2: points[j + 2], y2: points[j + 3] });
			}
		}

		function nearestDist(px: number, py: number): number {
			let minD = Infinity;
			for (const seg of segments) {
				const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
				const l2 = dx * dx + dy * dy;
				if (l2 === 0) {
					const d = Math.sqrt((px - seg.x1) ** 2 + (py - seg.y1) ** 2);
					if (d < minD) minD = d;
					continue;
				}
				let t = ((px - seg.x1) * dx + (py - seg.y1) * dy) / l2;
				t = Math.max(0, Math.min(1, t));
				const d = Math.sqrt((px - (seg.x1 + t * dx)) ** 2 + (py - (seg.y1 + t * dy)) ** 2);
				if (d < minD) minD = d;
			}
			return minD;
		}

		reportLines.push(`=== 器件 (共 ${allComponents?.length ?? 0} 个) ===`);
		for (const comp of allComponents || []) {
			const designator = comp.getState_Designator?.() || '';
			const net = comp.getState_Net?.() ?? '';
			if (!designator) {
				const ci = comp.getState_Component?.();
				reportLines.push(`【网络标识】类型: ${ci?.name ?? '?'} 网络: ${net || '?'}`);
				continue;
			}
			reportLines.push(`【${designator}】`);
			const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(comp.getState_PrimitiveId());
			if (pins) for (const pin of pins) {
				const d = nearestDist(pin.x, pin.y);
				reportLines.push(`  ${d < 1 ? '✅' : '❌'} ${pin.pinNumber} (${pin.pinName}): (${pin.x}, ${pin.y}) 距离=${d.toFixed(2)}`);
			}
		}

		eda.sys_Dialog.showInformationMessage(reportLines.join('\n'), '全坐标报告');
	} catch (e) { eda.sys_Dialog.showInformationMessage(`报告出错: ${String(e)}`, '错误'); }
}