import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function CoalIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 72" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="40,4 72,20 72,52 40,68 8,52 8,20" fill="#64748b" stroke="#94a3b8" strokeWidth="1.5" />
      <polygon points="40,4 72,20 40,36 8,20" fill="#94a3b8" opacity="0.6" />
      <polygon points="40,36 72,20 72,52 40,68" fill="#475569" opacity="0.9" />
      <polygon points="40,36 40,68 8,52 8,20" fill="#334155" opacity="0.9" />
      <line x1="40" y1="20" x2="55" y2="40" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="28" x2="20" y2="48" stroke="#1e293b" strokeWidth="1" strokeLinecap="round" />
      <line x1="48" y1="30" x2="42" y2="55" stroke="#1e293b" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="30" cy="18" rx="6" ry="3" fill="#cbd5e1" opacity="0.35" transform="rotate(-20,30,18)" />
    </svg>
  );
}

export function IronIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 72" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="40,4 72,20 72,52 40,68 8,52 8,20" fill="#7a9aba" stroke="#cbd5e1" strokeWidth="1.5" />
      <polygon points="40,4 72,20 40,36 8,20" fill="#c8d8e8" opacity="0.55" />
      <polygon points="40,36 72,20 72,52 40,68" fill="#5a7a9a" opacity="0.9" />
      <polygon points="40,36 40,68 8,52 8,20" fill="#3a5a7a" opacity="0.9" />
      <circle cx="28" cy="30" r="3" fill="#e0e0f0" opacity="0.7" />
      <circle cx="52" cy="42" r="3" fill="#e0e0f0" opacity="0.7" />
      <circle cx="35" cy="55" r="2.5" fill="#e0e0f0" opacity="0.5" />
      <ellipse cx="28" cy="16" rx="7" ry="3" fill="#e8f0f8" opacity="0.4" transform="rotate(-20,28,16)" />
    </svg>
  );
}

export function GoldIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 72" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="40,4 72,20 72,52 40,68 8,52 8,20" fill="#c48a1a" stroke="#f2b84b" strokeWidth="1.5" />
      <polygon points="40,4 72,20 40,36 8,20" fill="#f2b84b" opacity="0.7" />
      <polygon points="40,36 72,20 72,52 40,68" fill="#a06810" opacity="0.9" />
      <polygon points="40,36 40,68 8,52 8,20" fill="#7a4e08" opacity="0.9" />
      <line x1="40" y1="4" x2="40" y2="14" stroke="#ffe08a" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      <line x1="36" y1="6" x2="40" y2="14" stroke="#ffe08a" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="44" y1="6" x2="40" y2="14" stroke="#ffe08a" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="30" cy="16" rx="8" ry="3.5" fill="#fff5cc" opacity="0.5" transform="rotate(-20,30,16)" />
    </svg>
  );
}

export function DiamondIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 76" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="40,0 56,18 40,14 24,18" fill="#4fd1ff" stroke="#a0e8ff" strokeWidth="1" />
      <polygon points="8,14 24,18 40,14" fill="#7de0ff" stroke="#a0e8ff" strokeWidth="0.5" />
      <polygon points="56,18 72,14 40,14" fill="#38c0f0" stroke="#a0e8ff" strokeWidth="0.5" />
      <polygon points="8,14 24,18 40,74 6,34" fill="#1eb8f0" stroke="#4fd1ff" strokeWidth="1" />
      <polygon points="24,18 56,18 40,74" fill="#4fd1ff" stroke="#a0e8ff" strokeWidth="0.8" />
      <polygon points="56,18 72,14 74,34 40,74" fill="#0ea8e0" stroke="#4fd1ff" strokeWidth="1" />
      <line x1="28" y1="20" x2="36" y2="50" stroke="#a0f0ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="32" y1="18" x2="38" y2="28" stroke="#e0faff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export const ORE_ICON: Record<string, (props: IconProps) => JSX.Element> = {
  COAL:    CoalIcon,
  IRON:    IronIcon,
  GOLD:    GoldIcon,
  DIAMOND: DiamondIcon,
};