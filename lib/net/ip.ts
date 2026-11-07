import { BlockList, isIP } from "node:net";

// Which addresses owner-supplied destinations may reach (SSRF guard, spec §11).
// Everything private, loopback, link-local, shared, reserved, documentation or
// multicast is refused, including IPv4 hidden inside IPv6 forms.

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}

const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

/** Expands an IPv6 address to 8 groups of 16-bit numbers (handles :: and dotted tails). */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some((part) => part > 255)) return null;
    text = text.slice(0, -dotted[1].length) + `${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (text.includes("::") ? missing < 0 : headGroups.length !== 8) return null;
  const groups = [...headGroups, ...Array(text.includes("::") ? missing : 0).fill("0"), ...tailGroups].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

function v4FromGroups(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** The IPv4 address embedded in an IPv6 form we must also judge (mapped, compatible, NAT64, 6to4). */
function embeddedIpv4(address: string): string | null {
  const groups = ipv6Groups(address);
  if (!groups) return null;
  const zeros = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  if (zeros(0, 5) && groups[5] === 0xffff) return v4FromGroups(groups[6], groups[7]); // ::ffff:a.b.c.d
  if (zeros(0, 6) && (groups[6] !== 0 || groups[7] > 1)) return v4FromGroups(groups[6], groups[7]); // ::a.b.c.d
  if (groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) return v4FromGroups(groups[6], groups[7]); // 64:ff9b::/96
  if (groups[0] === 0x2002) return v4FromGroups(groups[1], groups[2]); // 6to4
  return null;
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blockedV4.check(address, "ipv4") && address !== "255.255.255.255";
  if (version === 6) {
    const embedded = embeddedIpv4(address);
    if (embedded) return isPublicAddress(embedded);
    return !blockedV6.check(address.split("%")[0], "ipv6");
  }
  return false;
}
