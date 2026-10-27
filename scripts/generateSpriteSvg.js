// Script to create a clean 4-frame 128x32 spritesheet for mario/character walking
const fs = require('fs');
const path = require('path');

// Let's create an SVG that renders 4 frames of a 32x32 walking pixel character
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32" viewBox="0 0 128 32">
  <!-- Frame 0: Stand (x: 0..31) -->
  <g transform="translate(0, 0)">
    <!-- Hat & Hair -->
    <rect x="10" y="4" width="12" height="4" fill="#DC2626" />
    <rect x="8" y="8" width="16" height="3" fill="#DC2626" />
    <rect x="8" y="11" width="6" height="4" fill="#78350F" />
    <rect x="14" y="11" width="10" height="4" fill="#FDE047" />
    <rect x="20" y="12" width="2" height="3" fill="#000000" />
    <!-- Mustache & Nose -->
    <rect x="22" y="13" width="4" height="2" fill="#FDE047" />
    <rect x="16" y="15" width="8" height="2" fill="#78350F" />
    <!-- Shirt & Overalls -->
    <rect x="10" y="17" width="12" height="7" fill="#DC2626" />
    <rect x="12" y="19" width="8" height="7" fill="#2563EB" />
    <rect x="10" y="21" width="2" height="4" fill="#2563EB" />
    <rect x="20" y="21" width="2" height="4" fill="#2563EB" />
    <circle cx="13" cy="22" r="1" fill="#FACC15" />
    <circle cx="19" cy="22" r="1" fill="#FACC15" />
    <!-- Shoes -->
    <rect x="9" y="26" width="6" height="4" fill="#78350F" />
    <rect x="17" y="26" width="6" height="4" fill="#78350F" />
  </g>

  <!-- Frame 1: Walk Step 1 (x: 32..63) -->
  <g transform="translate(32, 0)">
    <rect x="10" y="3" width="12" height="4" fill="#DC2626" />
    <rect x="8" y="7" width="16" height="3" fill="#DC2626" />
    <rect x="8" y="10" width="6" height="4" fill="#78350F" />
    <rect x="14" y="10" width="10" height="4" fill="#FDE047" />
    <rect x="20" y="11" width="2" height="3" fill="#000000" />
    <rect x="22" y="12" width="4" height="2" fill="#FDE047" />
    <rect x="16" y="14" width="8" height="2" fill="#78350F" />
    <!-- Arm swing -->
    <rect x="7" y="15" width="4" height="5" fill="#DC2626" />
    <rect x="11" y="16" width="10" height="7" fill="#DC2626" />
    <rect x="13" y="18" width="8" height="7" fill="#2563EB" />
    <!-- Stride Legs -->
    <rect x="7" y="24" width="7" height="5" fill="#78350F" />
    <rect x="19" y="22" width="6" height="4" fill="#78350F" />
  </g>

  <!-- Frame 2: Walk Contact (x: 64..95) -->
  <g transform="translate(64, 0)">
    <rect x="10" y="4" width="12" height="4" fill="#DC2626" />
    <rect x="8" y="8" width="16" height="3" fill="#DC2626" />
    <rect x="8" y="11" width="6" height="4" fill="#78350F" />
    <rect x="14" y="11" width="10" height="4" fill="#FDE047" />
    <rect x="20" y="12" width="2" height="3" fill="#000000" />
    <rect x="22" y="13" width="4" height="2" fill="#FDE047" />
    <rect x="16" y="15" width="8" height="2" fill="#78350F" />
    <!-- Body -->
    <rect x="10" y="17" width="12" height="7" fill="#DC2626" />
    <rect x="12" y="19" width="8" height="7" fill="#2563EB" />
    <!-- Legs in Passing -->
    <rect x="11" y="26" width="5" height="4" fill="#78350F" />
    <rect x="16" y="26" width="5" height="4" fill="#78350F" />
  </g>

  <!-- Frame 3: Walk Step 2 (x: 96..127) -->
  <g transform="translate(96, 0)">
    <rect x="10" y="3" width="12" height="4" fill="#DC2626" />
    <rect x="8" y="7" width="16" height="3" fill="#DC2626" />
    <rect x="8" y="10" width="6" height="4" fill="#78350F" />
    <rect x="14" y="10" width="10" height="4" fill="#FDE047" />
    <rect x="20" y="11" width="2" height="3" fill="#000000" />
    <rect x="22" y="12" width="4" height="2" fill="#FDE047" />
    <rect x="16" y="14" width="8" height="2" fill="#78350F" />
    <!-- Opposite Stride -->
    <rect x="21" y="15" width="4" height="5" fill="#DC2626" />
    <rect x="11" y="16" width="10" height="7" fill="#DC2626" />
    <rect x="11" y="18" width="8" height="7" fill="#2563EB" />
    <!-- Reverse Stride Legs -->
    <rect x="18" y="24" width="7" height="5" fill="#78350F" />
    <rect x="7" y="22" width="6" height="4" fill="#78350F" />
  </g>
</svg>`;

const outPath = path.join(__dirname, '..', 'public', 'images', 'mario-sprite.svg');
fs.writeFileSync(outPath, svgContent);
console.log('Saved mario-sprite.svg to', outPath);
