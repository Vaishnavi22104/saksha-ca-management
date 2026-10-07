/**
 * The assistant's sphere.
 *
 * A glass ball with a swirl inside: a warm green body, cool glass pooling
 * at the walls, one bright ribbon curling through the middle, and a pale
 * rim where the light wraps around. Drawn as SVG so it stays sharp at any
 * size and costs no download.
 */
export function Orb({ size = 148 }: { size?: number }) {
  return (
    <span className="orb" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="orb-svg" role="img" aria-label="Assistant" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="body" cx="60%" cy="50%" r="64%">
            <stop offset="0%"   stopColor="#E8FF9E"/>
            <stop offset="34%"  stopColor="#A8EC72"/>
            <stop offset="62%"  stopColor="#74DE8E"/>
            <stop offset="84%"  stopColor="#7FE0C8"/>
            <stop offset="100%" stopColor="#AFE8EC"/>
          </radialGradient>
          <radialGradient id="rim" cx="50%" cy="50%" r="50%">
            <stop offset="72%"  stopColor="#CFF3F2" stopOpacity="0"/>
            <stop offset="90%"  stopColor="#D9F6F4" stopOpacity=".75"/>
            <stop offset="100%" stopColor="#8FD2E6" stopOpacity=".65"/>
          </radialGradient>
          <filter id="b3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
          <filter id="b6" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
          <filter id="b12" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="12"/></filter>
          <clipPath id="ball"><circle cx="100" cy="100" r="92"/></clipPath>
        </defs>
      
        <circle cx="100" cy="100" r="92" fill="url(#body)"/>
      
        <g clipPath="url(#ball)" className="orb-swirl">
          {/* cool glass hugging the wall, not flooding the middle */}
          <ellipse cx="16" cy="100" rx="42" ry="94" fill="#B6ECEA" opacity=".8" filter="url(#b12)"/>
          <ellipse cx="104" cy="200" rx="98" ry="34" fill="#AEE9E2" opacity=".65" filter="url(#b12)"/>
      
          {/* the S: pale ribbon over the green body, only lightly softened */}
          <path d="M168 54 C124 30, 72 52, 68 98 C65 136, 106 154, 128 130 C144 112, 124 94, 108 106
                   C92 118, 104 152, 142 158 C164 161, 182 150, 190 134"
                fill="none" stroke="#E6FFA6" strokeOpacity=".9" strokeWidth="30"
                strokeLinecap="round" strokeLinejoin="round" filter="url(#b3)"/>
      
          {/* the bright heart of the swirl */}
          <ellipse cx="120" cy="96" rx="30" ry="24" fill="#FBFFD2" opacity=".85" filter="url(#b6)"/>
      
          {/* light catching the inner top-left wall */}
          <path d="M32 126 C26 70, 72 26, 132 24" fill="none" stroke="#F4FEFB" strokeOpacity=".65"
                strokeWidth="9" strokeLinecap="round" filter="url(#b3)"/>
        </g>
      
        <circle cx="100" cy="100" r="92" fill="url(#rim)"/>
      </svg>
    </span>
  );
}
