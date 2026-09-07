// Synthetic manga page for exercising the render engine without real data:
// white bubbles, a bubble over screentone, a caption box, a black shout bubble
// with white text, a dashed thought bubble over hatching and an SFX drawn as
// artwork. Also writes the matching legacy `bubbles` JSON.
//
//   node scripts/fixtures/make-test-page.mjs /tmp/page.jpg
//   npx tsx scripts/render-preview.ts --image /tmp/page.jpg --legacy /tmp/page.bubbles.json --out /tmp/out.jpg --debug
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const W = 1400, H = 2000;
const font = "Helvetica, Arial, sans-serif";
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <pattern id="tone" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#ffffff"/>
      <circle cx="4" cy="4" r="2.2" fill="#777"/>
    </pattern>
    <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" fill="#fff"/>
      <rect width="3" height="10" fill="#222"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <!-- panels -->
  <rect x="40" y="40" width="1320" height="900" fill="#fff" stroke="#000" stroke-width="6"/>
  <rect x="40" y="980" width="640" height="980" fill="url(#tone)" stroke="#000" stroke-width="6"/>
  <rect x="720" y="980" width="640" height="980" fill="url(#hatch)" stroke="#000" stroke-width="6"/>
  <!-- background art in panel 1 -->
  <circle cx="1000" cy="500" r="260" fill="#333"/>
  <path d="M100 900 L500 300 L900 900 Z" fill="#999"/>
  <!-- bubble 1: classic ellipse with tail, white -->
  <ellipse cx="380" cy="300" rx="260" ry="150" fill="#fff" stroke="#000" stroke-width="5"/>
  <path d="M440 440 L470 540 L520 430 Z" fill="#fff" stroke="#000" stroke-width="5"/>
  <path d="M446 440 L470 528 L512 436 Z" fill="#fff"/>
  <text x="380" y="280" font-family="${font}" font-size="34" font-weight="bold" text-anchor="middle">I NEVER THOUGHT</text>
  <text x="380" y="322" font-family="${font}" font-size="34" font-weight="bold" text-anchor="middle">IT WOULD END LIKE THIS.</text>
  <!-- bubble 2: rounded rect caption -->
  <rect x="900" y="80" width="420" height="120" fill="#fff" stroke="#000" stroke-width="5"/>
  <text x="1110" y="130" font-family="${font}" font-size="28" text-anchor="middle">THREE DAYS LATER,</text>
  <text x="1110" y="168" font-family="${font}" font-size="28" text-anchor="middle">AT THE OLD HARBOR</text>
  <!-- bubble 3: black shout bubble, white text -->
  <path d="M700 620 L760 560 L820 640 L900 580 L940 680 L1020 690 L960 760 L1000 840 L900 830 L860 900 L800 840 L720 880 L700 800 L620 780 L680 720 Z" fill="#000" stroke="#000" stroke-width="4"/>
  <text x="820" y="720" font-family="${font}" font-size="44" font-weight="bold" fill="#fff" text-anchor="middle">RUN!</text>
  <text x="820" y="770" font-family="${font}" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle">NOW!</text>
  <!-- bubble 4: ellipse over screentone -->
  <ellipse cx="360" cy="1300" rx="240" ry="170" fill="#fff" stroke="#000" stroke-width="5"/>
  <text x="360" y="1270" font-family="${font}" font-size="30" font-weight="bold" text-anchor="middle">DID YOU HEAR</text>
  <text x="360" y="1310" font-family="${font}" font-size="30" font-weight="bold" text-anchor="middle">THAT SOUND</text>
  <text x="360" y="1350" font-family="${font}" font-size="30" font-weight="bold" text-anchor="middle">FROM THE CELLAR?</text>
  <!-- bubble 5: grey-ish thought bubble over hatch -->
  <ellipse cx="1040" cy="1250" rx="230" ry="140" fill="#f2f2f2" stroke="#000" stroke-width="4" stroke-dasharray="14 10"/>
  <text x="1040" y="1240" font-family="${font}" font-size="28" font-style="italic" text-anchor="middle">maybe it was just</text>
  <text x="1040" y="1278" font-family="${font}" font-size="28" font-style="italic" text-anchor="middle">the wind...</text>
  <!-- SFX drawn as artwork -->
  <text x="1040" y="1750" font-family="Impact, ${font}" font-size="150" font-weight="900" fill="#fff" stroke="#000" stroke-width="8" text-anchor="middle" transform="rotate(-12 1040 1750)">BOOM</text>
  <!-- small label on a sign -->
  <rect x="120" y="1700" width="260" height="70" fill="#fff" stroke="#000" stroke-width="4"/>
  <text x="250" y="1747" font-family="${font}" font-size="30" text-anchor="middle">EXIT</text>
</svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(process.argv[2] || "page.jpg");

// Legacy bubbles (0-1000 normalized [ymin,xmin,ymax,xmax]) as Gemini would return
// them, deliberately a few percent off to mimic model imprecision.
const n = (x, y, w, h) => [Math.round(y/H*1000), Math.round(x/W*1000), Math.round((y+h)/H*1000), Math.round((x+w)/W*1000)];
const bubbles = [
  { box_2d: n(160, 248, 440, 90), original_text: "I NEVER THOUGHT IT WOULD END LIKE THIS.", translated_text: "Böyle biteceğini hiç düşünmemiştim.", type: "speech", confidence: 0.9 },
  { box_2d: n(915, 100, 400, 90), original_text: "THREE DAYS LATER, AT THE OLD HARBOR", translated_text: "Üç gün sonra, eski limanda", type: "caption", confidence: 0.85 },
  { box_2d: n(740, 680, 170, 110), original_text: "RUN! NOW!", translated_text: "KAÇ! HEMEN ŞİMDİ!", type: "speech", confidence: 0.8 },
  { box_2d: n(150, 1235, 420, 135), original_text: "DID YOU HEAR THAT SOUND FROM THE CELLAR?", translated_text: "Kilerden gelen o sesi sen de duydun mu?", type: "speech", confidence: 0.9 },
  { box_2d: n(850, 1210, 380, 90), original_text: "maybe it was just the wind...", translated_text: "belki de sadece rüzgârdı...", type: "speech", confidence: 0.7 },
  { box_2d: n(760, 1620, 560, 180), original_text: "BOOM", translated_text: "GÜMM", type: "sfx", confidence: 0.9 },
  { box_2d: n(140, 1712, 220, 48), original_text: "EXIT", translated_text: "ÇIKIŞ", type: "label", confidence: 0.9 },
];
await writeFile((process.argv[2] || "page.jpg").replace(/\.jpg$/, ".bubbles.json"), JSON.stringify(bubbles, null, 2));
console.log("fixture written");
