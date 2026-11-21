export function Brand({ size = 30, inverse = false, className }: { size?: number; inverse?: boolean; className?: string }) {
  return <span className={`brand${inverse ? " brand-inverse" : ""}${className ? ` ${className}` : ""}`}>
    <svg width={size} viewBox="0 0 493 337" aria-hidden="true"><path d="M0 337 L176 20 C183.5 6.6 192 0 207 0 H286 C301 0 309.5 6.6 317 20 L493 337 H343 V190 A96.5 96.5 0 0 0 150 190 V337 Z" fill="currentColor"/></svg>
    <span className="brand-name"><span>APP</span><strong>EDGE</strong></span>
  </span>;
}
