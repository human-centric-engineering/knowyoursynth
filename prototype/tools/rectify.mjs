// Straighten an angled panel photo with a homography (used for the Moog Grandmother owner photo).
// Q below is that photo's four faceplate corners; measure a new photo's corners and replace it.
//   node prototype/tools/rectify.mjs <in.jpg> <out.jpg> <aspect> <padL> <padT> <padR> <padB> <width>
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const sharp = require('sharp');
const [src, out, aspect, padL, padT, padR, padB, W0] = process.argv.slice(2);
// quad in the photo (TL, TR, BR, BL) = rect (0,0)-(W,H) in the output
const Q = [[643, 430], [4278, 157], [4485, 1368], [716, 1751]];
const W = +W0, H = Math.round(W / +aspect);
// homography rect->quad
function solve(A, b) { const n = b.length; for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; } } const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x; }
const S = [[0, 0], [W, 0], [W, H], [0, H]];
const A = [], b = [];
for (let i = 0; i < 4; i++) { const [x, y] = S[i], [u, v] = Q[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
const h = solve(A, b);
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const pl = +padL, pt = +padT, OW = W + pl + +padR, OH = H + pt + +padB, C = info.channels;
const o = Buffer.alloc(OW * OH * 3);
for (let Y = 0; Y < OH; Y++) for (let X = 0; X < OW; X++) {
  const x = X - pl, y = Y - pt, d = h[6] * x + h[7] * y + 1;
  const u = (h[0] * x + h[1] * y + h[2]) / d, v = (h[3] * x + h[4] * y + h[5]) / d;
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  if (x0 < 0 || y0 < 0 || x0 >= info.width - 1 || y0 >= info.height - 1) continue;
  for (let c = 0; c < 3; c++) {
    const p = (yy, xx) => data[(yy * info.width + xx) * C + c];
    o[(Y * OW + X) * 3 + c] = (p(y0, x0) * (1 - fx) + p(y0, x0 + 1) * fx) * (1 - fy) + (p(y0 + 1, x0) * (1 - fx) + p(y0 + 1, x0 + 1) * fx) * fy;
  }
}
await sharp(o, { raw: { width: OW, height: OH, channels: 3 } }).jpeg({ quality: 92 }).toFile(out);
console.log(OW, OH, 'rect', W, H);
