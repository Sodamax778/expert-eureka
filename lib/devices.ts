export type DeviceProfile = {
  key: string;
  name: string;
  inch: string;
  width: number;
  height: number;
};

export const customDeviceKey = "custom";

export const devices: DeviceProfile[] = [
  { key: "poke6s", name: "BOOX Poke6S 系列", inch: "6 英寸", width: 758, height: 1024 },
  { key: "poke6", name: "BOOX Poke 系列", inch: "6 英寸", width: 1072, height: 1448 },
  { key: "p6", name: "BOOX P6 / Palma 系列", inch: "6.13 英寸", width: 824, height: 1648 },
  { key: "leaf5", name: "BOOX Leaf / Page 系列", inch: "7 英寸", width: 1264, height: 1680 },
  { key: "note-x5-mini", name: "BOOX Note 1404 系列", inch: "7.8-10.3 英寸", width: 1404, height: 1872 },
  { key: "note-x5", name: "BOOX Note / Tab 系列", inch: "10.3 英寸", width: 1860, height: 2480 },
  { key: "t13c", name: "BOOX T13 系列", inch: "13.3 英寸", width: 2400, height: 3200 }
];

export function getDevice(key: string) {
  return devices.find((device) => device.key === key) ?? devices.find((device) => device.key === "leaf5") ?? devices[0];
}
