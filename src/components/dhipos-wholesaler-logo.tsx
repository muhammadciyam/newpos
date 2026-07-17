// Original wordmark for the "Dhipos Wholesaler" wholesale-network feature — a simple "DW"
// monogram rendered with currentColor so it follows whatever container/theme color wraps it.
export function DhiposWholesalerLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
      <text
        x="24"
        y="33"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="800"
        fontSize="21"
        letterSpacing="-1"
        fill="currentColor"
      >
        DW
      </text>
    </svg>
  );
}
