# NLCE — Natural Language Circuit Engineering

用自然语言描述电路需求，AI 自动生成元件清单、查引脚、算参数、生成网表，并在嘉立创 EDA 里自动放置元件、自动布线。

> **诚实定位**：这不是「AI 全自主设计电路」。它是「AI 生成 + 大量规则兜底」的工程原型。AI 负责「猜」元件和网表，规则层负责「纠错」和「硬修」。

## 已验证电路

| 电路 | 元件数 | 结果 |
|---|---|---|
| AMS1117 LDO | 3 | ✅ 16 秒 |
| STM32F103 核心板 | 28 | ✅ 完整 |
| STM32F407 网关 | 54 | ✅ 270 引脚，58 秒，0 重叠 |
| ESP32-S3 智能家居节点 | 21 | ✅ 19 秒，双 NPN 自动下载成功 |
| **ESP32-S3 开发板 N16R8（CH340 + OLED，Arduino IDE 兼容）** | **21** | **✅ 32 秒，151 引脚全归宿，801 段线 0 重叠** |

## 架构

| 项目 | 技术栈 | 作用 |
|---|---|---|
| `my-extension/` | TypeScript + 嘉立创扩展 SDK | EDA 插件，放元件，布线 |
| `ai-test/bridge-server.js` | Node.js + OpenAI SDK + ws | AI 服务端，兜底，强修 |
| `ai-desktop/` | Electron | 桌面悬浮球 |

通信：`ws://127.0.0.1:49620`

## 关键兜底逻辑

- `LOCAL_DICT`：常用元件本地字典，命中 0 毫秒返回
- `findBestMatch`：按期望引脚数校验搜索结果
- `safeParseJson`：AI 输出截断时自动补 `}` `]`
- `forceCriticalTopology`：强行保证关键拓扑
  - Type-C VBUS→5V、GND→GND、EH→GND
  - CH340 D+/D- ↔ Type-C DP/DN
  - CH340 TXD/RXD ↔ MCU RXD0/TXD0
  - ESP32 双 NPN 自动下载（DTR/RTS 交叉互锁）
  - ESP_EN 含 R1/SW1/C6，ESP_IO0 含 R2/SW2
  - OLED SCL/SDA → ESP32 IO9/IO8
  - MCU VDD/VSS 挂 3V3/GND
- 单点清理白名单：只清临时网络，信号网络保留并警告
- `layout`：主控居中，电容右侧，电阻下方，连接器左侧

## 快速开始

### 前置

- Node.js ≥ 20
- 嘉立创 EDA 专业版 ≥ 3.2
- OpenAI 兼容 API Key（如阿里云百炼 DashScope）

### 1. 装依赖

```powershell
cd F:\jlceda-extension\ai-test
npm install